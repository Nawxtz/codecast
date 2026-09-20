export type SupportedLanguage = "th-TH" | "en-US";

const LANG_TAG_REGEX = /^\[LANG:(th-TH|en-US)\]\s*/i;

/**
 * Extracts and removes a [LANG:xx-XX] tag from the model output.
 * If omitted, runs heuristic language detection as fallback.
 */
export function extractLanguageTag(content: string, userQuery?: string): {
  language: SupportedLanguage;
  cleanContent: string;
} {
  const match = content.match(LANG_TAG_REGEX);
  if (match) {
    const rawLang = match[1];
    const language = (rawLang === "th-TH" ? "th-TH" : "en-US") as SupportedLanguage;
    const cleanContent = content.slice(match[0].length).trim();
    return { language, cleanContent };
  }

  // If no tag is present, first inspect the user query, then the response content
  const detected = heuristicDetectLanguage(userQuery || content);
  return { language: detected, cleanContent: content };
}

/**
 * Heuristic detector:
 * - Thai Unicode block: \u0E00-\u0E7F -> th-TH
 * - All others fallback to en-US.
 */
export function heuristicDetectLanguage(text: string): SupportedLanguage {
  if (!text) return "en-US";

  // Thai Unicode block
  if (/[\u0E00-\u0E7F]/.test(text)) {
    return "th-TH";
  }

  return "en-US";
}
