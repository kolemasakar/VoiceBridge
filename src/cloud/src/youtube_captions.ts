import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  MediaLanguageHint,
  MediaTranscriptSegment
} from "./media_transcript.js";

const COMMAND_TIMEOUT_MS = 60000;
const MAX_SUBTITLE_BYTES = 8 * 1024 * 1024;
const MAX_SEGMENT_CHARACTERS = 1600;
const MAX_SEGMENT_DURATION_MS = 60000;

interface Json3Segment {
  utf8?: unknown;
}

interface Json3Event {
  tStartMs?: unknown;
  dDurationMs?: unknown;
  segs?: unknown;
}

interface Json3Document {
  events?: unknown;
}

export interface YoutubeCaptionResult {
  language: "uk" | "ru" | "en";
  segments: MediaTranscriptSegment[];
  transcriptText: string;
}

function supportedBaseLanguage(
  value: string | null | undefined
): "uk" | "ru" | "en" | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace("_", "-");
  const base = normalized.split("-", 1)[0];
  return base === "uk" || base === "ru" || base === "en" ? base : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanCaptionText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseYoutubeJson3(
  text: string
): MediaTranscriptSegment[] {
  let payload: Json3Document;
  try {
    payload = JSON.parse(text) as Json3Document;
  } catch {
    return [];
  }
  const events = Array.isArray(payload.events) ? payload.events : [];
  const raw: MediaTranscriptSegment[] = [];

  for (const value of events) {
    if (!value || typeof value !== "object") continue;
    const event = value as Json3Event;
    const start = finiteNumber(event.tStartMs);
    const duration = finiteNumber(event.dDurationMs);
    const segmentValues = Array.isArray(event.segs) ? event.segs : [];
    const eventText = cleanCaptionText(
      segmentValues
        .flatMap((segment) => {
          if (!segment || typeof segment !== "object") return [];
          const utf8 = (segment as Json3Segment).utf8;
          return typeof utf8 === "string" ? [utf8] : [];
        })
        .join("")
    );
    if (!eventText) continue;
    raw.push({
      index: raw.length,
      start_ms: start === null ? null : Math.max(0, Math.round(start)),
      end_ms:
        start === null || duration === null
          ? null
          : Math.max(0, Math.round(start + duration)),
      text: eventText,
      confidence: null
    });
  }

  return compactCaptionSegments(raw);
}

export function compactCaptionSegments(
  raw: MediaTranscriptSegment[]
): MediaTranscriptSegment[] {
  const output: MediaTranscriptSegment[] = [];
  let current: MediaTranscriptSegment | null = null;

  const flush = () => {
    if (!current || !current.text.trim()) return;
    current.index = output.length;
    current.text = cleanCaptionText(current.text);
    output.push(current);
    current = null;
  };

  for (const segment of raw) {
    if (!segment.text.trim()) continue;
    if (!current) {
      current = { ...segment, index: 0, confidence: null };
      continue;
    }

    const nextText = `${current.text} ${segment.text}`.trim();
    const start = current.start_ms;
    const end = segment.end_ms ?? current.end_ms;
    const duration =
      start !== null && end !== null ? Math.max(0, end - start) : 0;
    if (
      nextText.length > MAX_SEGMENT_CHARACTERS ||
      duration > MAX_SEGMENT_DURATION_MS
    ) {
      flush();
      current = { ...segment, index: 0, confidence: null };
      continue;
    }

    current.text = nextText;
    current.end_ms = end;
  }
  flush();
  return output;
}

async function runSubtitleCommand(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("yt-dlp", args, {
      stdio: ["ignore", "ignore", "ignore"]
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve(false);
    }, COMMAND_TIMEOUT_MS);
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

function captionLanguage(
  languageHint: MediaLanguageHint,
  detectedLanguage: string | null
): "uk" | "ru" | "en" | null {
  if (languageHint !== "auto") return languageHint;
  return supportedBaseLanguage(detectedLanguage);
}

export async function tryYoutubeCaptions(
  url: string,
  languageHint: MediaLanguageHint,
  detectedLanguage: string | null
): Promise<YoutubeCaptionResult | null> {
  const language = captionLanguage(languageHint, detectedLanguage);
  if (!language) return null;

  const directory = await mkdtemp(join(tmpdir(), "voicebridge-captions-"));
  try {
    const template = join(directory, "caption.%(ext)s");
    const ok = await runSubtitleCommand([
      "--no-playlist",
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      `${language}-orig,${language}`,
      "--sub-format",
      "json3",
      "--no-warnings",
      "--quiet",
      "--extractor-args",
      "youtube:player_client=mweb",
      "--js-runtimes",
      "node",
      "-o",
      template,
      url
    ]);
    if (!ok) return null;

    const files = (await readdir(directory))
      .filter((name) => name.endsWith(".json3"))
      .sort((left, right) => {
        const leftOrig = left.includes(`${language}-orig`);
        const rightOrig = right.includes(`${language}-orig`);
        return Number(rightOrig) - Number(leftOrig);
      });
    const selected = files[0];
    if (!selected) return null;

    const path = join(directory, selected);
    const text = await readFile(path, "utf8");
    if (Buffer.byteLength(text, "utf8") > MAX_SUBTITLE_BYTES) return null;
    const segments = parseYoutubeJson3(text);
    if (segments.length === 0) return null;
    return {
      language,
      segments,
      transcriptText: segments.map((segment) => segment.text).join(" ")
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
