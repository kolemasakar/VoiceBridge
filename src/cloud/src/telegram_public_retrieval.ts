import {
  managedMediaPlatform,
  normalizeManagedMediaUrl
} from "./managed_media_url.js";
import { MediaTranscriptError } from "./media_transcript.js";

const DEFAULT_TELEGRAM_FETCH_TIMEOUT_MS = 15000;
const DEFAULT_TELEGRAM_MAX_HTML_BYTES = 2 * 1024 * 1024;

export type TelegramMediaRetrievalProvider = "telegram_public_web";

export interface TelegramPublicMediaAsset {
  source_url: string;
  media_url: string;
  duration_seconds: number | null;
  provider: TelegramMediaRetrievalProvider;
  provider_mode: "telegram_post";
  credits_charged: 0;
}

export class TelegramMediaRetrievalError extends MediaTranscriptError {
  constructor(
    code: string,
    message: string,
    httpStatus: number,
    retryable: boolean,
    readonly provider: TelegramMediaRetrievalProvider = "telegram_public_web"
  ) {
    super(code, message, httpStatus, retryable);
  }
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function telegramSourceParts(sourceUrl: string): {
  sourceUrl: string;
  channel: string;
  postId: string;
} {
  const normalized = normalizeManagedMediaUrl(sourceUrl);
  if (managedMediaPlatform(normalized) !== "telegram") {
    throw new TelegramMediaRetrievalError(
      "TELEGRAM_MEDIA_URL_REQUIRED",
      "The Telegram retriever accepts only supported public Telegram post URLs.",
      400,
      false
    );
  }
  const parsed = new URL(normalized);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const channel = parts[0];
  const postId = parts[1];
  if (!channel || !postId) {
    throw new TelegramMediaRetrievalError(
      "TELEGRAM_MEDIA_URL_REQUIRED",
      "The Telegram post URL is incomplete.",
      400,
      false
    );
  }
  return { sourceUrl: normalized, channel, postId };
}

function parseDuration(value: string | null): number | null {
  if (!value) return null;
  const parts = value.trim().split(":");
  if (parts.length < 1 || parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    total = total * 60 + Number(part);
  }
  return Number.isFinite(total) && total >= 0 ? total : null;
}

function safeTelegramMediaUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(decodeHtmlAttribute(value));
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  const trustedHost = host === "cdn.telesco.pe" ||
    host === "cdn-telegram.org" ||
    host.endsWith(".cdn-telegram.org");
  if (!trustedHost) return null;
  if (!/\.mp4$/i.test(parsed.pathname)) return null;
  return parsed.toString();
}

function attributeValue(attributes: string, name: string): string | null {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  const match = pattern.exec(attributes);
  return match?.[2] ? decodeHtmlAttribute(match[2]) : null;
}

function hasClass(attributes: string, className: string): boolean {
  const classes = attributeValue(attributes, "class");
  return classes?.split(/\s+/).includes(className) ?? false;
}

function exactTelegramPostHref(href: string, sourceUrl: string): boolean {
  try {
    return normalizeManagedMediaUrl(href) === sourceUrl;
  } catch {
    return false;
  }
}

export function parseTelegramPublicEmbedHtml(
  html: string,
  sourceUrl: string
): TelegramPublicMediaAsset | null {
  const source = telegramSourceParts(sourceUrl);
  const expectedDataPost = `${source.channel}/${source.postId}`;
  const dataPostPattern = /\bdata-post\s*=\s*(["'])(.*?)\1/gi;
  let exactPostPresent = false;
  for (const match of html.matchAll(dataPostPattern)) {
    if (match[2] === expectedDataPost) {
      exactPostPresent = true;
      break;
    }
  }
  if (!exactPostPresent) return null;

  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";
    if (!hasClass(attributes, "tgme_widget_message_video_player")) continue;
    const href = attributeValue(attributes, "href");
    if (!href || !exactTelegramPostHref(href, source.sourceUrl)) continue;

    const videoMatch = /<video\b([^>]*)>/i.exec(body);
    const videoAttributes = videoMatch?.[1] ?? "";
    const mediaUrlRaw = videoMatch ? attributeValue(videoAttributes, "src") : null;
    if (!mediaUrlRaw) continue;
    const mediaUrl = safeTelegramMediaUrl(mediaUrlRaw);
    if (!mediaUrl) continue;

    const durationMatch = /<time\b([^>]*)>([^<]*)<\/time>/gi;
    let durationSeconds: number | null = null;
    for (const timeMatch of body.matchAll(durationMatch)) {
      const timeAttributes = timeMatch[1] ?? "";
      if (!hasClass(timeAttributes, "message_video_duration") &&
          !hasClass(timeAttributes, "js-message_video_duration")) {
        continue;
      }
      durationSeconds = parseDuration(timeMatch[2] ?? null);
      break;
    }

    return {
      source_url: source.sourceUrl,
      media_url: mediaUrl,
      duration_seconds: durationSeconds,
      provider: "telegram_public_web",
      provider_mode: "telegram_post",
      credits_charged: 0
    };
  }

  return null;
}

export class TelegramPublicWebRetriever {
  readonly provider = "telegram_public_web" as const;

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_TELEGRAM_FETCH_TIMEOUT_MS,
    private readonly maxHtmlBytes = DEFAULT_TELEGRAM_MAX_HTML_BYTES
  ) {}

  async retrieve(sourceUrl: string): Promise<TelegramPublicMediaAsset> {
    const source = telegramSourceParts(sourceUrl);
    const embedUrl = new URL(source.sourceUrl);
    embedUrl.searchParams.set("embed", "1");
    embedUrl.searchParams.set("single", "1");

    let response: Response;
    try {
      response = await this.fetchImpl(embedUrl, {
        method: "GET",
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "VoiceBridge-KRC-Media-Beta/1.0"
        },
        redirect: "follow",
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch {
      throw new TelegramMediaRetrievalError(
        "TELEGRAM_RETRIEVAL_UNAVAILABLE",
        "The public Telegram web preview could not be reached.",
        502,
        true
      );
    }

    if (response.url) {
      try {
        const finalUrl = new URL(response.url);
        if (!["t.me", "telegram.me"].includes(finalUrl.hostname.toLowerCase())) {
          throw new TelegramMediaRetrievalError(
            "TELEGRAM_MEDIA_UNAVAILABLE",
            "The Telegram public preview redirected outside the trusted Telegram web surface.",
            422,
            false
          );
        }
      } catch (error) {
        if (error instanceof TelegramMediaRetrievalError) throw error;
        throw new TelegramMediaRetrievalError(
          "TELEGRAM_MEDIA_UNAVAILABLE",
          "The Telegram public preview returned an invalid final URL.",
          422,
          false
        );
      }
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new TelegramMediaRetrievalError(
        retryable ? "TELEGRAM_RETRIEVAL_UNAVAILABLE" : "TELEGRAM_MEDIA_UNAVAILABLE",
        retryable
          ? "The public Telegram web preview is temporarily unavailable."
          : "The Telegram post is unavailable through the public web preview.",
        retryable ? 502 : 422,
        retryable
      );
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !contentType.includes("text/html")) {
      throw new TelegramMediaRetrievalError(
        "TELEGRAM_MEDIA_UNAVAILABLE",
        "The Telegram public preview did not return HTML.",
        422,
        false
      );
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > this.maxHtmlBytes) {
      throw new TelegramMediaRetrievalError(
        "TELEGRAM_PREVIEW_TOO_LARGE",
        "The Telegram public preview exceeded the supported response size.",
        413,
        false
      );
    }

    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > this.maxHtmlBytes) {
      throw new TelegramMediaRetrievalError(
        "TELEGRAM_PREVIEW_TOO_LARGE",
        "The Telegram public preview exceeded the supported response size.",
        413,
        false
      );
    }

    const asset = parseTelegramPublicEmbedHtml(html, source.sourceUrl);
    if (!asset) {
      throw new TelegramMediaRetrievalError(
        "TELEGRAM_MEDIA_UNAVAILABLE",
        "The requested public Telegram post does not expose a browser-playable video asset.",
        422,
        false
      );
    }
    return asset;
  }
}
