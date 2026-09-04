import { MediaTranscriptError } from "./media_transcript.js";

export const MANAGED_ATTACHMENT_PROBE_MAX_BYTES = 64 * 1024;
const ATTACHMENT_PROBE_TIMEOUT_MS = 8000;
// OpenAI historically documents files.oaiusercontent.com; current ChatGPT runtime may use regional *.oaiusercontent.com hosts.
const OPENAI_FILE_HOST_SUFFIX = ".oaiusercontent.com";

export type ManagedAttachmentClass = "audio" | "video";

export interface OpenAiConversationFileRef {
  name: string;
  id: string;
  mime_type: string;
  download_link: string;
}

export interface ManagedAttachmentProbeInput {
  file: OpenAiConversationFileRef;
}

export interface ManagedAttachmentProbeResult {
  transport_available: true;
  file_class: ManagedAttachmentClass;
  declared_mime_type: string;
  response_mime_type: string;
  mime_consistent: true;
  probe_bytes_received: number;
  probe_byte_limit: number;
  range_requested: true;
  range_supported: boolean;
  response_truncated_at_probe_limit: boolean;
}

export type ManagedAttachmentProbeRunner = (
  input: ManagedAttachmentProbeInput
) => Promise<ManagedAttachmentProbeResult>;

const AUDIO_EXTENSIONS = new Set([
  ".aac",
  ".flac",
  ".m4a",
  ".mp3",
  ".oga",
  ".ogg",
  ".opus",
  ".wav",
  ".webm"
]);

const VIDEO_EXTENSIONS = new Set([
  ".avi",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp4",
  ".webm"
]);

function nonEmptyString(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximumLength) return null;
  return trimmed;
}

export function parseManagedAttachmentProbeInput(
  value: unknown
): ManagedAttachmentProbeInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.openaiFileIdRefs) || input.openaiFileIdRefs.length !== 1) {
    return null;
  }

  const rawRef = input.openaiFileIdRefs[0];
  if (!rawRef || typeof rawRef !== "object" || Array.isArray(rawRef)) return null;
  const ref = rawRef as Record<string, unknown>;

  const name = nonEmptyString(ref.name, 512);
  const id = nonEmptyString(ref.id, 256);
  const mimeType = nonEmptyString(ref.mime_type, 256);
  const downloadLink = nonEmptyString(ref.download_link, 8192);
  if (!name || !id || !mimeType || !downloadLink) return null;

  return {
    file: {
      name,
      id,
      mime_type: mimeType,
      download_link: downloadLink
    }
  };
}

function normalizedMime(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function classFromMime(value: string): ManagedAttachmentClass | null {
  const mime = normalizedMime(value);
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/ogg") return "audio";
  if (mime === "application/x-matroska") return "video";
  return null;
}

function extensionOf(name: string): string {
  const withoutQuery = name.split(/[?#]/, 1)[0] ?? name;
  const dot = withoutQuery.lastIndexOf(".");
  return dot >= 0 ? withoutQuery.slice(dot).toLowerCase() : "";
}

function extensionSupports(
  extension: string,
  fileClass: ManagedAttachmentClass
): boolean {
  return fileClass === "audio"
    ? AUDIO_EXTENSIONS.has(extension)
    : VIDEO_EXTENSIONS.has(extension);
}

function validateDeclaredFile(ref: OpenAiConversationFileRef): ManagedAttachmentClass {
  const fileClass = classFromMime(ref.mime_type);
  const extension = extensionOf(ref.name);
  if (!fileClass || !extension || !extensionSupports(extension, fileClass)) {
    throw new MediaTranscriptError(
      "ATTACHMENT_MEDIA_TYPE_UNSUPPORTED",
      "The attached file must be a supported audio or video file with a matching filename extension.",
      415,
      false
    );
  }
  return fileClass;
}

function isAllowedOpenAiFileHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host.length > OPENAI_FILE_HOST_SUFFIX.length && host.endsWith(OPENAI_FILE_HOST_SUFFIX);
}

function hasSafeOpaquePath(pathname: string): boolean {
  return pathname.startsWith("/") && pathname.length > 1 && pathname.length <= 4096;
}

function rejectedUrlShape(url: URL): string {
  const observedHost = url.hostname.toLowerCase() || "none";
  const hostOk = isAllowedOpenAiFileHost(observedHost);
  const pathShape = /^\/file-[A-Za-z0-9_-]+/.test(url.pathname)
    ? "file-id"
    : hasSafeOpaquePath(url.pathname)
      ? "opaque"
      : "other";
  return `observed_host=${observedHost}; host_ok=${hostOk}; path_shape=${pathShape}`;
}

function validateDownloadUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MediaTranscriptError(
      "ATTACHMENT_DOWNLOAD_URL_REJECTED",
      "The attachment download URL is not an absolute URL. No path, file id, or signed query was echoed.",
      400,
      false
    );
  }

  if (
    url.protocol !== "https:" ||
    !isAllowedOpenAiFileHost(url.hostname) ||
    Boolean(url.username) ||
    Boolean(url.password) ||
    Boolean(url.port) ||
    Boolean(url.hash) ||
    !hasSafeOpaquePath(url.pathname)
  ) {
    throw new MediaTranscriptError(
      "ATTACHMENT_DOWNLOAD_URL_REJECTED",
      `Attachment download URL rejected (${rejectedUrlShape(url)}). No path, file id, or signed query was echoed.`,
      400,
      false
    );
  }
  return url;
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number
): Promise<{ bytesReceived: number; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new MediaTranscriptError(
      "ATTACHMENT_DOWNLOAD_EMPTY",
      "The attachment download returned no readable body.",
      422,
      false
    );
  }

  let bytesReceived = 0;
  let truncated = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = maximumBytes - bytesReceived;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      if (value.byteLength > remaining) {
        bytesReceived += remaining;
        truncated = true;
        break;
      }
      bytesReceived += value.byteLength;
    }
  } finally {
    if (truncated) {
      await reader.cancel().catch(() => undefined);
    }
  }

  if (bytesReceived === 0) {
    throw new MediaTranscriptError(
      "ATTACHMENT_DOWNLOAD_EMPTY",
      "The attachment download returned an empty body.",
      422,
      false
    );
  }
  return { bytesReceived, truncated };
}

export async function probeManagedAttachmentTransport(
  input: ManagedAttachmentProbeInput,
  fetchImpl: typeof fetch = fetch
): Promise<ManagedAttachmentProbeResult> {
  const declaredClass = validateDeclaredFile(input.file);
  const downloadUrl = validateDownloadUrl(input.file.download_link);

  let response: Response;
  try {
    response = await fetchImpl(downloadUrl, {
      method: "GET",
      headers: {
        accept: "*/*",
        range: `bytes=0-${MANAGED_ATTACHMENT_PROBE_MAX_BYTES - 1}`
      },
      redirect: "manual",
      signal: AbortSignal.timeout(ATTACHMENT_PROBE_TIMEOUT_MS)
    });
  } catch {
    throw new MediaTranscriptError(
      "ATTACHMENT_DOWNLOAD_UNAVAILABLE",
      "The temporary attachment URL could not be reached by the isolated backend.",
      502,
      true
    );
  }

  if (response.status >= 300 && response.status < 400) {
    throw new MediaTranscriptError(
      "ATTACHMENT_DOWNLOAD_REDIRECT_BLOCKED",
      "Attachment redirects are blocked by the transport probe.",
      502,
      false
    );
  }
  if (!(response.status === 200 || response.status === 206)) {
    throw new MediaTranscriptError(
      "ATTACHMENT_DOWNLOAD_UNAVAILABLE",
      `The temporary attachment URL returned HTTP ${response.status}.`,
      502,
      response.status === 408 || response.status === 429 || response.status >= 500
    );
  }

  const responseMime = normalizedMime(response.headers.get("content-type") ?? "");
  const responseClass = classFromMime(responseMime);
  if (!responseMime || responseClass !== declaredClass) {
    throw new MediaTranscriptError(
      "ATTACHMENT_MIME_MISMATCH",
      "The downloaded attachment MIME type does not match the declared audio/video class.",
      415,
      false
    );
  }

  const body = await readBoundedBody(response, MANAGED_ATTACHMENT_PROBE_MAX_BYTES);
  return {
    transport_available: true,
    file_class: declaredClass,
    declared_mime_type: normalizedMime(input.file.mime_type),
    response_mime_type: responseMime,
    mime_consistent: true,
    probe_bytes_received: body.bytesReceived,
    probe_byte_limit: MANAGED_ATTACHMENT_PROBE_MAX_BYTES,
    range_requested: true,
    range_supported: response.status === 206,
    response_truncated_at_probe_limit: body.truncated
  };
}
