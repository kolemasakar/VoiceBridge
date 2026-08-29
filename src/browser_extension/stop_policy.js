(function () {
  "use strict";

  const USER_STOP_PLAYBACK_GRACE_MS = 5000;
  const PLAYBACK_COMPLETION_EPSILON_SECONDS = 0.03;
  let userStopActive = false;
  let discardTtsAudio = false;
  let trackedTtsSegment = null;
  let playbackBoundaries = [];
  let completedPlaybackSegments = 0;

  function translationDrainComplete(event) {
    return Boolean(
      event &&
      event.event_type === "TRANSLATION_STATUS" &&
      event.data?.status === "CLOSED"
    );
  }

  function resetPlaybackTracking() {
    trackedTtsSegment = null;
    playbackBoundaries = [];
    completedPlaybackSegments = 0;
  }

  function syncPlayedSegments() {
    if (!audioContext) return;
    const completedThrough =
      audioContext.currentTime + PLAYBACK_COMPLETION_EPSILON_SECONDS;
    while (
      playbackBoundaries.length > 0 &&
      playbackBoundaries[0].endTime <= completedThrough
    ) {
      const boundary = playbackBoundaries.shift();
      completedPlaybackSegments += boundary.sourceSegmentCount;
    }
    streamState.playbackPlayedCount = completedPlaybackSegments;
  }

  function discardFuturePlaybackBoundaries() {
    playbackBoundaries = [];
  }

  function beginTrackedTtsSegment(event) {
    trackedTtsSegment = {
      segmentId: event.data?.segment_id || null,
      sourceSegmentCount: Math.max(
        1,
        Number(event.data?.source_segment_count || 1)
      ),
      scheduledChunks: 0,
      discarded: false
    };
  }

  function finishTrackedTtsSegment(event) {
    if (
      !trackedTtsSegment ||
      trackedTtsSegment.segmentId !== event.data?.segment_id
    ) {
      return;
    }
    if (
      !trackedTtsSegment.discarded &&
      trackedTtsSegment.scheduledChunks > 0 &&
      Number.isFinite(playbackEndTime)
    ) {
      playbackBoundaries.push({
        endTime: playbackEndTime,
        sourceSegmentCount: trackedTtsSegment.sourceSegmentCount
      });
    }
    trackedTtsSegment = null;
    syncPlayedSegments();
  }

  function installStopPolicy() {
    if (
      typeof stopCapture !== "function" ||
      typeof startCapture !== "function" ||
      typeof handleStreamEvent !== "function" ||
      typeof schedulePcmChunk !== "function" ||
      typeof waitForPlaybackDrain !== "function"
    ) {
      return;
    }

    const baseStopCapture = stopCapture;
    const baseStartCapture = startCapture;
    const baseHandleStreamEvent = handleStreamEvent;
    const baseSchedulePcmChunk = schedulePcmChunk;
    const baseWaitForPlaybackDrain = waitForPlaybackDrain;
    const baseRequestMetricsPublish =
      typeof requestMetricsPublish === "function" ? requestMetricsPublish : null;
    const baseStreamSnapshot =
      typeof streamSnapshot === "function" ? streamSnapshot : null;

    startCapture = async function (...args) {
      discardTtsAudio = false;
      userStopActive = false;
      resetPlaybackTracking();
      return baseStartCapture(...args);
    };

    stopCapture = function (reason = "USER_STOP") {
      const isUserStop = reason === "USER_STOP";
      if (isUserStop) {
        userStopActive = true;
        discardTtsAudio = true;
      }
      const operation = baseStopCapture(reason);
      return operation.finally(() => {
        if (isUserStop) {
          userStopActive = false;
        }
      });
    };

    handleStreamEvent = function (event) {
      if (event?.event_type === "TTS_AUDIO_START") {
        beginTrackedTtsSegment(event);
      }

      baseHandleStreamEvent(event);

      if (event?.event_type === "TTS_AUDIO_END") {
        finishTrackedTtsSegment(event);
      } else {
        syncPlayedSegments();
      }

      if (!userStopActive || !translationDrainComplete(event)) {
        return;
      }

      streamState.ttsStatus = "CLOSED";
      streamState.ttsPending = 0;
      streamState.ttsBuffered = 0;
      streamState.ttsRetryInMs = 0;
      streamCloseExpected = true;
      if (streamSocket && streamSocket.readyState === WebSocket.OPEN) {
        streamSocket.close(
          1000,
          "Translation drained; cancel queued TTS after user stop"
        );
      }
    };

    schedulePcmChunk = function (bytes, sampleRate) {
      if (discardTtsAudio) {
        if (trackedTtsSegment) {
          trackedTtsSegment.discarded = true;
        }
        return;
      }
      if (trackedTtsSegment) {
        trackedTtsSegment.scheduledChunks += 1;
      }
      return baseSchedulePcmChunk(bytes, sampleRate);
    };

    if (baseRequestMetricsPublish) {
      requestMetricsPublish = function (...args) {
        syncPlayedSegments();
        return baseRequestMetricsPublish(...args);
      };
    }

    if (baseStreamSnapshot) {
      streamSnapshot = function (...args) {
        syncPlayedSegments();
        return baseStreamSnapshot(...args);
      };
    }

    waitForPlaybackDrain = async function (timeoutMs) {
      if (!userStopActive) {
        return baseWaitForPlaybackDrain(timeoutMs);
      }

      const deadline = Date.now() + USER_STOP_PLAYBACK_GRACE_MS;
      while (
        audioContext &&
        (activePlaybackSources.size > 0 ||
          playbackEndTime > audioContext.currentTime + 0.05)
      ) {
        syncPlayedSegments();
        if (Date.now() >= deadline) {
          syncPlayedSegments();
          discardFuturePlaybackBoundaries();
          cancelPlayback();
          streamState.playbackStatus = "COMPLETED";
          streamState.playbackQueuedMs = 0;
          applyOriginalGain();
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      syncPlayedSegments();
      discardFuturePlaybackBoundaries();
      playbackDuckingActive = false;
      streamState.playbackStatus = "COMPLETED";
      streamState.playbackQueuedMs = 0;
      applyOriginalGain();
      return true;
    };
  }

  installStopPolicy();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      USER_STOP_PLAYBACK_GRACE_MS,
      PLAYBACK_COMPLETION_EPSILON_SECONDS,
      translationDrainComplete
    };
  }
})();
