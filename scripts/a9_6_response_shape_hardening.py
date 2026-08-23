from pathlib import Path

SOURCE = Path("src/cloud/src/supadata_provider.ts")
TESTS = Path("src/cloud/tests/supadata_provider.test.ts")

source = SOURCE.read_text()

old_block = '''function unwrapTranscriptPayload(
  payload: SupadataTranscriptResponse
): SupadataTranscriptResponse {
  const nested = payload.result;
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
    return payload;
  }
  return {
    ...payload,
    ...(nested as SupadataTranscriptResponse)
  };
}

function parseTranscriptResult(
  payload: SupadataTranscriptResponse,
  billableCredits: number
): SupadataGeneratedTranscriptResult {
  payload = unwrapTranscriptPayload(payload);
  const language = nonEmptyString(payload.lang);
  const segments = parseSegments(payload.content);
  const availableLanguages = Array.isArray(payload.availableLangs)
    ? payload.availableLangs.flatMap((value) => {
        const languageValue = nonEmptyString(value);
        return languageValue ? [languageValue] : [];
      })
    : [];
  if (!language || segments.length === 0) {
    throw new MediaTranscriptError(
      "MANAGED_PROVIDER_TRANSCRIPT_INVALID",
      "The managed transcript provider returned an empty or invalid transcript.",
      502,
      true
    );
  }
  return {
    status: "completed",
    language,
    available_languages: availableLanguages,
    segments,
    transcript_text: segments.map((segment) => segment.text).join(" "),
    billable_credits: billableCredits
  };
}
'''

new_block = '''function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function objectKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).sort();
}

function nestedResultDepth(payload: SupadataTranscriptResponse): number {
  let depth = 0;
  let current: unknown = payload.result;
  while (current && typeof current === "object" && !Array.isArray(current) && depth < 8) {
    depth += 1;
    current = (current as SupadataTranscriptResponse).result;
  }
  if (Array.isArray(current)) depth += 1;
  return depth;
}

function unwrapTranscriptPayload(
  payload: SupadataTranscriptResponse
): SupadataTranscriptResponse {
  let merged: SupadataTranscriptResponse = { ...payload };
  let nested: unknown = payload.result;
  let depth = 0;
  while (nested && typeof nested === "object" && !Array.isArray(nested) && depth < 4) {
    const nestedPayload = nested as SupadataTranscriptResponse;
    merged = { ...merged, ...nestedPayload };
    nested = nestedPayload.result;
    depth += 1;
  }
  if (Array.isArray(nested) && !Array.isArray(merged.content)) {
    merged = { ...merged, content: nested };
  } else if (Array.isArray(payload.result) && !Array.isArray(merged.content)) {
    merged = { ...merged, content: payload.result };
  }
  return merged;
}

function inferTranscriptLanguage(
  payload: SupadataTranscriptResponse,
  content: unknown
): string | null {
  const explicit = nonEmptyString(payload.lang);
  if (explicit) return explicit;
  if (!Array.isArray(content)) return null;
  const languages = new Set<string>();
  for (const value of content) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const language = nonEmptyString((value as SupadataTranscriptChunk).lang);
    if (language) languages.add(language);
  }
  return languages.size === 1 ? [...languages][0] ?? null : null;
}

function safeTranscriptPayloadShape(payload: SupadataTranscriptResponse): Record<string, unknown> {
  const unwrapped = unwrapTranscriptPayload(payload);
  const content = unwrapped.content;
  const firstItem = Array.isArray(content) && content.length > 0 ? content[0] : null;
  const firstItemKeys = objectKeys(firstItem);
  const firstItemTypes = firstItem && typeof firstItem === "object" && !Array.isArray(firstItem)
    ? Object.fromEntries(firstItemKeys.map((key) => [
        key,
        valueType((firstItem as Record<string, unknown>)[key])
      ]))
    : {};
  const firstResult = payload.result && typeof payload.result === "object" && !Array.isArray(payload.result)
    ? payload.result as SupadataTranscriptResponse
    : null;
  return {
    top_level_keys: objectKeys(payload),
    status: nonEmptyString(payload.status),
    result_type: valueType(payload.result),
    result_keys: objectKeys(payload.result),
    nested_result_type: valueType(firstResult?.result),
    nested_result_depth: nestedResultDepth(payload),
    content_type: valueType(content),
    content_length: Array.isArray(content) ? content.length : null,
    content_item_keys: firstItemKeys,
    content_item_types: firstItemTypes,
    lang_type: valueType(unwrapped.lang),
    available_langs_type: valueType(unwrapped.availableLangs)
  };
}

function emitSafeTranscriptShape(
  payload: SupadataTranscriptResponse,
  context: { phase: string; http_status?: number } | null
): void {
  console.warn(
    "KRC_SUPADATA_TRANSCRIPT_SHAPE",
    JSON.stringify({
      phase: context?.phase ?? "unknown",
      http_status: context?.http_status ?? null,
      ...safeTranscriptPayloadShape(payload)
    })
  );
}

function parseTranscriptResult(
  payload: SupadataTranscriptResponse,
  billableCredits: number,
  context: { phase: string; http_status?: number } | null = null
): SupadataGeneratedTranscriptResult {
  const rawPayload = payload;
  payload = unwrapTranscriptPayload(payload);
  const language = inferTranscriptLanguage(payload, payload.content);
  const segments = parseSegments(payload.content);
  const explicitAvailableLanguages = Array.isArray(payload.availableLangs)
    ? payload.availableLangs.flatMap((value) => {
        const languageValue = nonEmptyString(value);
        return languageValue ? [languageValue] : [];
      })
    : [];
  const availableLanguages = explicitAvailableLanguages.length > 0
    ? explicitAvailableLanguages
    : language ? [language] : [];
  if (!language || segments.length === 0) {
    emitSafeTranscriptShape(rawPayload, context);
    throw new MediaTranscriptError(
      "MANAGED_PROVIDER_TRANSCRIPT_INVALID",
      "The managed transcript provider returned an empty or invalid transcript.",
      502,
      true
    );
  }
  return {
    status: "completed",
    language,
    available_languages: availableLanguages,
    segments,
    transcript_text: segments.map((segment) => segment.text).join(" "),
    billable_credits: billableCredits
  };
}
'''

if old_block not in source:
    raise SystemExit("parser block not found; refusing non-deterministic patch")
source = source.replace(old_block, new_block, 1)

replacements = [
    (
'''    const result = parseTranscriptResult(
      payload,
      billableCredits || NATIVE_TRANSCRIPT_CREDITS
    );''',
'''    const result = parseTranscriptResult(
      payload,
      billableCredits || NATIVE_TRANSCRIPT_CREDITS,
      { phase: "native", http_status: response.status }
    );'''
    ),
    (
'''    let payload = initial.payload;
    if (initial.response.status === 202 || nonEmptyString(payload.jobId)) {''',
'''    let payload = unwrapTranscriptPayload(initial.payload);
    let finalHttpStatus = initial.response.status;
    if (initial.response.status === 202 || nonEmptyString(payload.jobId)) {'''
    ),
    (
'''        const status = nonEmptyString(polled.payload.status);
        if (status === "queued" || status === "active") continue;
        if (status === "failed") {''',
'''        const polledPayload = unwrapTranscriptPayload(polled.payload);
        const status = nonEmptyString(polledPayload.status)?.toLowerCase() ?? null;
        if (status === "queued" || status === "active") continue;
        if (status === "failed") {'''
    ),
    (
'''        if (status === "completed") {
          payload = polled.payload;
          billedFromHeader = billedFromHeader || parseBillableCredits(polled.response.headers);
          completed = true;
          break;
        }
        throw new MediaTranscriptError(''',
'''        if (status === "completed") {
          payload = polledPayload;
          finalHttpStatus = polled.response.status;
          billedFromHeader = billedFromHeader || parseBillableCredits(polled.response.headers);
          completed = true;
          break;
        }
        emitSafeTranscriptShape(polled.payload, {
          phase: "generate-poll-status",
          http_status: polled.response.status
        });
        throw new MediaTranscriptError('''
    ),
    (
'''    const preliminary = parseTranscriptResult(payload, billedFromHeader);''',
'''    const preliminary = parseTranscriptResult(
      payload,
      billedFromHeader,
      { phase: "generate-final", http_status: finalHttpStatus }
    );'''
    )
]

for old, new in replacements:
    if old not in source:
        raise SystemExit(f"required source block not found: {old[:60]!r}")
    source = source.replace(old, new, 1)

SOURCE.write_text(source)

tests = TESTS.read_text()
marker = 'test("Supadata generated transcript accepts deeply nested result and infers chunk language"'
if marker not in tests:
    tests += r'''

test("Supadata generated transcript accepts deeply nested result and infers chunk language", async () => {
  let accountReads = 0;
  await withMockServer((request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/me") {
      accountReads += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        organizationId: "org-fb-deep",
        plan: "Free",
        maxCredits: 100,
        usedCredits: accountReads === 1 ? 20 : 22
      }));
      return;
    }
    if (url.pathname === "/transcript") {
      response.writeHead(202, {
        "content-type": "application/json",
        "x-billable-requests": "2"
      });
      response.end(JSON.stringify({ jobId: "job-fb-deep" }));
      return;
    }
    assert.equal(url.pathname, "/transcript/job-fb-deep");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      status: "COMPLETED",
      result: {
        result: {
          content: [
            { text: "Deep nested transcript", offset: 0, duration: 22000, lang: "uk" }
          ]
        }
      }
    }));
  }, async (baseUrl) => {
    const provider = new SupadataProvider("test-key", baseUrl, 0, 2);
    const result = await provider.getGeneratedTranscript(
      "https://www.facebook.com/reel/1234567890/",
      2
    );
    assert.equal(result.status, "completed");
    assert.equal(result.billable_credits, 2);
    assert.equal(result.language, "uk");
    assert.deepEqual(result.available_languages, ["uk"]);
    assert.equal(result.segments.length, 1);
    assert.equal(result.segments[0]?.end_ms, 22000);
    assert.equal(accountReads, 2);
  });
});

test("Supadata invalid transcript diagnostic exposes shape but never transcript text", async () => {
  const secretTranscriptText = "DO-NOT-LOG-TRANSCRIPT-TEXT";
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...values: unknown[]) => {
    warnings.push(values.map((value) => String(value)).join(" "));
  };
  try {
    await withMockServer((request, response) => {
      const url = new URL(request.url || "/", "http://localhost");
      if (url.pathname === "/me") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          organizationId: "org-shape",
          plan: "Free",
          maxCredits: 100,
          usedCredits: 22
        }));
        return;
      }
      assert.equal(url.pathname, "/transcript");
      response.writeHead(200, {
        "content-type": "application/json",
        "x-billable-requests": "2"
      });
      response.end(JSON.stringify({
        status: "completed",
        result: {
          content: [
            { text: secretTranscriptText, offset: "invalid", duration: 22000 }
          ]
        }
      }));
    }, async (baseUrl) => {
      const provider = new SupadataProvider("test-key", baseUrl, 0, 2);
      await assert.rejects(
        provider.getGeneratedTranscript(
          "https://www.facebook.com/reel/shape-only/",
          2
        ),
        /empty or invalid transcript/
      );
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /KRC_SUPADATA_TRANSCRIPT_SHAPE/);
  assert.match(warnings[0] ?? "", /"content_length":1/);
  assert.match(warnings[0] ?? "", /"content_item_keys":\["duration","offset","text"\]/);
  assert.doesNotMatch(warnings[0] ?? "", new RegExp(secretTranscriptText));
});
'''
    TESTS.write_text(tests)
