import { spawn } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import type {
  MediaClientTranscriptJobView,
  MediaClientTranscriptStatus
} from "./media_client_ingest.js";
import type { MediaTranscriptSegment } from "./media_transcript.js";

const STORE_COMMAND_TIMEOUT_MS = 15000;
const HEX_64 = /^[a-f0-9]{64}$/;
const JOB_ID = /^KRCC_[A-Za-z0-9-]+$/;
const STATUS = /^[A-Z_]+$/;

export interface PersistedMediaClientJob {
  job: MediaClientTranscriptJobView;
  requestKey: string;
  accessCodeDigest: string;
  internalJobId: string | null;
  segments: MediaTranscriptSegment[];
  expiresAt: string;
}

function hexJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("hex");
}

function jsonFromHex<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "hex").toString("utf8")) as T;
}

export function mediaClientAccessDigest(accessCode: string): string {
  return createHash("sha256").update(accessCode, "utf8").digest("hex");
}

export function mediaClientRequestKey(
  normalizedUrl: string,
  languageHint: string,
  accessCode: string
): string {
  const digest = mediaClientAccessDigest(accessCode);
  return createHash("sha256")
    .update(`${normalizedUrl}|${languageHint}|${digest}`, "utf8")
    .digest("hex");
}

export function mediaClientAccessMatches(
  expectedDigest: string,
  accessCode: string
): boolean {
  if (!HEX_64.test(expectedDigest)) return false;
  const expected = Buffer.from(expectedDigest, "hex");
  const actual = Buffer.from(mediaClientAccessDigest(accessCode), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function validateRecord(record: PersistedMediaClientJob): void {
  if (!JOB_ID.test(record.job.job_id)) throw new Error("Invalid persistent job id.");
  if (!HEX_64.test(record.requestKey)) throw new Error("Invalid persistent request key.");
  if (!HEX_64.test(record.accessCodeDigest)) {
    throw new Error("Invalid persistent access digest.");
  }
  if (record.internalJobId !== null && !JOB_ID.test(record.internalJobId)) {
    throw new Error("Invalid persistent internal job id.");
  }
  if (!STATUS.test(record.job.status)) throw new Error("Invalid persistent job status.");
  if (!Number.isFinite(Date.parse(record.expiresAt))) {
    throw new Error("Invalid persistent expiry.");
  }
}

export class MediaClientPersistentStore {
  readonly enabled: boolean;
  private initialized: Promise<void> | null = null;

  constructor(private readonly databaseUrl: string | null) {
    this.enabled = Boolean(databaseUrl);
  }

  async ready(): Promise<void> {
    if (!this.enabled) return;
    if (!this.initialized) {
      this.initialized = this.initialize().catch((error) => {
        this.initialized = null;
        throw error;
      });
    }
    await this.initialized;
  }

  async put(record: PersistedMediaClientJob): Promise<void> {
    if (!this.enabled) return;
    validateRecord(record);
    await this.ready();

    const payloadHex = hexJson(record.job);
    const segmentsHex = hexJson(record.segments);
    const internal = record.internalJobId === null
      ? "NULL"
      : `'${record.internalJobId}'`;
    const expirySeconds = Date.parse(record.expiresAt) / 1000;
    const updatedSeconds = Date.parse(record.job.updated_at) / 1000;

    let sql = `
INSERT INTO krc_media_client_jobs (
  job_id, request_key, access_code_digest, internal_job_id,
  status, payload, segments, expires_at, updated_at
) VALUES (
  '${record.job.job_id}', '${record.requestKey}', '${record.accessCodeDigest}', ${internal},
  '${record.job.status}',
  convert_from(decode('${payloadHex}', 'hex'), 'UTF8')::jsonb,
  convert_from(decode('${segmentsHex}', 'hex'), 'UTF8')::jsonb,
  to_timestamp(${expirySeconds}), to_timestamp(${updatedSeconds})
)
ON CONFLICT (job_id) DO UPDATE SET
  request_key = EXCLUDED.request_key,
  access_code_digest = EXCLUDED.access_code_digest,
  internal_job_id = EXCLUDED.internal_job_id,
  status = EXCLUDED.status,
  payload = EXCLUDED.payload,
  segments = EXCLUDED.segments,
  expires_at = EXCLUDED.expires_at,
  updated_at = EXCLUDED.updated_at;
`;

    if (record.job.stt_seconds_charged > 0) {
      const day = record.job.beta_quota.day_utc;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        throw new Error("Invalid persistent quota day.");
      }
      const seconds = Math.max(0, Math.floor(record.job.stt_seconds_charged));
      sql += `
INSERT INTO krc_media_stt_charges (job_id, day_utc, seconds)
VALUES ('${record.job.job_id}', '${day}'::date, ${seconds})
ON CONFLICT (job_id) DO UPDATE SET
  day_utc = EXCLUDED.day_utc,
  seconds = GREATEST(krc_media_stt_charges.seconds, EXCLUDED.seconds);
`;
    }

    await this.run(sql);
  }

  async get(jobId: string): Promise<PersistedMediaClientJob | null> {
    if (!this.enabled) return null;
    if (!JOB_ID.test(jobId)) return null;
    await this.ready();
    const output = await this.run(`
SELECT job_id, request_key, access_code_digest,
       COALESCE(internal_job_id, ''), status,
       encode(convert_to(payload::text, 'UTF8'), 'hex'),
       encode(convert_to(segments::text, 'UTF8'), 'hex'),
       extract(epoch from expires_at)::bigint
FROM krc_media_client_jobs
WHERE job_id='${jobId}' AND expires_at > now()
LIMIT 1;
`);
    return this.parseRow(output);
  }

  async findByRequestKey(
    requestKey: string
  ): Promise<PersistedMediaClientJob | null> {
    if (!this.enabled || !HEX_64.test(requestKey)) return null;
    await this.ready();
    const output = await this.run(`
SELECT job_id, request_key, access_code_digest,
       COALESCE(internal_job_id, ''), status,
       encode(convert_to(payload::text, 'UTF8'), 'hex'),
       encode(convert_to(segments::text, 'UTF8'), 'hex'),
       extract(epoch from expires_at)::bigint
FROM krc_media_client_jobs
WHERE request_key='${requestKey}'
  AND status <> 'FAILED'
  AND expires_at > now()
ORDER BY updated_at DESC
LIMIT 1;
`);
    return this.parseRow(output);
  }

  async hasOtherActiveJob(requestKey: string): Promise<boolean> {
    if (!this.enabled || !HEX_64.test(requestKey)) return false;
    await this.ready();
    const output = await this.run(`
SELECT CASE WHEN EXISTS (
  SELECT 1
  FROM krc_media_client_jobs
  WHERE request_key <> '${requestKey}'
    AND status NOT IN ('COMPLETED', 'FAILED')
    AND expires_at > now()
) THEN '1' ELSE '0' END;
`);
    return output.trim() === "1";
  }

  async sumSttCharges(dayUtc: string): Promise<number> {
    if (!this.enabled || !/^\d{4}-\d{2}-\d{2}$/.test(dayUtc)) return 0;
    await this.ready();
    const output = await this.run(`
SELECT COALESCE(SUM(seconds), 0)::bigint
FROM krc_media_stt_charges
WHERE day_utc='${dayUtc}'::date;
`);
    const parsed = Number(output.trim());
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  }

  async purgeExpired(): Promise<void> {
    if (!this.enabled) return;
    await this.ready();
    await this.run(`
DELETE FROM krc_media_client_jobs WHERE expires_at <= now();
DELETE FROM krc_media_stt_charges WHERE day_utc < current_date - interval '2 days';
`);
  }

  private async initialize(): Promise<void> {
    await this.run(`
CREATE TABLE IF NOT EXISTS krc_media_client_jobs (
  job_id text PRIMARY KEY,
  request_key text NOT NULL,
  access_code_digest text NOT NULL,
  internal_job_id text NULL,
  status text NOT NULL,
  payload jsonb NOT NULL,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS krc_media_client_jobs_request_key_idx
  ON krc_media_client_jobs (request_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS krc_media_client_jobs_active_idx
  ON krc_media_client_jobs (status, expires_at);
CREATE TABLE IF NOT EXISTS krc_media_stt_charges (
  job_id text PRIMARY KEY,
  day_utc date NOT NULL,
  seconds integer NOT NULL CHECK (seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS krc_media_stt_charges_day_idx
  ON krc_media_stt_charges (day_utc);
`);
  }

  private parseRow(output: string): PersistedMediaClientJob | null {
    const line = output.trim();
    if (!line) return null;
    const columns = line.split("\t");
    if (columns.length !== 8) {
      throw new Error("Persistent MEDIA BETA row is malformed.");
    }
    const [
      jobId,
      requestKey,
      accessCodeDigest,
      internalJobId,
      status,
      payloadHex,
      segmentsHex,
      expiresEpoch
    ] = columns;
    if (
      !jobId || !requestKey || !accessCodeDigest || !status ||
      !payloadHex || !segmentsHex || !expiresEpoch
    ) {
      throw new Error("Persistent MEDIA BETA row is incomplete.");
    }
    const job = jsonFromHex<MediaClientTranscriptJobView>(payloadHex);
    if (job.job_id !== jobId || job.status !== status as MediaClientTranscriptStatus) {
      throw new Error("Persistent MEDIA BETA row does not match its payload.");
    }
    return {
      job,
      requestKey,
      accessCodeDigest,
      internalJobId: internalJobId || null,
      segments: jsonFromHex<MediaTranscriptSegment[]>(segmentsHex),
      expiresAt: new Date(Number(expiresEpoch) * 1000).toISOString()
    };
  }

  private async run(sql: string): Promise<string> {
    const databaseUrl = this.databaseUrl;
    if (!databaseUrl) return "";
    return new Promise((resolve, reject) => {
      const child = spawn(
        "psql",
        [
          "-X",
          "-v", "ON_ERROR_STOP=1",
          "-A",
          "-t",
          "-F", "\t",
          "--dbname", databaseUrl,
          "-c", sql
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
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
        reject(new Error("MEDIA BETA durable store timed out."));
      }, STORE_COMMAND_TIMEOUT_MS);
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", () => {});
      child.on("error", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error("MEDIA BETA durable store is unavailable."));
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error("MEDIA BETA durable store command failed."));
          return;
        }
        resolve(Buffer.concat(stdout).toString("utf8"));
      });
    });
  }
}
