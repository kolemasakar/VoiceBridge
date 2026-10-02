import type { HeaderShape, PeerObservation } from "./peer_observation.js";

/** Research-only bounded, ephemeral aggregate; no live server import. */
export interface PeerWindowSummary {
  readonly window_observations: number;
  readonly allowed: number;
  readonly rejected: number;
  readonly distinct_tag_buckets: number;
  readonly overflow_observations: number;
  readonly header_shape_counts: Readonly<Record<HeaderShape, number>>;
}

const SHAPES: readonly HeaderShape[] = [
  "absent", "empty", "single_untrusted", "multiple_untrusted", "oversize"
];

export class BoundedPeerWindow {
  private readonly tags = new Set<string>();
  private readonly counts: Record<HeaderShape, number> = {
    absent: 0, empty: 0, single_untrusted: 0,
    multiple_untrusted: 0, oversize: 0
  };
  private allowed = 0;
  private rejected = 0;
  private overflow = 0;
  private windowStartedAt: number;

  constructor(
    startMs: number,
    private readonly windowMs = 60_000,
    private readonly maxTags = 128,
    private readonly minimumSummaryCount = 5
  ) {
    if (!Number.isFinite(startMs) || !Number.isSafeInteger(windowMs) ||
        windowMs < 1 || !Number.isSafeInteger(maxTags) || maxTags < 1 ||
        !Number.isSafeInteger(minimumSummaryCount) || minimumSummaryCount < 1) {
      throw new Error("invalid diagnostic window configuration");
    }
    this.windowStartedAt = startMs;
  }

  /** No raw IP, header, key, request ID, or individual tag is emitted. */
  record(observation: PeerObservation, accepted: boolean, nowMs: number): void {
    if (!Number.isFinite(nowMs) || nowMs < this.windowStartedAt ||
        nowMs >= this.windowStartedAt + this.windowMs) {
      throw new Error("observation outside diagnostic window");
    }
    if (!/^[a-f0-9]{24}$/.test(observation.peer_tag) ||
        !SHAPES.includes(observation.forwarded_shape)) {
      throw new Error("invalid diagnostic observation");
    }
    if (this.tags.has(observation.peer_tag)) {
      // Already counted in distinct-tag budget.
    } else if (this.tags.size < this.maxTags) {
      this.tags.add(observation.peer_tag);
    } else {
      this.overflow++;
    }
    this.counts[observation.forwarded_shape]++;
    if (accepted) this.allowed++;
    else this.rejected++;
  }

  /** Suppress low-volume windows; never return tag-level or request-level data. */
  finish(): PeerWindowSummary | null {
    const total = this.allowed + this.rejected;
    if (total < this.minimumSummaryCount) return null;
    return {
      window_observations: total,
      allowed: this.allowed,
      rejected: this.rejected,
      distinct_tag_buckets: this.tags.size,
      overflow_observations: this.overflow,
      header_shape_counts: { ...this.counts }
    };
  }

  /** Explicitly discard all within-window tag linkage. */
  clear(nextStartMs: number): void {
    if (!Number.isFinite(nextStartMs)) throw new Error("invalid next window");
    this.tags.clear();
    for (const shape of SHAPES) this.counts[shape] = 0;
    this.allowed = 0;
    this.rejected = 0;
    this.overflow = 0;
    this.windowStartedAt = nextStartMs;
  }
}
