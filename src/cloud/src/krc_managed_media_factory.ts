import type { AppConfig } from "./config.js";
import {
  CobaltFacebookRetriever,
  ScrapeCreatorsFacebookRetriever
} from "./facebook_media_retrieval.js";
import { DefaultManagedFacebookPipeline } from "./facebook_managed_pipeline.js";
import { FreeTierSupadataProvider } from "./free_tier_supadata_provider.js";
import { MediaBetaGate } from "./media_beta.js";
import { ManagedMediaPersistentStore } from "./managed_media_persistence.js";
import { ManagedMediaService } from "./managed_media_service.js";
import {
  createMediaTranscriptionProvider,
  type MediaTranscriptionProvider
} from "./media_transcription_provider.js";
import { SupadataProvider } from "./supadata_provider.js";
import { DefaultManagedTelegramPipeline } from "./telegram_managed_pipeline.js";
import { TelegramPublicWebRetriever } from "./telegram_public_retrieval.js";

export interface KrcManagedMediaFactoryResult {
  readonly service: ManagedMediaService;
  readonly transcriptionProvider: MediaTranscriptionProvider;
}

export function createKrcManagedMediaService(
  config: AppConfig
): KrcManagedMediaFactoryResult {
  const databaseUrl = process.env.KRC_MEDIA_DATABASE_URL?.trim() || null;
  const store = databaseUrl
    ? new ManagedMediaPersistentStore(databaseUrl)
    : undefined;

  const freeRetriever = config.cobaltEndpoint
    ? new CobaltFacebookRetriever(
      config.cobaltEndpoint,
      config.cobaltApiKey ?? null
    )
    : null;

  const paidRetriever = config.mediaFreeTierOnly
    ? null
    : config.scrapeCreatorsApiKey
      ? new ScrapeCreatorsFacebookRetriever(
        config.scrapeCreatorsApiKey,
        config.scrapeCreatorsEndpoint ?? "https://api.scrapecreators.com",
        config.scrapeCreatorsCacheMaxAge ?? "30d"
      )
      : null;

  const transcriptionProvider = createMediaTranscriptionProvider(config);
  const facebookPipeline = new DefaultManagedFacebookPipeline(
    freeRetriever,
    paidRetriever,
    transcriptionProvider.facebookStt
  );
  const telegramPipeline = new DefaultManagedTelegramPipeline(
    new TelegramPublicWebRetriever(),
    transcriptionProvider.telegramStt
  );

  // Supadata remains available only for the historical/private managed-native path.
  // Public MEDIA is routed by public_cobalt_media.ts and must not activate Supadata.
  const nativeProvider = !config.mediaPublicMode &&
    config.mediaFreeTierOnly &&
    config.supadataApiKey
    ? new FreeTierSupadataProvider(new SupadataProvider(config.supadataApiKey))
    : undefined;

  const service = new ManagedMediaService(
    new MediaBetaGate(
      config.mediaBetaCodes ?? [],
      config.mediaDailySttSeconds ?? 7200
    ),
    config.mediaPublicMode
      ? null
      : nativeProvider
        ? null
        : config.supadataApiKey ?? null,
    nativeProvider,
    {
      ...(store ? { store } : {}),
      jobTtlSeconds: config.mediaJobTtlSeconds ?? 3600,
      facebookPipeline,
      telegramPipeline,
      attachmentPipeline: transcriptionProvider.attachmentPipeline
    }
  );

  return { service, transcriptionProvider };
}
