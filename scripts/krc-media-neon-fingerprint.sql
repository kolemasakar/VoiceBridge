WITH structural_items AS (
  SELECT concat_ws(E'\x1f', 'relation', n.nspname, c.relkind::text, c.relname) AS item
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname !~ '^pg_toast'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'S')

  UNION ALL

  SELECT concat_ws(E'\x1f',
           'column',
           n.nspname,
           c.relname,
           a.attnum::text,
           a.attname,
           format_type(a.atttypid, a.atttypmod),
           a.attnotnull::text,
           a.attidentity,
           a.attgenerated,
           COALESCE(pg_get_expr(ad.adbin, ad.adrelid), '<NULL>')
         ) AS item
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname !~ '^pg_toast'
    AND c.relkind IN ('r', 'p', 'v', 'm')
    AND a.attnum > 0
    AND NOT a.attisdropped

  UNION ALL

  SELECT concat_ws(E'\x1f',
           'constraint',
           n.nspname,
           c.relname,
           con.conname,
           con.contype::text,
           pg_get_constraintdef(con.oid, true)
         ) AS item
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname !~ '^pg_toast'

  UNION ALL

  SELECT concat_ws(E'\x1f',
           'index',
           n.nspname,
           ic.relname,
           pg_get_indexdef(i.indexrelid, 0, true)
         ) AS item
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_class ic ON ic.oid = i.indexrelid
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname !~ '^pg_toast'

  UNION ALL

  SELECT concat_ws(E'\x1f', 'extension', extname, extversion) AS item
  FROM pg_extension
)
SELECT 'schema_fingerprint',
       md5(COALESCE(string_agg(md5(item), '' ORDER BY item), ''))
FROM structural_items;

SELECT 'table_count', count(*)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname !~ '^pg_toast';

SELECT 'managed_count', count(*)
FROM public.krc_managed_media_jobs;

SELECT 'managed_fingerprint',
       md5(COALESCE(string_agg(
         md5(concat_ws(E'\x1f',
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
         md5(concat_ws(E'\x1f',
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
         md5(concat_ws(E'\x1f',
           job_id,
           day_utc::text,
           seconds::text,
           extract(epoch from created_at)::text
         )),
         '' ORDER BY job_id
       ), ''))
FROM public.krc_media_stt_charges;
