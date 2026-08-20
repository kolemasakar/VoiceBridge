import { spawn } from "node:child_process";
import type {
  ManagedMediaJobStore,
  ManagedMediaStoredRecord,
  ManagedMediaStoreReservation,
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

  async purgeExpired(): Promise<void> {
    await this.ready();
    await this.run("DELETE FROM krc_managed_media_jobs WHERE expires_at <= now();");
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
WITH inserted AS (
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
  ON CONFLICT (request_key) DO NOTHING
  RETURNING job_id
)
SELECT CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN '1' ELSE '0' END,
       job_id, request_key, access_code_digest, status,
       encode(convert_to(payload::text, 'UTF8'), 'hex'),
       encode(convert_to(segments::text, 'UTF8'), 'hex'),
       extract(epoch from expires_at)::bigint
FROM krc_managed_media_jobs
WHERE request_key='${record.requestKey}' AND expires_at > now()
LIMIT 1;
`);
    const parsed = this.parseReservation(output);
    if (!parsed) throw new Error("Managed media reservation did not return a row.");
    return parsed;
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
`);
  }

  private parseReservation(output: string): ManagedMediaStoreReservation | null {
    const line = output.trim().split("\n").filter(Boolean).at(-1);
    if (!line) return null;
    const columns = line.split("\t");
    if (columns.length !== 8) {
      throw new Error("Managed media reservation row is malformed.");
    }
    const [created, ...rest] = columns as [string, ...string[]];
    return {
      created: created === "1",
      record: this.parseColumns(rest)
    };
  }

  private parseRow(output: string): ManagedMediaStoredRecord | null {
    const line = output.trim().split("\n").filter(Boolean).at(-1);
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
