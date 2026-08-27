import { spawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticate } from "./auth.js";
import type { AppConfig } from "./config.js";

const ROOT = "/api/v1/media/internal-db-export";
const FINGERPRINT = `${ROOT}/fingerprint`;
const COMMAND_TIMEOUT_MS = 120000;
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;
const MAX_FINGERPRINT_BYTES = 1024 * 1024;

const FINGERPRINT_SQL = `
SELECT 'table_count', count(*)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema');

SELECT 'managed_count', count(*)
FROM public.krc_managed_media_jobs;

SELECT 'managed_fingerprint',
       md5(COALESCE(string_agg(
         md5(concat_ws(E'\\x1f',
           job_id,
           request_key,
           access_code_digest,
           status,
           payload::text,
           segments::text,
           extract(epoch from expires_at)::text,
           extract(epoch from updated_at)::text
         )),
         '' ORDER BY job_id
       ), ''))
FROM public.krc_managed_media_jobs;

SELECT 'client_count', count(*)
FROM public.krc_media_client_jobs;

SELECT 'client_fingerprint',
       md5(COALESCE(string_agg(
         md5(concat_ws(E'\\x1f',
           job_id,
           request_key,
           access_code_digest,
           COALESCE(internal_job_id, '<NULL>'),
           status,
           payload::text,
           segments::text,
           extract(epoch from expires_at)::text,
           extract(epoch from updated_at)::text
         )),
         '' ORDER BY job_id
       ), ''))
FROM public.krc_media_client_jobs;

SELECT 'stt_charge_count', count(*)
FROM public.krc_media_stt_charges;

SELECT 'stt_charge_fingerprint',
       md5(COALESCE(string_agg(
         md5(concat_ws(E'\\x1f',
           job_id,
           day_utc::text,
           seconds::text,
           extract(epoch from created_at)::text
         )),
         '' ORDER BY job_id
       ), ''))
FROM public.krc_media_stt_charges;
`;

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

function runReadOnlyCommand(
  databaseUrl: string,
  command: string,
  args: string[],
  stdin: string | null,
  maximumBytes: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PGDATABASE: databaseUrl,
        PGCONNECT_TIMEOUT: "10",
        PGOPTIONS: "-c default_transaction_read_only=on"
      }
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("INTERNAL_DB_EXPORT_TIMEOUT"));
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > maximumBytes) {
        settled = true;
        clearTimeout(timer);
        child.kill("SIGKILL");
        reject(new Error("INTERNAL_DB_EXPORT_TOO_LARGE"));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on("data", () => {});
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("INTERNAL_DB_EXPORT_UNAVAILABLE"));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error("INTERNAL_DB_EXPORT_FAILED"));
        return;
      }
      resolve(Buffer.concat(chunks));
    });

    if (stdin !== null) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

export function createInternalDbExportHttpHandler(config: AppConfig) {
  const databaseUrl = process.env.KRC_MEDIA_DATABASE_URL?.trim() || null;

  const handle = async (
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<boolean> => {
    const requestUrl = new URL(request.url || "/", "http://voicebridge.local");
    const path = requestUrl.pathname;
    if (path !== ROOT && path !== FINGERPRINT) return false;

    if (!config.mediaActionToken || !databaseUrl) {
      sendJson(response, 503, { error: { code: "INTERNAL_DB_EXPORT_NOT_CONFIGURED" } });
      return true;
    }

    const authentication = authenticate(request, config.mediaActionToken);
    if (!authentication.ok) {
      sendJson(response, 401, { error: { code: authentication.code } });
      return true;
    }

    if ((request.method || "GET") !== "GET") {
      sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED" } });
      return true;
    }

    try {
      if (path === FINGERPRINT) {
        const output = await runReadOnlyCommand(
          databaseUrl,
          "psql",
          ["-X", "-A", "-t", "-F", "|", "-v", "ON_ERROR_STOP=1"],
          FINGERPRINT_SQL,
          MAX_FINGERPRINT_BYTES
        );
        response.statusCode = 200;
        response.setHeader("content-type", "text/plain; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.setHeader("content-length", String(output.length));
        response.end(output);
        return true;
      }

      const archive = await runReadOnlyCommand(
        databaseUrl,
        "pg_dump",
        ["--format=custom", "--no-owner", "--no-acl"],
        null,
        MAX_EXPORT_BYTES
      );
      response.statusCode = 200;
      response.setHeader("content-type", "application/octet-stream");
      response.setHeader("cache-control", "no-store");
      response.setHeader("content-disposition", "attachment; filename=krc-media-source.dump");
      response.setHeader("content-length", String(archive.length));
      response.end(archive);
      return true;
    } catch {
      sendJson(response, 503, { error: { code: "INTERNAL_DB_EXPORT_FAILED" } });
      return true;
    }
  };

  return { handle };
}
