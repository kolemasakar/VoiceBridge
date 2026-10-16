import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSupadataFreeTier } from "../src/free_tier_supadata_provider.js";

function account(plan: string, maxCredits: number) {
  return {
    organization_id: "fixture",
    plan,
    max_credits: maxCredits,
    used_credits: 0,
    remaining_credits: maxCredits
  };
}

test("Supadata Free label with 100-credit ceiling is accepted", () => {
  assert.doesNotThrow(() => assertSupadataFreeTier(account("Free", 100)));
});

test("Supadata Basic label with 100-credit free ceiling is accepted", () => {
  assert.doesNotThrow(() => assertSupadataFreeTier(account("Basic", 100)));
});

test("Supadata paid Basic allocation is rejected", () => {
  assert.throws(
    () => assertSupadataFreeTier(account("Basic", 300)),
    (error: unknown) =>
      (error as { code?: string }).code === "MANAGED_PROVIDER_FREE_TIER_REQUIRED"
  );
});

test("unknown plan label fails closed even at free-sized allocation", () => {
  assert.throws(
    () => assertSupadataFreeTier(account("Unknown", 100)),
    (error: unknown) =>
      (error as { code?: string }).code === "MANAGED_PROVIDER_FREE_TIER_REQUIRED"
  );
});
