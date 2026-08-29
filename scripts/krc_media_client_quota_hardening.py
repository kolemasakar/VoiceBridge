from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    s = p.read_text()
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one replacement, found {count}: {old[:120]!r}")
    p.write_text(s.replace(old, new, 1))


# Client-assisted ingest can delegate the quota decision to a durable shared ledger.
replace_once(
    "src/cloud/src/media_client_ingest.ts",
    'import { MediaBetaGate, type MediaBetaUsage } from "./media_beta.js";',
    'import { MediaBetaGate, type MediaBetaReserveResult, type MediaBetaUsage } from "./media_beta.js";'
)
replace_once(
    "src/cloud/src/media_client_ingest.ts",
    """export interface MediaClientIngestServiceOptions {
  assemblyAiApiKey: string | null;
  betaGate: MediaBetaGate;
  maxDurationSeconds: number;
  jobTtlSeconds: number;
  maxConcurrentJobs: number;
}""",
    """export interface MediaClientIngestServiceOptions {
  assemblyAiApiKey: string | null;
  betaGate: MediaBetaGate;
  reserveSttSeconds?: ((
    jobId: string,
    requestedSeconds: number
  ) => Promise<MediaBetaReserveResult>) | undefined;
  maxDurationSeconds: number;
  jobTtlSeconds: number;
  maxConcurrentJobs: number;
}"""
)
replace_once(
    "src/cloud/src/media_client_ingest.ts",
    """      const reservation = this.options.betaGate.reserveSttSeconds(durationSeconds);
      job.beta_quota = reservation.usage;
      if (!reservation.allowed) {""",
    """      const reservation = this.options.reserveSttSeconds
        ? await this.options.reserveSttSeconds(job.job_id, durationSeconds)
        : this.options.betaGate.reserveSttSeconds(durationSeconds);
      job.beta_quota = reservation.usage;
      if (!reservation.allowed) {"""
)

# Client persistent store gains the same atomic per-day reservation primitive and
# advisory lock key as the managed KRCM store, so KRCC and KRCM compete against
# one shared daily STT budget.
replace_once(
    "src/cloud/src/media_client_persistence.ts",
    """export interface PersistedMediaClientJob {
  job: MediaClientTranscriptJobView;
  requestKey: string;
  accessCodeDigest: string;
  internalJobId: string | null;
  segments: MediaTranscriptSegment[];
  expiresAt: string;
}""",
    """export interface PersistedMediaClientJob {
  job: MediaClientTranscriptJobView;
  requestKey: string;
  accessCodeDigest: string;
  internalJobId: string | null;
  segments: MediaTranscriptSegment[];
  expiresAt: string;
}

export interface MediaClientSttReservation {
  allowed: boolean;
  used_seconds: number;
  remaining_seconds: number;
}"""
)
replace_once(
    "src/cloud/src/media_client_persistence.ts",
    """  async put(record: PersistedMediaClientJob): Promise<void> {
    if (!this.enabled) return;""",
    """  async reserveSttSeconds(
    jobId: string,
    dayUtc: string,
    requestedSeconds: number,
    dailyLimitSeconds: number
  ): Promise<MediaClientSttReservation> {
    if (!this.enabled) {
      throw new Error("MEDIA BETA durable quota store is disabled.");
    }
    if (!JOB_ID.test(jobId)) throw new Error("Invalid persistent quota job id.");
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dayUtc)) {
      throw new Error("Invalid persistent quota day.");
    }
    if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 0) {
      throw new Error("Invalid persistent quota seconds.");
    }
    if (
      !Number.isInteger(dailyLimitSeconds) ||
      dailyLimitSeconds < 60 ||
      dailyLimitSeconds > 86400
    ) {
      throw new Error("Invalid persistent daily quota limit.");
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
      .filter((item) => item.split("\\t").length === 3)
      .at(-1);
    if (!line) throw new Error("Persistent quota reservation returned no row.");
    const [allowedRaw, usedRaw, remainingRaw] = line.split("\\t");
    const used = Number(usedRaw);
    const remaining = Number(remainingRaw);
    if (
      (allowedRaw !== "0" && allowedRaw !== "1") ||
      !Number.isFinite(used) ||
      !Number.isFinite(remaining)
    ) {
      throw new Error("Persistent quota reservation row is malformed.");
    }
    return {
      allowed: allowedRaw === "1",
      used_seconds: Math.max(0, Math.floor(used)),
      remaining_seconds: Math.max(0, Math.floor(remaining))
    };
  }

  async put(record: PersistedMediaClientJob): Promise<void> {
    if (!this.enabled) return;"""
)

# Wire the client path to the persistent quota ledger before AssemblyAI starts.
replace_once(
    "src/cloud/src/media_client_http.ts",
    """export function createMediaClientHttpHandler(config: AppConfig) {
  const betaGate = new MediaBetaGate(
    config.mediaBetaCodes ?? [],
    config.mediaDailySttSeconds ?? 7200
  );
  const service = new MediaClientIngestService({
    assemblyAiApiKey: config.assemblyAiApiKey,
    betaGate,
    maxDurationSeconds: config.mediaMaxDurationSeconds ?? 3600,
    jobTtlSeconds: config.mediaJobTtlSeconds ?? 3600,
    maxConcurrentJobs: config.mediaMaxConcurrentJobs ?? 1
  });
  const jobTtlSeconds = config.mediaJobTtlSeconds ?? 3600;
  const databaseUrl = process.env.KRC_MEDIA_DATABASE_URL?.trim() || null;
  const persistentStore = new MediaClientPersistentStore(databaseUrl);""",
    """export function createMediaClientHttpHandler(config: AppConfig) {
  const betaGate = new MediaBetaGate(
    config.mediaBetaCodes ?? [],
    config.mediaDailySttSeconds ?? 7200
  );
  const jobTtlSeconds = config.mediaJobTtlSeconds ?? 3600;
  const databaseUrl = process.env.KRC_MEDIA_DATABASE_URL?.trim() || null;
  const persistentStore = new MediaClientPersistentStore(databaseUrl);
  const service = new MediaClientIngestService({
    assemblyAiApiKey: config.assemblyAiApiKey,
    betaGate,
    reserveSttSeconds: persistentStore.enabled
      ? async (jobId, requestedSeconds) => {
          const usage = betaGate.usage();
          let durable;
          try {
            durable = await persistentStore.reserveSttSeconds(
              jobId,
              usage.day_utc,
              requestedSeconds,
              usage.daily_limit_seconds
            );
          } catch {
            throw new MediaTranscriptError(
              "MEDIA_CLIENT_DURABLE_QUOTA_UNAVAILABLE",
              "The durable MEDIA BETA STT quota ledger is temporarily unavailable.",
              503,
              true
            );
          }
          const snapshot = {
            day_utc: usage.day_utc,
            daily_limit_seconds: usage.daily_limit_seconds,
            used_seconds: durable.used_seconds,
            remaining_seconds: durable.remaining_seconds
          };
          if (durable.allowed) {
            betaGate.restoreUsage(snapshot.day_utc, snapshot.used_seconds);
          }
          return { allowed: durable.allowed, usage: snapshot };
        }
      : undefined,
    maxDurationSeconds: config.mediaMaxDurationSeconds ?? 3600,
    jobTtlSeconds,
    maxConcurrentJobs: config.mediaMaxConcurrentJobs ?? 1
  });"""
)

print("legacy client-assisted shared quota hardening prepared")
