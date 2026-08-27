SELECT 'table_count', count(*)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema');

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
