import { NextRequest, NextResponse } from "next/server";
import { EdgeTTS } from "@seepine/edge-tts";

const VOICE_MAP: Record<string, string> = {
  "th-TH": "th-TH-NiwatNeural",
  th: "th-TH-NiwatNeural",
  "en-US": "en-US-JennyNeural",
  en: "en-US-JennyNeural",
};

function cleanMarkdown(text: string): string {
  return text
    .replace(/(?:###\s*⚠️?\s*What Needs to Be Fixed:|What Needs to Be Fixed)[\s\S]*$/i, "")
    .replace(/(`{3,}|~{3,})[\s\S]*?\1/g, " ")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\`(.+?)\`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^[\s\-*]+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ALLOWED_EDGE_VOICES = new Set([
  "th-TH-PremwadeeNeural",
  "th-TH-NiwatNeural",
  "en-US-JennyNeural",
  "en-US-GuyNeural",
]);

// In-memory audio buffer cache to eliminate repeat synthesis delays
const ttsMemoryCache = new Map<string, Buffer>();
const MAX_CACHE_ENTRIES = 80;

function getVoice(lang?: string, requestedVoice?: string): string {
  const normalizedVoice = requestedVoice?.replace(/^edge-tts:/i, "");
  if (normalizedVoice && ALLOWED_EDGE_VOICES.has(normalizedVoice)) {
    if (!lang) return normalizedVoice;
    const langPrefix = lang.split("-")[0].toLowerCase();
    const voicePrefix = normalizedVoice.split("-")[0].toLowerCase();
    if (langPrefix === voicePrefix) {
      return normalizedVoice;
    }
  }
  if (!lang) return VOICE_MAP["en-US"];
  const normalized = lang.trim().replace(/_/g, "-");
  if (VOICE_MAP[normalized]) return VOICE_MAP[normalized];
  const prefix = normalized.split("-")[0].toLowerCase();
  return VOICE_MAP[prefix] ?? VOICE_MAP["en-US"];
}

async function handleTts(text: string, lang?: string, requestedVoice?: string) {
  let cleaned = cleanMarkdown(text);
  if (!cleaned) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }

  // Cap synthesis input length to guarantee rapid synthesis (< 1s)
  if (cleaned.length > 280) {
    cleaned = cleaned.slice(0, 280).trim();
  }

  const voice = getVoice(lang, requestedVoice);
  const cacheKey = `${voice}:${lang ?? "default"}:${cleaned}`;

  const cached = ttsMemoryCache.get(cacheKey);
  if (cached) {
    return new NextResponse(new Uint8Array(cached), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Content-Length": cached.byteLength.toString(),
        "X-TTS-Cache": "HIT",
      },
    });
  }

  const synthesize = async () => {
    const tts = new EdgeTTS({
      voice,
      lang: lang ?? "en-US",
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
      timeout: 8000,
    });
    return await tts.call(cleaned);
  };

  try {
    let result;
    try {
      result = await synthesize();
    } catch {
      result = await synthesize();
    }

    const buffer = Buffer.isBuffer(result.data)
      ? result.data
      : Buffer.from(result.data);

    // Save to LRU cache
    if (ttsMemoryCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = ttsMemoryCache.keys().next().value;
      if (oldestKey) ttsMemoryCache.delete(oldestKey);
    }
    ttsMemoryCache.set(cacheKey, buffer);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Content-Length": buffer.byteLength.toString(),
        "X-TTS-Cache": "MISS",
      },
    });
  } catch (error) {
    console.error("[api/tts] Edge-TTS synthesis failed:", error);
    return NextResponse.json(
      { error: "Speech synthesis failed." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("text") ?? "";
  const lang = searchParams.get("lang") ?? undefined;
  const voice = searchParams.get("voice") ?? undefined;
  return handleTts(text, lang, voice);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = typeof body.text === "string" ? body.text : "";
    const lang = typeof body.lang === "string" ? body.lang : undefined;
    const voice = typeof body.voice === "string" ? body.voice : undefined;
    return handleTts(text, lang, voice);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 },
    );
  }
}
