const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const policySource = readFileSync(
  path.join(__dirname, "..", "stop_policy.js"),
  "utf8"
);

function createContext() {
  let resolveStop;
  let scheduledChunks = 0;
  const closed = [];

  const context = {
    module: { exports: {} },
    exports: {},
    Promise,
    Date,
    setTimeout,
    clearTimeout,
    WebSocket: { OPEN: 1 },
    streamState: {
      ttsStatus: "ACTIVE",
      ttsPending: 4,
      ttsBuffered: 3,
      ttsRetryInMs: 2000,
      playbackStatus: "PLAYING",
      playbackQueuedMs: 45000
    },
    streamCloseExpected: false,
    streamSocket: {
      readyState: 1,
      close(code, reason) {
        closed.push({ code, reason });
        this.readyState = 3;
      }
    },
    audioContext: null,
    activePlaybackSources: new Set(),
    playbackEndTime: 0,
    playbackDuckingActive: false,
    applyOriginalGain() {},
    cancelPlayback() {},
    startCapture: async () => undefined,
    stopCapture: () => new Promise((resolve) => {
      resolveStop = resolve;
    }),
    handleStreamEvent() {},
    schedulePcmChunk() {
      scheduledChunks += 1;
    },
    waitForPlaybackDrain: async () => true
  };
  vm.createContext(context);
  vm.runInContext(policySource, context, { filename: "stop_policy.js" });

  return {
    context,
    closed,
    getScheduledChunks: () => scheduledChunks,
    resolveStop: () => resolveStop?.()
  };
}

test("stop policy closes stream only after translation drain completes", async () => {
  const runtime = createContext();
  const stop = runtime.context.stopCapture("USER_STOP");

  runtime.context.handleStreamEvent({
    event_type: "TRANSLATION_STATUS",
    data: { status: "DRAINING" }
  });
  assert.equal(runtime.closed.length, 0);

  runtime.context.handleStreamEvent({
    event_type: "TRANSLATION_STATUS",
    data: { status: "CLOSED" }
  });
  assert.equal(runtime.closed.length, 1);
  assert.equal(runtime.closed[0].code, 1000);
  assert.equal(runtime.context.streamCloseExpected, true);
  assert.equal(runtime.context.streamState.ttsStatus, "CLOSED");
  assert.equal(runtime.context.streamState.ttsPending, 0);
  assert.equal(runtime.context.streamState.ttsBuffered, 0);

  runtime.resolveStop();
  await stop;
});

test("stop policy suppresses new TTS playback after user stop", async () => {
  const runtime = createContext();
  const stop = runtime.context.stopCapture("USER_STOP");

  runtime.context.schedulePcmChunk(new Uint8Array([0, 0]), 24000);
  assert.equal(runtime.getScheduledChunks(), 0);

  runtime.resolveStop();
  await stop;

  await runtime.context.startCapture();
  runtime.context.schedulePcmChunk(new Uint8Array([0, 0]), 24000);
  assert.equal(runtime.getScheduledChunks(), 1);
});

test("stop policy keeps non-user shutdown behavior unchanged", async () => {
  const runtime = createContext();
  const stop = runtime.context.stopCapture("STREAM_DISCONNECTED");

  runtime.context.schedulePcmChunk(new Uint8Array([0, 0]), 24000);
  assert.equal(runtime.getScheduledChunks(), 1);

  runtime.context.handleStreamEvent({
    event_type: "TRANSLATION_STATUS",
    data: { status: "CLOSED" }
  });
  assert.equal(runtime.closed.length, 0);

  runtime.resolveStop();
  await stop;
});
