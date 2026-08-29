import { createHash, timingSafeEqual } from "node:crypto";

const DEFAULT_DAILY_STT_SECONDS = 7200;

export interface MediaBetaUsage {
  day_utc: string;
  daily_limit_seconds: number;
  used_seconds: number;
  remaining_seconds: number;
}

export interface MediaBetaReserveResult {
  allowed: boolean;
  usage: MediaBetaUsage;
}

function digestAccessCode(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function utcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function parseMediaBetaCodes(value: string | undefined): string[] {
  if (!value) return [];
  const codes = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (codes.some((code) => code.length < 12 || code.length > 128)) {
    throw new Error(
      "KRC_MEDIA_BETA_CODES entries must contain 12 to 128 characters."
    );
  }
  if (new Set(codes).size !== codes.length) {
    throw new Error("KRC_MEDIA_BETA_CODES must not contain duplicate codes.");
  }
  return codes;
}

export class MediaBetaGate {
  readonly configured: boolean;
  private readonly codeDigests: Buffer[];
  private usageDayUtc: string | null = null;
  private usedSeconds = 0;

  constructor(
    accessCodes: string[],
    private readonly dailySttSeconds = DEFAULT_DAILY_STT_SECONDS
  ) {
    if (
      !Number.isInteger(dailySttSeconds) ||
      dailySttSeconds < 60 ||
      dailySttSeconds > 24 * 60 * 60
    ) {
      throw new Error(
        "MEDIA_DAILY_STT_SECONDS must be an integer between 60 and 86400."
      );
    }
    this.codeDigests = accessCodes.map(digestAccessCode);
    this.configured = this.codeDigests.length > 0;
  }

  authorize(accessCode: string): boolean {
    if (!this.configured || accessCode.length < 12 || accessCode.length > 128) {
      return false;
    }
    const candidate = digestAccessCode(accessCode);
    return this.codeDigests.some(
      (expected) =>
        expected.length === candidate.length && timingSafeEqual(expected, candidate)
    );
  }

  restoreUsage(dayUtc: string, usedSeconds: number): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayUtc)) {
      throw new Error("MEDIA BETA durable usage day must use YYYY-MM-DD.");
    }
    if (!Number.isFinite(usedSeconds) || usedSeconds < 0) {
      throw new Error("MEDIA BETA durable usage must be a non-negative number.");
    }
    this.usageDayUtc = dayUtc;
    this.usedSeconds = Math.min(
      this.dailySttSeconds,
      Math.max(0, Math.floor(usedSeconds))
    );
  }

  reserveSttSeconds(
    requestedSeconds: number,
    now = new Date()
  ): MediaBetaReserveResult {
    if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 0) {
      return { allowed: false, usage: this.usage(now) };
    }
    const seconds = Math.ceil(requestedSeconds);
    const day = utcDay(now);
    if (this.usageDayUtc !== day) {
      this.usageDayUtc = day;
      this.usedSeconds = 0;
    }

    if (this.usedSeconds + seconds > this.dailySttSeconds) {
      return { allowed: false, usage: this.usage(now) };
    }

    this.usedSeconds += seconds;
    return { allowed: true, usage: this.usage(now) };
  }

  usage(now = new Date()): MediaBetaUsage {
    const day = utcDay(now);
    const used = this.usageDayUtc === day ? this.usedSeconds : 0;
    return {
      day_utc: day,
      daily_limit_seconds: this.dailySttSeconds,
      used_seconds: used,
      remaining_seconds: Math.max(0, this.dailySttSeconds - used)
    };
  }
}
