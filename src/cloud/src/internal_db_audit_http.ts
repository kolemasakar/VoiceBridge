import { spawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticate } from "./auth.js";
import type { AppConfig } from "./config.js";

const AUDIT_PATH = "/api/v1/media/internal-db-audit";
const AUDIT_TIMEOUT_MS = 15000;
const MAX_AUDIT_BYTES = 1024 * 1024;

const AUDIT_SQL = String.raw`
BEGIN TRANSACTION READ ONLY;
SELECT json_build_object(
  'mode', 'read_only_internal_audit',
  'read_only', true,
  'database', json_build_object(
    'name', current_database(),
    'server_version', current_setting('server_version'),
    'transaction_read_only', current_setting('transaction_read_only'),
    'default_transaction_read_only', current_setting('default_transaction_read_only'),
    'size_bytes', pg_database_size(current_database())
  ),
  'tables', (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.schema_name, t.table_name), '[]'::json)
    FROM (
      SELECT n.nspname AS schema_name,
             c.relname AS table_name,
             pg_relation_size(c.oid) AS table_bytes,
             pg_indexes_size(c.oid) AS index_bytes,
             pg_total_relation_size(c.oid) AS total_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY n.nspname, c.relname
    ) t
  ),
  'columns', (
    SELECT COALESCE(json_agg(row_to_json(c) ORDER BY c.table_schema, c.table_name, c.ordinal_position), '[]'::json)
    FROM (
      SELECT table_schema, table_name, ordinal_position, column_name,
             data_type, udt_name, is_nullable, column_default,
             is_identity, identity_generation
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name, ordinal_position
    ) c
  ),
  'constraints', (
    SELECT COALESCE(json_agg(row_to_json(k) ORDER BY k.schema_name, k.table_name, k.constraint_name), '[]'::json)
    FROM (
      SELECT n.nspname AS schema_name,
             c.relname AS table_name,
             con.conname AS constraint_name,
             con.contype AS constraint_type,
             pg_get_constraintdef(con.oid, true) AS definition
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY n.nspname, c.relname, con.conname
    ) k
  ),
  'indexes', (
    SELECT COALESCE(json_agg(row_to_json(i) ORDER BY i.schemaname, i.tablename, i.indexname), '[]'::json)
    FROM (
      SELECT schemaname, tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schemaname, tablename, indexname
    ) i
  ),
  'sequences', (
    SELECT COALESCE(json_agg(row_to_json(s) ORDER BY s.sequence_schema, s.sequence_name), '[]'::json)
    FROM (
      SELECT sequence_schema, sequence_name, data_type, start_value,
             minimum_value, maximum_value, increment
      FROM information_schema.sequences
      WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY sequence_schema, sequence_name
    ) s
  ),
  'extensions', (
    SELECT COALESCE(json_agg(row_to_json(e) ORDER BY e.extname), '[]'::json)
    FROM (
      SELECT extname, extversion
      FROM pg_extension
      ORDER BY extname
    ) e
  ),
  'row_counts', json_build_object(
    'krc_managed_media_jobs', (SELECT count(*) FROM public.krc_managed_media_jobs),
    'krc_media_client_jobs', (SELECT count(*) FROM public.krc_media_client_jobs),
    'krc_media_stt_charges', (SELECT count(*) FROM public.krc_media_stt_charges)
  ),
  'managed_status_distribution', (
    SELECT COALESCE(json_object_agg(status, row_count ORDER BY status), '{}'::json)
    FROM (
      SELECT status, count(*) AS row_count
      FROM public.krc_managed_media_jobs
      GROUP BY status
    ) q
  ),
  'managed_timestamp_range', (
    SELECT json_build_object(
      'oldest_updated_at', min(updated_at),
      'newest_updated_at', max(updated_at),
      'earliest_expires_at', min(expires_at),
      'latest_expires_at', max(expires_at)
    )
    FROM public.krc_managed_media_jobs
  ),
  'client_status_distribution', (
    SELECT COALESCE(json_object_agg(status, row_count ORDER BY status), '{}'::json)
    FROM (
      SELECT status, count(*) AS row_count
      FROM public.krc_media_client_jobs
      GROUP BY status
    ) q
  ),
  'client_timestamp_range', (
    SELECT json_build_object(
      'oldest_updated_at', min(updated_at),
      'newest_updated_at', max(updated_at),
      'earliest_expires_at', min(expires_at),
      'latest_expires_at', max(expires_at)
    )
    FROM public.krc_media_client_jobs
  ),
  'stt_charge_range', (
    SELECT json_build_object(
      'row_count', count(*),
      'oldest_day', min(day_utc),
      'newest_day', max(day_utc),
      'total_seconds', COALESCE(sum(seconds), 0)
    )
    FROM public.krc_media_stt_charges
  )
);
ROLLBACK;
`;

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(JSON.stringify(body));
}

function runReadOnlyAudit(databaseUrl: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "psql",
      [
        "-X",
        "-q",
        "-v", "ON_ERROR_STOP=1",
        "-A",
        "-t",
        "--dbname", databaseUrl
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PGCONNECT_TIMEOUT: "5",
          PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=10000"
        }
      }
    );

    const stdout: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("Internal database audit failed."));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGKILL");
      fail();
    }, AUDIT_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_AUDIT_BYTES) {
        child.kill("SIGKILL");
        fail();
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", () => {});
    child.on("error", fail);
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        fail();
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        const raw = Buffer.concat(stdout).toString("utf8").trim();
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const database = parsed.database as Record<string, unknown> | undefined;
        if (
          parsed.read_only !== true ||
          database?.transaction_read_only !== "on" ||
          database?.default_transaction_read_only !== "on"
        ) {
          reject(new Error("Internal database audit read-only guard failed."));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error("Internal database audit output was invalid."));
      }
    });

    child.stdin.end(AUDIT_SQL);
  });
}

export function createInternalDbAuditHttpHandler(config: AppConfig) {
  const handle = async (
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<boolean> => {
    const requestUrl = new URL(request.url || "/", "http://voicebridge.local");
    if (requestUrl.pathname !== AUDIT_PATH) return false;

    if (!config.mediaActionToken) {
      writeJson(response, 503, { error: { code: "MEDIA_TRANSCRIPT_NOT_CONFIGURED" } });
      return true;
    }
    const authentication = authenticate(request, config.mediaActionToken);
    if (!authentication.ok) {
      writeJson(response, 401, { error: { code: authentication.code } });
      return true;
    }
    if ((request.method || "GET") !== "GET") {
      response.setHeader("allow", "GET");
      writeJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED" } });
      return true;
    }
    if (requestUrl.search) {
      writeJson(response, 400, { error: { code: "INVALID_REQUEST" } });
      return true;
    }

    const databaseUrl = process.env.KRC_MEDIA_DATABASE_URL?.trim();
    if (!databaseUrl) {
      writeJson(response, 503, { error: { code: "DATABASE_NOT_CONFIGURED" } });
      return true;
    }

    try {
      const audit = await runReadOnlyAudit(databaseUrl);
      writeJson(response, 200, audit);
    } catch {
      writeJson(response, 503, { error: { code: "INTERNAL_DB_AUDIT_FAILED" } });
    }
    return true;
  };

  return { handle };
}
