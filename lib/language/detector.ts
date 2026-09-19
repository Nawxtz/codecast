export type SupportedLanguage = "th-TH" | "ja-JP" | "es-ES" | "en-US";

const LANG_TAG_REGEX = /^\[LANG:(th-TH|ja-JP|es-ES|en-US)\]\s*/i;

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
    const language = (
      rawLang === "th-TH" || rawLang === "ja-JP" || rawLang === "es-ES"
        ? rawLang
        : "en-US"
    ) as SupportedLanguage;
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
 * - Japanese Kana/Kanji: \u3040-\u30FF\u4E00-\u9FAF -> ja-JP
 * - Spanish common words / inverted punctuation (¿, ¡, á, é, í, ó, ú, ñ) -> es-ES
 * - All others (including French, German, Chinese, etc.) STRICTLY fallback to en-US.
 */
export function heuristicDetectLanguage(text: string): SupportedLanguage {
  if (!text) return "en-US";

  // 1. Thai
  if (/[\u0E00-\u0E7F]/.test(text)) {
    return "th-TH";
  }

  // 2. Japanese (Hiragana, Katakana, common Kanji with kana)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
    return "ja-JP";
  }

  const sample = text.toLowerCase();

  // Explicitly reject French patterns before checking accented vowels
  if (/\b(bonjour|salut|merci|s['’]il vous plaît|s['’]il te plaît|cette|vérifier|pourquoi|avec|dans|sur|est-ce)\b/i.test(sample)) {
    return "en-US";
  }

  // Explicitly reject German patterns
  if (/\b(hallo|guten|danke|bitte|überprüfe|nicht|eine|einen|dieser|dieses)\b/i.test(sample)) {
    return "en-US";
  }

  // Definite Spanish punctuation, ñ, or accented Spanish vowels
  if (/[¿¡ñÑ]/.test(text)) {
    return "es-ES";
  }

  const spanishPatterns = [
    /\bpor favor\b/i,
    /\b(código|codigo)\b/i,
    /\b(función|funcion)\b/i,
    /\b(línea|linea)\b/i,
    /\b(revisar|revisa|revise)\b/i,
    /\b(arreglar|arregla)\b/i,
    /\b(problema|problemas)\b/i,
    /\b(error|fallo)\s+en\b/i,
    /\bhay\s+un\b/i,
    /\bde\s+esta\b/i,
    /\bel\s+pr\b/i,
    /\b(gracias|bueno|también|tambien|está|estan)\b/i,
  ];

  for (const pattern of spanishPatterns) {
    if (pattern.test(sample)) {
      return "es-ES";
    }
  }

  // 4. Strict Fallback: Everything else (French, German, undetermined, English) -> en-US
  return "en-US";
}
