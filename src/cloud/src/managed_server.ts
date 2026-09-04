import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { AppConfig } from "./config.js";
import { createKrcManagedMediaService } from "./krc_managed_media_factory.js";
import { createManagedAttachmentProbeHttpHandler } from "./managed_attachment_probe_http.js";
import { createManagedMediaHttpHandler } from "./managed_media_http.js";
import { createPublicCobaltMediaHttpHandler } from "./public_cobalt_media.js";
import { PublicMediaAdmissionController } from "./public_media_admission.js";
import { createVoiceBridgeServer } from "./server.js";

type RequestListener = (
  request: IncomingMessage,
  response: ServerResponse
) => unknown;

export function createManagedVoiceBridgeServer(config: AppConfig) {
  const server = createVoiceBridgeServer(config);
  const legacyListeners = server.listeners("request") as RequestListener[];
  server.removeAllListeners("request");

  const attachmentProbe = createManagedAttachmentProbeHttpHandler(config);
  const krcManaged = createKrcManagedMediaService(config);
  const managedMedia = createManagedMediaHttpHandler(config, krcManaged.service);
  const publicCobaltMedia = config.mediaPublicMode
    ? createPublicCobaltMediaHttpHandler(config)
    : null;
  const publicAdmission = new PublicMediaAdmissionController(config);

  server.on("request", async (request, response) => {
    const lease = publicAdmission.admit(request, response);
    if (lease.handled) return;

    try {
      if (await attachmentProbe.handle(request, response)) return;
      if (publicCobaltMedia && await publicCobaltMedia.handle(request, response)) return;
      if (await managedMedia.handle(request, response)) return;
    } finally {
      lease.release();
    }

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
