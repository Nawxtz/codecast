export interface SpeechSynthesisOptions {
  lang?: string;
  voice?: SpeechSynthesisVoice;
  voiceURI?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: (event: SpeechSynthesisEvent) => void;
  onEnd?: (event: SpeechSynthesisEvent) => void;
  onError?: (event: SpeechSynthesisErrorEvent) => void;
}

interface SpeechJob {
  utterance: SpeechSynthesisUtterance;
  settled: boolean;
  finish: (error?: unknown) => void;
}

// Retain utterances and their handlers until speech ends or is cancelled.
const activeJobs = new Set<SpeechJob>();
const pendingVoiceLoads = new WeakMap<
  SpeechSynthesis,
  Promise<SpeechSynthesisVoice[]>
>();

function getSynthesis(): SpeechSynthesis | undefined {
  if (typeof window === "undefined") return undefined;
  return window.speechSynthesis ?? undefined;
}

export function isSpeechSynthesisSupported(): boolean {
  return getSynthesis() !== undefined;
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/\[\s*LANG\s*:\s*[\w-]+\s*\]/gi, " ")
    .replace(/(`{3,}|~{3,})[\s\S]*?\1/g, " as shown in the code fix below ")
    .replace(/(?:`{3,}|~{3,})[\s\S]*$/g, " as shown in the code fix below ")
    .replace(/^\s*\|.*$/gm, " ")
    .replace(/^\s{0,3}\[[^\]]+\]:[^\r\n]*$/gm, "")
    .replace(/!\[([^\]]*)\]\([^)\r\n]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)\r\n]*\)/g, "$1")
    .replace(/!?\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/<(?:https?:\/\/|ftp:\/\/|www\.)[^>\s]+>/gi, " ")
    .replace(/\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>]+/gi, " ")
    .replace(/<\/?[a-z][a-z0-9-]*(?:\s[^<>]*?)?\s*\/?>/gi, " ")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/[ \t]+#+[ \t]*$/gm, "")
    .replace(/^[ \t]*(?:>[ \t]*)+/gm, "")
    .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, "")
    .replace(/^[ \t]*[=-]{2,}[ \t]*$/gm, "")
    .replace(/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/gm, "")
    .replace(/^[ \t]*\[[ xX]\][ \t]*/gm, "")
    .replace(/\\([\\`*{}[\]()#+.!_>~-])/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/[#[\]{}]/g, "")
    .replace(/\|/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripMarkdownForSpeech(raw: string, _lang: string = "en-US"): string {
  if (!raw) return "";

  // Strip any language tag at start or anywhere
  const strippedRaw = raw.replace(/\[\s*LANG\s*:\s*[\w-]+\s*\]/gi, "").trim();

  // 1. Check for common review / detailed analysis section headers in English and Thai
  const fixHeadingRegex = /(?:###\s*⚠️?\s*(?:What Needs to Be Fixed|สิ่งที่ต้องแก้ไข|ข้อควรปรับปรุง|ข้อผิดพลาด|คำแนะนำ|การเปลี่ยนแปลงหลัก|จุดที่อาจต้องปรับปรุง)|(?:What Needs to Be Fixed|สิ่งที่ต้องแก้ไข|ข้อควรปรับปรุง|ข้อผิดพลาด|คำแนะนำ|การเปลี่ยนแปลงหลัก|จุดที่อาจต้องปรับปรุง))/i;
  const parts = strippedRaw.split(fixHeadingRegex);

  let target = parts.length > 1 && parts[0]?.trim() ? parts[0].trim() : strippedRaw;

  // 2. If preceded by a conversational intro and followed by a list or table (e.g. "- ", "* ", "1. ", "|"), isolate the intro
  const listMatch = target.search(/(?:\r?\n\s*[-*•]\s+)|(?:\r?\n\s*\d+\.\s+)|(?:\r?\n\s*\|)/);
  if (listMatch > 10) {
    const preamble = target.slice(0, listMatch).trim();
    if (preamble.length >= 10) {
      target = preamble;
    }
  }

  // 3. Clean markdown formatting
  let cleaned = cleanMarkdown(target);

  // Strip trailing "เช่น:" or "for example:" if the list that followed was stripped
  cleaned = cleaned.replace(/\s*(?:เช่น|for example|such as|for instance)[:：]?\s*$/i, "");

  // 4. Conversational speech length guard:
  // If text is excessively long (> 380 chars), isolate the key initial sentences so TTS remains rapid and conversational.
  if (cleaned.length > 380) {
    // Check for standard sentence endings
    const sentenceEndings = cleaned.match(/^.*?[.!?](?:\s+|$)/s);
    if (sentenceEndings && sentenceEndings[0].length >= 20 && sentenceEndings[0].length <= 380) {
      cleaned = sentenceEndings[0].trim();
    } else {
      // For Thai or text without period punctuation, look for newline, polite particles, or space boundary
      const thaiEnding = cleaned.match(/^.*?(?:ครับ|ค่ะ|นะครับ|นะคะ)(?:\s+|$)/);
      if (thaiEnding && thaiEnding[0].length >= 20 && thaiEnding[0].length <= 380) {
        cleaned = thaiEnding[0].trim();
      } else {
        const sliceIdx = cleaned.lastIndexOf(" ", 320);
        if (sliceIdx > 80) {
          cleaned = cleaned.slice(0, sliceIdx).trim();
        } else {
          cleaned = cleaned.slice(0, 320).trim();
        }
      }
    }
  }

  return cleaned;
}

export function getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  const synthesis = getSynthesis();
  if (!synthesis) return Promise.resolve([]);

  const available = synthesis.getVoices();
  if (available.length > 0) return Promise.resolve(available);

  const activeSynthesis = synthesis;
  const pending = pendingVoiceLoads.get(activeSynthesis);
  if (pending) return pending;

  const promise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const useEventListener = typeof activeSynthesis.addEventListener === "function";
    const previousHandler = activeSynthesis.onvoiceschanged;

    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);

      if (useEventListener) {
        activeSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      } else if (activeSynthesis.onvoiceschanged === onVoicesChanged) {
        activeSynthesis.onvoiceschanged = previousHandler;
      }
    };

    const finish = (voices: SpeechSynthesisVoice[]): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(voices);
    };

    function onVoicesChanged(event: Event): void {
      try {
        if (!useEventListener && previousHandler) {
          previousHandler.call(activeSynthesis, event);
        }
      } finally {
        const voices = activeSynthesis.getVoices();
        if (voices.length > 0) finish(voices);
      }
    }

    // Some browsers never fire voiceschanged; do not wait indefinitely.
    timer = setTimeout(() => finish(activeSynthesis.getVoices()), 1000);

    if (useEventListener) {
      activeSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    } else {
      activeSynthesis.onvoiceschanged = onVoicesChanged;
    }

    // Cover voices becoming available between the first read and subscription.
    const voices = activeSynthesis.getVoices();
    if (voices.length > 0) finish(voices);
  });

  pendingVoiceLoads.set(synthesis, promise);
  void promise.then(
    () => {
      if (pendingVoiceLoads.get(synthesis) === promise) {
        pendingVoiceLoads.delete(synthesis);
      }
    },
    () => {
      if (pendingVoiceLoads.get(synthesis) === promise) {
        pendingVoiceLoads.delete(synthesis);
      }
    },
  );

  return promise;
}

function normalizeLanguage(lang: string): string {
  return lang.trim().replace(/_/g, "-").toLowerCase();
}

function matchesLanguage(voice: SpeechSynthesisVoice, lang: string): boolean {
  const requested = normalizeLanguage(lang);
  if (!requested) return false;

  const language = requested.split("-")[0];
  const candidate = normalizeLanguage(voice.lang);
  return (
    candidate === requested ||
    candidate === language ||
    candidate.startsWith(`${language}-`)
  );
}

interface StudioVoiceSpec {
  name: string;
  voiceURI: string;
  lang: string;
}

const STUDIO_NEURAL_VOICES: Record<string, StudioVoiceSpec[]> = {
  "th-TH": [
    { name: "Niwat (Studio Neural - Fast)", voiceURI: "edge-tts:th-TH-NiwatNeural", lang: "th-TH" },
    { name: "Premwadee (Studio Neural - Edge TTS)", voiceURI: "edge-tts:th-TH-PremwadeeNeural", lang: "th-TH" },
  ],
  "en-US": [
    { name: "Jenny (Studio Neural - Edge TTS)", voiceURI: "edge-tts:en-US-JennyNeural", lang: "en-US" },
    { name: "Guy (Studio Neural - Edge TTS)", voiceURI: "edge-tts:en-US-GuyNeural", lang: "en-US" },
  ],
};

function createSyntheticVoice(spec: StudioVoiceSpec, isDefault: boolean): SpeechSynthesisVoice {
  return {
    name: spec.name,
    voiceURI: spec.voiceURI,
    lang: spec.lang,
    default: isDefault,
    localService: false,
  } as SpeechSynthesisVoice;
}

export function getStudioVoicesForLanguage(
  lang: string,
): SpeechSynthesisVoice[] {
  const norm = normalizeLanguage(lang);
  if (!norm) return [];

  const studioSpecs =
    STUDIO_NEURAL_VOICES[lang] ||
    STUDIO_NEURAL_VOICES[norm] ||
    STUDIO_NEURAL_VOICES[lang.split("-")[0]] ||
    STUDIO_NEURAL_VOICES["en-US"] ||
    [];
  return studioSpecs.map((spec, index) =>
    createSyntheticVoice(spec, index === 0),
  );
}

export function getDefaultVoiceURIForLanguage(lang: string): string {
  const studioVoices = getStudioVoicesForLanguage(lang);
  return studioVoices[0]?.voiceURI || "edge-tts:en-US-JennyNeural";
}

export async function getVoicesForLanguage(
  lang: string,
): Promise<SpeechSynthesisVoice[]> {
  const studioVoices = getStudioVoicesForLanguage(lang);

  const nativeVoices = (await getAvailableVoices()).filter((voice) =>
    matchesLanguage(voice, lang),
  );

  return [...studioVoices, ...nativeVoices];
}

function chooseBestVoice(
  voices: readonly SpeechSynthesisVoice[],
  lang: string,
): SpeechSynthesisVoice | undefined {
  const requested = normalizeLanguage(lang);
  let best: SpeechSynthesisVoice | undefined;
  let bestScore = -1;

  for (const voice of voices) {
    if (!matchesLanguage(voice, requested)) continue;

    let score = normalizeLanguage(voice.lang) === requested ? 1000 : 0;
    if (/studio neural|edge tts/i.test(voice.name)) score += 500;
    else if (/natural|neural|premium|enhanced/i.test(voice.name)) score += 100;
    if (/google/i.test(`${voice.name} ${voice.voiceURI}`)) score += 50;
    if (voice.default) score += 10;

    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }

  return best;
}

export async function getBestVoiceForLanguage(
  lang: string,
): Promise<SpeechSynthesisVoice | undefined> {
  if (!normalizeLanguage(lang)) return undefined;
  const voices = await getVoicesForLanguage(lang);
  return chooseBestVoice(voices, lang);
}

let currentNeuralAudio: HTMLAudioElement | null = null;

export function cancelAllSpeech(): void {
  if (currentNeuralAudio) {
    try {
      currentNeuralAudio.pause();
      currentNeuralAudio.currentTime = 0;
    } catch {
      // Ignore
    }
    currentNeuralAudio = null;
  }
  cancelSpeech();
}

export function cancelSpeech(): void {
  const synthesis = getSynthesis();
  const jobs = Array.from(activeJobs);

  // Settle pending voice-selection jobs too, preventing delayed speech.
  for (const job of jobs) job.finish();

  synthesis?.cancel();
}

export function isSpeaking(): boolean {
  if (currentNeuralAudio && !currentNeuralAudio.paused && !currentNeuralAudio.ended) {
    return true;
  }
  return getSynthesis()?.speaking ?? false;
}

const clientAudioCache = new Map<string, string>();
const MAX_CLIENT_AUDIO_CACHE = 50;

export async function playNeuralAudio(
  text: string,
  options: SpeechSynthesisOptions = {},
): Promise<void> {
  const lang = options.lang || "en-US";
  const cleanText = stripMarkdownForSpeech(text, lang);
  if (!cleanText) return;

  cancelAllSpeech();

  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return speak(cleanText, options);
  }

  try {
    let voiceToUse = options.voiceURI;
    if (voiceToUse?.startsWith("edge-tts:")) {
      const voiceName = voiceToUse.replace("edge-tts:", "");
      const langPrefix = lang.split("-")[0].toLowerCase();
      if (!voiceName.toLowerCase().startsWith(langPrefix)) {
        voiceToUse = getDefaultVoiceURIForLanguage(lang);
      }
    } else if (!voiceToUse) {
      voiceToUse = getDefaultVoiceURIForLanguage(lang);
    }

    let url = `/api/tts?text=${encodeURIComponent(cleanText)}&lang=${encodeURIComponent(lang)}`;
    if (voiceToUse?.startsWith("edge-tts:")) {
      const edgeVoice = voiceToUse.replace("edge-tts:", "");
      url += `&voice=${encodeURIComponent(edgeVoice)}`;
    }

    let audioUrl = clientAudioCache.get(url);
    if (!audioUrl) {
      let res = await fetch(url);
      if (!res.ok) {
        // Fast retry for transient network hiccups
        await new Promise((r) => setTimeout(r, 200));
        res = await fetch(url);
      }

      if (!res.ok) {
        throw new Error(`TTS server responded with ${res.status}`);
      }

      const blob = await res.blob();
      audioUrl = URL.createObjectURL(blob);

      if (clientAudioCache.size >= MAX_CLIENT_AUDIO_CACHE) {
        const oldest = clientAudioCache.entries().next().value;
        if (oldest) {
          URL.revokeObjectURL(oldest[1]);
          clientAudioCache.delete(oldest[0]);
        }
      }
      clientAudioCache.set(url, audioUrl);
    }

    const audio = new Audio(audioUrl);
    currentNeuralAudio = audio;

    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        if (currentNeuralAudio === audio) {
          currentNeuralAudio = null;
        }
        if (error) {
          options.onError?.(error as SpeechSynthesisErrorEvent);
        } else {
          options.onEnd?.({} as SpeechSynthesisEvent);
        }
        resolve();
      };

      audio.onplay = () => {
        options.onStart?.({} as SpeechSynthesisEvent);
      };

      audio.onended = () => {
        finish();
      };

      audio.onerror = () => {
        finish(new Error("HTML5 Audio playback error"));
        void speak(cleanText, options);
      };

      audio.play().catch((playErr) => {
        finish(playErr);
        void speak(cleanText, options);
      });
    });
  } catch (err) {
    console.warn("[playNeuralAudio] Fetch or playback failed, falling back to Web Speech:", err);
    return speak(cleanText, options);
  }
}

function clampOption(
  value: number | undefined,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(maximum, Math.max(minimum, value));
}

export function speak(
  text: string,
  options: SpeechSynthesisOptions = {},
): Promise<void> {
  const cleanText = stripMarkdownForSpeech(text);
  if (!cleanText) return Promise.resolve();

  const synthesis = getSynthesis();
  if (!synthesis) {
    return Promise.reject(
      new Error("Speech synthesis is not supported in this browser."),
    );
  }

  // Snapshot options so asynchronous voice loading cannot change this job.
  const settings = { ...options };

  return new Promise<void>((resolve, reject) => {
    const Utterance =
      typeof SpeechSynthesisUtterance !== "undefined"
        ? SpeechSynthesisUtterance
        : window.SpeechSynthesisUtterance;

    if (typeof Utterance !== "function") {
      reject(new Error("Speech synthesis is not supported in this browser."));
      return;
    }

    const utterance = new Utterance(cleanText);
    const job: SpeechJob = {
      utterance,
      settled: false,
      finish(error?: unknown): void {
        if (job.settled) return;
        job.settled = true;
        activeJobs.delete(job);
        utterance.onstart = null;
        utterance.onend = null;
        utterance.onerror = null;

        if (error !== undefined) reject(error);
        else resolve();
      },
    };

    activeJobs.add(job);

    utterance.onstart = (event): void => {
      if (!job.settled) settings.onStart?.(event);
    };

    utterance.onend = (event): void => {
      if (job.settled) return;
      job.finish();
      settings.onEnd?.(event);
    };

    utterance.onerror = (event): void => {
      if (job.settled) return;

      if (
        event.error === "canceled" ||
        event.error === "interrupted" ||
        event.error === "not-allowed"
      ) {
        job.finish();
      } else {
        job.finish(new Error(`Speech synthesis failed: ${event.error}`));
      }

      settings.onError?.(event);
    };

    const start = async (): Promise<void> => {
      let voice = settings.voice;

      if (!voice && (settings.voiceURI || settings.lang)) {
        const voices = await getAvailableVoices();
        if (job.settled) return;

        if (settings.voiceURI) {
          voice = voices.find(
            (candidate) => candidate.voiceURI === settings.voiceURI,
          );
        }

        if (!voice && settings.lang) {
          voice = chooseBestVoice(voices, settings.lang);
        }
      }

      if (job.settled) return;

      if (voice) utterance.voice = voice;
      if (settings.lang) utterance.lang = settings.lang;
      else if (voice?.lang) utterance.lang = voice.lang;

      const rate = clampOption(settings.rate, 0.1, 10);
      const pitch = clampOption(settings.pitch, 0, 2);
      const volume = clampOption(settings.volume, 0, 1);

      if (rate !== undefined) utterance.rate = rate;
      if (pitch !== undefined) utterance.pitch = pitch;
      if (volume !== undefined) utterance.volume = volume;

      synthesis.speak(utterance);
    };

    void start().catch((error: unknown) => {
      job.finish(error ?? new Error("Speech synthesis failed."));
    });
  });
}