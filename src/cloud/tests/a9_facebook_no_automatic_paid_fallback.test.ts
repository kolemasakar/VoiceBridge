import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FacebookMediaRetrievalChain,
  FacebookMediaRetrievalError,
  type FacebookRetrievalCreditConsent
} from "../src/facebook_media_retrieval.js";

const FACEBOOK_URL = "https://www.facebook.com/reel/1114235920664408/";
const CONSENT: FacebookRetrievalCreditConsent = {
  provider: "scrapecreators",
  mode: "facebook_post",
  max_credits: 1
};

test("A9 regression: Cobalt failure is unavailable and never triggers paid fallback", async () => {
  let freeCalls = 0;
  let paidCalls = 0;

  const freeRetriever = {
    provider: "cobalt" as const,
    async retrieve(): Promise<never> {
      freeCalls += 1;
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
      throw new Error("paid fallback must remain unreachable in active Media Beta");
    }
  };

  const chain = new FacebookMediaRetrievalChain(freeRetriever, paidRetriever);

  for (const consent of [undefined, CONSENT]) {
    await assert.rejects(
      chain.retrieve(FACEBOOK_URL, consent),
      (error: unknown) => {
        assert.ok(error instanceof FacebookMediaRetrievalError);
        assert.equal(error.code, "FACEBOOK_RETRIEVAL_UNAVAILABLE");
        assert.equal(error.provider, "cobalt");
        return true;
      }
    );
  }

  assert.equal(freeCalls, 2);
  assert.equal(paidCalls, 0);
});
