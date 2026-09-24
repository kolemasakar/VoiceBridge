import { MediaTranscriptError } from "./media_transcript.js";

export type ManagedMediaPlatform = "youtube" | "instagram" | "facebook" | "telegram";

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

function isFacebookHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "facebook.com" || host.endsWith(".facebook.com");
}

function isFacebookWatchHost(hostname: string): boolean {
  return hostname.toLowerCase() === "fb.watch";
}

function isTelegramHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "t.me" || host === "telegram.me";
}

function safeFacebookToken(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9._-]+$/.test(value));
}

function safeTelegramChannel(value: string | undefined): value is string {
  if (!value || !/^[A-Za-z0-9_]{5,64}$/.test(value)) return false;
  return ![
    "addlist",
    "joinchat",
    "login",
    "proxy",
    "share",
    "socks"
  ].includes(value.toLowerCase());
}

function safeTelegramPostId(value: string | undefined): value is string {
  if (!value || !/^\d+$/.test(value)) return false;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0;
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
  if (isFacebookHost(parsed.hostname) || isFacebookWatchHost(parsed.hostname)) {
    return "facebook";
  }
  if (isTelegramHost(parsed.hostname)) return "telegram";
  return unsupportedUrl(
    "Only public HTTPS YouTube, Instagram, Facebook and Telegram video URLs are supported by the managed beta."
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

export function isManagedTelegramPublicPostUrl(value: string): boolean {
  try {
    return managedMediaPlatform(normalizeManagedMediaUrl(value)) === "telegram";
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

    return `https://www.instagram.com/${kind}/${shortcode}/`;
  }

  if (isFacebookWatchHost(url.hostname)) {
    const parts = url.pathname.split("/").filter(Boolean);
    const shortcode = parts[0];
    if (!safeFacebookToken(shortcode)) {
      return unsupportedUrl(
        "Only public fb.watch video links are supported."
      );
    }
    return `https://fb.watch/${shortcode}/`;
  }

  if (isFacebookHost(url.hostname)) {
    const parts = url.pathname.split("/").filter(Boolean);
    const first = parts[0]?.toLowerCase();

    if (["login", "accounts", "groups", "events", "marketplace"].includes(first || "")) {
      return unsupportedUrl(
        "Only public Facebook Reel/video/post URLs are supported; login, group and private-resource URLs are not supported."
      );
    }

    if (first === "reel" && safeFacebookToken(parts[1])) {
      return `https://www.facebook.com/reel/${parts[1]}/`;
    }

    if (first === "watch") {
      const videoId = url.searchParams.get("v") || undefined;
      if (!safeFacebookToken(videoId)) {
        return unsupportedUrl("Facebook watch URLs must include a public video id.");
      }
      return `https://www.facebook.com/watch/?v=${encodeURIComponent(videoId)}`;
    }

    if (
      first === "share" &&
      ["r", "v", "p"].includes(parts[1]?.toLowerCase() || "") &&
      safeFacebookToken(parts[2])
    ) {
      return `https://www.facebook.com/share/${parts[1]!.toLowerCase()}/${parts[2]}/`;
    }

    const videosIndex = parts.findIndex((part) => part.toLowerCase() === "videos");
    if (videosIndex > 0 && safeFacebookToken(parts[videosIndex + 1])) {
      const ownerPath = parts.slice(0, videosIndex).join("/");
      return `https://www.facebook.com/${ownerPath}/videos/${parts[videosIndex + 1]}/`;
    }

    const postsIndex = parts.findIndex((part) => part.toLowerCase() === "posts");
    if (postsIndex > 0 && safeFacebookToken(parts[postsIndex + 1])) {
      const ownerPath = parts.slice(0, postsIndex).join("/");
      return `https://www.facebook.com/${ownerPath}/posts/${parts[postsIndex + 1]}/`;
    }

    return unsupportedUrl(
      "Only public Facebook Reel, watch, share, video-post or supported fb.watch URLs are supported."
    );
  }

  if (isTelegramHost(url.hostname)) {
    const parts = url.pathname.split("/").filter(Boolean);
    const preview = parts[0]?.toLowerCase() === "s";
    const channel = preview ? parts[1] : parts[0];
    const postId = preview ? parts[2] : parts[1];
    const expectedParts = preview ? 3 : 2;

    if (
      parts.length !== expectedParts ||
      !safeTelegramChannel(channel) ||
      !safeTelegramPostId(postId)
    ) {
      return unsupportedUrl(
        "Only public Telegram channel/group post URLs in the form https://t.me/<channel>/<post_id> are supported; invite, login and non-post URLs are not supported."
      );
    }

    return `https://t.me/${channel}/${postId}`;
  }

  return unsupportedUrl(
    "Only public HTTPS YouTube, Instagram, Facebook and Telegram video URLs are supported by the managed beta."
  );
}
