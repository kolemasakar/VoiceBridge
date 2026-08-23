from pathlib import Path

service_path = Path('src/cloud/src/managed_media_service.ts')
test_path = Path('src/cloud/tests/managed_media_service.test.ts')

source = service_path.read_text(encoding='utf-8')

const_anchor = 'export type ManagedMediaStatus =\n'
if 'const PAID_JOB_MIN_RETENTION_SECONDS = 86400;\n' not in source:
    if const_anchor not in source:
        raise SystemExit('status anchor not found')
    source = source.replace(
        const_anchor,
        'const PAID_JOB_MIN_RETENTION_SECONDS = 86400;\n\n' + const_anchor,
        1,
    )

old_helper = '''  private expiryFrom(updatedAt: string): string {\n    return new Date(\n      Date.parse(updatedAt) + this.jobTtlSeconds * 1000\n    ).toISOString();\n  }\n'''
new_helper = '''  private expiryFrom(updatedAt: string, job?: ManagedMediaJobView): string {\n    const paidOrUncertain = Boolean(\n      job && (\n        job.credit_charge_uncertain ||\n        job.credits_charged > 0 ||\n        (job.metadata_credits_charged ?? 0) > 0\n      )\n    );\n    const retentionSeconds = paidOrUncertain\n      ? Math.max(this.jobTtlSeconds, PAID_JOB_MIN_RETENTION_SECONDS)\n      : this.jobTtlSeconds;\n    return new Date(\n      Date.parse(updatedAt) + retentionSeconds * 1000\n    ).toISOString();\n  }\n'''
if old_helper in source:
    source = source.replace(old_helper, new_helper, 1)
elif new_helper not in source:
    raise SystemExit('expiry helper anchor not found')

replacements = {
    'expiresAt: this.expiryFrom(updatedAt)\n': 'expiresAt: this.expiryFrom(updatedAt, interrupted.job)\n',
}
# Apply explicit context-sensitive replacements instead of a global replacement.
source = source.replace(
'''      expiresAt: this.expiryFrom(updatedAt)\n    };\n    await this.store.put(interrupted);''',
'''      expiresAt: this.expiryFrom(updatedAt, interrupted.job)\n    };\n    await this.store.put(interrupted);''',
1,
)
source = source.replace(
'''      expiresAt: this.expiryFrom(startedAt)\n    };\n    await this.store.put(processing);\n    this.inFlight.add(record.requestKey);\n    try {\n      const metadata =''',
'''      expiresAt: this.expiryFrom(startedAt, {\n        ...record.job,\n        status: "PROCESSING",\n        updated_at: startedAt,\n        credit_charge_uncertain: true,\n        error: null\n      })\n    };\n    await this.store.put(processing);\n    this.inFlight.add(record.requestKey);\n    try {\n      const metadata =''',
1,
)
# Normalize the preceding verbose processing expiry to use the already-built job via post-construction assignment.
verbose = '''      expiresAt: this.expiryFrom(startedAt, {\n        ...record.job,\n        status: "PROCESSING",\n        updated_at: startedAt,\n        credit_charge_uncertain: true,\n        error: null\n      })\n'''
if verbose in source:
    source = source.replace(verbose, '      expiresAt: this.expiryFrom(startedAt, processingJobPlaceholder as never)\n', 1)
# The placeholder approach is not desirable; rebuild both processing blocks directly below.
source = source.replace('      expiresAt: this.expiryFrom(startedAt, processingJobPlaceholder as never)\n', '      expiresAt: this.expiryFrom(startedAt)\n', 1)

# Use a safe second pass: after each record object is created, set expiry using its final job before persistence.
# This avoids duplicating job literals while preserving existing construction semantics.
source = source.replace(
'''    await this.store.put(interrupted);\n    return interrupted;''',
'''    interrupted.expiresAt = this.expiryFrom(updatedAt, interrupted.job);\n    await this.store.put(interrupted);\n    return interrupted;''',
1,
)

# Add retention refresh before every put of mutable result records.
for name in ['processing', 'updated', 'failed']:
    source = source.replace(
        f'    await this.store.put({name});',
        f'    {name}.expiresAt = this.expiryFrom({name}.job.updated_at, {name}.job);\n    await this.store.put({name});'
    )

# Initial native reservation must also retain the uncertain billable processing state.
source = source.replace(
'''    const reservation = await this.store.reserve(record);''',
'''    record.expiresAt = this.expiryFrom(job.updated_at, job);\n    const reservation = await this.store.reserve(record);''',
1,
)

# Remove any earlier context-specific accidental nested argument; final refresh is authoritative, but keep construction valid.
source = source.replace('expiresAt: this.expiryFrom(updatedAt, interrupted.job)', 'expiresAt: this.expiryFrom(updatedAt)')

service_path.write_text(source.rstrip() + '\n', encoding='utf-8')

tests = test_path.read_text(encoding='utf-8')

# Add required store types to the existing import.
if 'type ManagedMediaJobStore' not in tests:
    tests = tests.replace(
        '  parseManagedMediaPreflightInput,\n  type ManagedNativeTranscriptProvider\n',
        '  parseManagedMediaPreflightInput,\n  type ManagedMediaJobStore,\n  type ManagedMediaStoredRecord,\n  type ManagedMediaStoreReservation,\n  type ManagedNativeTranscriptProvider\n',
        1,
    )

marker = 'test("paid native-unavailable jobs retain at least a 24-hour recovery window", async () => {'
if marker not in tests:
    addition = r'''

class RecordingStore implements ManagedMediaJobStore {
  readonly durable = true;
  readonly kind = "postgres" as const;
  record: ManagedMediaStoredRecord | null = null;

  async ready(): Promise<void> {}
  async purgeExpired(): Promise<void> {}
  async findByRequestKey(requestKey: string): Promise<ManagedMediaStoredRecord | null> {
    return this.record?.requestKey === requestKey ? structuredClone(this.record) : null;
  }
  async reserve(record: ManagedMediaStoredRecord): Promise<ManagedMediaStoreReservation> {
    if (this.record) return { created: false, record: structuredClone(this.record) };
    this.record = structuredClone(record);
    return { created: true, record: structuredClone(record) };
  }
  async put(record: ManagedMediaStoredRecord): Promise<void> {
    this.record = structuredClone(record);
  }
  async get(jobId: string): Promise<ManagedMediaStoredRecord | null> {
    return this.record?.job.job_id === jobId ? structuredClone(this.record) : null;
  }
}

test("paid native-unavailable jobs retain at least a 24-hour recovery window", async () => {
  const store = new RecordingStore();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider("unavailable"),
    { store, jobTtlSeconds: 300 }
  );
  const input = parseManagedMediaNativeInput({
    url: "https://youtu.be/recovery-window",
    beta_access_code: ACCESS_CODE,
    credit_consent: {
      provider: "supadata",
      mode: "native",
      max_credits: 1
    }
  });
  assert.ok(input);
  const job = await service.startNative(input);
  assert.equal(job.status, "AWAITING_AI_CONSENT");
  assert.equal(job.credits_charged, 1);
  assert.ok(store.record);
  const retentionSeconds = (
    Date.parse(store.record.expiresAt) - Date.parse(store.record.job.updated_at)
  ) / 1000;
  assert.ok(retentionSeconds >= 86400);
});
'''
    tests = tests.rstrip() + addition + '\n'

test_path.write_text(tests.rstrip() + '\n', encoding='utf-8')
print('patched paid managed-media retention and regression coverage')
