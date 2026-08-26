from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "src/cloud/tests/managed_media_instagram.test.ts"
text = PATH.read_text(encoding="utf-8")
old = '''test("managed capability advertises YouTube, Instagram and Facebook", () => {
'''
new = '''test("managed capability advertises YouTube, Instagram, Facebook and Telegram", () => {
'''
if old not in text:
    raise SystemExit("capability test title anchor not found")
text = text.replace(old, new, 1)
old = '''  assert.deepEqual(capability.platforms, ["youtube", "instagram", "facebook"]);
'''
new = '''  assert.deepEqual(capability.platforms, ["youtube", "instagram", "facebook", "telegram"]);
  assert.equal(capability.telegram_public_retrieval, true);
  assert.equal(capability.telegram_retrieval_provider, "telegram_public_web");
  assert.equal(capability.telegram_retrieval_credits, 0);
'''
if old not in text:
    raise SystemExit("capability platform assertion anchor not found")
PATH.write_text(text.replace(old, new, 1), encoding="utf-8")
print("A9.9 Telegram capability regression updated")
