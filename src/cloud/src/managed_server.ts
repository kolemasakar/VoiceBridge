import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { AppConfig } from "./config.js";
import { createInternalDbAuditHttpHandler } from "./internal_db_audit_http.js";
import { createManagedAttachmentProbeHttpHandler } from "./managed_attachment_probe_http.js";
import { createManagedMediaHttpHandler } from "./managed_media_http.js";
import { createVoiceBridgeServer } from "./server.js";

type RequestListener = (
  request: IncomingMessage,
  response: ServerResponse
) => unknown;

export function createManagedVoiceBridgeServer(config: AppConfig) {
  const server = createVoiceBridgeServer(config);
  const legacyListeners = server.listeners("request") as RequestListener[];
  server.removeAllListeners("request");

  const internalDbAudit = createInternalDbAuditHttpHandler(config);
  const attachmentProbe = createManagedAttachmentProbeHttpHandler(config);
  const managedMedia = createManagedMediaHttpHandler(config);
  server.on("request", async (request, response) => {
    if (await internalDbAudit.handle(request, response)) return;
    if (await attachmentProbe.handle(request, response)) return;
    if (await managedMedia.handle(request, response)) return;
    for (const listener of legacyListeners) {
      await listener.call(server, request, response);
      if (response.writableEnded) break;
    }
  });

  return server;
}

export async function listen(
  config: AppConfig
): Promise<{
  server: ReturnType<typeof createManagedVoiceBridgeServer>;
  url: string;
}> {
  const server = createManagedVoiceBridgeServer(config);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return {
    server,
    url: `http://${address.address}:${address.port}`
  };
}
