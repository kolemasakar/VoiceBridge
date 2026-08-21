from __future__ import annotations

from pathlib import Path


def replace_all(text: str, old: str, new: str, minimum: int, label: str) -> str:
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f"{label}: expected at least {minimum} matches, got {count}")
    return text.replace(old, new)


path = Path("src/cloud/src/managed_media_service.ts")
s = path.read_text(encoding="utf-8")

# Persisted A9.3/A9.5 jobs predate these Facebook fields. Keep reads compatible.
s = s.replace(
    '''  media_duration_seconds: number | null;
  ai_credit_ceiling: number | null;
  metadata_credits_charged: number;''',
    '''  media_duration_seconds?: number | null;
  ai_credit_ceiling?: number | null;
  metadata_credits_charged?: number;''',
)

s = replace_all(
    s,
    'record.job.media_duration_seconds !== null',
    '(record.job.media_duration_seconds ?? null) !== null',
    2,
    'duration already available checks',
)
s = replace_all(
    s,
    'record.job.media_duration_seconds === null',
    '(record.job.media_duration_seconds ?? null) === null',
    2,
    'duration missing checks',
)
s = replace_all(
    s,
    'record.job.ai_credit_ceiling === null',
    '(record.job.ai_credit_ceiling ?? null) === null',
    1,
    'ceiling missing check',
)
s = replace_all(
    s,
    'record.job.metadata_credits_charged + metadata.billable_credits',
    '(record.job.metadata_credits_charged ?? 0) + metadata.billable_credits',
    1,
    'metadata credit compatibility',
)

# After explicit null guards, tell TypeScript the duration is present.
s = replace_all(
    s,
    '''record.job.media_duration_seconds
      );''',
    '''record.job.media_duration_seconds!
      );''',
    2,
    'duration quote calls',
)
s = s.replace(
    'mediaDurationSeconds = record.job.media_duration_seconds;',
    'mediaDurationSeconds = record.job.media_duration_seconds!;',
)

path.write_text(s, encoding="utf-8")
