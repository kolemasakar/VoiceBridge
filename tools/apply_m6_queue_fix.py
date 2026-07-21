from __future__ import annotations

import json
from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8", newline="\n")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one occurrence, found {count}")
    return text.replace(old, new, 1)


def replace_between(text: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f"{label}: start marker not found")
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"{label}: end marker not found")
    return text[:start] + replacement + text[end:]


# -----------------------------------------------------------------------------
# Cloud stream transport
# -----------------------------------------------------------------------------
path = "src/cloud/src/stream_transport.ts"
text = read(path)
text = replace_once(text, "const MAX_TRANSLATION_QUEUE = 20;", "const MAX_TRANSLATION_QUEUE = 60;", path)
text = replace_once(text, "const TRANSLATION_DRAIN_TIMEOUT_MS = 10000;", "const TRANSLATION_DRAIN_TIMEOUT_MS = 45000;", path)
text = replace_once(text, "const MAX_TTS_QUEUE = 20;", "const MAX_TTS_QUEUE = 60;", path)
text = replace_once(
    text,
    "const TTS_DRAIN_TIMEOUT_MS = 30000;",
    """const TTS_DRAIN_TIMEOUT_MS = 60000;
const TTS_BATCH_MAX_SEGMENTS = 3;
const TTS_BATCH_MAX_CHARACTERS = 1200;
const TTS_BATCH_WINDOW_MS = 2500;
const TTS_MIN_REQUEST_INTERVAL_MS = 6000;
const TRANSLATION_MAX_ATTEMPTS = 4;
const TRANSLATION_RETRY_DELAYS_MS = [2000, 5000, 15000];
const TTS_MAX_ATTEMPTS = 3;
const TTS_RETRY_DELAYS_MS = [10000, 30000];""",
    path,
)
text = replace_once(
    text,
    """interface ClientEvent {
  event_type: string;
  sequence?: number;
  occurred_at?: string;
  data?: Record<string, unknown>;
}
""",
    """interface ClientEvent {
  event_type: string;
  sequence?: number;
  occurred_at?: string;
  data?: Record<string, unknown>;
}

interface TtsQueueItem {
  segmentId: string;
  text: string;
}
""",
    path,
)
text = replace_once(
    text,
    """  translationLatencyTotalMs: number;
  translationLatencyMaximumMs: number;
  ttsChain: Promise<void>;""",
    """  translationLatencyTotalMs: number;
  translationLatencyMaximumMs: number;
  translationRetryCount: number;
  translationBackoffUntil: number;
  ttsChain: Promise<void>;""",
    path,
)
text = replace_once(
    text,
    """  ttsAudioBytes: number;
  ttsAudioDurationMs: number;
}""",
    """  ttsAudioBytes: number;
  ttsAudioDurationMs: number;
  ttsBuffer: TtsQueueItem[];
  ttsBatchTimer: NodeJS.Timeout | null;
  ttsLastRequestAt: number;
  ttsBackoffUntil: number;
  ttsRetryCount: number;
  ttsBatchCount: number;
}""",
    path,
)
helper = """function delayWithAbort(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0) {
    return Promise.resolve();
  }
  if (signal.aborted) {
    return Promise.reject(new Error("QUEUE_ABORTED"));
  }
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("QUEUE_ABORTED"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

"""
summary_marker = "function summary(context: StreamContext): Record<string, unknown> {"
if summary_marker not in text:
    raise SystemExit(f"{path}: summary marker missing")
text = text.replace(summary_marker, helper + summary_marker, 1)
text = replace_once(
    text,
    """    maximum_translation_latency_ms: context.finalTranslations > 0
      ? context.translationLatencyMaximumMs
      : null,
    final_tts_segments: context.finalTtsSegments,""",
    """    maximum_translation_latency_ms: context.finalTranslations > 0
      ? context.translationLatencyMaximumMs
      : null,
    translation_retries: context.translationRetryCount,
    final_tts_segments: context.finalTtsSegments,""",
    path,
)
text = replace_once(
    text,
    """    maximum_tts_latency_ms: context.finalTtsSegments > 0
      ? context.ttsLatencyMaximumMs
      : null
  };""",
    """    maximum_tts_latency_ms: context.finalTtsSegments > 0
      ? context.ttsLatencyMaximumMs
      : null,
    tts_retries: context.ttsRetryCount,
    tts_batches: context.ttsBatchCount
  };""",
    path,
)
text = replace_once(
    text,
    """      translationLatencyTotalMs: 0,
      translationLatencyMaximumMs: 0,
      ttsChain: Promise.resolve(),""",
    """      translationLatencyTotalMs: 0,
      translationLatencyMaximumMs: 0,
      translationRetryCount: 0,
      translationBackoffUntil: 0,
      ttsChain: Promise.resolve(),""",
    path,
)
text = replace_once(
    text,
    """      ttsAudioBytes: 0,
      ttsAudioDurationMs: 0
    };""",
    """      ttsAudioBytes: 0,
      ttsAudioDurationMs: 0,
      ttsBuffer: [],
      ttsBatchTimer: null,
      ttsLastRequestAt: 0,
      ttsBackoffUntil: 0,
      ttsRetryCount: 0,
      ttsBatchCount: 0
    };""",
    path,
)

new_tts_block = """    const scheduleTtsFlush = (): void => {
      if (
        context.ttsBatchTimer ||
        context.ttsBuffer.length === 0 ||
        !context.ttsAccepting
      ) {
        return;
      }
      context.ttsBatchTimer = setTimeout(() => {
        context.ttsBatchTimer = null;
        flushTtsBuffer(true);
      }, TTS_BATCH_WINDOW_MS);
    };

    const takeTtsBatch = (): TtsQueueItem[] => {
      const items: TtsQueueItem[] = [];
      let characters = 0;
      while (
        context.ttsBuffer.length > 0 &&
        items.length < TTS_BATCH_MAX_SEGMENTS
      ) {
        const next = context.ttsBuffer[0]!;
        if (
          items.length > 0 &&
          characters + next.text.length > TTS_BATCH_MAX_CHARACTERS
        ) {
          break;
        }
        context.ttsBuffer.shift();
        items.push(next);
        characters += next.text.length;
      }
      return items;
    };

    const queueTtsBatch = (items: TtsQueueItem[]): void => {
      if (items.length === 0) {
        return;
      }
      const sourceSegmentIds = items.map((item) => item.segmentId);
      const batchSegmentId = sourceSegmentIds[0]!;
      const combinedText = items.map((item) => item.text).join("\n\n");

      const operation = async (): Promise<void> => {
        try {
          let result: Awaited<ReturnType<TtsProvider["synthesize"]>> | null = null;
          for (let attempt = 1; attempt <= TTS_MAX_ATTEMPTS; attempt += 1) {
            const rateDelay = Math.max(
              0,
              context.ttsLastRequestAt + TTS_MIN_REQUEST_INTERVAL_MS - Date.now(),
              context.ttsBackoffUntil - Date.now()
            );
            if (rateDelay > 0) {
              sendEvent("TTS_STATUS", {
                provider: ttsProvider.name,
                voice: ttsVoice,
                status: "BACKOFF",
                pending: context.ttsPending,
                buffered: context.ttsBuffer.length,
                retry_in_ms: rateDelay,
                retries: context.ttsRetryCount
              });
              await delayWithAbort(rateDelay, context.ttsAbortController.signal);
            }
            context.ttsLastRequestAt = Date.now();
            try {
              result = await ttsProvider.synthesize({
                segmentId: batchSegmentId,
                language: "uk",
                text: combinedText.slice(0, MAX_TTS_SOURCE_CHARACTERS),
                voice: ttsVoice,
                requestedAt: new Date().toISOString(),
                signal: context.ttsAbortController.signal
              });
              break;
            } catch (error) {
              const providerError = error instanceof TtsProviderError
                ? error
                : new TtsProviderError(
                  "TTS_PROVIDER_FAILED",
                  "TTS provider request failed.",
                  true
                );
              if (!providerError.retryable || attempt >= TTS_MAX_ATTEMPTS) {
                throw providerError;
              }
              context.ttsRetryCount += 1;
              const fallback = TTS_RETRY_DELAYS_MS[
                Math.min(attempt - 1, TTS_RETRY_DELAYS_MS.length - 1)
              ]!;
              const retryDelay = Math.max(
                fallback,
                providerError.retryAfterMs || 0
              );
              context.ttsBackoffUntil = Date.now() + retryDelay;
              sendEvent("TTS_STATUS", {
                provider: ttsProvider.name,
                voice: ttsVoice,
                status: providerError.code === "TTS_RATE_LIMITED"
                  ? "RATE_LIMITED"
                  : "BACKOFF",
                pending: context.ttsPending,
                buffered: context.ttsBuffer.length,
                retry_in_ms: retryDelay,
                attempt,
                retries: context.ttsRetryCount
              });
            }
          }

          if (!result || !context.ttsDelivering) {
            return;
          }

          const chunkCount = Math.ceil(
            result.audio.byteLength / TTS_AUDIO_CHUNK_BYTES
          );
          await sendEventAsync("TTS_AUDIO_START", {
            segment_id: result.segmentId,
            source_segment_ids: sourceSegmentIds,
            source_segment_count: items.length,
            provider: result.provider,
            voice: result.voice,
            audio_format: result.audioFormat,
            sample_rate_hz: result.sampleRateHz,
            channels: result.channels,
            byte_length: result.audio.byteLength,
            chunk_count: chunkCount,
            audio_duration_ms: result.audioDurationMs,
            tts_latency_ms: result.ttsLatencyMs,
            completed_at: result.completedAt
          });

          for (let index = 0; index < chunkCount; index += 1) {
            if (!context.ttsDelivering) {
              return;
            }
            const start = index * TTS_AUDIO_CHUNK_BYTES;
            const end = Math.min(
              start + TTS_AUDIO_CHUNK_BYTES,
              result.audio.byteLength
            );
            await sendEventAsync("TTS_AUDIO_CHUNK", {
              segment_id: result.segmentId,
              chunk_index: index,
              chunk_count: chunkCount,
              audio_base64: result.audio.subarray(start, end).toString("base64")
            });
          }

          await sendEventAsync("TTS_AUDIO_END", {
            segment_id: result.segmentId,
            source_segment_ids: sourceSegmentIds,
            source_segment_count: items.length,
            provider: result.provider,
            voice: result.voice,
            audio_duration_ms: result.audioDurationMs,
            byte_length: result.audio.byteLength,
            tts_latency_ms: result.ttsLatencyMs
          });

          context.finalTtsSegments += items.length;
          context.ttsBatchCount += 1;
          context.ttsLatencyTotalMs += result.ttsLatencyMs;
          context.ttsLatencyMaximumMs = Math.max(
            context.ttsLatencyMaximumMs,
            result.ttsLatencyMs
          );
          context.ttsAudioBytes += result.audio.byteLength;
          context.ttsAudioDurationMs += result.audioDurationMs;
        } catch (error) {
          if (!context.ttsDelivering) {
            return;
          }
          const providerError = error instanceof TtsProviderError
            ? error
            : new TtsProviderError(
              "TTS_PROVIDER_FAILED",
              "TTS provider request failed."
            );
          sendTtsError(
            batchSegmentId,
            providerError.code,
            providerError.message,
            providerError.retryable
          );
        } finally {
          context.ttsPending = Math.max(0, context.ttsPending - items.length);
          if (context.ttsPending === 0 && context.ttsAccepting) {
            sendEvent("TTS_STATUS", {
              provider: ttsProvider.name,
              voice: ttsVoice,
              status: "READY",
              pending: 0,
              buffered: 0,
              retries: context.ttsRetryCount
            });
          }
        }
      };

      context.ttsChain = context.ttsChain
        .then(operation)
        .catch(() => undefined);
    };

    const flushTtsBuffer = (forceAll = false): void => {
      if (context.ttsBatchTimer) {
        clearTimeout(context.ttsBatchTimer);
        context.ttsBatchTimer = null;
      }
      while (context.ttsBuffer.length > 0) {
        if (!forceAll && context.ttsBuffer.length < TTS_BATCH_MAX_SEGMENTS) {
          scheduleTtsFlush();
          return;
        }
        const items = takeTtsBatch();
        queueTtsBatch(items);
        if (!forceAll) {
          break;
        }
      }
      if (context.ttsBuffer.length > 0) {
        scheduleTtsFlush();
      }
    };

    const enqueueTts = (
      segmentId: string,
      translatedText: string
    ): void => {
      if (!ttsProvider.configured || !context.ttsAccepting) {
        return;
      }
      if (context.ttsPending >= MAX_TTS_QUEUE) {
        sendTtsError(
          segmentId,
          "TTS_QUEUE_FULL",
          "TTS queue is full.",
          true
        );
        return;
      }

      context.ttsPending += 1;
      context.ttsBuffer.push({
        segmentId,
        text: translatedText.slice(0, TTS_BATCH_MAX_CHARACTERS)
      });
      sendEvent("TTS_STATUS", {
        provider: ttsProvider.name,
        voice: ttsVoice,
        status: "QUEUED",
        pending: context.ttsPending,
        buffered: context.ttsBuffer.length,
        retries: context.ttsRetryCount
      });

      if (context.ttsBuffer.length >= TTS_BATCH_MAX_SEGMENTS) {
        flushTtsBuffer(false);
      } else {
        scheduleTtsFlush();
      }
    };

"""
text = replace_between(text, "    const enqueueTts = (", "    const enqueueTranslation = (", new_tts_block, path)

translation_start = text.find("    const enqueueTranslation = (")
if translation_start < 0:
    raise SystemExit(f"{path}: translation queue marker missing")
try_start = text.find("        try {\n          const result = await translationProvider.translate({", translation_start)
catch_start = text.find("        } catch (error) {", try_start)
if try_start < 0 or catch_start < 0:
    raise SystemExit(f"{path}: translation operation markers missing")
new_translation_try = """        try {
          let result: Awaited<ReturnType<TranslationProvider["translate"]>> | null = null;
          for (
            let attempt = 1;
            attempt <= TRANSLATION_MAX_ATTEMPTS;
            attempt += 1
          ) {
            const rateDelay = Math.max(
              0,
              context.translationBackoffUntil - Date.now()
            );
            if (rateDelay > 0) {
              sendEvent("TRANSLATION_STATUS", {
                provider: translationProvider.name,
                status: "BACKOFF",
                pending: context.translationPending,
                retry_in_ms: rateDelay,
                retries: context.translationRetryCount
              });
              await delayWithAbort(
                rateDelay,
                context.translationAbortController.signal
              );
            }
            try {
              result = await translationProvider.translate({
                segmentId,
                sourceLanguage: "en",
                targetLanguage: "uk",
                sourceText: sourceText.slice(0, MAX_TRANSLATION_SOURCE_CHARACTERS),
                context: boundedTranslationContext(previousContext),
                requestedAt: new Date().toISOString(),
                signal: context.translationAbortController.signal
              });
              break;
            } catch (error) {
              const providerError = error instanceof TranslationProviderError
                ? error
                : new TranslationProviderError(
                  "TRANSLATION_PROVIDER_FAILED",
                  "Translation provider request failed.",
                  true
                );
              if (
                !providerError.retryable ||
                attempt >= TRANSLATION_MAX_ATTEMPTS
              ) {
                throw providerError;
              }
              context.translationRetryCount += 1;
              const fallback = TRANSLATION_RETRY_DELAYS_MS[
                Math.min(
                  attempt - 1,
                  TRANSLATION_RETRY_DELAYS_MS.length - 1
                )
              ]!;
              const retryDelay = Math.max(
                fallback,
                providerError.retryAfterMs || 0
              );
              context.translationBackoffUntil = Date.now() + retryDelay;
              sendEvent("TRANSLATION_STATUS", {
                provider: translationProvider.name,
                status: providerError.code === "TRANSLATION_RATE_LIMITED"
                  ? "RATE_LIMITED"
                  : "BACKOFF",
                pending: context.translationPending,
                retry_in_ms: retryDelay,
                attempt,
                retries: context.translationRetryCount
              });
            }
          }

          if (!result || !context.translationDelivering) {
            return;
          }
          context.finalTranslations += 1;
          context.translationLatencyTotalMs += result.translationLatencyMs;
          context.translationLatencyMaximumMs = Math.max(
            context.translationLatencyMaximumMs,
            result.translationLatencyMs
          );
          sendEvent("TRANSLATION_FINAL", {
            segment_id: result.segmentId,
            provider: result.provider,
            translated_text: result.translatedText,
            translation_latency_ms: result.translationLatencyMs,
            completed_at: result.completedAt
          });
          enqueueTts(result.segmentId, result.translatedText);
"""
text = text[:try_start] + new_translation_try + text[catch_start:]
text = replace_once(
    text,
    """            providerError.code === "TRANSLATION_TIMEOUT" ||
              providerError.code === "TRANSLATION_RATE_LIMITED"
          );""",
    """            providerError.retryable
          );""",
    path,
)
text = replace_once(
    text,
    """    const drainTts = async (): Promise<void> => {
      context.ttsPendingAtStop = context.ttsPending;""",
    """    const drainTts = async (): Promise<void> => {
      if (context.ttsBatchTimer) {
        clearTimeout(context.ttsBatchTimer);
        context.ttsBatchTimer = null;
      }
      flushTtsBuffer(true);
      context.ttsPendingAtStop = context.ttsPending;""",
    path,
)
text = replace_once(
    text,
    """      max_translation_queue: MAX_TRANSLATION_QUEUE,
      translation_drain_timeout_ms: TRANSLATION_DRAIN_TIMEOUT_MS,""",
    """      max_translation_queue: MAX_TRANSLATION_QUEUE,
      translation_max_attempts: TRANSLATION_MAX_ATTEMPTS,
      translation_drain_timeout_ms: TRANSLATION_DRAIN_TIMEOUT_MS,""",
    path,
)
text = replace_once(
    text,
    """      max_tts_queue: MAX_TTS_QUEUE,
      tts_audio_chunk_bytes: TTS_AUDIO_CHUNK_BYTES,
      tts_drain_timeout_ms: TTS_DRAIN_TIMEOUT_MS""",
    """      max_tts_queue: MAX_TTS_QUEUE,
      tts_batch_max_segments: TTS_BATCH_MAX_SEGMENTS,
      tts_batch_window_ms: TTS_BATCH_WINDOW_MS,
      tts_min_request_interval_ms: TTS_MIN_REQUEST_INTERVAL_MS,
      tts_max_attempts: TTS_MAX_ATTEMPTS,
      tts_audio_chunk_bytes: TTS_AUDIO_CHUNK_BYTES,
      tts_drain_timeout_ms: TTS_DRAIN_TIMEOUT_MS""",
    path,
)
text = replace_once(
    text,
    """      context.ttsAccepting = false;
      context.ttsDelivering = false;
      context.ttsAbortController.abort();""",
    """      context.ttsAccepting = false;
      context.ttsDelivering = false;
      if (context.ttsBatchTimer) {
        clearTimeout(context.ttsBatchTimer);
        context.ttsBatchTimer = null;
      }
      context.ttsAbortController.abort();""",
    path,
)
write(path, text)


# -----------------------------------------------------------------------------
# Browser offscreen state
# -----------------------------------------------------------------------------
path = "src/browser_extension/offscreen.js"
text = read(path)
text = replace_once(text, "const MAX_PLAYBACK_QUEUE_SECONDS = 45;", "const MAX_PLAYBACK_QUEUE_SECONDS = 90;", path)
text = replace_once(text, "const PLAYBACK_DRAIN_TIMEOUT_MS = 35000;", "const PLAYBACK_DRAIN_TIMEOUT_MS = 70000;", path)
text = replace_once(text, "const STREAM_STOP_TIMEOUT_MS = 45000;", "const STREAM_STOP_TIMEOUT_MS = 120000;", path)
text = replace_once(
    text,
    """    translationLatencyMs: null,
    ttsStatus: "OFFLINE",""",
    """    translationLatencyMs: null,
    translationPending: 0,
    translationRetryCount: 0,
    translationRetryInMs: 0,
    ttsStatus: "OFFLINE",""",
    path,
)
text = replace_once(
    text,
    """    ttsAudioDurationMs: 0,
    playbackStatus: "IDLE",""",
    """    ttsAudioDurationMs: 0,
    ttsPending: 0,
    ttsBuffered: 0,
    ttsRetryCount: 0,
    ttsRetryInMs: 0,
    playbackStatus: "IDLE",""",
    path,
)
text = replace_once(
    text,
    """    translation_latency_ms: streamState.translationLatencyMs,
    tts_status: streamState.ttsStatus,""",
    """    translation_latency_ms: streamState.translationLatencyMs,
    translation_pending: streamState.translationPending,
    translation_retry_count: streamState.translationRetryCount,
    translation_retry_in_ms: streamState.translationRetryInMs,
    tts_status: streamState.ttsStatus,""",
    path,
)
text = replace_once(
    text,
    """    tts_audio_duration_ms: streamState.ttsAudioDurationMs,
    playback_status: streamState.playbackStatus,""",
    """    tts_audio_duration_ms: streamState.ttsAudioDurationMs,
    tts_pending: streamState.ttsPending,
    tts_buffered: streamState.ttsBuffered,
    tts_retry_count: streamState.ttsRetryCount,
    tts_retry_in_ms: streamState.ttsRetryInMs,
    playback_status: streamState.playbackStatus,""",
    path,
)
translation_status_start = '  if (event.event_type === "TRANSLATION_STATUS") {'
translation_error_start = '  if (event.event_type === "TRANSLATION_ERROR") {'
new_translation_status = """  if (event.event_type === "TRANSLATION_STATUS") {
    streamState.translationProvider =
      event.data?.provider || streamState.translationProvider;
    streamState.translationStatus = event.data?.status || "UNKNOWN";
    streamState.translationPending = Number(
      event.data?.pending ?? streamState.translationPending
    );
    streamState.translationRetryCount = Number(
      event.data?.retries ?? streamState.translationRetryCount
    );
    streamState.translationRetryInMs = Number(event.data?.retry_in_ms || 0);
  }

"""
text = replace_between(text, translation_status_start, translation_error_start, new_translation_status, path)
text = replace_once(
    text,
    """    streamState.translationStatus = "ACTIVE";
    streamState.translationError = null;""",
    """    streamState.translationStatus = "ACTIVE";
    streamState.translationError = null;
    streamState.translationRetryInMs = 0;""",
    path,
)
tts_status_start = '  if (event.event_type === "TTS_STATUS") {'
tts_error_start = '  if (event.event_type === "TTS_ERROR") {'
new_tts_status = """  if (event.event_type === "TTS_STATUS") {
    streamState.ttsProvider = event.data?.provider || streamState.ttsProvider;
    streamState.ttsVoice = event.data?.voice || streamState.ttsVoice;
    streamState.ttsStatus = event.data?.status || "UNKNOWN";
    streamState.ttsPending = Number(
      event.data?.pending ?? streamState.ttsPending
    );
    streamState.ttsBuffered = Number(
      event.data?.buffered ?? streamState.ttsBuffered
    );
    streamState.ttsRetryCount = Number(
      event.data?.retries ?? streamState.ttsRetryCount
    );
    streamState.ttsRetryInMs = Number(event.data?.retry_in_ms || 0);
  }

"""
text = replace_between(text, tts_status_start, tts_error_start, new_tts_status, path)
start = text.find('  if (event.event_type === "TTS_AUDIO_START") {')
end = text.find('  if (event.event_type === "TTS_AUDIO_CHUNK") {', start)
if start < 0 or end < 0:
    raise SystemExit(f"{path}: TTS audio start block markers missing")
block = text[start:end]
block = replace_once(
    block,
    """      chunksReceived: 0,
      ended: false
    };""",
    """      chunksReceived: 0,
      ended: false,
      sourceSegmentCount: Number(event.data?.source_segment_count || 1)
    };""",
    path,
)
block = replace_once(
    block,
    """    streamState.ttsStatus = "ACTIVE";
    streamState.ttsLatencyMs =""",
    """    streamState.ttsStatus = "ACTIVE";
    streamState.ttsError = null;
    streamState.ttsRetryInMs = 0;
    streamState.ttsLatencyMs =""",
    path,
)
text = text[:start] + block + text[end:]
text = replace_once(
    text,
    "      streamState.ttsFinalCount += 1;",
    "      streamState.ttsFinalCount += currentTtsSegment.sourceSegmentCount;",
    path,
)
completed_start = '  if (event.event_type === "STREAM_COMPLETED") {'
completed_end = "\n  if (\n    typeof event.event_type === \"string\""
start = text.find(completed_start)
end = text.find(completed_end, start)
if start < 0 or end < 0:
    raise SystemExit(f"{path}: stream completed block markers missing")
completed_block = text[start:end]
completed_block = replace_once(
    completed_block,
    """    if (event.data?.average_tts_latency_ms !== null) {
      streamState.ttsLatencyMs =
        event.data?.average_tts_latency_ms ?? streamState.ttsLatencyMs;
    }
  }
""",
    """    if (event.data?.average_tts_latency_ms !== null) {
      streamState.ttsLatencyMs =
        event.data?.average_tts_latency_ms ?? streamState.ttsLatencyMs;
    }
    streamState.translationFinalCount = Math.max(
      streamState.translationFinalCount,
      Number(event.data?.final_translations || 0)
    );
    streamState.ttsFinalCount = Math.max(
      streamState.ttsFinalCount,
      Number(event.data?.final_tts_segments || 0)
    );
    streamState.translationRetryCount = Number(
      event.data?.translation_retries ?? streamState.translationRetryCount
    );
    streamState.ttsRetryCount = Number(
      event.data?.tts_retries ?? streamState.ttsRetryCount
    );
    streamState.translationPending = 0;
    streamState.ttsPending = 0;
    streamState.ttsBuffered = 0;
    streamState.translationRetryInMs = 0;
    streamState.ttsRetryInMs = 0;
  }
""",
    path,
)
text = text[:start] + completed_block + text[end:]
write(path, text)


# -----------------------------------------------------------------------------
# Popup metrics
# -----------------------------------------------------------------------------
path = "src/browser_extension/popup.html"
text = read(path)
text = replace_once(
    text,
    """          <div><dt>Translation latency</dt><dd id="translation-latency">-</dd></div>
        </dl>""",
    """          <div><dt>Translation latency</dt><dd id="translation-latency">-</dd></div>
          <div><dt>Pending</dt><dd id="translation-pending">0</dd></div>
          <div><dt>Retries</dt><dd id="translation-retries">0</dd></div>
        </dl>""",
    path,
)
text = replace_once(
    text,
    """          <div><dt>Audio segments</dt><dd id="tts-count">0</dd></div>
          <div><dt>TTS latency</dt><dd id="tts-latency">-</dd></div>
          <div><dt>Playback</dt><dd id="playback-status">IDLE</dd></div>
          <div><dt>Queued audio</dt><dd id="playback-queued">0 ms</dd></div>
          <div><dt>Audio bytes</dt><dd id="tts-bytes">0</dd></div>""",
    """          <div><dt>Voiced segments</dt><dd id="tts-count">0</dd></div>
          <div><dt>TTS latency</dt><dd id="tts-latency">-</dd></div>
          <div><dt>Pending</dt><dd id="tts-pending">0</dd></div>
          <div><dt>Buffered</dt><dd id="tts-buffered">0</dd></div>
          <div><dt>Retries</dt><dd id="tts-retries">0</dd></div>
          <div><dt>Playback</dt><dd id="playback-status">IDLE</dd></div>
          <div><dt>Played segments</dt><dd id="playback-played">0</dd></div>
          <div><dt>Queued audio</dt><dd id="playback-queued">0 ms</dd></div>
          <div><dt>Audio bytes</dt><dd id="tts-bytes">0</dd></div>""",
    path,
)
write(path, text)

path = "src/browser_extension/popup.js"
text = read(path)
text = replace_once(
    text,
    """  translationCount: document.querySelector("#translation-count"),
  ttsStatus: document.querySelector("#tts-status"),""",
    """  translationCount: document.querySelector("#translation-count"),
  translationPending: document.querySelector("#translation-pending"),
  translationRetries: document.querySelector("#translation-retries"),
  ttsStatus: document.querySelector("#tts-status"),""",
    path,
)
text = replace_once(
    text,
    """  ttsError: document.querySelector("#tts-error"),
  playbackStatus: document.querySelector("#playback-status"),
  playbackQueued: document.querySelector("#playback-queued"),""",
    """  ttsError: document.querySelector("#tts-error"),
  ttsPending: document.querySelector("#tts-pending"),
  ttsBuffered: document.querySelector("#tts-buffered"),
  ttsRetries: document.querySelector("#tts-retries"),
  playbackStatus: document.querySelector("#playback-status"),
  playbackPlayed: document.querySelector("#playback-played"),
  playbackQueued: document.querySelector("#playback-queued"),""",
    path,
)
text = replace_once(
    text,
    """  elements.translationCount.textContent = state.translation_final_count ?? 0;

  const ttsStatus""",
    """  elements.translationCount.textContent = state.translation_final_count ?? 0;
  elements.translationPending.textContent = state.translation_pending ?? 0;
  elements.translationRetries.textContent = state.translation_retry_count ?? 0;

  const ttsStatus""",
    path,
)
text = replace_once(
    text,
    """  elements.playbackStatus.className = statusClass(playbackStatus);
  elements.playbackQueued.textContent =""",
    """  elements.ttsPending.textContent = state.tts_pending ?? 0;
  elements.ttsBuffered.textContent = state.tts_buffered ?? 0;
  elements.ttsRetries.textContent = state.tts_retry_count ?? 0;
  elements.playbackStatus.className = statusClass(playbackStatus);
  elements.playbackPlayed.textContent = state.playback_played_count ?? 0;
  elements.playbackQueued.textContent =""",
    path,
)
write(path, text)


# -----------------------------------------------------------------------------
# Version bumps
# -----------------------------------------------------------------------------
path = "src/cloud/src/server.ts"
text = replace_once(read(path), 'const SERVICE_VERSION = "0.5.0";', 'const SERVICE_VERSION = "0.5.1";', path)
write(path, text)

path = "src/browser_extension/manifest.json"
manifest = json.loads(read(path))
if manifest.get("version") != "0.6.0":
    raise SystemExit("Unexpected extension version")
manifest["version"] = "0.6.1"
write(path, json.dumps(manifest, indent=2) + "\n")

path = "src/cloud/package.json"
package = json.loads(read(path))
if package.get("version") != "0.5.0":
    raise SystemExit("Unexpected package version")
package["version"] = "0.5.1"
write(path, json.dumps(package, indent=2) + "\n")

path = "src/cloud/package-lock.json"
lock = json.loads(read(path))
lock["version"] = "0.5.1"
lock["packages"][""]["version"] = "0.5.1"
write(path, json.dumps(lock, indent=2) + "\n")


# -----------------------------------------------------------------------------
# Tests and documentation
# -----------------------------------------------------------------------------
path = "src/cloud/tests/cloud.test.ts"
text = read(path)
text = text.replace("cloud 0.5.0", "cloud 0.5.1")
text = text.replace('body.version, "0.5.0"', 'body.version, "0.5.1"')
text = text.replace("above twenty pending segments", "above sixty pending segments")
text = text.replace("for (let index = 0; index < 21; index += 1)", "for (let index = 0; index < 61; index += 1)")
text = text.replace("completed.data.final_transcripts, 21", "completed.data.final_transcripts, 61")
text = text.replace("completed.data.translation_pending_at_stop, 20", "completed.data.translation_pending_at_stop, 60")
write(path, text)

history = Path("docs/history/PHASE_1_MILESTONE_6_RATE_LIMIT_PATCH.md")
history.write_text(
    """# Phase 1 Milestone 6 Rate Limit Patch

Date: 2026-07-21

Status: IMPLEMENTED; LIVE VALIDATION PENDING

## Trigger

A six-minute controlled public YouTube test produced 87 final English segments, 72 Ukrainian translations, and only 12 Ukrainian speech segments. Audio transport remained healthy with zero dropped frames. Ukrainian speech initially played, then skipped increasingly, and finally stopped while text translation continued.

## Root Cause

The cloud submitted one Gemini TTS request for every translated segment. The preview TTS model returned rate-limit responses. The original queue had no retry or backoff and the browser cleared the visible error after a later READY status. Translation requests had the same no-retry behavior during transient quota pressure.

## Resolution

Cloud service `0.5.1`:

- raises translation and TTS queue capacity from 20 to 60 accepted segments;
- retries transient translation failures up to four attempts;
- retries transient TTS failures up to three attempts;
- honors provider Retry-After when available;
- exposes RATE_LIMITED and BACKOFF status with retry timing;
- batches up to three translated segments into one TTS request;
- waits at least six seconds between TTS requests;
- preserves source-segment counts through batched audio events;
- extends bounded shutdown drains for retry-aware queues.

Browser extension `0.6.1`:

- preserves the last provider error until a successful result arrives;
- displays pending work, buffered TTS segments, and retry counts;
- counts voiced source segments rather than provider request batches;
- reports played source-segment count;
- keeps bounded browser playback and shutdown behavior.

## Validation Target

Run a public YouTube test for at least ten minutes. Translation and speech counts may temporarily lag while BACKOFF is active, but should continue increasing rather than permanently stopping. After Stop, the accepted queues must drain within their bounds or report an explicit timeout instead of silently losing work.
""",
    encoding="ascii",
    newline="\n",
)

for temporary in [
    "docs/history/PHASE_1_MILESTONE_6_RATE_LIMIT_PATCH_DRAFT.md",
    "docs/history/PHASE_1_MILESTONE_6_RATE_LIMIT_PATCH_TRIGGER.md",
    "docs/history/PHASE_1_MILESTONE_6_VALIDATION_PENDING.md",
    "docs/history/PHASE_1_MILESTONE_6_PATCH_BRANCH.md",
]:
    Path(temporary).unlink(missing_ok=True)

Path(__file__).unlink()
