import type { PeerObservation } from "./peer_observation.js";
import { BoundedPeerWindow, type PeerWindowSummary } from "./peer_window_aggregate.js";

/** Research-only clock-driven rotation. No timers, persistence, logs or server imports. */
export class PeerWindowCoordinator {
  private readonly window: BoundedPeerWindow;
  private start: number;
  private readonly summaries: Array<{ endedAtMs: number; summary: PeerWindowSummary }> = [];
  constructor(
    startMs: number,
    private readonly windowMs = 60_000,
    private readonly retentionMs = 86_400_000,
    private readonly maxSummaries = 1440
  ) {
    if (!Number.isFinite(startMs) || !Number.isSafeInteger(windowMs) || windowMs < 1 ||
        !Number.isSafeInteger(retentionMs) || retentionMs < windowMs ||
        !Number.isSafeInteger(maxSummaries) || maxSummaries < 1) {
      throw new Error("invalid peer window coordinator settings");
    }
    this.start = startMs;
    this.window = new BoundedPeerWindow(startMs, windowMs);
  }

  /** Call from an external scheduler even during idle periods. */
  advance(nowMs: number): void {
    if (!Number.isFinite(nowMs) || nowMs < this.start) {
      throw new Error("nonmonotonic diagnostic clock");
    }
    if (nowMs >= this.start + this.windowMs) {
      const endedAtMs = this.start + this.windowMs;
      const summary = this.window.finish();
      if (summary !== null && nowMs - endedAtMs < this.retentionMs) {
        this.summaries.push({ endedAtMs, summary });
      }
      const elapsedWindows = Math.floor((nowMs - this.start) / this.windowMs);
      this.start += elapsedWindows * this.windowMs;
      this.window.clear(this.start);
    }
    this.purge(nowMs);
  }

  record(observation: PeerObservation, accepted: boolean, nowMs: number): void {
    this.advance(nowMs);
    this.window.record(observation, accepted, nowMs);
  }

  /** Aggregate only; no per-request or per-peer observations leave the coordinator. */
  readSummaries(nowMs: number): readonly PeerWindowSummary[] {
    this.advance(nowMs);
    return this.summaries.map(({ summary }) => ({
      ...summary, header_shape_counts: { ...summary.header_shape_counts }
    }));
  }

  clear(nowMs: number): void {
    this.advance(nowMs);
    this.summaries.length = 0;
    this.window.clear(this.start);
  }

  private purge(nowMs: number): void {
    while (this.summaries.length &&
      (nowMs - this.summaries[0]!.endedAtMs >= this.retentionMs ||
       this.summaries.length > this.maxSummaries)) {
      this.summaries.shift();
    }
  }
}
