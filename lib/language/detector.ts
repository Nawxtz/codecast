export type SupportedLanguage = "th-TH" | "en-US";

const LANG_TAG_REGEX = /\[\s*LANG\s*:\s*(th-TH|en-US)\s*\]/i;
const ALL_LANG_TAGS_REGEX = /\[\s*LANG\s*:\s*[\w-]+\s*\]/gi;

/**
 * Extracts and removes any [LANG:xx-XX] or [ LANG:xx-XX ] tags from the model output.
 * If omitted, runs heuristic language detection as fallback.
 */
export function extractLanguageTag(content: string, userQuery?: string): {
  language: SupportedLanguage;
  cleanContent: string;
} {
  const match = content.match(LANG_TAG_REGEX);
  let cleanContent = content.replace(ALL_LANG_TAGS_REGEX, "").trim();

  // If userQuery was echoed at the beginning before the tag, remove the echoed prompt
  if (userQuery && userQuery.trim().length > 3) {
    const trimmedQuery = userQuery.trim();
    if (cleanContent.startsWith(trimmedQuery)) {
      cleanContent = cleanContent.slice(trimmedQuery.length).trim();
    }
  }

  if (match) {
    const rawLang = match[1];
    const language = (rawLang.toLowerCase().startsWith("th") ? "th-TH" : "en-US") as SupportedLanguage;
    return { language, cleanContent };
  }

  // If no tag is present, first inspect the user query, then the response content
  const detected = heuristicDetectLanguage(userQuery || content);
  return { language: detected, cleanContent };
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
