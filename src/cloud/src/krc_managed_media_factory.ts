import type { AppConfig } from "./config.js";
import {
  CobaltFacebookRetriever,
  ScrapeCreatorsFacebookRetriever
} from "./facebook_media_retrieval.js";
import { DefaultManagedFacebookPipeline } from "./facebook_managed_pipeline.js";
import { MediaBetaGate } from "./media_beta.js";
import { ManagedMediaPersistentStore } from "./managed_media_persistence.js";
import { ManagedMediaService } from "./managed_media_service.js";
import {
  createMediaTranscriptionProvider,
  type MediaTranscriptionProvider
} from "./media_transcription_provider.js";
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

  const paidRetriever = config.scrapeCreatorsApiKey
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

  const service = new ManagedMediaService(
    new MediaBetaGate(
      config.mediaBetaCodes ?? [],
      config.mediaDailySttSeconds ?? 7200
    ),
    config.supadataApiKey ?? null,
    undefined,
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
