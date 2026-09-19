import { NextRequest, NextResponse } from "next/server";
import { EdgeTTS } from "@seepine/edge-tts";

const VOICE_MAP: Record<string, string> = {
  "th-TH": "th-TH-PremwadeeNeural",
  th: "th-TH-PremwadeeNeural",
  "ja-JP": "ja-JP-NanamiNeural",
  ja: "ja-JP-NanamiNeural",
  "es-ES": "es-ES-ElviraNeural",
  es: "es-ES-ElviraNeural",
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
  "ja-JP-NanamiNeural",
  "ja-JP-KeitaNeural",
  "es-ES-ElviraNeural",
  "es-ES-AlvaroNeural",
  "en-US-JennyNeural",
  "en-US-GuyNeural",
]);

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
  const cleaned = cleanMarkdown(text);
  if (!cleaned) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }

  const voice = getVoice(lang, requestedVoice);

  const synthesize = async () => {
    const tts = new EdgeTTS({
      voice,
      lang: lang ?? "en-US",
      outputFormat: "audio-24khz-96kbitrate-mono-mp3",
      timeout: 25000,
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

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "Content-Length": buffer.byteLength.toString(),
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
