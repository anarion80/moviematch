import { ServerRequest } from "http/server.ts";
import * as log from "log/mod.ts";
import { acceptWebSocket } from "ws/mod.ts";
import { Client } from "/internal/app/moviematch/client.ts";

export const handler = async (
  req: ServerRequest,
) => {
  try {
    const webSocket = await acceptWebSocket({
      bufReader: req.r,
      bufWriter: req.w,
      ...req,
    });

    const client = new Client(webSocket);
    await client.finished;
  } catch (err) {
    log.error(`Failed to upgrade to a WebSocket ${String(err)}`);
  }
};
