import { join } from "https://deno.land/std@0.83.0/path/mod.ts";
import { getLogger } from "/internal/app/moviematch/logger.ts";
import {
  PlexDirectory,
  PlexDirectoryType,
  PlexMediaContainer,
  PlexMediaProviders,
  PlexVideo,
  PlexVideoItem,
} from "/internal/app/plex/types.d.ts";
import { updatePath, updateSearch } from "/internal/util/url.ts";
import { memo } from "/internal/util/memo.ts";
import { fetch } from "/internal/util/fetch.ts";
import { getConfig } from "/internal/app/moviematch/config.ts";

export class AuthenticationError extends Error {}
export class TimeoutError extends Error {}

export const isAvailable = async (plexUrl: URL): Promise<boolean> => {
  if (getConfig().useTestFixtures) {
    return true;
  }

  const req = await fetch(updatePath(plexUrl, "/identity").href, {});
  return req.ok;
};

interface ViewOptions {
  directoryType?: PlexDirectoryType[];
  directoryName?: string[];
  filters?: Filter[];
  sort?: Sort;
  limit?: number;
}

export enum FilterOperator {
  IS = "",
  IS_NOT = "!",
  LESS_THAN = "<<",
  GREATER_THAN = "??",
}

type FilterKeyword =
  | "title" // Title
  | "studio" // Studio
  | "userRating" // Rating
  | "contentRating" // Content Rating
  | "year" // Year
  | "decade" // Decade
  | "originallyAvailableAt" // Release Date
  | "unmatched" // Unmatched
  | "duplicate" // Duplicate
  | "genre" // Genre
  | "collection" // Collection
  | "director" // Director
  | "writer" // Writer
  | "producer" // Producer
  | "actor" // Actor
  | "country" // Country
  | "addedAt" // Date Added
  | "viewCount" // Plays
  | "lastViewedAt" // Last Played
  | "unwatched" // Unplayed
  | "resolution" // Resolution
  | "hdr" // HDR
  | "label" // Label
  | typeof CUSTOM_FILTERS[number]; // Additional filters that Plex doesn't do for us.

const CUSTOM_FILTERS = ["rating"] as const;

type FilterValue = string;

type Filter = [FilterKeyword, keyof typeof FilterOperator, FilterValue];

type SortKeyword =
  | "titleSort" // Title
  | "year" // Year
  | "originallyAvailableAt" // Release Date
  | "rating" // Critic Rating
  | "audienceRating" // Audience Rating
  | "userRating" // Rating
  | "contentRating" // Content Rating
  | "duration" // Duration
  | "viewOffset" // Progress
  | "viewCount" // Plays
  | "addedAt" // Date Added
  | "lastViewedAt" // Date Viewed
  | "mediaHeight" // Resolution
  | "mediaBitrate"; // Bitrate

enum SortDirection {
  ASCENDING = "",
  DESCENDING = ":desc",
}

type Sort = [SortKeyword, keyof typeof SortDirection];

export const getDirectories = memo(async (plexUrl: URL) => {
  const directoryUrl = updatePath(plexUrl, `/library/sections`).href;
  const response = await fetch(directoryUrl, {
    headers: { accept: "application/json" },
  });

  getLogger().debug(`Fetching ${directoryUrl}`);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${directoryUrl}: ${response.status} (${response.statusText})`,
    );
  }

  const directory: PlexMediaContainer<PlexDirectory> = await response.json();
  if (directory && getConfig().writeFixtures) {
    Deno.writeTextFile(
      join(Deno.cwd(), "/fixtures/library-sections.json"),
      JSON.stringify(directory, null, 2),
    );
  }
  return directory.MediaContainer.Directory;
});

export const getMedia = async (
  plexUrl: URL,
  directoryKey: string,
  { filters, sort, limit }: ViewOptions,
) => {
  const [sortKeyword, sortDirection] = sort ?? ["titleSort", "ASCENDING"];

  const queryUrl = updateSearch(
    updatePath(plexUrl, `/library/sections/${directoryKey}/all`),
    {
      ...filters?.reduce(
        (acc, [key, operator, value]) => ({
          ...acc,
          [`${key}${FilterOperator[operator]}`]: value,
        }),
        {},
      ),
      sort: sortKeyword + SortDirection[sortDirection],
      limit: String(limit ?? "-1"),
    },
  );

  getLogger().debug(`Fetching ${queryUrl.href}`);

  const req = await fetch(queryUrl.href, {
    headers: {
      accept: "application/json",
    },
  });

  if (!req.ok) {
    throw new Error(`Request failed with ${req.status} (${req.statusText})`);
  }

  const media: PlexMediaContainer<PlexVideo> = await req.json();

  if (media && getConfig().writeFixtures) {
    Deno.writeTextFile(
      join(Deno.cwd(), `/fixtures/library-sections-${directoryKey}-all.json`),
      JSON.stringify(media, null, 2),
    );
  }

  let videos = media.MediaContainer.Metadata;

  if (!videos || videos.length === 0) {
    getLogger().info(
      `${media.MediaContainer.librarySectionTitle} has no videos. Skipping.`,
    );
    return [];
  }

  const customFilters = filters?.filter(([key]) =>
    ((CUSTOM_FILTERS as unknown) as FilterKeyword[]).includes(key)
  );

  if (customFilters) {
    for (const [keyword, operator, value] of customFilters) {
      switch (keyword as typeof CUSTOM_FILTERS[number]) {
        case "rating":
          videos = videos.filter((video) => {
            switch (operator) {
              case "IS":
                return video.rating === value;
              case "IS_NOT":
                return video.rating !== value;
              case "GREATER_THAN":
                return Number(video.rating) > Number(value);
              case "LESS_THAN":
                return Number(video.rating) < Number(value);
            }
          });
          break;
      }
    }
  }

  return videos;
};

export const getAllMedia = async (plexUrl: URL, viewOptions: ViewOptions) => {
  const { directoryType, directoryName } = viewOptions;
  const directories = await getDirectories(plexUrl);

  if (!directories) {
    throw new Error("No directories found!");
  }

  let filteredDirectories = directories;

  if (directoryType?.length) {
    filteredDirectories = filteredDirectories?.filter(({ type }) =>
      directoryType.includes(type)
    );
    getLogger().debug(filteredDirectories, directoryType);
  }

  if (directoryName?.length) {
    filteredDirectories = filteredDirectories?.filter(({ title }) =>
      directoryName.includes(title as PlexDirectoryType)
    );
    getLogger().debug(filteredDirectories, directoryName);
  }

  getLogger().debug(
    `Selected libraries: ${
      filteredDirectories.map(
        (_) => _.title,
      )
    } out of ${directories.map((_) => _.title)}`,
  );

  const videos: PlexVideoItem[] = [];

  for (const directory of filteredDirectories) {
    try {
      videos.push(...(await getMedia(plexUrl, directory.key, viewOptions)));
    } catch (err) {
      getLogger().error(err);
    }
  }

  return videos;
};

export const getServerId = memo(async (plexUrl: URL) => {
  const req = await fetch(
    updatePath(plexUrl, "/media/providers"),
    {
      headers: { accept: "application/json" },
    },
  );

  if (!req.ok) {
    if (req.status === 401) {
      throw new AuthenticationError(`Authentication error: ${req.url}`);
    } else {
      throw new Error(
        `${req.url} returned ${req.status}: ${await req.text()}`,
      );
    }
  }

  const providers: PlexMediaProviders = await req.json();
  return providers.MediaContainer.machineIdentifier;
});
