import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import {
  CobaltFacebookRetriever,
  FacebookMediaRetrievalChain,
  FacebookMediaRetrievalError,
  ScrapeCreatorsFacebookRetriever,
  facebookRetrievalCreditPreflight,
  parseFacebookRetrievalCreditConsent,
  type FacebookRetrievalCreditConsent
} from "../src/facebook_media_retrieval.js";

const FACEBOOK_URL = "https://www.facebook.com/reel/1114235920664408/";
const CONSENT: FacebookRetrievalCreditConsent = {
  provider: "scrapecreators",
  mode: "facebook_post",
  max_credits: 1
};

async function withMockServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch((error) => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function bodyText(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

test("Facebook paid retrieval preflight remains reserve-only provider metadata", () => {
  assert.deepEqual(facebookRetrievalCreditPreflight(FACEBOOK_URL), {
    source_url: FACEBOOK_URL,
    provider: "scrapecreators",
    mode: "facebook_post",
    estimated_credits: 1,
    maximum_credits: 1,
    consent_required: true,
    consent_options: { approve: 1, reject: 2 },
    provider_balance_lookup_performed: false,
    note: "provider_balance_endpoint_is_not_used_for_preflight"
  });
  assert.deepEqual(parseFacebookRetrievalCreditConsent(CONSENT), CONSENT);
  assert.equal(parseFacebookRetrievalCreditConsent({
    provider: "scrapecreators",
    mode: "facebook_post",
    max_credits: 2
  }), null);
});

test("Cobalt returns a zero-credit Facebook media asset without paid fallback", async () => {
  let cobaltCalls = 0;
  await withMockServer(async (request, response) => {
    cobaltCalls += 1;
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/");
    const body = JSON.parse(await bodyText(request)) as Record<string, unknown>;
    assert.equal(body.url, FACEBOOK_URL);
    assert.equal(body.downloadMode, "auto");
    assert.equal(body.videoQuality, "720");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      status: "redirect",
      url: "https://video.example.test/facebook.mp4",
      filename: "facebook.mp4"
    }));
  }, async (cobaltBase) => {
    const paidRetriever = {
      provider: "scrapecreators" as const,
      async retrieve(): Promise<never> {
        throw new Error("paid fallback must not run");
      }
    };
    const chain = new FacebookMediaRetrievalChain(
      new CobaltFacebookRetriever(cobaltBase),
      paidRetriever
    );
    const asset = await chain.retrieve(FACEBOOK_URL);
    assert.equal(asset.provider, "cobalt");
    assert.equal(asset.credits_charged, 0);
    assert.equal(asset.media_url, "https://video.example.test/facebook.mp4");
    assert.equal(asset.duration_seconds, null);
  });
  assert.equal(cobaltCalls, 1);
});

test("Cobalt failure is terminal unavailable and never calls reserve paid fallback", async () => {
  let cobaltCalls = 0;
  let paidCalls = 0;
  await withMockServer((_request, response) => {
    cobaltCalls += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "error", error: { code: "api.fetch.fail" } }));
  }, async (cobaltBase) => {
    const paidRetriever = {
      provider: "scrapecreators" as const,
      async retrieve(): Promise<never> {
        paidCalls += 1;
        throw new Error("paid fallback is reserve-only");
      }
    };
    const chain = new FacebookMediaRetrievalChain(
      new CobaltFacebookRetriever(cobaltBase),
      paidRetriever
    );
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
  });
  assert.equal(cobaltCalls, 2);
  assert.equal(paidCalls, 0);
});

test("ScrapeCreators reserve retriever still requires explicit one-credit consent", async () => {
  let calls = 0;
  await withMockServer((request, response) => {
    calls += 1;
    assert.equal(request.method, "GET");
    const url = new URL(request.url || "/", "http://localhost");
    assert.equal(url.pathname, "/v1/facebook/post");
    assert.equal(url.searchParams.get("url"), FACEBOOK_URL);
    assert.equal(url.searchParams.get("cache_max_age"), "30d");
    assert.equal(request.headers["x-api-key"], "test-key");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      success: true,
      credits_remaining: 77,
      credits_charged: 1,
      hd_url: "https://video.example.test/reel-hd.mp4",
      sd_url: "https://video.example.test/reel-sd.mp4",
      length_in_second: 23.36
    }));
  }, async (paidBase) => {
    const retriever = new ScrapeCreatorsFacebookRetriever("test-key", paidBase);
    await assert.rejects(
      retriever.retrieve(FACEBOOK_URL),
      (error: unknown) => {
        assert.ok(error instanceof FacebookMediaRetrievalError);
        assert.equal(error.code, "FACEBOOK_RETRIEVAL_CREDIT_CONSENT_REQUIRED");
        return true;
      }
    );
    const asset = await retriever.retrieve(FACEBOOK_URL, CONSENT);
    assert.equal(asset.provider, "scrapecreators");
    assert.equal(asset.provider_mode, "facebook_post");
    assert.equal(asset.credits_charged, 1);
    assert.equal(asset.credits_remaining, 77);
    assert.equal(asset.duration_seconds, 23.36);
    assert.equal(asset.media_url, "https://video.example.test/reel-hd.mp4");
  });
  assert.equal(calls, 1);
});

test("ScrapeCreators cached response may charge zero credits and remains valid", async () => {
  let calls = 0;
  await withMockServer((_request, response) => {
    calls += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      success: true,
      cached: true,
      credits_remaining: 78,
      credits_charged: 0,
      sd_url: "https://video.example.test/cached.mp4",
      length_in_second: 22
    }));
  }, async (baseUrl) => {
    const retriever = new ScrapeCreatorsFacebookRetriever("test-key", baseUrl);
    const asset = await retriever.retrieve(FACEBOOK_URL, CONSENT);
    assert.equal(asset.cached, true);
    assert.equal(asset.credits_charged, 0);
    assert.equal(asset.credits_remaining, 78);
  });
  assert.equal(calls, 1);
});

test("paid retrieval never retries and reports credit cap breach", async () => {
  let calls = 0;
  await withMockServer((_request, response) => {
    calls += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      success: true,
      credits_remaining: 76,
      credits_charged: 2,
      hd_url: "https://video.example.test/should-not-be-used.mp4"
    }));
  }, async (baseUrl) => {
    const retriever = new ScrapeCreatorsFacebookRetriever("test-key", baseUrl);
    await assert.rejects(
      retriever.retrieve(FACEBOOK_URL, CONSENT),
      (error: unknown) => {
        assert.ok(error instanceof FacebookMediaRetrievalError);
        assert.equal(error.code, "FACEBOOK_SCRAPECREATORS_CREDIT_CAP_BREACH");
        assert.equal(error.creditsCharged, 2);
        assert.equal(error.creditsRemaining, 76);
        return true;
      }
    );
  });
  assert.equal(calls, 1);
});

test("paid provider 5xx is a single non-retryable reserve-provider attempt", async () => {
  let calls = 0;
  await withMockServer((_request, response) => {
    calls += 1;
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({
      success: false,
      credits_remaining: 77,
      credits_charged: 1
    }));
  }, async (baseUrl) => {
    const retriever = new ScrapeCreatorsFacebookRetriever("test-key", baseUrl);
    await assert.rejects(
      retriever.retrieve(FACEBOOK_URL, CONSENT),
      (error: unknown) => {
        assert.ok(error instanceof FacebookMediaRetrievalError);
        assert.equal(error.code, "FACEBOOK_SCRAPECREATORS_FAILED");
        assert.equal(error.retryable, false);
        assert.equal(error.creditsCharged, 1);
        return true;
      }
    );
  });
  assert.equal(calls, 1);
});
