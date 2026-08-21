from pathlib import Path

source_path = Path('src/cloud/src/supadata_provider.ts')
test_path = Path('src/cloud/tests/supadata_provider.test.ts')

source = source_path.read_text(encoding='utf-8')

old_interface = '''  error?: unknown;\n  message?: unknown;\n  details?: unknown;\n}\n'''
new_interface = '''  error?: unknown;\n  message?: unknown;\n  details?: unknown;\n  result?: unknown;\n}\n'''
if '  result?: unknown;\n' not in source:
    if old_interface not in source:
        raise SystemExit('SupadataTranscriptResponse insertion anchor not found')
    source = source.replace(old_interface, new_interface, 1)

helper = '''\nfunction unwrapTranscriptPayload(\n  payload: SupadataTranscriptResponse\n): SupadataTranscriptResponse {\n  const nested = payload.result;\n  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {\n    return payload;\n  }\n  return {\n    ...payload,\n    ...(nested as SupadataTranscriptResponse)\n  };\n}\n'''
anchor = '''\nfunction parseTranscriptResult(\n  payload: SupadataTranscriptResponse,\n  billableCredits: number\n): SupadataGeneratedTranscriptResult {\n'''
if 'function unwrapTranscriptPayload(' not in source:
    if anchor not in source:
        raise SystemExit('parseTranscriptResult anchor not found')
    source = source.replace(anchor, helper + anchor, 1)

parse_anchor = '''): SupadataGeneratedTranscriptResult {\n  const language = nonEmptyString(payload.lang);\n'''
parse_replacement = '''): SupadataGeneratedTranscriptResult {\n  payload = unwrapTranscriptPayload(payload);\n  const language = nonEmptyString(payload.lang);\n'''
if 'payload = unwrapTranscriptPayload(payload);' not in source:
    if parse_anchor not in source:
        raise SystemExit('parseTranscriptResult body anchor not found')
    source = source.replace(parse_anchor, parse_replacement, 1)

source_path.write_text(source, encoding='utf-8')

tests = test_path.read_text(encoding='utf-8')
marker = 'test("Supadata generated transcript accepts nested async result payloads", async () => {'
if marker not in tests:
    addition = r'''

test("Supadata generated transcript accepts nested async result payloads", async () => {
  let accountReads = 0;
  let jobReads = 0;
  await withMockServer((request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/me") {
      accountReads += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        organizationId: "org-fb-ai",
        plan: "Free",
        maxCredits: 100,
        usedCredits: accountReads === 1 ? 12 : 14
      }));
      return;
    }
    if (url.pathname === "/transcript") {
      assert.equal(url.searchParams.get("mode"), "generate");
      assert.equal(url.searchParams.get("text"), "false");
      assert.equal(
        url.searchParams.get("url"),
        "https://www.facebook.com/reel/1234567890/"
      );
      response.writeHead(202, {
        "content-type": "application/json",
        "x-billable-requests": "2"
      });
      response.end(JSON.stringify({ jobId: "job-fb-nested" }));
      return;
    }
    assert.equal(url.pathname, "/transcript/job-fb-nested");
    jobReads += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      status: "completed",
      result: {
        lang: "en",
        availableLangs: ["en"],
        content: [
          { text: "Nested Facebook transcript", offset: 0, duration: 22000, lang: "en" }
        ]
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
    assert.equal(result.language, "en");
    assert.equal(result.segments.length, 1);
    assert.equal(result.segments[0]?.end_ms, 22000);
    assert.equal(jobReads, 1);
    assert.equal(accountReads, 2);
  });
});
'''
    tests = tests.rstrip() + addition.rstrip() + '\n'

test_path.write_text(tests, encoding='utf-8')
print('patched supadata nested async transcript result support')
