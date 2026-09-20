import { beforeEach, describe, expect, it, vi } from 'vitest';

if (typeof (globalThis as unknown as { window: unknown }).window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

type RecognitionModule = typeof import('../lib/voice/speechRecognition');
type SynthesisModule = typeof import('../lib/voice/speechSynthesis');

type EventHandler = ((event: unknown) => void) | null;

/**
 * Minimal stand-in for the browser SpeechRecognition constructor.
 * Supports both the `on<event>` property style and `addEventListener`.
 */
class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];

  onstart: EventHandler = null;
  onresult: EventHandler = null;
  onerror: EventHandler = null;
  onend: EventHandler = null;
  onaudiostart: EventHandler = null;
  onspeechend: EventHandler = null;

  continuous = false;
  interimResults = false;
  lang = '';
  maxAlternatives = 1;

  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  private listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set<(event: unknown) => void>();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown): void {
    const handler = (this as unknown as Record<string, unknown>)[`on${type}`];
    if (typeof handler === 'function') {
      (handler as (e: unknown) => void)(event);
    }
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

/**
 * Minimal stand-in for SpeechSynthesisUtterance.
 */
class MockSpeechSynthesisUtterance {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: unknown = null;

  onstart: EventHandler = null;
  onend: EventHandler = null;
  onerror: EventHandler = null;
  onboundary: EventHandler = null;

  private listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(text: string) {
    this.text = text;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set<(event: unknown) => void>();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown): void {
    const handler = (this as unknown as Record<string, unknown>)[`on${type}`];
    if (typeof handler === 'function') {
      (handler as (e: unknown) => void)(event);
    }
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

let speakingValue = false;
let lastUtterance: MockSpeechSynthesisUtterance | null = null;

const speakMock = vi.fn((utterance: MockSpeechSynthesisUtterance): void => {
  lastUtterance = utterance;
});
const cancelMock = vi.fn();
const getVoicesMock = vi.fn((): unknown[] => []);
const pauseMock = vi.fn();
const resumeMock = vi.fn();

const speechSynthesisMock = {
  speak: speakMock,
  cancel: cancelMock,
  getVoices: getVoicesMock,
  pause: pauseMock,
  resume: resumeMock,
  pending: false,
  paused: false,
  get speaking(): boolean {
    return speakingValue;
  },
};

function installMocks(): void {
  MockSpeechRecognition.instances = [];
  lastUtterance = null;
  speakingValue = false;

  speakMock.mockClear();
  cancelMock.mockClear();
  getVoicesMock.mockClear();
  pauseMock.mockClear();
  resumeMock.mockClear();

  Object.defineProperty(window, 'SpeechRecognition', {
    value: MockSpeechRecognition,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    value: MockSpeechRecognition,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, 'speechSynthesis', {
    value: speechSynthesisMock,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
    value: MockSpeechSynthesisUtterance,
    configurable: true,
    writable: true,
  });
}

async function loadRecognition(): Promise<RecognitionModule> {
  return import('../lib/voice/speechRecognition');
}

async function loadSynthesis(): Promise<SynthesisModule> {
  return import('../lib/voice/speechSynthesis');
}

describe('voice pipeline', () => {
  beforeEach(() => {
    vi.resetModules();
    installMocks();
  });

  describe('speechRecognition', () => {
    it('isSpeechRecognitionSupported returns true when the constructor exists', async () => {
      const mod = await loadRecognition();
      expect(mod.isSpeechRecognitionSupported()).toBe(true);
    });

    it('createSpeechRecognizer wires up onStart, onResult, onError and onEnd', async () => {
      const mod = await loadRecognition();

      const onStart = vi.fn();
      const onResult = vi.fn();
      const onError = vi.fn();
      const onEnd = vi.fn();

      const recognizer = mod.createSpeechRecognizer({
        onStart,
        onResult,
        onError,
        onEnd,
      });

      expect(recognizer).toBeTruthy();
      expect(typeof recognizer.start).toBe('function');
      expect(typeof recognizer.stop).toBe('function');
      expect(typeof recognizer.abort).toBe('function');

      recognizer.start();
      const instance = MockSpeechRecognition.instances[0];
      expect(instance).toBeDefined();

      instance.emit('start', new Event('start'));
      expect(onStart).toHaveBeenCalledTimes(1);

      const resultEvent = {
        results: [[{ transcript: 'hello world', confidence: 0.92 }]],
        resultIndex: 0,
      };
      instance.emit('result', resultEvent);
      expect(onResult).toHaveBeenCalledTimes(1);

      const errorEvent = { error: 'no-speech', message: 'No speech was detected.' };
      instance.emit('error', errorEvent);
      expect(onError).toHaveBeenCalledTimes(1);

      instance.emit('end', new Event('end'));
      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('start, stop and abort delegate to the underlying recognizer without throwing', async () => {
      const mod = await loadRecognition();
      const recognizer = mod.createSpeechRecognizer({ onResult: vi.fn() });

      recognizer.start();
      const instance = MockSpeechRecognition.instances[0];
      expect(instance).toBeDefined();

      expect(() => recognizer.start()).not.toThrow();
      expect(() => recognizer.stop()).not.toThrow();
      expect(() => recognizer.abort()).not.toThrow();

      expect(instance.start).toHaveBeenCalled();
      expect(instance.stop).toHaveBeenCalled();
      expect(instance.abort).toHaveBeenCalled();
    });

    it('configures th-TH language correctly on underlying SpeechRecognition instance', async () => {
      const mod = await loadRecognition();
      const recognizer = mod.createSpeechRecognizer({}, { lang: 'th-TH' });

      recognizer.start();
      const instance = MockSpeechRecognition.instances[0];
      expect(instance).toBeDefined();
      expect(instance.lang).toBe('th-TH');
    });

    it('accumulates Thai multi-segment transcripts without inserting spaces', async () => {
      const mod = await loadRecognition();
      const onResult = vi.fn();
      const recognizer = mod.createSpeechRecognizer({ onResult }, { lang: 'th-TH' });

      recognizer.start();
      const instance = MockSpeechRecognition.instances[0];

      // Simulate first segment interim
      instance.emit('result', {
        results: [
          Object.assign([{ transcript: 'ช่วยตรวจ' }], { isFinal: false }),
        ],
      });
      expect(onResult).toHaveBeenLastCalledWith('ช่วยตรวจ', false);

      // Simulate first segment final + second segment interim
      instance.emit('result', {
        results: [
          Object.assign([{ transcript: 'ช่วยตรวจ' }], { isFinal: true }),
          Object.assign([{ transcript: 'โค้ดให้หน่อยครับ' }], { isFinal: false }),
        ],
      });
      expect(onResult).toHaveBeenLastCalledWith('ช่วยตรวจโค้ดให้หน่อยครับ', false);

      // Simulate both segments final
      instance.emit('result', {
        results: [
          Object.assign([{ transcript: 'ช่วยตรวจ' }], { isFinal: true }),
          Object.assign([{ transcript: 'โค้ดให้หน่อยครับ' }], { isFinal: true }),
        ],
      });
      expect(onResult).toHaveBeenLastCalledWith('ช่วยตรวจโค้ดให้หน่อยครับ', true);
    });
  });

  describe('speechSynthesis', () => {
    it('isSpeechSynthesisSupported returns true when window.speechSynthesis exists', async () => {
      const mod = await loadSynthesis();
      expect(mod.isSpeechSynthesisSupported()).toBe(true);
    });

    it('cancelSpeech calls window.speechSynthesis.cancel (barge-in)', async () => {
      const mod = await loadSynthesis();

      mod.cancelSpeech();

      expect(cancelMock).toHaveBeenCalledTimes(1);
    });

    it('speak creates an utterance, attaches handlers and resolves on end', async () => {
      const mod = await loadSynthesis();

      const promise = mod.speak('hello world');

      expect(speakMock).toHaveBeenCalledTimes(1);
      expect(lastUtterance).not.toBeNull();
      expect(lastUtterance?.text).toBe('hello world');

      let resolved = false;
      void promise.then(() => {
        resolved = true;
      });

      lastUtterance?.emit('end', new Event('end'));

      await promise;
      expect(resolved).toBe(true);
    });

    it('isSpeaking reflects window.speechSynthesis.speaking', async () => {
      const mod = await loadSynthesis();

      speakingValue = false;
      expect(mod.isSpeaking()).toBe(false);

      speakingValue = true;
      expect(mod.isSpeaking()).toBe(true);
    });

    it('getVoicesForLanguage returns Studio Neural voices for th-TH even without browser native voices', async () => {
      const mod = await loadSynthesis();
      const voices = await mod.getVoicesForLanguage('th-TH');

      expect(voices.length).toBeGreaterThanOrEqual(2);
      expect(voices.some((v) => v.voiceURI.includes('Premwadee'))).toBe(true);
      expect(voices.some((v) => v.voiceURI.includes('Niwat'))).toBe(true);
    });

    it('getBestVoiceForLanguage selects Premwadee Studio Neural voice for th-TH', async () => {
      const mod = await loadSynthesis();
      const best = await mod.getBestVoiceForLanguage('th-TH');

      expect(best).toBeDefined();
      expect(best?.voiceURI).toBe('edge-tts:th-TH-NiwatNeural');
    });

    it('getStudioVoicesForLanguage returns synchronous voices without delay', async () => {
      const mod = await loadSynthesis();
      const thaiVoices = mod.getStudioVoicesForLanguage('th-TH');
      expect(thaiVoices.length).toBeGreaterThanOrEqual(2);
      expect(thaiVoices[0].voiceURI).toBe('edge-tts:th-TH-NiwatNeural');

      const englishVoices = mod.getStudioVoicesForLanguage('en-US');
      expect(englishVoices[0].voiceURI).toBe('edge-tts:en-US-JennyNeural');
    });

    it('getDefaultVoiceURIForLanguage returns correct default URI per language', async () => {
      const mod = await loadSynthesis();
      expect(mod.getDefaultVoiceURIForLanguage('th-TH')).toBe('edge-tts:th-TH-NiwatNeural');
      expect(mod.getDefaultVoiceURIForLanguage('en-US')).toBe('edge-tts:en-US-JennyNeural');
    });

    describe('stripMarkdownForSpeech', () => {
      const reviewWithCard = `In \`src/auth.ts\`, line 55 is not awaiting \`validateToken\`.

### ⚠️ What Needs to Be Fixed:
1. \`src/auth.ts\`, line 55. Not awaiting validateToken allows invalid tokens through.
\`\`\`typescript
const isValid = await validateToken(token);
\`\`\``;

      it('isolates clean conversational intro without canned assistant cues for en-US', async () => {
        const mod = await loadSynthesis();
        const spoken = mod.stripMarkdownForSpeech(reviewWithCard, 'en-US');

        expect(spoken).toBe('In src/auth.ts, line 55 is not awaiting validateToken.');
        expect(spoken).not.toContain("I've placed the fix recommendation");
        expect(spoken).not.toContain('What Needs to Be Fixed');
        expect(spoken).not.toContain('```');
      });

      it('isolates clean conversational intro without canned assistant cues for th-TH', async () => {
        const mod = await loadSynthesis();
        const spoken = mod.stripMarkdownForSpeech(reviewWithCard, 'th-TH');

        expect(spoken).toBe('In src/auth.ts, line 55 is not awaiting validateToken.');
        expect(spoken).not.toContain('ผมลงจุดแก้ไว้ในการ์ดด้านล่างแล้วครับ');
        expect(spoken).not.toContain('What Needs to Be Fixed');
      });

      it('preserves full clean message when no fix card exists', async () => {
        const mod = await loadSynthesis();
        const cleanMsg = 'PR #2 looks clean—no blocking issues found.';
        const spoken = mod.stripMarkdownForSpeech(cleanMsg, 'en-US');

        expect(spoken).toBe('PR 2 looks clean—no blocking issues found.');
        expect(spoken).not.toContain("I've placed the fix recommendation");
      });

      it('isolates conversational preamble before bullet lists in Thai', async () => {
        const mod = await loadSynthesis();
        const msgWithBullets = `สวัสดีครับ! ผมคือ **CodeCast Voice Reviewer** ครับ ผมเป็นผู้ช่วยผู้เชี่ยวชาญด้านการตรวจสอบโค้ด (Code Review) ครับ

ผมทำได้หลายอย่าง เช่น:

- 🔍 **ตรวจสอบ Pull Request** — ดู diff และวิเคราะห์โค้ด
- 📝 **แสดงความคิดเห็น** — ให้ข้อเสนอแนะตรงบรรทัดโค้ด`;

        const spoken = mod.stripMarkdownForSpeech(msgWithBullets, 'th-TH');
        expect(spoken).toContain('CodeCast Voice Reviewer');
        expect(spoken).not.toContain('ตรวจสอบ Pull Request');
        expect(spoken).not.toContain('- 🔍');
        expect(spoken.length).toBeLessThan(220);
      });

      it('isolates intro before Thai fix heading (### สิ่งที่ต้องแก้ไข)', async () => {
        const mod = await loadSynthesis();
        const thaiReview = `ผมได้ตรวจสอบโค้ดเรียบร้อยแล้วครับ พบจุดที่ควรปรับปรุง 2 จุด

### สิ่งที่ต้องแก้ไข:
1. การจัดการ Error ใน async function ขาด try-catch
\`\`\`ts
await apiCall();
\`\`\``;

        const spoken = mod.stripMarkdownForSpeech(thaiReview, 'th-TH');
        expect(spoken).toBe('ผมได้ตรวจสอบโค้ดเรียบร้อยแล้วครับ พบจุดที่ควรปรับปรุง 2 จุด');
        expect(spoken).not.toContain('สิ่งที่ต้องแก้ไข');
        expect(spoken).not.toContain('apiCall');
      });
    });
  });
});