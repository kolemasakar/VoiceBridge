from pathlib import Path

path = Path("src/cloud/tests/managed_media_service.test.ts")
s = path.read_text(encoding="utf-8")
old = '''test("AI consent parser accepts only separate Supadata generate cap of 40", () => {
  assert.equal(
    parseManagedMediaAiInput({
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "supadata", mode: "generate", max_credits: 2 }
    }),
    null
  );
  assert.ok(
    parseManagedMediaAiInput({
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "supadata", mode: "generate", max_credits: 40 }
    })
  );
});
'''
new = '''test("AI consent parser accepts bounded dynamic Supadata generate caps", () => {
  for (const maxCredits of [2, 6, 40]) {
    assert.ok(
      parseManagedMediaAiInput({
        beta_access_code: ACCESS_CODE,
        credit_consent: {
          provider: "supadata",
          mode: "generate",
          max_credits: maxCredits
        }
      })
    );
  }

  for (const maxCredits of [1, 2.5, 10001]) {
    assert.equal(
      parseManagedMediaAiInput({
        beta_access_code: ACCESS_CODE,
        credit_consent: {
          provider: "supadata",
          mode: "generate",
          max_credits: maxCredits
        }
      }),
      null
    );
  }

  assert.equal(
    parseManagedMediaAiInput({
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "other", mode: "generate", max_credits: 6 }
    }),
    null
  );
  assert.equal(
    parseManagedMediaAiInput({
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "supadata", mode: "native", max_credits: 6 }
    }),
    null
  );
});
'''
if s.count(old) != 1:
    raise SystemExit(f"legacy AI consent parser test match count={s.count(old)}")
path.write_text(s.replace(old, new, 1), encoding="utf-8")
