import { MediaTranscriptError } from "./media_transcript.js";

export type ManagedMediaPlatform = "youtube" | "instagram";

function isYoutubeHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be" ||
    host.endsWith(".youtu.be");
}

function isInstagramHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "instagram.com" || host.endsWith(".instagram.com");
}

function invalidUrl(message: string): never {
  throw new MediaTranscriptError(
    "MEDIA_URL_INVALID",
    message,
    400,
    false
  );
}

function unsupportedUrl(message: string): never {
  throw new MediaTranscriptError(
    "MEDIA_URL_UNSUPPORTED",
    message,
    400,
    false
  );
}

export function managedMediaPlatform(url: string): ManagedMediaPlatform {
  const parsed = new URL(url);
  if (isYoutubeHost(parsed.hostname)) return "youtube";
  if (isInstagramHost(parsed.hostname)) return "instagram";
  return unsupportedUrl(
    "Only public HTTPS YouTube and Instagram Reel/video URLs are supported by the managed beta."
  );
}

export function isManagedInstagramReelUrl(value: string): boolean {
  try {
    const normalized = normalizeManagedMediaUrl(value);
    const parsed = new URL(normalized);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return managedMediaPlatform(normalized) === "instagram" && parts[0] === "reel";
  } catch {
    return false;
  }
}

export function normalizeManagedMediaUrl(value: string): string {
  if (value.length > 2048) {
    return invalidUrl("The media URL is too long.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidUrl("The media URL is not valid.");
  }

  if (url.protocol !== "https:") {
    return unsupportedUrl("Managed media URLs must use HTTPS.");
  }

  if (isYoutubeHost(url.hostname)) {
    url.hash = "";
    return url.toString();
  }

  if (isInstagramHost(url.hostname)) {
    const parts = url.pathname.split("/").filter(Boolean);
    const kind = parts[0]?.toLowerCase();
    const shortcode = parts[1];
    if (
      !shortcode ||
      !["reel", "p", "tv"].includes(kind || "") ||
      !/^[A-Za-z0-9_-]+$/.test(shortcode)
    ) {
      return unsupportedUrl(
        "Only public Instagram Reel or video-post URLs are supported; profile, login and private-resource URLs are not supported."
      );
    }

    // Canonicalize share URLs so tracking parameters such as igsh do not
    // create distinct durable request keys and accidental duplicate spend.
    return `https://www.instagram.com/${kind}/${shortcode}/`;
  }

  return unsupportedUrl(
    "Only public HTTPS YouTube and Instagram Reel/video URLs are supported by the managed beta."
  );
}
