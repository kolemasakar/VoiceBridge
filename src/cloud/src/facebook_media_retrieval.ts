import { managedMediaPlatform, normalizeManagedMediaUrl } from "./managed_media_url.js";
import { MediaTranscriptError } from "./media_transcript.js";

export const SCRAPECREATORS_FACEBOOK_POST_MAX_CREDITS = 1 as const;

export type FacebookMediaRetrievalProvider = "cobalt" | "scrapecreators";
export type FacebookRetrievalHttpStatusClass = "2xx" | "4xx" | "5xx" | null;

export interface FacebookMediaAsset {
  source_url: string;
  media_url: string;
  duration_seconds: number | null;
  provider: FacebookMediaRetrievalProvider;
  provider_mode: "self_hosted" | "facebook_post";
  credits_charged: number;
  credits_remaining: number | null;
  cached: boolean;
}

export interface FacebookRetrievalCreditConsent {
  provider: "scrapecreators";
  mode: "facebook_post";
  max_credits: 1;
}

export interface FacebookRetrievalCreditPreflight {
  source_url: string;
  provider: "scrapecreators";
  mode: "facebook_post";
  estimated_credits: 1;
  maximum_credits: 1;
  consent_required: true;
  consent_options: { approve: 1; reject: 2 };
  provider_balance_lookup_performed: false;
  note: "provider_balance_endpoint_is_not_used_for_preflight";
}

export class FacebookMediaRetrievalError extends MediaTranscriptError {
  constructor(
    code: string,
    message: string,
    httpStatus: number,
    retryable: boolean,
    readonly provider: FacebookMediaRetrievalProvider | null = null,
    readonly creditsCharged: number | null = null,
    readonly creditsRemaining: number | null = null,
    readonly providerHttpStatusClass: FacebookRetrievalHttpStatusClass = null
  ) {
    super(code, message, httpStatus, retryable);
  }
}

export interface FacebookMediaRetriever {
  readonly provider: FacebookMediaRetrievalProvider;
  retrieve(
    sourceUrl: string,
    consent?: FacebookRetrievalCreditConsent
  ): Promise<FacebookMediaAsset>;
}

function normalizedFacebookUrl(value: string): string {
  const normalized = normalizeManagedMediaUrl(value);
  if (managedMediaPlatform(normalized) !== "facebook") {
    throw new FacebookMediaRetrievalError(
      "FACEBOOK_MEDIA_URL_REQUIRED",
      "The retrieval provider accepts only supported public Facebook video URLs.",
      400,
      false
    );
  }
  return normalized;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeEndpoint(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  const localHttp = parsed.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error(`${name} must use HTTPS outside local tests.`);
  }
  return value.replace(/\/+$/, "");
}

function safeMediaUrl(value: unknown, baseUrl?: string): string | null {
  const raw = nonEmptyString(value);
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = baseUrl ? new URL(raw, baseUrl) : new URL(raw);
  } catch {
    return null;
  }
  const localHttp = parsed.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) return null;
  return parsed.toString();
}

function httpStatusClass(status: number): FacebookRetrievalHttpStatusClass {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return null;
}

async function jsonResponse(
  response: Response,
  provider: FacebookMediaRetrievalProvider
): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const payload = JSON.parse(text) as unknown;
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
  } catch {
    throw new FacebookMediaRetrievalError(
      "FACEBOOK_RETRIEVAL_INVALID_JSON",
      "The Facebook media retrieval provider returned invalid JSON.",
      502,
      false,
      provider,
      null,
      null,
      httpStatusClass(response.status)
    );
  }
}

export function parseFacebookRetrievalCreditConsent(
  value: unknown
): FacebookRetrievalCreditConsent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const consent = value as Record<string, unknown>;
  if (
    consent.provider !== "scrapecreators" ||
    consent.mode !== "facebook_post" ||
    consent.max_credits !== SCRAPECREATORS_FACEBOOK_POST_MAX_CREDITS
  ) {
    return null;
  }
  return {
    provider: "scrapecreators",
    mode: "facebook_post",
    max_credits: SCRAPECREATORS_FACEBOOK_POST_MAX_CREDITS
  };
}

export function facebookRetrievalCreditPreflight(
  sourceUrl: string
): FacebookRetrievalCreditPreflight {
  return {
    source_url: normalizedFacebookUrl(sourceUrl),
    provider: "scrapecreators",
    mode: "facebook_post",
    estimated_credits: SCRAPECREATORS_FACEBOOK_POST_MAX_CREDITS,
    maximum_credits: SCRAPECREATORS_FACEBOOK_POST_MAX_CREDITS,
    consent_required: true,
    consent_options: { approve: 1, reject: 2 },
    provider_balance_lookup_performed: false,
    note: "provider_balance_endpoint_is_not_used_for_preflight"
  };
}

export class CobaltFacebookRetriever implements FacebookMediaRetriever {
  readonly provider = "cobalt" as const;
  private readonly endpoint: string;

  constructor(
    endpoint: string,
    private readonly apiKey: string | null = null
  ) {
    this.endpoint = safeEndpoint(endpoint, "Cobalt endpoint");
  }

  async retrieve(sourceUrl: string): Promise<FacebookMediaAsset> {
    const source = normalizedFacebookUrl(sourceUrl);
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json"
    };
    if (this.apiKey) headers.authorization = `Api-Key ${this.apiKey}`;

    let response: Response;
    try {
      response = await fetch(`${this.endpoint}/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: source,
          downloadMode: "auto",
          videoQuality: "720",
          disableMetadata: true
        })
      });
    } catch {
      throw new FacebookMediaRetrievalError(
        "FACEBOOK_COBALT_UNREACHABLE",
        "The self-hosted Facebook retrieval service could not be reached.",
        502,
        true,
        "cobalt"
      );
    }

    const payload = await jsonResponse(response, "cobalt");
    if (!response.ok) {
      throw new FacebookMediaRetrievalError(
        "FACEBOOK_COBALT_FAILED",
        "The self-hosted Facebook retrieval service rejected the public media request.",
        response.status >= 500 ? 502 : 422,
        response.status >= 500,
        "cobalt",
        null,
        null,
        httpStatusClass(response.status)
      );
    }

    const status = nonEmptyString(payload.status)?.toLowerCase() || "";
    let mediaUrl: string | null = null;
    if (status === "redirect" || status === "tunnel") {
      mediaUrl = safeMediaUrl(payload.url, `${this.endpoint}/`);
    } else if (status === "picker" && Array.isArray(payload.picker)) {
      const video = payload.picker.find((item) => {
        if (!item || typeof item !== "object") return false;
        return (item as Record<string, unknown>).type === "video";
      });
      if (video && typeof video === "object") {
        mediaUrl = safeMediaUrl(
          (video as Record<string, unknown>).url,
          `${this.endpoint}/`
        );
      }
    }

    if (!mediaUrl) {
      throw new FacebookMediaRetrievalError(
        "FACEBOOK_COBALT_NO_DIRECT_MEDIA",
        "The self-hosted retrieval attempt did not return a directly usable Facebook video asset.",
        422,
        false,
        "cobalt",
        null,
        null,
        httpStatusClass(response.status)
      );
    }

    return {
      source_url: source,
      media_url: mediaUrl,
      duration_seconds: null,
      provider: "cobalt",
      provider_mode: "self_hosted",
      credits_charged: 0,
      credits_remaining: null,
      cached: false
    };
  }
}

export class ScrapeCreatorsFacebookRetriever implements FacebookMediaRetriever {
  readonly provider = "scrapecreators" as const;
  private readonly endpoint: string;

  constructor(
    private readonly apiKey: string,
    endpoint = "https://api.scrapecreators.com",
    private readonly cacheMaxAge = "30d"
  ) {
    if (!apiKey.trim()) throw new Error("ScrapeCreators API key is required.");
    this.endpoint = safeEndpoint(endpoint, "ScrapeCreators endpoint");
  }

  async retrieve(
    sourceUrl: string,
    consent?: FacebookRetrievalCreditConsent
  ): Promise<FacebookMediaAsset> {
    const source = normalizedFacebookUrl(sourceUrl);
    if (!consent || !parseFacebookRetrievalCreditConsent(consent)) {
      throw new FacebookMediaRetrievalError(
        "FACEBOOK_RETRIEVAL_CREDIT_CONSENT_REQUIRED",
        "ScrapeCreators Facebook retrieval requires explicit consent for at most one credit.",
        409,
        false,
        "scrapecreators"
      );
    }

    const url = new URL(`${this.endpoint}/v1/facebook/post`);
    url.searchParams.set("url", source);
    if (this.cacheMaxAge) url.searchParams.set("cache_max_age", this.cacheMaxAge);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-api-key": this.apiKey
        }
      });
    } catch {
      throw new FacebookMediaRetrievalError(
        "FACEBOOK_SCRAPECREATORS_UNREACHABLE",
        "The paid Facebook retrieval provider could not be reached; the request must not be replayed automatically.",
        502,
        false,
        "scrapecreators"
      );
    }

    const payload = await jsonResponse(response, "scrapecreators");
    const charged = finiteNumber(payload.credits_charged);
    const remaining = finiteNumber(payload.credits_remaining);
    if (charged === null || !Number.isInteger(charged) || charged < 0) {
      throw new FacebookMediaRetrievalError(
        "FACEBOOK_SCRAPECREATORS_CHARGE_UNKNOWN",
        "The paid retrieval response did not report a trustworthy credit charge; do not retry automatically.",
        502,
        false,
        "scrapecreators",
        null,
        remaining
      );
    }
    if (charged > consent.max_credits) {
      throw new FacebookMediaRetrievalError(
        "FACEBOOK_SCRAPECREATORS_CREDIT_CAP_BREACH",
        "The paid retrieval provider reported a charge above the approved credit cap.",
        502,
        false,
        "scrapecreators",
        charged,
        remaining
      );
    }

    if (!response.ok || payload.success !== true) {
      throw new FacebookMediaRetrievalError(
        "FACEBOOK_SCRAPECREATORS_FAILED",
        "The paid retrieval provider could not obtain this public Facebook video; do not retry automatically.",
        response.status >= 500 ? 502 : 422,
        false,
        "scrapecreators",
        charged,
        remaining
      );
    }

    const mediaUrl = safeMediaUrl(payload.hd_url) || safeMediaUrl(payload.sd_url);
    if (!mediaUrl) {
      throw new FacebookMediaRetrievalError(
        "FACEBOOK_SCRAPECREATORS_NO_MEDIA",
        "The paid retrieval provider returned no directly usable Facebook video URL.",
        422,
        false,
        "scrapecreators",
        charged,
        remaining
      );
    }

    const duration = finiteNumber(payload.length_in_second);
    return {
      source_url: source,
      media_url: mediaUrl,
      duration_seconds: duration !== null && duration > 0 ? duration : null,
      provider: "scrapecreators",
      provider_mode: "facebook_post",
      credits_charged: charged,
      credits_remaining: remaining,
      cached: payload.cached === true
    };
  }
}

export class FacebookMediaRetrievalChain {
  constructor(
    private readonly freeRetriever: FacebookMediaRetriever,
    private readonly paidRetriever: FacebookMediaRetriever | null
  ) {}

  async retrieve(
    sourceUrl: string,
    consent?: FacebookRetrievalCreditConsent
  ): Promise<FacebookMediaAsset> {
    const source = normalizedFacebookUrl(sourceUrl);
    void consent;
    void this.paidRetriever;

    let provider: FacebookMediaRetrievalProvider | null = this.freeRetriever.provider;
    let statusClass: FacebookRetrievalHttpStatusClass = null;
    try {
      return await this.freeRetriever.retrieve(source);
    } catch (error) {
      if (error instanceof MediaTranscriptError && error.code === "MEDIA_URL_INVALID") {
        throw error;
      }
      if (error instanceof FacebookMediaRetrievalError) {
        provider = error.provider ?? this.freeRetriever.provider;
        statusClass = error.providerHttpStatusClass;
      }
    }

    throw new FacebookMediaRetrievalError(
      "FACEBOOK_RETRIEVAL_UNAVAILABLE",
      "The free Facebook retrieval attempt failed. Paid fallback is disabled in active Media Beta.",
      422,
      false,
      provider,
      null,
      null,
      statusClass
    );
  }
}
