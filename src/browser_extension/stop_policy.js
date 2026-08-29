(function () {
  "use strict";

  const USER_STOP_PLAYBACK_GRACE_MS = 5000;
  let userStopActive = false;
  let discardTtsAudio = false;

  function translationDrainComplete(event) {
    return Boolean(
      event &&
      event.event_type === "TRANSLATION_STATUS" &&
      event.data?.status === "CLOSED"
    );
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

    startCapture = async function (...args) {
      discardTtsAudio = false;
      userStopActive = false;
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
      baseHandleStreamEvent(event);
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
        return;
      }
      return baseSchedulePcmChunk(bytes, sampleRate);
    };

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
        if (Date.now() >= deadline) {
          cancelPlayback();
          streamState.playbackStatus = "COMPLETED";
          streamState.playbackQueuedMs = 0;
          applyOriginalGain();
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

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
      translationDrainComplete
    };
  }
})();
