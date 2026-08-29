from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    source = target.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(
            f"{path}: expected exactly one replacement, found {count}: {old[:100]!r}"
        )
    target.write_text(source.replace(old, new, 1))


# Make the quota callback awaitable. Every real AssemblyAI path must wait for
# the quota decision before upload/submit begins.
for path in (
    "src/cloud/src/facebook_managed_pipeline.ts",
    "src/cloud/src/telegram_managed_pipeline.ts",
    "src/cloud/src/attachment_managed_pipeline.ts",
):
    target = Path(path)
    source = target.read_text()
    old = "reserveSttSeconds: (seconds: number) => void"
    if old not in source:
        raise SystemExit(f"{path}: quota callback signature baseline missing")
    target.write_text(
        source.replace(
            old,
            "reserveSttSeconds: (seconds: number) => void | Promise<void>",
        )
    )

replace_once(
    "src/cloud/src/facebook_managed_pipeline.ts",
    "      reserveSttSeconds(duration);",
    "      await reserveSttSeconds(duration);",
)
replace_once(
    "src/cloud/src/telegram_managed_pipeline.ts",
    "    reserveSttSeconds(duration);",
    "    await reserveSttSeconds(duration);",
)
replace_once(
    "src/cloud/src/attachment_managed_pipeline.ts",
    "      reserveSttSeconds(durationSeconds);",
    "      await reserveSttSeconds(durationSeconds);",
)

# Invalid or non-finite duration input must fail closed instead of poisoning
# the in-memory quota counter with NaN/Infinity.
replace_once(
    "src/cloud/src/media_beta.ts",
    """  ): MediaBetaReserveResult {
    const seconds = Math.max(1, Math.ceil(requestedSeconds));
    const day = utcDay(now);""",
    """  ): MediaBetaReserveResult {
    if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 0) {
      return { allowed: false, usage: this.usage(now) };
    }
    const seconds = Math.ceil(requestedSeconds);
    const day = utcDay(now);""",
)

# Managed durable stores can expose an atomic STT quota ledger reservation.
replace_once(
    "src/cloud/src/managed_media_service.ts",
    """export interface ManagedMediaStoreReservation {
  created: boolean;
  record: ManagedMediaStoredRecord;
}

export interface ManagedMediaJobStore {""",
    """export interface ManagedMediaStoreReservation {
  created: boolean;
  record: ManagedMediaStoredRecord;
}

export interface ManagedMediaSttReservation {
  allowed: boolean;
  used_seconds: number;
  remaining_seconds: number;
}

export interface ManagedMediaJobStore {""",
)
replace_once(
    "src/cloud/src/managed_media_service.ts",
    """  reserve(record: ManagedMediaStoredRecord): Promise<ManagedMediaStoreReservation>;
  put(record: ManagedMediaStoredRecord): Promise<void>;
  get(jobId: string): Promise<ManagedMediaStoredRecord | null>;
}""",
    """  reserve(record: ManagedMediaStoredRecord): Promise<ManagedMediaStoreReservation>;
  put(record: ManagedMediaStoredRecord): Promise<void>;
  get(jobId: string): Promise<ManagedMediaStoredRecord | null>;
  reserveSttSeconds?(
    jobId: string,
    dayUtc: string,
    requestedSeconds: number,
    dailyLimitSeconds: number
  ): Promise<ManagedMediaSttReservation>;
}""",
)

# Persistent quota is authoritative. A persistent-store error does not fall
# back to an in-memory allowance.
replace_once(
    "src/cloud/src/managed_media_service.ts",
    """  async preflight(
    input: ManagedMediaPreflightInput
  ): Promise<ManagedMediaCreditPreflight> {""",
    """  private async reserveSttQuota(
    jobId: string,
    requestedSeconds: number
  ): Promise<void> {
    if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 0) {
      throw new MediaTranscriptError(
        \"MEDIA_STT_DURATION_INVALID\",
        \"The media duration is invalid for STT quota reservation.\",
        422,
        false
      );
    }
    const now = new Date();
    const usage = this.betaGate.usage(now);
    if (this.store.reserveSttSeconds) {
      let reservation: ManagedMediaSttReservation;
      try {
        reservation = await this.store.reserveSttSeconds(
          jobId,
          usage.day_utc,
          requestedSeconds,
          usage.daily_limit_seconds
        );
      } catch {
        throw new MediaTranscriptError(
          \"MANAGED_DURABLE_STORE_UNAVAILABLE\",
          \"The managed media durable quota ledger is temporarily unavailable.\",
          503,
          true
        );
      }
      if (!reservation.allowed) {
        throw new MediaTranscriptError(
          \"MEDIA_BETA_STT_QUOTA_EXHAUSTED\",
          \"The closed MEDIA BETA daily STT quota is exhausted.\",
          429,
          false
        );
      }
      this.betaGate.restoreUsage(usage.day_utc, reservation.used_seconds);
      return;
    }
    const reservation = this.betaGate.reserveSttSeconds(requestedSeconds, now);
    if (!reservation.allowed) {
      throw new MediaTranscriptError(
        \"MEDIA_BETA_STT_QUOTA_EXHAUSTED\",
        \"The closed MEDIA BETA daily STT quota is exhausted.\",
        429,
        false
      );
    }
  }

  async preflight(
    input: ManagedMediaPreflightInput
  ): Promise<ManagedMediaCreditPreflight> {""",
)

# Enforce exact consent shape at the service boundary, not just the HTTP parser.
replace_once(
    "src/cloud/src/managed_media_service.ts",
    """  async startNative(input: ManagedMediaNativeInput): Promise<ManagedMediaJobView> {
    this.authorize(input.beta_access_code);
    await this.ensureStore();""",
    """  async startNative(input: ManagedMediaNativeInput): Promise<ManagedMediaJobView> {
    this.authorize(input.beta_access_code);
    if (
      input.credit_consent?.provider !== \"supadata\" ||
      input.credit_consent?.mode !== \"native\" ||
      input.credit_consent?.max_credits !== 1
    ) {
      throw new MediaTranscriptError(
        \"MEDIA_CREDIT_CONSENT_REQUIRED\",
        \"Exact one-credit Supadata native consent is required before processing.\",
        409,
        false
      );
    }
    await this.ensureStore();""",
)

replace_once(
    "src/cloud/src/managed_media_service.ts",
    """  async startFacebookMetadata(
    jobId: string,
    input: ManagedMediaFacebookMetadataInput
  ): Promise<ManagedMediaJobView> {
    const record = await this.authorizedRecord(jobId, input.beta_access_code);
    this.authorizeFacebookMetadataProvider();
    if ((record.job.media_duration_seconds ?? null) !== null) {""",
    """  async startFacebookMetadata(
    jobId: string,
    input: ManagedMediaFacebookMetadataInput
  ): Promise<ManagedMediaJobView> {
    const record = await this.authorizedRecord(jobId, input.beta_access_code);
    if (
      input.credit_consent?.provider !== \"supadata\" ||
      input.credit_consent?.mode !== \"metadata\" ||
      input.credit_consent?.max_credits !== 1
    ) {
      throw new MediaTranscriptError(
        \"MEDIA_METADATA_CREDIT_CONSENT_REQUIRED\",
        \"Exact one-credit Supadata metadata consent is required before duration lookup.\",
        409,
        false
      );
    }
    this.authorizeFacebookMetadataProvider();
    if ((record.job.media_duration_seconds ?? null) !== null) {""",
)

replace_once(
    "src/cloud/src/managed_media_service.ts",
    """    const record = await this.authorizedRecord(jobId, input.beta_access_code);
    this.authorizeFacebookPipeline(input.beta_access_code);
    if (record.job.provider_mode === \"facebook_retrieval_stt\" && record.job.status === \"COMPLETED\") {""",
    """    const record = await this.authorizedRecord(jobId, input.beta_access_code);
    this.authorizeFacebookPipeline(input.beta_access_code);
    if (!parseFacebookRetrievalCreditConsent(input.credit_consent)) {
      throw new MediaTranscriptError(
        \"FACEBOOK_RETRIEVAL_CREDIT_CONSENT_REQUIRED\",
        \"Exact one-credit ScrapeCreators consent is required before paid Facebook retrieval.\",
        409,
        false
      );
    }
    if (record.job.provider_mode === \"facebook_retrieval_stt\" && record.job.status === \"COMPLETED\") {""",
)

replace_once(
    "src/cloud/src/managed_media_service.ts",
    """  async startAi(
    jobId: string,
    input: ManagedMediaAiInput
  ): Promise<ManagedMediaJobView> {
    const record = await this.authorizedRecord(jobId, input.beta_access_code);
    this.authorizeAiProvider();

    if (record.job.provider_mode === \"generate\") {""",
    """  async startAi(
    jobId: string,
    input: ManagedMediaAiInput
  ): Promise<ManagedMediaJobView> {
    const record = await this.authorizedRecord(jobId, input.beta_access_code);
    if (
      input.credit_consent?.provider !== \"supadata\" ||
      input.credit_consent?.mode !== \"generate\" ||
      !Number.isInteger(input.credit_consent?.max_credits) ||
      input.credit_consent.max_credits < 2 ||
      input.credit_consent.max_credits > 10000
    ) {
      throw new MediaTranscriptError(
        \"MEDIA_AI_CREDIT_CONSENT_REQUIRED\",
        \"A valid explicit Supadata AI credit consent is required before generated transcription.\",
        409,
        false
      );
    }
    this.authorizeAiProvider();

    if (record.job.provider_mode === \"generate\") {""",
)

# Managed attachment and Telegram have identical quota callback blocks.
service_path = Path("src/cloud/src/managed_media_service.ts")
service_source = service_path.read_text()
old_quota_callback = """        (seconds) => {
          const quota = this.betaGate.reserveSttSeconds(seconds);
          if (!quota.allowed) {
            throw new MediaTranscriptError(
              \"MEDIA_BETA_STT_QUOTA_EXHAUSTED\",
              \"The closed MEDIA BETA daily STT quota is exhausted.\",
              429,
              false
            );
          }
        }
"""
if service_source.count(old_quota_callback) != 2:
    raise SystemExit(
        "expected exactly two attachment/Telegram in-memory quota callbacks"
    )
service_source = service_source.replace(
    old_quota_callback,
    "        (seconds) => this.reserveSttQuota(job.job_id, seconds)\n",
    2,
)
old_facebook_callback = """    const stt = await this.facebookPipeline!.transcribe(asset, languageHint, (seconds) => {
      const reservation = this.betaGate.reserveSttSeconds(seconds);
      if (!reservation.allowed) {
        throw new MediaTranscriptError(
          \"MEDIA_BETA_STT_QUOTA_EXHAUSTED\",
          \"The closed MEDIA BETA daily STT quota is exhausted.\",
          429,
          false
        );
      }
    });"""
new_facebook_callback = """    const stt = await this.facebookPipeline!.transcribe(
      asset,
      languageHint,
      (seconds) => this.reserveSttQuota(record.job.job_id, seconds)
    );"""
if service_source.count(old_facebook_callback) != 1:
    raise SystemExit("Facebook in-memory quota callback baseline missing")
service_path.write_text(
    service_source.replace(old_facebook_callback, new_facebook_callback, 1)
)

# Add an atomic, idempotent per-day ledger to the managed PostgreSQL store.
replace_once(
    "src/cloud/src/managed_media_persistence.ts",
    """  ManagedMediaJobStore,
  ManagedMediaStoredRecord,
  ManagedMediaStoreReservation,
  ManagedMediaStatus""",
    """  ManagedMediaJobStore,
  ManagedMediaStoredRecord,
  ManagedMediaStoreReservation,
  ManagedMediaSttReservation,
  ManagedMediaStatus""",
)

replace_once(
    "src/cloud/src/managed_media_persistence.ts",
    """  async purgeExpired(): Promise<void> {
    await this.ready();
    await this.run(\"DELETE FROM krc_managed_media_jobs WHERE expires_at <= now();\");
  }""",
    """  async reserveSttSeconds(
    jobId: string,
    dayUtc: string,
    requestedSeconds: number,
    dailyLimitSeconds: number
  ): Promise<ManagedMediaSttReservation> {
    if (!JOB_ID.test(jobId)) throw new Error(\"Invalid managed quota job id.\");
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dayUtc)) {
      throw new Error(\"Invalid managed quota day.\");
    }
    if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 0) {
      throw new Error(\"Invalid managed quota seconds.\");
    }
    if (
      !Number.isInteger(dailyLimitSeconds) ||
      dailyLimitSeconds < 60 ||
      dailyLimitSeconds > 86400
    ) {
      throw new Error(\"Invalid managed daily quota limit.\");
    }
    const seconds = Math.ceil(requestedSeconds);
    await this.ready();
    const output = await this.run(`
WITH quota_lock AS MATERIALIZED (
  SELECT pg_advisory_xact_lock(hashtext('krc_media_stt_quota|${dayUtc}'))
),
existing AS MATERIALIZED (
  SELECT charges.day_utc, charges.seconds
  FROM quota_lock, krc_media_stt_charges charges
  WHERE charges.job_id='${jobId}'
),
usage_before AS MATERIALIZED (
  SELECT COALESCE(SUM(charges.seconds), 0)::bigint AS used_seconds
  FROM quota_lock
  LEFT JOIN krc_media_stt_charges charges
    ON charges.day_utc='${dayUtc}'::date
),
inserted AS (
  INSERT INTO krc_media_stt_charges (job_id, day_utc, seconds)
  SELECT '${jobId}', '${dayUtc}'::date, ${seconds}
  FROM usage_before
  WHERE NOT EXISTS (SELECT 1 FROM existing)
    AND usage_before.used_seconds + ${seconds} <= ${dailyLimitSeconds}
  ON CONFLICT (job_id) DO NOTHING
  RETURNING seconds
)
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM existing
      WHERE day_utc='${dayUtc}'::date AND seconds >= ${seconds}
    ) THEN 1
    WHEN EXISTS (SELECT 1 FROM inserted) THEN 1
    ELSE 0
  END,
  usage_before.used_seconds + COALESCE((SELECT SUM(seconds) FROM inserted), 0),
  GREATEST(
    0,
    ${dailyLimitSeconds} - (
      usage_before.used_seconds + COALESCE((SELECT SUM(seconds) FROM inserted), 0)
    )
  )
FROM usage_before;
`);
    const line = output
      .split(/\\r?\\n/)
      .filter((item) => item.split(\"\\t\").length === 3)
      .at(-1);
    if (!line) throw new Error(\"Managed media quota reservation returned no row.\");
    const [allowedRaw, usedRaw, remainingRaw] = line.split(\"\\t\");
    const used = Number(usedRaw);
    const remaining = Number(remainingRaw);
    if (
      (allowedRaw !== \"0\" && allowedRaw !== \"1\") ||
      !Number.isFinite(used) ||
      !Number.isFinite(remaining)
    ) {
      throw new Error(\"Managed media quota reservation row is malformed.\");
    }
    return {
      allowed: allowedRaw === \"1\",
      used_seconds: Math.max(0, Math.floor(used)),
      remaining_seconds: Math.max(0, Math.floor(remaining))
    };
  }

  async purgeExpired(): Promise<void> {
    await this.ready();
    await this.run(`
DELETE FROM krc_managed_media_jobs WHERE expires_at <= now();
DELETE FROM krc_media_stt_charges WHERE day_utc < current_date - interval '2 days';
`);
  }""",
)

replace_once(
    "src/cloud/src/managed_media_persistence.ts",
    """CREATE INDEX IF NOT EXISTS krc_managed_media_jobs_updated_idx
  ON krc_managed_media_jobs (updated_at DESC);
`);""",
    """CREATE INDEX IF NOT EXISTS krc_managed_media_jobs_updated_idx
  ON krc_managed_media_jobs (updated_at DESC);
CREATE TABLE IF NOT EXISTS krc_media_stt_charges (
  job_id text PRIMARY KEY,
  day_utc date NOT NULL,
  seconds integer NOT NULL CHECK (seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS krc_media_stt_charges_day_idx
  ON krc_media_stt_charges (day_utc);
`);""",
)

# Regression matrix. This is intentionally provider-fake-only: no external
# provider, Cobalt, AssemblyAI, Supadata, or live database is contacted here.
test_path = Path("src/cloud/tests/managed_media_consent_credit_quota.test.ts")
test_path.write_text(r'''import assert from "node:assert/strict";
import { test } from "node:test";
import type { ManagedAttachmentPipeline } from "../src/attachment_managed_pipeline.js";
import type { ManagedFacebookPipeline } from "../src/facebook_managed_pipeline.js";
import { MediaBetaGate } from "../src/media_beta.js";
import {
  ManagedMediaService,
  managedMediaAccessDigest,
  parseManagedMediaAiInput,
  parseManagedMediaFacebookFallbackConsentInput,
  parseManagedMediaFacebookMetadataInput,
  parseManagedMediaNativeInput,
  type ManagedMediaJobStore,
  type ManagedMediaJobView,
  type ManagedMediaStoredRecord,
  type ManagedMediaStoreReservation,
  type ManagedMediaSttReservation,
  type ManagedNativeTranscriptProvider
} from "../src/managed_media_service.js";

const ACCESS_CODE = "consent-credit-owner-2026";

class FixtureStore implements ManagedMediaJobStore {
  readonly durable = true;
  readonly kind = "postgres" as const;
  protected readonly records = new Map<string, ManagedMediaStoredRecord>();

  add(record: ManagedMediaStoredRecord): void {
    this.records.set(record.job.job_id, structuredClone(record));
  }

  async ready(): Promise<void> {}
  async purgeExpired(): Promise<void> {}

  async findByRequestKey(key: string): Promise<ManagedMediaStoredRecord | null> {
    for (const record of this.records.values()) {
      if (record.requestKey === key) return structuredClone(record);
    }
    return null;
  }

  async reserve(record: ManagedMediaStoredRecord): Promise<ManagedMediaStoreReservation> {
    const existing = await this.findByRequestKey(record.requestKey);
    if (existing) return { created: false, record: existing };
    this.add(record);
    return { created: true, record: structuredClone(record) };
  }

  async put(record: ManagedMediaStoredRecord): Promise<void> {
    this.add(record);
  }

  async get(jobId: string): Promise<ManagedMediaStoredRecord | null> {
    const record = this.records.get(jobId);
    return record ? structuredClone(record) : null;
  }
}

class QuotaStore extends FixtureStore {
  quotaCalls = 0;

  constructor(private readonly reservation: ManagedMediaSttReservation) {
    super();
  }

  async reserveSttSeconds(): Promise<ManagedMediaSttReservation> {
    this.quotaCalls += 1;
    return { ...this.reservation };
  }
}

function fixtureRecord(
  id: string,
  sourceUrl: string,
  status: ManagedMediaJobView["status"],
  providerMode: ManagedMediaJobView["provider_mode"]
): ManagedMediaStoredRecord {
  const now = new Date().toISOString();
  return {
    job: {
      job_id: id,
      status,
      created_at: now,
      updated_at: now,
      source_url: sourceUrl,
      language_hint: "auto",
      provider: providerMode === "facebook_retrieval_stt" ? "assemblyai" : "supadata",
      provider_mode: providerMode,
      detected_language: null,
      available_languages: [],
      credits_charged: 0,
      credits_remaining_estimate: 100,
      credit_charge_uncertain: false,
      reused: false,
      segment_count: 0,
      transcript_characters: 0,
      ai_fallback_requires_new_consent: status === "AWAITING_AI_CONSENT",
      media_duration_seconds: null,
      ai_credit_ceiling: null,
      metadata_credits_charged: 0,
      error: null
    },
    requestKey: managedMediaAccessDigest(`request-${id}`),
    accessCodeDigest: managedMediaAccessDigest(ACCESS_CODE),
    segments: [],
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  };
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

test("consent parsers reject provider mode and credit-cap substitutions", () => {
  const nativeBase = {
    url: "https://youtu.be/consent",
    beta_access_code: ACCESS_CODE
  };
  for (const credit_consent of [
    undefined,
    { provider: "other", mode: "native", max_credits: 1 },
    { provider: "supadata", mode: "generate", max_credits: 1 },
    { provider: "supadata", mode: "native", max_credits: 0 },
    { provider: "supadata", mode: "native", max_credits: 2 },
    { provider: "supadata", mode: "native", max_credits: 1.5 }
  ]) {
    assert.equal(parseManagedMediaNativeInput({ ...nativeBase, credit_consent }), null);
  }

  for (const credit_consent of [
    undefined,
    { provider: "other", mode: "metadata", max_credits: 1 },
    { provider: "supadata", mode: "generate", max_credits: 1 },
    { provider: "supadata", mode: "metadata", max_credits: 2 }
  ]) {
    assert.equal(
      parseManagedMediaFacebookMetadataInput({ beta_access_code: ACCESS_CODE, credit_consent }),
      null
    );
  }

  for (const credit_consent of [
    undefined,
    { provider: "other", mode: "generate", max_credits: 40 },
    { provider: "supadata", mode: "native", max_credits: 40 },
    { provider: "supadata", mode: "generate", max_credits: 1 },
    { provider: "supadata", mode: "generate", max_credits: 2.5 },
    { provider: "supadata", mode: "generate", max_credits: 10001 }
  ]) {
    assert.equal(
      parseManagedMediaAiInput({ beta_access_code: ACCESS_CODE, credit_consent }),
      null
    );
  }

  for (const credit_consent of [
    undefined,
    { provider: "scrapecreators", mode: "facebook_post", max_credits: 2 },
    { provider: "other", mode: "facebook_post", max_credits: 1 }
  ]) {
    assert.equal(
      parseManagedMediaFacebookFallbackConsentInput({ beta_access_code: ACCESS_CODE, credit_consent }),
      null
    );
  }
});

test("service native consent guard stops forged typed input before quote or provider work", async () => {
  let quoteCalls = 0;
  let nativeCalls = 0;
  const provider: ManagedNativeTranscriptProvider = {
    async quoteNative() {
      quoteCalls += 1;
      return {
        provider: "supadata",
        mode: "native",
        plan: "test",
        max_credits: 10,
        used_credits: 0,
        remaining_credits: 10,
        estimated_credits: 1,
        remaining_after_estimate: 9,
        consent_required: true,
        can_continue: true
      };
    },
    async getNativeTranscript() {
      nativeCalls += 1;
      return { status: "unavailable", billable_credits: 1 };
    }
  };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider
  );
  await assert.rejects(
    () => service.startNative({
      url: "https://youtu.be/forged",
      language_hint: "auto",
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "supadata", mode: "native", max_credits: 2 }
    } as never),
    (error: unknown) => errorCode(error) === "MEDIA_CREDIT_CONSENT_REQUIRED"
  );
  assert.equal(quoteCalls, 0);
  assert.equal(nativeCalls, 0);
});

test("service metadata and AI consent guards stop forged input before provider work", async () => {
  const store = new FixtureStore();
  const counters = { metadataQuote: 0, metadataGet: 0, aiQuote: 0, aiGet: 0 };
  const provider: ManagedNativeTranscriptProvider = {
    async quoteNative() { throw new Error("unused"); },
    async getNativeTranscript() { throw new Error("unused"); },
    async quoteMetadata() {
      counters.metadataQuote += 1;
      return {
        provider: "supadata", mode: "metadata", plan: "test",
        max_credits: 10, used_credits: 0, remaining_credits: 10,
        estimated_credits: 1, remaining_after_estimate: 9,
        consent_required: true, can_continue: true
      };
    },
    async getMetadataDuration() {
      counters.metadataGet += 1;
      return { duration_seconds: 60, billable_credits: 1 };
    },
    async quoteGenerateForDuration() {
      counters.aiQuote += 1;
      return {
        provider: "supadata", mode: "generate", plan: "test",
        max_credits: 100, used_credits: 0, remaining_credits: 100,
        estimated_credits: 2, maximum_credits: 2, credits_per_minute: 2,
        maximum_duration_minutes: 20, remaining_after_estimate: 98,
        conservative_maximum: true, consent_required: true, can_continue: true
      };
    },
    async quoteGenerateInstagramReel() {
      counters.aiQuote += 1;
      return {
        provider: "supadata", mode: "generate", plan: "test",
        max_credits: 100, used_credits: 0, remaining_credits: 100,
        estimated_credits: 40, maximum_credits: 40, credits_per_minute: 2,
        maximum_duration_minutes: 20, remaining_after_estimate: 60,
        conservative_maximum: true, consent_required: true, can_continue: true
      };
    },
    async getGeneratedTranscript() {
      counters.aiGet += 1;
      return {
        status: "completed", language: "en", available_languages: ["en"],
        segments: [], transcript_text: "x", billable_credits: 1
      };
    }
  };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]), null, provider, { store }
  );

  const metadataRecord = fixtureRecord(
    "KRCM_metadata-consent",
    "https://www.facebook.com/reel/1234567890123456",
    "AWAITING_AI_CONSENT",
    "native"
  );
  store.add(metadataRecord);
  await assert.rejects(
    () => service.startFacebookMetadata(metadataRecord.job.job_id, {
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "supadata", mode: "metadata", max_credits: 2 }
    } as never),
    (error: unknown) => errorCode(error) === "MEDIA_METADATA_CREDIT_CONSENT_REQUIRED"
  );
  assert.equal(counters.metadataQuote, 0);
  assert.equal(counters.metadataGet, 0);

  const aiRecord = fixtureRecord(
    "KRCM_ai-consent",
    "https://www.instagram.com/reel/AI123/",
    "AWAITING_AI_CONSENT",
    "native"
  );
  store.add(aiRecord);
  await assert.rejects(
    () => service.startAi(aiRecord.job.job_id, {
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "other", mode: "generate", max_credits: 40 }
    } as never),
    (error: unknown) => errorCode(error) === "MEDIA_AI_CREDIT_CONSENT_REQUIRED"
  );
  assert.equal(counters.aiQuote, 0);
  assert.equal(counters.aiGet, 0);
});

test("stale AI maximum and exhausted balance stop before generated transcript work", async () => {
  const store = new FixtureStore();
  let quoteCalls = 0;
  let aiCalls = 0;
  let canContinue = true;
  const provider: ManagedNativeTranscriptProvider = {
    async quoteNative() { throw new Error("unused"); },
    async getNativeTranscript() { throw new Error("unused"); },
    async quoteGenerateInstagramReel() {
      quoteCalls += 1;
      return {
        provider: "supadata", mode: "generate", plan: "test",
        max_credits: 100, used_credits: 0,
        remaining_credits: canContinue ? 100 : 10,
        estimated_credits: 40, maximum_credits: 40, credits_per_minute: 2,
        maximum_duration_minutes: 20,
        remaining_after_estimate: canContinue ? 60 : 0,
        conservative_maximum: true, consent_required: true,
        can_continue: canContinue
      };
    },
    async getGeneratedTranscript() {
      aiCalls += 1;
      return {
        status: "completed", language: "en", available_languages: ["en"],
        segments: [], transcript_text: "x", billable_credits: 1
      };
    }
  };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]), null, provider, { store }
  );

  const stale = fixtureRecord(
    "KRCM_ai-stale",
    "https://www.instagram.com/reel/STALE1/",
    "AWAITING_AI_CONSENT",
    "native"
  );
  store.add(stale);
  await assert.rejects(
    () => service.startAi(stale.job.job_id, {
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "supadata", mode: "generate", max_credits: 39 }
    }),
    (error: unknown) => errorCode(error) === "MEDIA_AI_CREDIT_CONSENT_REQUIRED"
  );
  assert.equal(aiCalls, 0);
  assert.equal(quoteCalls, 1);

  canContinue = false;
  const exhausted = fixtureRecord(
    "KRCM_ai-exhausted",
    "https://www.instagram.com/reel/STALE2/",
    "AWAITING_AI_CONSENT",
    "native"
  );
  store.add(exhausted);
  await assert.rejects(
    () => service.startAi(exhausted.job.job_id, {
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "supadata", mode: "generate", max_credits: 40 }
    }),
    (error: unknown) => errorCode(error) === "MANAGED_PROVIDER_CREDITS_EXHAUSTED"
  );
  assert.equal(aiCalls, 0);
  assert.equal(quoteCalls, 2);
});

test("Facebook invalid typed consent is rejected before paid retrieval and mutation", async () => {
  const store = new FixtureStore();
  const calls = { paid: 0, stt: 0 };
  const pipeline: ManagedFacebookPipeline = {
    configured: true,
    async freeRetrieve() { return null; },
    async paidRetrieve() {
      calls.paid += 1;
      throw new Error("must not run");
    },
    async transcribe() {
      calls.stt += 1;
      throw new Error("must not run");
    }
  };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    null as never,
    { store, facebookPipeline: pipeline }
  );
  const waiting = fixtureRecord(
    "KRCM_fb-consent",
    "https://www.facebook.com/reel/1234567890123456",
    "AWAITING_RETRIEVAL_CONSENT",
    "facebook_retrieval_stt"
  );
  store.add(waiting);
  await assert.rejects(
    () => service.continueFacebookFallback(waiting.job.job_id, {
      beta_access_code: ACCESS_CODE,
      credit_consent: {
        provider: "scrapecreators", mode: "facebook_post", max_credits: 2
      }
    } as never),
    (error: unknown) => errorCode(error) === "FACEBOOK_RETRIEVAL_CREDIT_CONSENT_REQUIRED"
  );
  assert.equal(calls.paid, 0);
  assert.equal(calls.stt, 0);
  assert.equal(
    (await store.get(waiting.job.job_id))?.job.status,
    "AWAITING_RETRIEVAL_CONSENT"
  );
});

test("durable STT quota denial happens before attachment provider start", async () => {
  const store = new QuotaStore({
    allowed: false,
    used_seconds: 60,
    remaining_seconds: 0
  });
  let providerStarts = 0;
  const attachment: ManagedAttachmentPipeline = {
    configured: true,
    async transcribe(_file, _language, reserve) {
      await reserve(30);
      providerStarts += 1;
      return {
        provider: "assemblyai",
        provider_model: "universal-2",
        provider_data_deleted: true,
        detected_language: "en",
        language_confidence: 1,
        duration_seconds: 30,
        transcript_text: "x",
        segments: [
          { index: 0, start_ms: 0, end_ms: 1000, text: "x", confidence: null }
        ]
      };
    }
  };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE], 60),
    null,
    null as never,
    { store, attachmentPipeline: attachment }
  );
  const job = await service.startAttachment({
    openaiFileIdRefs: [{
      id: "file-quota",
      name: "quota.mp3",
      mime_type: "audio/mpeg",
      download_url: "https://example.oaiusercontent.com/file-quota"
    }],
    language_hint: "auto",
    beta_access_code: ACCESS_CODE
  });
  assert.equal(job.status, "FAILED");
  assert.equal(job.error?.code, "MEDIA_BETA_STT_QUOTA_EXHAUSTED");
  assert.equal(store.quotaCalls, 1);
  assert.equal(providerStarts, 0);
});

test("invalid in-process quota durations fail closed without corrupting usage", () => {
  const gate = new MediaBetaGate([ACCESS_CODE], 60);
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
    const result = gate.reserveSttSeconds(value);
    assert.equal(result.allowed, false);
    assert.equal(result.usage.used_seconds, 0);
    assert.equal(result.usage.remaining_seconds, 60);
  }
});
''')

print("consent/credit/quota source patch and regression matrix prepared")
