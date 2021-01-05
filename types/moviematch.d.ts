/**
 * Shared API interfaces between the frontend and backend
 */

export type Message = ServerMessage | ClientMessage;

export type ServerMessage =
  | { type: "login"; payload: Login }
  | { type: "createRoom"; payload: CreateRoomRequest }
  | { type: "joinRoom"; payload: JoinRoomRequest }
  | { type: "rate"; payload: Rate };

export type ClientMessage =
  | { type: "loginError"; payload: LoginError }
  | { type: "loginSuccess"; payload: LoginSuccess }
  | { type: "createRoomError"; payload: CreateRoomError }
  | { type: "createRoomSuccess"; payload: JoinRoomSuccess }
  | { type: "joinRoomError"; payload: JoinRoomError }
  | { type: "joinRoomSuccess"; payload: JoinRoomSuccess }
  | { type: "match"; payload: Match }
  | { type: "media"; payload: Media[] }
  | { type: "config"; payload: Config };

// Configure message

export interface Config {
  translations: Record<string, string>;
  requirePlexLogin: boolean;
}

// Login (when login is required to create a new room)

export interface Login {
  userName: string;
  plexAuth?: {
    clientId: string;
    plexToken: string;
  };
}

export interface LoginError {
  name: "MalformedMessage";
  message: string;
}

export type Permissions = "CanCreateRoom";

export interface LoginSuccess {
  avatarImage: string;
  permissions: Permissions[];
}

// Create Room

export type RoomOption = "EndOnFirstMatch";

export interface Filter {
  key: string;
  operator: "equal" | "notEqual" | "lessThan" | "greaterThan";
  value: string;
}

export type RoomSort = "random" | "rating";

export interface CreateRoomRequest {
  roomName: string;
  password?: string;
  options?: RoomOption[];
  filters?: Filter[];
  sort?: RoomSort;
}

export interface CreateRoomError {
  name: "RoomExistsError" | "UnauthorizedError" | "NotLoggedInError";
  message: string;
}

// Join

export interface JoinRoomRequest {
  roomName: string;
  password?: string;
}

export interface JoinRoomError {
  name:
    | "UserAlreadyJoinedError"
    | "AccessDeniedError"
    | "RoomNotFoundError"
    | "NotLoggedInError"
    | "UnknownError";
  message: string;
}

export interface JoinRoomSuccess {
  previousMatches: Match[];
  media: Media[];
}

// In-Room

export interface Media {
  id: string;
  type: "movie" | "show" | "artist" | "photo";
  title: string;
  description: string;
  tagline: string;
  year: string;
  posterUrl: string;
  linkUrl: string;
  genres: string[];
  duration: number;
  rating: number;
  contentRating: string;
}

export interface Match {
  media: Media;
  users: string[];
}

export interface Rate {
  rating: "like" | "dislike";
  mediaId: string;
}