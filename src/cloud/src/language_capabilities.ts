export interface LanguageOption {
  tag: string;
  label: string;
}

export interface LanguagePair {
  source_language: string;
  target_language: string;
}

export interface ResolvedLanguagePair extends LanguagePair {
  stt_language: string;
  target_locale: string;
}

const REGISTRY_VERSION = "1.0.0";

const SOURCE_LANGUAGES: readonly LanguageOption[] = [
  { tag: "en", label: "English" }
];

const TARGET_LANGUAGES: readonly LanguageOption[] = [
  { tag: "uk", label: "Ukrainian" }
];

const VALIDATED_PAIRS: readonly ResolvedLanguagePair[] = [
  {
    source_language: "en",
    target_language: "uk",
    stt_language: "en-US",
    target_locale: "uk-UA"
  }
];

export function canonicalizeLanguageTag(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    return Intl.getCanonicalLocales(value.trim())[0] ?? null;
  } catch {
    return null;
  }
}

export function resolveLanguagePair(
  sourceLanguage: unknown,
  targetLanguage: unknown
): ResolvedLanguagePair | null {
  const source = canonicalizeLanguageTag(sourceLanguage);
  const target = canonicalizeLanguageTag(targetLanguage);
  if (!source || !target) {
    return null;
  }
  const pair = VALIDATED_PAIRS.find(
    (candidate) =>
      candidate.source_language === source &&
      candidate.target_language === target
  );
  return pair ? { ...pair } : null;
}

export function publicLanguageCapabilities() {
  return {
    registry_version: REGISTRY_VERSION,
    validation_policy: "validated_pairs_only",
    source_languages: SOURCE_LANGUAGES.map((language) => ({ ...language })),
    target_languages: TARGET_LANGUAGES.map((language) => ({ ...language })),
    pairs: VALIDATED_PAIRS.map(({ source_language, target_language }) => ({
      source_language,
      target_language
    })),
    defaults: {
      source_language: VALIDATED_PAIRS[0]!.source_language,
      target_language: VALIDATED_PAIRS[0]!.target_language
    }
  };
}
