import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticate } from "./auth.js";
import type { AppConfig } from "./config.js";

const MANAGED_MEDIA_ROOT = "/api/v1/media/managed";

export const SUPADATA_FREE_MONTHLY_CREDITS = 100;
export const SUPADATA_FREE_REQUESTS_PER_SECOND = 1;
export const PUBLIC_MEDIA_MAX_REQUESTS_PER_MINUTE = 60;
export const PUBLIC_MEDIA_MAX_CONCURRENT_REQUESTS = 1;
export const PUBLIC_MEDIA_MAX_DAILY_STT_SECONDS = 7200;

export function derivePublicMediaAdmissionCode(actionToken: string): string {
  const digest = createHash("sha256").update(actionToken, "utf8").digest("hex");
  return `public-${digest.slice(0, 48)}`;
}

export function isManagedMediaRequest(request: IncomingMessage): boolean {
  const url = new URL(request.url || "/", "http://voicebridge.local");
  return url.pathname === MANAGED_MEDIA_ROOT ||
    url.pathname.startsWith(`${MANAGED_MEDIA_ROOT}/`);
}

export interface PublicMediaAdmissionLease {
  handled: boolean;
  release(): void;
}

function noLease(handled = false): PublicMediaAdmissionLease {
  return { handled, release() {} };
}

function sendLimit(
  response: ServerResponse,
  code: "MEDIA_PUBLIC_FREE_TIER_RATE_LIMIT" | "MEDIA_PUBLIC_CONCURRENCY_LIMIT",
  message: string
): void {
  response.statusCode = 429;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("retry-after", "1");
  response.end(JSON.stringify({
    error: {
      code,
      message,
      category: "MEDIA",
      retryable: true,
      details: []
    }
  }));
}

export class PublicMediaAdmissionController {
  private windowStartedAt = 0;
  private requestsInWindow = 0;
  private lastAcceptedAt = 0;
  private activeRequests = 0;

  constructor(
    private readonly config: AppConfig,
    private readonly now: () => number = Date.now
  ) {}

  admit(
    request: IncomingMessage,
    response: ServerResponse
  ): PublicMediaAdmissionLease {
    if (!this.config.mediaPublicMode || !isManagedMediaRequest(request)) {
      return noLease();
    }

    const token = this.config.mediaActionToken;
    if (!token) return noLease();

    const authentication = authenticate(request, token);
    if (!authentication.ok) {
      // The managed handler owns the canonical authentication response.
      return noLease();
    }

    const now = this.now();
    if (now - this.windowStartedAt >= 60_000 || this.windowStartedAt === 0) {
      this.windowStartedAt = now;
      this.requestsInWindow = 0;
    }

    const configuredPerMinute = Math.max(
      1,
      Math.min(
        this.config.rateLimitRequestsPerMinute,
        PUBLIC_MEDIA_MAX_REQUESTS_PER_MINUTE
      )
    );
    const minimumIntervalMs = Math.ceil(
      1000 / SUPADATA_FREE_REQUESTS_PER_SECOND
    );

    if (
      this.requestsInWindow >= configuredPerMinute ||
      (this.lastAcceptedAt > 0 && now - this.lastAcceptedAt < minimumIntervalMs)
    ) {
      sendLimit(
        response,
        "MEDIA_PUBLIC_FREE_TIER_RATE_LIMIT",
        "The public MEDIA free-tier request rate has been reached. Retry later."
      );
      return noLease(true);
    }

    const configuredConcurrency = Math.max(
      1,
      Math.min(
        this.config.mediaMaxConcurrentJobs ?? PUBLIC_MEDIA_MAX_CONCURRENT_REQUESTS,
        PUBLIC_MEDIA_MAX_CONCURRENT_REQUESTS
      )
    );
    if (this.activeRequests >= configuredConcurrency) {
      sendLimit(
        response,
        "MEDIA_PUBLIC_CONCURRENCY_LIMIT",
        "The public MEDIA free-tier concurrency limit has been reached. Retry later."
      );
      return noLease(true);
    }

    this.requestsInWindow += 1;
    this.lastAcceptedAt = now;
    this.activeRequests += 1;
    let released = false;
    return {
      handled: false,
      release: () => {
        if (released) return;
        released = true;
        this.activeRequests = Math.max(0, this.activeRequests - 1);
      }
    };
  }
}
