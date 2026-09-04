import { MediaTranscriptError } from "./media_transcript.js";
import type { ManagedNativeTranscriptProvider } from "./managed_media_service.js";
import {
  SupadataProvider,
  type SupadataAccountInfo,
  type SupadataGenerateCreditQuote,
  type SupadataMetadataCreditQuote,
  type SupadataNativeCreditQuote
} from "./supadata_provider.js";
import { SUPADATA_FREE_MONTHLY_CREDITS } from "./public_media_admission.js";

function normalizePlan(plan: string): string {
  return plan.trim().toLowerCase();
}

export function assertSupadataFreeTier(account: SupadataAccountInfo): void {
  if (
    normalizePlan(account.plan) !== "free" ||
    account.max_credits > SUPADATA_FREE_MONTHLY_CREDITS
  ) {
    throw new MediaTranscriptError(
      "MANAGED_PROVIDER_FREE_TIER_REQUIRED",
      "Public MEDIA is restricted to the Supadata free tier and cannot use a paid plan or paid credits.",
      503,
      false
    );
  }
}

function assertFreeQuote(
  quote: SupadataNativeCreditQuote | SupadataMetadataCreditQuote | SupadataGenerateCreditQuote
): void {
  assertSupadataFreeTier({
    organization_id: "quote",
    plan: quote.plan,
    max_credits: quote.max_credits,
    used_credits: quote.used_credits,
    remaining_credits: quote.remaining_credits
  });
}

export class FreeTierSupadataProvider implements ManagedNativeTranscriptProvider {
  constructor(private readonly inner: SupadataProvider) {}

  private async requireCredits(required: number): Promise<void> {
    const account = await this.inner.getAccount();
    assertSupadataFreeTier(account);
    if (account.remaining_credits < required) {
      throw new MediaTranscriptError(
        "MANAGED_PROVIDER_CREDITS_EXHAUSTED",
        "The Supadata free-tier credit pool is exhausted.",
        429,
        false
      );
    }
  }

  async quoteNative(): Promise<SupadataNativeCreditQuote> {
    const quote = await this.inner.quoteNative();
    assertFreeQuote(quote);
    return quote;
  }

  async getNativeTranscript(...args: Parameters<SupadataProvider["getNativeTranscript"]>) {
    await this.requireCredits(1);
    return this.inner.getNativeTranscript(...args);
  }

  async quoteMetadata(): Promise<SupadataMetadataCreditQuote> {
    const quote = await this.inner.quoteMetadata();
    assertFreeQuote(quote);
    return quote;
  }

  async getMetadataDuration(...args: Parameters<SupadataProvider["getMetadataDuration"]>) {
    await this.requireCredits(1);
    return this.inner.getMetadataDuration(...args);
  }

  async quoteGenerateForDuration(
    ...args: Parameters<SupadataProvider["quoteGenerateForDuration"]>
  ): Promise<SupadataGenerateCreditQuote> {
    const quote = await this.inner.quoteGenerateForDuration(...args);
    assertFreeQuote(quote);
    return quote;
  }

  async quoteGenerateInstagramReel(): Promise<SupadataGenerateCreditQuote> {
    const quote = await this.inner.quoteGenerateInstagramReel();
    assertFreeQuote(quote);
    return quote;
  }

  async getGeneratedTranscript(
    ...args: Parameters<SupadataProvider["getGeneratedTranscript"]>
  ) {
    const approvedMaxCredits = args[1] ?? 1;
    await this.requireCredits(Math.max(1, Math.ceil(approvedMaxCredits)));
    return this.inner.getGeneratedTranscript(...args);
  }
}
