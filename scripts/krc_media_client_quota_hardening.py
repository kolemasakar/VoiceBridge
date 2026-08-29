from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    s = p.read_text()
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one replacement, found {count}: {old[:120]!r}")
    p.write_text(s.replace(old, new, 1))


# Client-assisted ingest delegates STT quota decisions to the durable shared ledger.
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

# Client persistent store gains the same atomic durable STT ledger as managed media.
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
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('krc_media_stt_quota|${dayUtc}'));
WITH existing AS MATERIALIZED (
  SELECT charges.day_utc, charges.seconds
  FROM krc_media_stt_charges charges
  WHERE charges.job_id='${jobId}'
),
usage_before AS MATERIALIZED (
  SELECT COALESCE(SUM(charges.seconds), 0)::bigint AS used_seconds
  FROM krc_media_stt_charges charges
  WHERE charges.day_utc='${dayUtc}'::date
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
COMMIT;
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

# Wire legacy KRCC audio ingestion to the durable reservation before AssemblyAI starts.
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

# Fix the already-hardened KRCM reservation: a lock acquired inside one SQL
# statement cannot refresh that statement's MVCC snapshot after waiting. Acquire
# the transaction-scoped advisory lock in a preceding statement inside BEGIN.
replace_once(
    "src/cloud/src/managed_media_persistence.ts",
    """    const output = await this.run(`
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
),""",
    """    const output = await this.run(`
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('krc_media_stt_quota|${dayUtc}'));
WITH existing AS MATERIALIZED (
  SELECT charges.day_utc, charges.seconds
  FROM krc_media_stt_charges charges
  WHERE charges.job_id='${jobId}'
),
usage_before AS MATERIALIZED (
  SELECT COALESCE(SUM(charges.seconds), 0)::bigint AS used_seconds
  FROM krc_media_stt_charges charges
  WHERE charges.day_utc='${dayUtc}'::date
),"""
)
replace_once(
    "src/cloud/src/managed_media_persistence.ts",
    """FROM usage_before;
`);
    const line = output""",
    """FROM usage_before;
COMMIT;
`);
    const line = output"""
)

# Both stores can initialize concurrently at process boot. Serialize shared DDL
# across their independent psql sessions to avoid CREATE TABLE IF NOT EXISTS races.
for schema_path in (
    "src/cloud/src/managed_media_persistence.ts",
    "src/cloud/src/media_client_persistence.ts",
):
    replace_once(
        schema_path,
        """  private async initialize(): Promise<void> {
    await this.run(`
CREATE TABLE IF NOT EXISTS""",
        """  private async initialize(): Promise<void> {
    await this.run(`
SELECT pg_advisory_lock(hashtext('krc_media_schema_init'));
CREATE TABLE IF NOT EXISTS"""
    )
    replace_once(
        schema_path,
        """CREATE INDEX IF NOT EXISTS krc_media_stt_charges_day_idx
  ON krc_media_stt_charges (day_utc);
`);
  }""",
        """CREATE INDEX IF NOT EXISTS krc_media_stt_charges_day_idx
  ON krc_media_stt_charges (day_utc);
SELECT pg_advisory_unlock(hashtext('krc_media_schema_init'));
`);
  }"""
    )

print("legacy client-assisted shared quota hardening prepared")
