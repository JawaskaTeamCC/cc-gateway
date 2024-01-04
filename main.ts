import { env } from "./Env.ts";
import Logger from "https://deno.land/x/logger@v1.1.3/logger.ts";
import {
  WebSocketClient,
  WebSocketServer,
} from "https://deno.land/x/websocket@v0.1.4/mod.ts";
import { None, Option, Some } from "npm:@octantis/option";

const log = new Logger();

// Extract env here
const HTTP_PORT = env.get("HTTP_PORT", "80", Number);
const WEB_SOCKET_PORT = env.get("WEB_SOCKET_PORT", "8100", Number);
const TOKEN = env.get("TOKEN");
const HOST_NAME = env.get("HOST_NAME", "0.0.0.0");

log.info(
  `Running gateway server at http://${HOST_NAME}:${HTTP_PORT} and directing to port ${HOST_NAME}:${WEB_SOCKET_PORT}`
);

let client: Option<WebSocketClient> = None();

function trace(req: Request, res: Response): Response {
  if (res.status >= 200 && res.status < 400) {
    log.info(`[${req.method}][${res.status}] ${req.url} - ${res.statusText}`);
  } else {
    log.warn(`[${req.method}][${res.status}] ${req.url} - ${res.statusText}`);
  }
  return res;
}

Deno.serve({ port: HTTP_PORT }, async (req) => {
  if (client.isEmpty()) {
    const res = new Response(
      "Service unavailable: Host is down in the overworld",
      { status: 501 }
    );
    return trace(req, res);
  } else {
    const body = await req.text();
    const res = await new Promise<Response>((r) => {
      const c = client.get();
      const {
        headers,
        method,
        referrer,
        referrerPolicy,
        credentials,
        destination,
        url,
      } = req;
      c.send(
        JSON.stringify({
          body,
          headers,
          method,
          referrer,
          referrerPolicy,
          credentials,
          destination,
          url,
        })
      );
      c.once("message", (msg: string) => {
        const { body, ...options } = JSON.parse(msg);
        r(new Response(body, options));
      });
    });
    return trace(req, res);
  }
});

const wss = new WebSocketServer(WEB_SOCKET_PORT);
wss.on("connection", (ws: WebSocketClient) => {
  log.info(`Incoming connection on the socket end`);
  ws.once("close", () => {
    client = None();
  });
  ws.once("message", (msg: string) => {
    const { token } = JSON.parse(msg);
    if (token != TOKEN) {
      log.warn(`Client attempting to connect with token ${token}!`);
      ws.send(
        JSON.stringify({
          closing: true,
          reason: "Bad token",
          code: "bad-token",
        })
      );
      if (!ws.isClosed) {
        ws.closeForce();
      }
    } else {
      if (client.isDefined()) {
        log.info(`Closing connection for existing client`);
        if (!client.value.isClosed) {
          client.value.send(
            JSON.stringify({
              closing: true,
              reason: "Connection hijacking",
              code: "hijack",
            })
          );
          client.value.closeForce();
        }
      }
      log.info("Connection acknowledged!");
      ws.send(JSON.stringify({ ack: true }));
      client = Some(ws);
    }
  });
});
