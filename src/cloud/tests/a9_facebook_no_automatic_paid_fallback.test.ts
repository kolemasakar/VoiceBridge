import assert from "node:assert/strict";
import { test } from "node:test";
import { FacebookMediaRetrievalChain, FacebookMediaRetrievalError } from "../src/facebook_media_retrieval.js";

const FACEBOOK_URL = "https://www.facebook.com/reel/1114235920664408/";

test("A9: Cobalt failure does not trigger automatic paid fallback", async () => {
  let paidCalls = 0;

  const freeRetriever = {
    provider: "cobalt" as const,
    async retrieve(): Promise<never> {
      throw new FacebookMediaRetrievalError(
        "FACEBOOK_COBALT_FAILED",
        "free retrieval unavailable",
        502,
        false,
        "cobalt"
      );
    }
  };

  const paidRetriever = {
    provider: "scrapecreators" as const,
    async retrieve(): Promise<never> {
      paidCalls += 1;
      throw new Error("automatic paid fallback is forbidden");
    }
  };

  const chain = new FacebookMediaRetrievalChain(freeRetriever, paidRetriever);

  await assert.rejects(
    chain.retrieve(FACEBOOK_URL),
    (error: unknown) => {
      assert.ok(error instanceof FacebookMediaRetrievalError);
      assert.equal(error.code, "FACEBOOK_RETRIEVAL_CREDIT_CONSENT_REQUIRED");
      return true;
    }
  );

  assert.equal(paidCalls, 0);
});
