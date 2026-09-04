import { spawn } from "node:child_process";
import type {
  ManagedMediaJobStore,
  ManagedMediaStoredRecord,
  ManagedMediaStoreReservation,
  ManagedMediaSttReservation,
  ManagedMediaStatus
} from "./managed_media_service.js";
import type { MediaTranscriptSegment } from "./media_transcript.js";

const STORE_COMMAND_TIMEOUT_MS = 15000;
const HEX_64 = /^[a-f0-9]{64}$/;
const JOB_ID = /^KRCM_[A-Za-z0-9-]+$/;
const STATUS = /^[A-Z_]+$/;

function hexJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("hex");
}

function jsonFromHex<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "hex").toString("utf8")) as T;
}

function validateRecord(record: ManagedMediaStoredRecord): void {
  if (!JOB_ID.test(record.job.job_id)) throw new Error("Invalid managed job id.");
  if (!HEX_64.test(record.requestKey)) throw new Error("Invalid managed request key.");
  if (!HEX_64.test(record.accessCodeDigest)) {
    throw new Error("Invalid managed access digest.");
  }
  if (!STATUS.test(record.job.status)) throw new Error("Invalid managed job status.");
  if (!Number.isFinite(Date.parse(record.expiresAt))) {
    throw new Error("Invalid managed job expiry.");
  }
}

export function selectManagedMediaPsqlRow(output: string): string | null {
  const lines = output.split(/\r?\n/).filter((line) => line.length > 0);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line && line.split("\t").length === 7) return line;
  }
  return null;
}

export class ManagedMediaPersistentStore implements ManagedMediaJobStore {
  readonly durable = true;
  readonly kind = "postgres" as const;
  private initialized: Promise<void> | null = null;

  constructor(private readonly databaseUrl: string) {}

  async ready(): Promise<void> {
    if (!this.initialized) {
      this.initialized = this.initialize().catch((error) => {
        this.initialized = null;
        throw error;
      });
    }
    await this.initialized;
  }

  async reserveSttSeconds(
    jobId: string,
    dayUtc: string,
    requestedSeconds: number,
    dailyLimitSeconds: number
  ): Promise<ManagedMediaSttReservation> {
    if (!JOB_ID.test(jobId)) throw new Error("Invalid managed quota job id.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayUtc)) {
      throw new Error("Invalid managed quota day.");
    }
    if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 0) {
      throw new Error("Invalid managed quota seconds.");
    }
    if (
      !Number.isInteger(dailyLimitSeconds) ||
      dailyLimitSeconds < 60 ||
      dailyLimitSeconds > 86400
    ) {
      throw new Error("Invalid managed daily quota limit.");
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
      .split(/\r?\n/)
      .filter((item) => item.split("\t").length === 3)
      .at(-1);
    if (!line) throw new Error("Managed media quota reservation returned no row.");
    const [allowedRaw, usedRaw, remainingRaw] = line.split("\t");
    const used = Number(usedRaw);
    const remaining = Number(remainingRaw);
    if (
      (allowedRaw !== "0" && allowedRaw !== "1") ||
      !Number.isFinite(used) ||
      !Number.isFinite(remaining)
    ) {
      throw new Error("Managed media quota reservation row is malformed.");
    }
    return {
      allowed: allowedRaw === "1",
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
  }

  async findByRequestKey(
    requestKey: string
  ): Promise<ManagedMediaStoredRecord | null> {
    if (!HEX_64.test(requestKey)) return null;
    await this.ready();
    const output = await this.run(`
SELECT job_id, request_key, access_code_digest, status,
       encode(convert_to(payload::text, 'UTF8'), 'hex'),
       encode(convert_to(segments::text, 'UTF8'), 'hex'),
       extract(epoch from expires_at)::bigint
FROM krc_managed_media_jobs
WHERE request_key='${requestKey}' AND expires_at > now()
LIMIT 1;
`);
    return this.parseRow(output);
  }

  async reserve(
    record: ManagedMediaStoredRecord
  ): Promise<ManagedMediaStoreReservation> {
    validateRecord(record);
    await this.ready();
    const payloadHex = hexJson(record.job);
    const segmentsHex = hexJson(record.segments);
    const expirySeconds = Date.parse(record.expiresAt) / 1000;
    const updatedSeconds = Date.parse(record.job.updated_at) / 1000;

    const output = await this.run(`
DELETE FROM krc_managed_media_jobs
WHERE request_key='${record.requestKey}' AND expires_at <= now();
INSERT INTO krc_managed_media_jobs (
  job_id, request_key, access_code_digest, status,
  payload, segments, expires_at, updated_at
) VALUES (
  '${record.job.job_id}', '${record.requestKey}', '${record.accessCodeDigest}',
  '${record.job.status}',
  convert_from(decode('${payloadHex}', 'hex'), 'UTF8')::jsonb,
  convert_from(decode('${segmentsHex}', 'hex'), 'UTF8')::jsonb,
  to_timestamp(${expirySeconds}), to_timestamp(${updatedSeconds})
)
ON CONFLICT (request_key) DO UPDATE SET
  request_key = EXCLUDED.request_key
RETURNING job_id, request_key, access_code_digest, status,
          encode(convert_to(payload::text, 'UTF8'), 'hex'),
          encode(convert_to(segments::text, 'UTF8'), 'hex'),
          extract(epoch from expires_at)::bigint;
`);
    const parsed = this.parseRow(output);
    if (!parsed) throw new Error("Managed media reservation did not return a row.");
    return {
      created: parsed.job.job_id === record.job.job_id,
      record: parsed
    };
  }

  async put(record: ManagedMediaStoredRecord): Promise<void> {
    validateRecord(record);
    await this.ready();
    const payloadHex = hexJson(record.job);
    const segmentsHex = hexJson(record.segments);
    const expirySeconds = Date.parse(record.expiresAt) / 1000;
    const updatedSeconds = Date.parse(record.job.updated_at) / 1000;
    await this.run(`
INSERT INTO krc_managed_media_jobs (
  job_id, request_key, access_code_digest, status,
  payload, segments, expires_at, updated_at
) VALUES (
  '${record.job.job_id}', '${record.requestKey}', '${record.accessCodeDigest}',
  '${record.job.status}',
  convert_from(decode('${payloadHex}', 'hex'), 'UTF8')::jsonb,
  convert_from(decode('${segmentsHex}', 'hex'), 'UTF8')::jsonb,
  to_timestamp(${expirySeconds}), to_timestamp(${updatedSeconds})
)
ON CONFLICT (job_id) DO UPDATE SET
  status = EXCLUDED.status,
  payload = jsonb_set(
    EXCLUDED.payload,
    '{created_at}',
    krc_managed_media_jobs.payload->'created_at',
    true
  ),
  segments = EXCLUDED.segments,
  expires_at = EXCLUDED.expires_at,
  updated_at = EXCLUDED.updated_at;
`);
  }

  async get(jobId: string): Promise<ManagedMediaStoredRecord | null> {
    if (!JOB_ID.test(jobId)) return null;
    await this.ready();
    const output = await this.run(`
SELECT job_id, request_key, access_code_digest, status,
       encode(convert_to(payload::text, 'UTF8'), 'hex'),
       encode(convert_to(segments::text, 'UTF8'), 'hex'),
       extract(epoch from expires_at)::bigint
FROM krc_managed_media_jobs
WHERE job_id='${jobId}' AND expires_at > now()
LIMIT 1;
`);
    return this.parseRow(output);
  }

  private async initialize(): Promise<void> {
    await this.run(`
SELECT pg_advisory_lock(hashtext('krc_media_schema_init'));
CREATE TABLE IF NOT EXISTS krc_managed_media_jobs (
  job_id text PRIMARY KEY,
  request_key text NOT NULL UNIQUE,
  access_code_digest text NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS krc_managed_media_jobs_active_idx
  ON krc_managed_media_jobs (status, expires_at);
CREATE INDEX IF NOT EXISTS krc_managed_media_jobs_updated_idx
  ON krc_managed_media_jobs (updated_at DESC);
CREATE TABLE IF NOT EXISTS krc_media_stt_charges (
  job_id text PRIMARY KEY,
  day_utc date NOT NULL,
  seconds integer NOT NULL CHECK (seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS krc_media_stt_charges_day_idx
  ON krc_media_stt_charges (day_utc);
SELECT pg_advisory_unlock(hashtext('krc_media_schema_init'));
`);
  }

  private parseRow(output: string): ManagedMediaStoredRecord | null {
    const line = selectManagedMediaPsqlRow(output);
    if (!line) return null;
    return this.parseColumns(line.split("\t"));
  }

  private parseColumns(columns: string[]): ManagedMediaStoredRecord {
    if (columns.length !== 7) {
      throw new Error("Managed media persistent row is malformed.");
    }
    const [
      jobId,
      requestKey,
      accessCodeDigest,
      status,
      payloadHex,
      segmentsHex,
      expiresEpoch
    ] = columns as [string, string, string, string, string, string, string];
    if (
      !jobId || !requestKey || !accessCodeDigest || !status ||
      !payloadHex || !segmentsHex || !expiresEpoch
    ) {
      throw new Error("Managed media persistent row is incomplete.");
    }
    const job = jsonFromHex<ManagedMediaStoredRecord["job"]>(payloadHex);
    if (job.job_id !== jobId || job.status !== status as ManagedMediaStatus) {
      throw new Error("Managed media persistent row does not match payload.");
    }
    return {
      job,
      requestKey,
      accessCodeDigest,
      segments: jsonFromHex<MediaTranscriptSegment[]>(segmentsHex),
      expiresAt: new Date(Number(expiresEpoch) * 1000).toISOString()
    };
  }

  private async run(sql: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        "psql",
        [
          "-X",
          "-v", "ON_ERROR_STOP=1",
          "-A",
          "-t",
          "-F", "\t",
          "--dbname", this.databaseUrl
        ],
        {
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            PGCONNECT_TIMEOUT: "5"
          }
        }
      );
      const stdout: Buffer[] = [];
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        reject(new Error("Managed media durable store timed out."));
      }, STORE_COMMAND_TIMEOUT_MS);
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", () => {});
      child.on("error", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error("Managed media durable store is unavailable."));
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error("Managed media durable store command failed."));
          return;
        }
        resolve(Buffer.concat(stdout).toString("utf8"));
      });
      child.stdin.end(sql);
    });
  }
}
