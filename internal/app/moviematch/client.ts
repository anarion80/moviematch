import { WebSocket } from "ws/mod.ts";
import * as log from "log/mod.ts";
import { Deferred, deferred } from "async/deferred.ts";
import {
  ClientMessage,
  Config,
  CreateRoomRequest,
  JoinRoomError,
  JoinRoomRequest,
  Locale,
  Login,
  LoginError,
  LoginSuccess,
  Rate,
  ServerMessage,
} from "/types/moviematch.d.ts";
import {
  AccessDeniedError,
  createRoom,
  getRoom,
  Room,
  RoomExistsError,
  RoomNotFoundError,
  UserAlreadyJoinedError,
} from "/internal/app/moviematch/room.ts";
import {
  ConfigReloadError,
  getConfig,
  updateConfiguration,
  verifyConfig,
} from "/internal/app/moviematch/config.ts";
import { getUser, PlexUser } from "/internal/app/plex/plex_tv.ts";
import { getTranslations } from "/internal/app/moviematch/i18n.ts";

export class Client {
  finished: Deferred<void> = deferred();
  ws: WebSocket;
  room?: Room;
  userName?: string;
  plexAuth?: Login["plexAuth"];
  plexUser?: PlexUser;
  locale?: Locale;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.listenForMessages();
    this.sendConfig();
  }

  private sendConfig() {
    if (this.ws.isClosed) {
      throw new Error(`Cannot send config when WebSocket is closed`);
    }

    const requiresConfiguration = getConfig().servers.length === 0;

    this.sendMessage({
      type: "config",
      payload: {
        requiresConfiguration,
        requirePlexLogin: getConfig().requirePlexTvLogin,
        ...(requiresConfiguration
          ? {
            initialConfiguration: getConfig(),
          }
          : {}),
      },
    });
  }

  private async listenForMessages() {
    try {
      for await (const messageText of this.ws) {
        if (this.ws.isClosed) {
          break;
        }

        if (typeof messageText === "string") {
          try {
            const message: ServerMessage = JSON.parse(messageText);
            switch (message.type) {
              case "login":
                await this.handleLogin(message.payload);
                break;
              case "createRoom":
                await this.handleCreateRoom(message.payload);
                break;
              case "joinRoom":
                await this.handleJoinRoom(message.payload);
                break;
              case "rate":
                await this.handleRate(message.payload);
                break;
              case "setLocale":
                await this.handleSetLocale(message.payload);
                break;
              case "setup":
                await this.handleSetup(message.payload);
                break;
              default:
                log.info(`Unhandled message: ${messageText}`);
                break;
            }
          } catch (err) {
            if (err instanceof ConfigReloadError) {
              throw err;
            }

            log.error(`Failed to parse message: ${messageText}`);
          }
        }
      }
    } catch (err) {
      if (err instanceof ConfigReloadError) {
        throw err;
      }

      log.info(`WebSocket had an error. ${String(err)}`);
    } finally {
      log.info(`WebSocket listenForMessages has finished`);
      this.handleClose();
    }
  }

  private async handleLogin(login: Login) {
    log.debug(`Handling login event: ${JSON.stringify(login)}`);

    if (typeof login?.userName !== "string") {
      const error: LoginError = {
        name: "MalformedMessage",
        message: "The login message was not formed correctly.",
      };

      return this.ws.send(JSON.stringify(error));
    }

    if (this.userName && login.userName !== this.userName) {
      log.debug(`Logging out ${this.userName}`);
      this.room?.users.delete(this.userName);
    }

    this.userName = login.userName;

    const successMessage: LoginSuccess = {
      avatarImage: "",
      permissions: [],
    };

    if (login.plexAuth) {
      try {
        const plexUser = await getUser(login.plexAuth);
        this.plexAuth = login.plexAuth;
        this.plexUser = plexUser;
        successMessage.avatarImage = plexUser.thumb;
      } catch (err) {
        log.error(
          `plexAuth invalid! ${JSON.stringify(login.plexAuth)}`,
          err,
        );
      }
    }

    this.sendMessage({ type: "loginSuccess", payload: successMessage });
  }

  private async handleCreateRoom(createRoomReq: CreateRoomRequest) {
    log.debug(
      `Handling room creation event: ${JSON.stringify(createRoomReq)}`,
    );

    if (!this.userName) {
      return this.sendMessage({
        type: "createRoomError",
        payload: {
          name: "NotLoggedInError",
          message: "You must be logged in to create a room.",
        },
      });
    }

    try {
      this.room = createRoom(createRoomReq);
      this.room.users.set(this.userName, this);
      this.sendMessage({
        type: "createRoomSuccess",
        payload: {
          previousMatches: await this.room.getMatches(this.userName!, true),
          media: await this.room.getMediaForUser(this.userName),
        },
      });
    } catch (err) {
      if (err instanceof RoomExistsError) {
        return this.sendMessage({
          type: "createRoomError",
          payload: {
            name: "RoomExistsError",
            message: err.message,
          },
        });
      } else {
        log.error(err);
      }
    }
  }

  private async handleJoinRoom(joinRoomReq: JoinRoomRequest) {
    if (!this.userName) {
      return this.sendMessage({
        type: "joinRoomError",
        payload: {
          name: "NotLoggedInError",
          message: "You must log in before trying to join a room.",
        },
      });
    }
    try {
      this.room = getRoom(this.userName, joinRoomReq);
      this.room.users.set(this.userName, this);
      this.sendMessage({
        type: "joinRoomSuccess",
        payload: {
          previousMatches: await this.room.getMatches(this.userName!, true),
          media: await this.room.getMediaForUser(this.userName),
        },
      });
    } catch (err) {
      let error: JoinRoomError["name"];
      if (err instanceof AccessDeniedError) {
        error = "AccessDeniedError";
      } else if (err instanceof RoomNotFoundError) {
        error = "RoomNotFoundError";
      } else if (err instanceof UserAlreadyJoinedError) {
        error = "UserAlreadyJoinedError";
      } else {
        error = "UnknownError";
      }

      return this.sendMessage({
        type: "joinRoomError",
        payload: {
          name: error,
          message: err.message,
        },
      });
    }
    log.debug(
      `Handling room join event: ${JSON.stringify(joinRoomReq)}`,
    );
  }

  private handleRate(rate: Rate) {
    if (this.userName) {
      log.debug(
        `Handling rate event: ${this.userName} ${JSON.stringify(rate)}`,
      );
      this.room?.storeRating(this.userName, rate);
    }
  }

  private async handleSetLocale(locale: Locale) {
    this.locale = locale;

    const headers = new Headers({
      "accept-language": locale.language,
    });

    this.sendMessage({
      type: "translations",
      payload: await getTranslations(headers),
    });
  }

  private handleClose() {
    log.info(`${this.userName ?? "Unknown user"} left.`);

    if (this.room && this.userName) {
      this.room.users.delete(this.userName);
    }

    this.finished.resolve();
  }

  private async handleAbort() {
    log.info(
      `WebSocket ${this.ws.isClosed ? "already closed" : "gonna close."}`,
    );
    try {
      if (!this.ws.isClosed) {
        await this.ws.close();
      }
    } catch (err) {
      log.info(`this.ws.close() threw: ${String(err)}`);
    }
  }

  private async handleSetup(config: Config) {
    const currentConfig = getConfig();
    if (currentConfig.servers.length === 0) {
      try {
        verifyConfig(config, true);
        await updateConfiguration(config as unknown as Record<string, unknown>);
      } catch (err) {
        this.sendMessage({
          type: "setupError",
          payload: {
            "message": String(err),
            "type": "INVALID_CONFIG",
          },
        });
        log.error(`Tried to setup with an invalid config. ${String(err)}`);
      }
    } else {
      this.sendMessage({
        type: "setupError",
        payload: {
          "message": "MovieMatch has already been set up",
          "type": "ALREADY_SETUP",
        },
      });
      log.info(
        `An attempt was made to configure MovieMatch after it has been initially set up.`,
      );
      log.info(
        `Please edit the configuration YAML directly and restart MovieMatch.`,
      );
    }
  }

  async sendMessage(msg: ClientMessage) {
    try {
      await this.ws.send(JSON.stringify(msg));
    } catch (err) {
      log.warning(`Tried to send message to a disconnected client`);
    }
  }
}
