import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isManagedTelegramPublicPostUrl,
  managedMediaPlatform,
  normalizeManagedMediaUrl
} from "../src/managed_media_url.js";
import { MediaTranscriptError } from "../src/media_transcript.js";
import {
  TelegramMediaRetrievalError,
  TelegramPublicWebRetriever,
  parseTelegramPublicEmbedHtml
} from "../src/telegram_public_retrieval.js";

const TELEGRAM_URL = "https://t.me/techcrimes/12101";
const TELEGRAM_MEDIA_URL = "https://cdn4.cdn-telegram.org/file/119b6ffe41.mp4?token=test&amp;expires=1";
const TELEGRAM_LIVE_MEDIA_URL = "https://cdn4.telesco.pe/file/119b6ffe41.mp4?token=test&amp;expires=1";

function embedHtml(options?: {
  post?: string;
  href?: string;
  mediaUrl?: string | null;
  duration?: string;
}): string {
  const post = options?.post ?? "techcrimes/12101";
  const href = options?.href ?? TELEGRAM_URL;
  const duration = options?.duration ?? "0:16";
  const video = options?.mediaUrl === null
    ? ""
    : `<video src="${options?.mediaUrl ?? TELEGRAM_MEDIA_URL}" class="tgme_widget_message_video"></video>`;
  return `<!doctype html>
<html><body>
<div class="tgme_widget_message js-widget_message" data-post="${post}">
<a class="tgme_widget_message_video_player js-message_video_player" href="${href}">
${video}
<time class="message_video_duration js-message_video_duration">${duration}</time>
</a>
</div>
</body></html>`;
}

test("A9.9 normalizes supported public Telegram post URLs", () => {
  assert.equal(normalizeManagedMediaUrl(TELEGRAM_URL), TELEGRAM_URL);
  assert.equal(
    normalizeManagedMediaUrl("https://telegram.me/techcrimes/12101?single=1#fragment"),
    TELEGRAM_URL
  );
  assert.equal(
    normalizeManagedMediaUrl("https://t.me/s/techcrimes/12101?before=12102"),
    TELEGRAM_URL
  );
  assert.equal(managedMediaPlatform(TELEGRAM_URL), "telegram");
  assert.equal(isManagedTelegramPublicPostUrl(TELEGRAM_URL), true);
});

test("A9.9 rejects Telegram invite, login and non-post URLs", () => {
  for (const url of [
    "https://t.me/+AbCdEf123",
    "https://t.me/joinchat/AbCdEf123",
    "https://t.me/techcrimes",
    "https://t.me/techcrimes/not-a-number",
    "https://t.me/share/url?url=https%3A%2F%2Fexample.com"
  ]) {
    assert.throws(
      () => normalizeManagedMediaUrl(url),
      (error: unknown) => {
        assert.ok(error instanceof MediaTranscriptError);
        assert.equal(error.code, "MEDIA_URL_UNSUPPORTED");
        return true;
      }
    );
    assert.equal(isManagedTelegramPublicPostUrl(url), false);
  }
});

test("A9.9 parses the exact Telegram embed video and charges zero retrieval credits", () => {
  const asset = parseTelegramPublicEmbedHtml(embedHtml(), TELEGRAM_URL);
  assert.ok(asset);
  assert.equal(asset.source_url, TELEGRAM_URL);
  assert.equal(
    asset.media_url,
    "https://cdn4.cdn-telegram.org/file/119b6ffe41.mp4?token=test&expires=1"
  );
  assert.equal(asset.duration_seconds, 16);
  assert.equal(asset.provider, "telegram_public_web");
  assert.equal(asset.provider_mode, "telegram_post");
  assert.equal(asset.credits_charged, 0);
});

test("A9.9 accepts live Telegram telesco.pe CDN subdomains", () => {
  const asset = parseTelegramPublicEmbedHtml(
    embedHtml({ mediaUrl: TELEGRAM_LIVE_MEDIA_URL }),
    TELEGRAM_URL
  );
  assert.ok(asset);
  assert.equal(
    asset.media_url,
    "https://cdn4.telesco.pe/file/119b6ffe41.mp4?token=test&expires=1"
  );
  assert.equal(asset.credits_charged, 0);
});

test("A9.9 ignores neighboring posts and untrusted media origins", () => {
  assert.equal(
    parseTelegramPublicEmbedHtml(
      embedHtml({ post: "techcrimes/12100", href: "https://t.me/techcrimes/12100" }),
      TELEGRAM_URL
    ),
    null
  );
  assert.equal(
    parseTelegramPublicEmbedHtml(
      embedHtml({ mediaUrl: "https://attacker.example.test/video.mp4" }),
      TELEGRAM_URL
    ),
    null
  );
});

test("A9.9 retriever requests the single public embed and returns the parsed asset", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    calls += 1;
    const url = new URL(input instanceof Request ? input.url : input.toString());
    assert.equal(url.origin + url.pathname, TELEGRAM_URL);
    assert.equal(url.searchParams.get("embed"), "1");
    assert.equal(url.searchParams.get("single"), "1");
    assert.equal(init?.method, "GET");
    return new Response(embedHtml(), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  };

  const retriever = new TelegramPublicWebRetriever(fetchImpl);
  const asset = await retriever.retrieve(TELEGRAM_URL);
  assert.equal(asset.provider, "telegram_public_web");
  assert.equal(asset.credits_charged, 0);
  assert.equal(calls, 1);
});

test("A9.9 no browser-playable video is terminal Telegram media unavailable", async () => {
  const fetchImpl: typeof fetch = async () => new Response(
    embedHtml({ mediaUrl: null }),
    { status: 200, headers: { "content-type": "text/html" } }
  );
  const retriever = new TelegramPublicWebRetriever(fetchImpl);
  await assert.rejects(
    retriever.retrieve(TELEGRAM_URL),
    (error: unknown) => {
      assert.ok(error instanceof TelegramMediaRetrievalError);
      assert.equal(error.code, "TELEGRAM_MEDIA_UNAVAILABLE");
      assert.equal(error.retryable, false);
      return true;
    }
  );
});

test("A9.9 temporary Telegram preview failure is retryable but never becomes a paid route", async () => {
  const fetchImpl: typeof fetch = async () => new Response("temporary", { status: 503 });
  const retriever = new TelegramPublicWebRetriever(fetchImpl);
  await assert.rejects(
    retriever.retrieve(TELEGRAM_URL),
    (error: unknown) => {
      assert.ok(error instanceof TelegramMediaRetrievalError);
      assert.equal(error.code, "TELEGRAM_RETRIEVAL_UNAVAILABLE");
      assert.equal(error.retryable, true);
      assert.equal(error.provider, "telegram_public_web");
      return true;
    }
  );
});
