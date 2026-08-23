from pathlib import Path
from textwrap import dedent


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


# --- config.ts ------------------------------------------------------------
path = Path("src/cloud/src/config.ts")
text = path.read_text(encoding="utf-8")

text = replace_once(
    text,
    '  assemblyAiApiKey: string | null;\n  supadataApiKey?: string | null;\n',
    '  assemblyAiApiKey: string | null;\n'
    '  supadataApiKey?: string | null;\n'
    '  cobaltEndpoint?: string | null;\n'
    '  cobaltApiKey?: string | null;\n'
    '  scrapeCreatorsApiKey?: string | null;\n'
    '  scrapeCreatorsEndpoint?: string;\n'
    '  scrapeCreatorsCacheMaxAge?: string;\n',
    "config interface",
)

anchor = dedent('''
function parseHttpsEndpoint(
  value: string | undefined,
  fallback: string,
  name: string
): string {
  const raw = value || fallback;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  const localHttp = parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error(`${name} must use HTTPS.`);
  }
  return raw.replace(/\\\/+$/, "");
}
''').strip() + "\n"
replacement = anchor + dedent('''

function parseOptionalHttpsEndpoint(
  value: string | undefined,
  name: string
): string | null {
  if (!value || !value.trim()) return null;
  return parseHttpsEndpoint(value.trim(), value.trim(), name);
}

function parseCacheMaxAge(value: string | undefined): string {
  const normalized = (value || "30d").trim().toLowerCase();
  if (!/^\\d{1,4}[smhdw]$/.test(normalized)) {
    throw new Error(
      "SCRAPECREATORS_CACHE_MAX_AGE must be an integer followed by s, m, h, d, or w."
    );
  }
  return normalized;
}
''')
text = replace_once(text, anchor, replacement, "config endpoint helpers")

text = replace_once(
    text,
    '    assemblyAiApiKey: environment.ASSEMBLYAI_API_KEY || null,\n'
    '    supadataApiKey: environment.SUPADATA_API_KEY || null,\n',
    '    assemblyAiApiKey: environment.ASSEMBLYAI_API_KEY || null,\n'
    '    supadataApiKey: environment.SUPADATA_API_KEY || null,\n'
    '    cobaltEndpoint: parseOptionalHttpsEndpoint(\n'
    '      environment.KRC_MEDIA_COBALT_ENDPOINT,\n'
    '      "KRC_MEDIA_COBALT_ENDPOINT"\n'
    '    ),\n'
    '    cobaltApiKey: environment.KRC_MEDIA_COBALT_API_KEY || null,\n'
    '    scrapeCreatorsApiKey: environment.SCRAPECREATORS_API_KEY || null,\n'
    '    scrapeCreatorsEndpoint: parseHttpsEndpoint(\n'
    '      environment.SCRAPECREATORS_ENDPOINT,\n'
    '      "https://api.scrapecreators.com",\n'
    '      "SCRAPECREATORS_ENDPOINT"\n'
    '    ),\n'
    '    scrapeCreatorsCacheMaxAge: parseCacheMaxAge(\n'
    '      environment.SCRAPECREATORS_CACHE_MAX_AGE\n'
    '    ),\n',
    "config provider env",
)
path.write_text(text, encoding="utf-8")


# --- managed_media_http.ts ------------------------------------------------
path = Path("src/cloud/src/managed_media_http.ts")
text = path.read_text(encoding="utf-8")

text = replace_once(
    text,
    'import { MediaBetaGate } from "./media_beta.js";\n',
    'import { MediaBetaGate } from "./media_beta.js";\n'
    'import {\n'
    '  CobaltFacebookRetriever,\n'
    '  ScrapeCreatorsFacebookRetriever\n'
    '} from "./facebook_media_retrieval.js";\n'
    'import {\n'
    '  AssemblyAiFacebookMediaStt,\n'
    '  DefaultManagedFacebookPipeline\n'
    '} from "./facebook_managed_pipeline.js";\n',
    "http provider imports",
)

text = replace_once(
    text,
    '  ManagedMediaService,\n'
    '  parseManagedMediaAiInput,\n'
    '  parseManagedMediaFacebookMetadataInput,\n',
    '  ManagedMediaService,\n'
    '  parseManagedMediaAiInput,\n'
    '  parseManagedMediaFacebookFallbackConsentInput,\n'
    '  parseManagedMediaFacebookMetadataInput,\n',
    "http service parser import",
)

text = replace_once(
    text,
    'const TRANSCRIPTIONS = `${ROOT}/transcriptions`;\n',
    'const TRANSCRIPTIONS = `${ROOT}/transcriptions`;\n'
    'const FACEBOOK_FALLBACK = `${ROOT}/facebook-fallback`;\n',
    "http fallback constant",
)

text = replace_once(
    text,
    'const FACEBOOK_METADATA_PREFLIGHT_PATH = /^\\/api\\/v1\\/media\\/managed\\/transcriptions\\/(KRCM_[A-Za-z0-9-]+)\\/facebook-ai-estimate-preflight$/;\n',
    'const FACEBOOK_RETRIEVAL_PREFLIGHT_PATH = /^\\/api\\/v1\\/media\\/managed\\/transcriptions\\/(KRCM_[A-Za-z0-9-]+)\\/facebook-retrieval-preflight$/;\n'
    'const FACEBOOK_RETRIEVAL_START_PATH = /^\\/api\\/v1\\/media\\/managed\\/transcriptions\\/(KRCM_[A-Za-z0-9-]+)\\/facebook-retrieval$/;\n'
    'const FACEBOOK_METADATA_PREFLIGHT_PATH = /^\\/api\\/v1\\/media\\/managed\\/transcriptions\\/(KRCM_[A-Za-z0-9-]+)\\/facebook-ai-estimate-preflight$/;\n',
    "http fallback path regex",
)

old_factory = dedent('''
function defaultManagedService(config: AppConfig): ManagedMediaService {
  const databaseUrl = process.env.KRC_MEDIA_DATABASE_URL?.trim() || null;
  const store = databaseUrl
    ? new ManagedMediaPersistentStore(databaseUrl)
    : undefined;
  return new ManagedMediaService(
    new MediaBetaGate(
      config.mediaBetaCodes ?? [],
      config.mediaDailySttSeconds ?? 7200
    ),
    config.supadataApiKey ?? null,
    undefined,
    {
      ...(store ? { store } : {}),
      jobTtlSeconds: config.mediaJobTtlSeconds ?? 3600
    }
  );
}
''').strip() + "\n"
new_factory = dedent('''
function defaultManagedService(config: AppConfig): ManagedMediaService {
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
  const facebookPipeline = new DefaultManagedFacebookPipeline(
    freeRetriever,
    paidRetriever,
    new AssemblyAiFacebookMediaStt(config.assemblyAiApiKey)
  );
  return new ManagedMediaService(
    new MediaBetaGate(
      config.mediaBetaCodes ?? [],
      config.mediaDailySttSeconds ?? 7200
    ),
    config.supadataApiKey ?? null,
    undefined,
    {
      ...(store ? { store } : {}),
      jobTtlSeconds: config.mediaJobTtlSeconds ?? 3600,
      facebookPipeline
    }
  );
}
''').strip() + "\n"
text = replace_once(text, old_factory, new_factory, "http runtime factory")

text = replace_once(
    text,
    '    facebook_ai_metadata_credits: 1,\n'
    '    ai_requires_separate_preflight: true,\n',
    '    facebook_ai_metadata_credits: 1,\n'
    '    facebook_retrieval_stt_fallback: true,\n'
    '    facebook_free_retrieval_provider: "cobalt",\n'
    '    facebook_free_retrieval_configured: Boolean(config.cobaltEndpoint),\n'
    '    facebook_paid_retrieval_provider: "scrapecreators",\n'
    '    facebook_paid_retrieval_configured: Boolean(config.scrapeCreatorsApiKey),\n'
    '    facebook_paid_retrieval_max_credits: 1,\n'
    '    facebook_paid_retrieval_requires_separate_consent: true,\n'
    '    facebook_automatic_paid_retrieval: false,\n'
    '    facebook_stt_provider: "assemblyai",\n'
    '    facebook_stt_configured: Boolean(config.assemblyAiApiKey),\n'
    '    ai_requires_separate_preflight: true,\n',
    "http capability",
)

fallback_route = dedent('''
      if (method === "POST" && path === FACEBOOK_FALLBACK) {
        const rawBody = await readJsonBody(request, config.maxRequestBodyBytes);
        const body = withServerOwnerAccessCode(rawBody, config.mediaBetaCodes);
        const input = parseManagedMediaPreflightInput(body);
        if (!input) {
          throw new MediaTranscriptError(
            "INVALID_REQUEST",
            "The managed Facebook fallback request is not valid.",
            400,
            false
          );
        }
        const job = await service.startFacebookFallback(input);
        sendJson(
          response,
          200,
          { request_id: context.requestId, ...job },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

''')
text = replace_once(
    text,
    '      if (method === "POST" && path === TRANSCRIPTIONS) {\n',
    fallback_route + '      if (method === "POST" && path === TRANSCRIPTIONS) {\n',
    "http free fallback route",
)

retrieval_routes = dedent('''
      const facebookRetrievalPreflightMatch = FACEBOOK_RETRIEVAL_PREFLIGHT_PATH.exec(path);
      if (method === "GET" && facebookRetrievalPreflightMatch?.[1]) {
        const quote = await service.facebookFallbackPreflight(
          facebookRetrievalPreflightMatch[1],
          serverOwnerAccessCode(config.mediaBetaCodes)
        );
        sendJson(
          response,
          200,
          { request_id: context.requestId, ...quote },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

      const facebookRetrievalStartMatch = FACEBOOK_RETRIEVAL_START_PATH.exec(path);
      if (method === "POST" && facebookRetrievalStartMatch?.[1]) {
        const rawBody = await readJsonBody(request, config.maxRequestBodyBytes);
        const body = withServerOwnerAccessCode(rawBody, config.mediaBetaCodes);
        const input = parseManagedMediaFacebookFallbackConsentInput(body);
        if (!input) {
          throw new MediaTranscriptError(
            "FACEBOOK_RETRIEVAL_CREDIT_CONSENT_REQUIRED",
            "Separate one-credit ScrapeCreators consent is required before paid Facebook retrieval.",
            409,
            false
          );
        }
        const job = await service.continueFacebookFallback(
          facebookRetrievalStartMatch[1],
          input
        );
        sendJson(
          response,
          200,
          { request_id: context.requestId, ...job },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

''')
text = replace_once(
    text,
    '      const facebookMetadataPreflightMatch = FACEBOOK_METADATA_PREFLIGHT_PATH.exec(path);\n',
    retrieval_routes + '      const facebookMetadataPreflightMatch = FACEBOOK_METADATA_PREFLIGHT_PATH.exec(path);\n',
    "http retrieval consent routes",
)
path.write_text(text, encoding="utf-8")


# --- .env.example ---------------------------------------------------------
path = Path("src/cloud/.env.example")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    'ASSEMBLYAI_API_KEY=replace-with-an-assemblyai-api-key\n',
    'ASSEMBLYAI_API_KEY=replace-with-an-assemblyai-api-key\n'
    'KRC_MEDIA_COBALT_ENDPOINT=\n'
    'KRC_MEDIA_COBALT_API_KEY=\n'
    'SCRAPECREATORS_API_KEY=\n'
    'SCRAPECREATORS_ENDPOINT=https://api.scrapecreators.com\n'
    'SCRAPECREATORS_CACHE_MAX_AGE=30d\n',
    "env example",
)
path.write_text(text, encoding="utf-8")


# --- managed_media_http.test.ts ------------------------------------------
path = Path("src/cloud/tests/managed_media_http.test.ts")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    'import type { AppConfig } from "../src/config.js";\n',
    'import type { AppConfig } from "../src/config.js";\n'
    'import type { ManagedFacebookPipeline } from "../src/facebook_managed_pipeline.js";\n'
    'import type {\n'
    '  FacebookMediaAsset,\n'
    '  FacebookRetrievalCreditConsent\n'
    '} from "../src/facebook_media_retrieval.js";\n',
    "http test imports",
)

fake_pipeline = dedent('''
class FakeFacebookPipeline implements ManagedFacebookPipeline {
  readonly configured = true;
  freeCalls = 0;
  paidCalls = 0;
  sttCalls = 0;

  constructor(private readonly freeSucceeds: boolean) {}

  async freeRetrieve(sourceUrl: string): Promise<FacebookMediaAsset | null> {
    this.freeCalls += 1;
    if (!this.freeSucceeds) return null;
    return {
      source_url: sourceUrl,
      media_url: "https://media.example/free-facebook.mp4",
      duration_seconds: 12,
      provider: "cobalt",
      provider_mode: "self_hosted",
      credits_charged: 0,
      credits_remaining: null,
      cached: false
    };
  }

  async paidRetrieve(
    sourceUrl: string,
    consent: FacebookRetrievalCreditConsent
  ): Promise<FacebookMediaAsset> {
    this.paidCalls += 1;
    assert.deepEqual(consent, {
      provider: "scrapecreators",
      mode: "facebook_post",
      max_credits: 1
    });
    return {
      source_url: sourceUrl,
      media_url: "https://media.example/paid-facebook.mp4",
      duration_seconds: 18,
      provider: "scrapecreators",
      provider_mode: "facebook_post",
      credits_charged: 1,
      credits_remaining: 41,
      cached: false
    };
  }

  async transcribe(
    asset: FacebookMediaAsset,
    _languageHint: "auto" | "uk" | "ru" | "en",
    reserveSttSeconds: (seconds: number) => void
  ) {
    this.sttCalls += 1;
    const duration = asset.duration_seconds ?? 10;
    reserveSttSeconds(duration);
    return {
      provider: "assemblyai" as const,
      provider_model: "universal-2" as const,
      provider_data_deleted: true,
      detected_language: "uk",
      language_confidence: 0.97,
      duration_seconds: duration,
      transcript_text: "Managed Facebook HTTP fallback transcript",
      segments: [{
        index: 0,
        start_ms: 0,
        end_ms: Math.ceil(duration * 1000),
        text: "Managed Facebook HTTP fallback transcript",
        confidence: 0.95
      }]
    };
  }
}

''')
text = replace_once(
    text,
    'function actionHeaders(): Record<string, string> {\n',
    fake_pipeline + 'function actionHeaders(): Record<string, string> {\n',
    "http fake facebook pipeline",
)

new_tests = dedent('''

test("managed HTTP free Facebook fallback completes through injected Cobalt and AssemblyAI adapters", async () => {
  const pipeline = new FakeFacebookPipeline(true);
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    undefined,
    { facebookPipeline: pipeline }
  );
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/v1/media/managed/facebook-fallback`, {
      method: "POST",
      headers: actionHeaders(),
      body: JSON.stringify({
        url: "https://www.facebook.com/reel/1114235920664408/",
        language_hint: "auto"
      })
    });
    assert.equal(response.status, 200);
    const job = await response.json() as Record<string, unknown>;
    assert.equal(job.status, "COMPLETED");
    assert.equal(job.provider, "assemblyai");
    assert.equal(job.provider_mode, "facebook_retrieval_stt");
    assert.equal(job.retrieval_provider, "cobalt");
    assert.equal(job.retrieval_credits_charged, 0);
    assert.equal(job.stt_seconds_charged, 12);
    assert.equal(job.segment_count, 1);
    assert.equal(pipeline.freeCalls, 1);
    assert.equal(pipeline.paidCalls, 0);
    assert.equal(pipeline.sttCalls, 1);

    const segments = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/${String(job.job_id)}/segments`,
      { headers: { authorization: `Bearer ${ACTION_TOKEN}`, connection: "close" } }
    );
    assert.equal(segments.status, 200);
    const page = await segments.json() as { segments?: unknown[] };
    assert.equal(page.segments?.length, 1);
  } finally {
    await close(server);
  }
});

test("managed HTTP paid Facebook retrieval requires local preflight and exact one-credit consent", async () => {
  const pipeline = new FakeFacebookPipeline(false);
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    undefined,
    { facebookPipeline: pipeline }
  );
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const baseUrl = await listen(server);
  try {
    const initial = await fetch(`${baseUrl}/api/v1/media/managed/facebook-fallback`, {
      method: "POST",
      headers: actionHeaders(),
      body: JSON.stringify({
        url: "https://www.facebook.com/reel/1114235920664408/",
        language_hint: "auto"
      })
    });
    assert.equal(initial.status, 200);
    const waiting = await initial.json() as Record<string, unknown>;
    assert.equal(waiting.status, "AWAITING_RETRIEVAL_CONSENT");
    assert.equal(pipeline.freeCalls, 1);
    assert.equal(pipeline.paidCalls, 0);
    assert.equal(pipeline.sttCalls, 0);
    const jobId = String(waiting.job_id);

    const preflight = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/${jobId}/facebook-retrieval-preflight`,
      { headers: { authorization: `Bearer ${ACTION_TOKEN}`, connection: "close" } }
    );
    assert.equal(preflight.status, 200);
    const quote = await preflight.json() as Record<string, unknown>;
    assert.equal(quote.provider, "scrapecreators");
    assert.equal(quote.mode, "facebook_post");
    assert.equal(quote.estimated_credits, 1);
    assert.equal(quote.maximum_credits, 1);
    assert.equal(quote.provider_balance_lookup_performed, false);
    assert.equal(pipeline.paidCalls, 0);

    const denied = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/${jobId}/facebook-retrieval`,
      {
        method: "POST",
        headers: actionHeaders(),
        body: JSON.stringify({})
      }
    );
    assert.equal(denied.status, 409);
    const deniedBody = await denied.json() as { error?: { code?: string } };
    assert.equal(
      deniedBody.error?.code,
      "FACEBOOK_RETRIEVAL_CREDIT_CONSENT_REQUIRED"
    );
    assert.equal(pipeline.paidCalls, 0);

    const approvedBody = {
      credit_consent: {
        provider: "scrapecreators",
        mode: "facebook_post",
        max_credits: 1
      }
    };
    const approved = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/${jobId}/facebook-retrieval`,
      {
        method: "POST",
        headers: actionHeaders(),
        body: JSON.stringify(approvedBody)
      }
    );
    assert.equal(approved.status, 200);
    const completed = await approved.json() as Record<string, unknown>;
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.retrieval_provider, "scrapecreators");
    assert.equal(completed.retrieval_credits_charged, 1);
    assert.equal(completed.credits_charged, 1);
    assert.equal(completed.credits_remaining_estimate, 41);
    assert.equal(completed.stt_seconds_charged, 18);
    assert.equal(pipeline.paidCalls, 1);
    assert.equal(pipeline.sttCalls, 1);

    const duplicate = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/${jobId}/facebook-retrieval`,
      {
        method: "POST",
        headers: actionHeaders(),
        body: JSON.stringify(approvedBody)
      }
    );
    assert.equal(duplicate.status, 200);
    const duplicateBody = await duplicate.json() as Record<string, unknown>;
    assert.equal(duplicateBody.reused, true);
    assert.equal(pipeline.paidCalls, 1);
    assert.equal(pipeline.sttCalls, 1);
  } finally {
    await close(server);
  }
});

test("managed default runtime factory advertises configured Facebook retrieval without making provider calls", async () => {
  const runtimeConfig: AppConfig = {
    ...CONFIG,
    assemblyAiApiKey: "assemblyai-test-key",
    cobaltEndpoint: "http://127.0.0.1:65534",
    cobaltApiKey: null,
    scrapeCreatorsApiKey: null,
    scrapeCreatorsEndpoint: "http://127.0.0.1:65533",
    scrapeCreatorsCacheMaxAge: "30d"
  };
  const handler = createManagedMediaHttpHandler(runtimeConfig);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/v1/media/managed`, {
      headers: { authorization: `Bearer ${ACTION_TOKEN}`, connection: "close" }
    });
    assert.equal(response.status, 200);
    const capability = await response.json() as Record<string, unknown>;
    assert.equal(capability.configured, true);
    assert.equal(capability.facebook_retrieval_stt_fallback, true);
    assert.equal(capability.facebook_free_retrieval_provider, "cobalt");
    assert.equal(capability.facebook_free_retrieval_configured, true);
    assert.equal(capability.facebook_paid_retrieval_provider, "scrapecreators");
    assert.equal(capability.facebook_paid_retrieval_configured, false);
    assert.equal(capability.facebook_paid_retrieval_max_credits, 1);
    assert.equal(capability.facebook_paid_retrieval_requires_separate_consent, true);
    assert.equal(capability.facebook_automatic_paid_retrieval, false);
    assert.equal(capability.facebook_stt_provider, "assemblyai");
    assert.equal(capability.facebook_stt_configured, true);
  } finally {
    await close(server);
  }
});
''')
if 'managed HTTP free Facebook fallback completes through injected Cobalt' not in text:
    text = text.rstrip() + "\n" + new_tests
path.write_text(text, encoding="utf-8")
