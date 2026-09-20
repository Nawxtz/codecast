export interface SpeechRecognizerHandlers {
  onStart?: () => void;
  onEnd?: () => void;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onSpeechStart?: () => void;
  onSpeechDetected?: () => void;
}

export interface SpeechRecognizerOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

interface NativeSpeechRecognitionAlternative {
  readonly transcript: string;
}

interface NativeSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: NativeSpeechRecognitionAlternative | undefined;
}

interface NativeSpeechRecognitionResultEvent {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    readonly [index: number]: NativeSpeechRecognitionResult | undefined;
  };
}

interface NativeSpeechRecognitionErrorEvent {
  readonly error?: string;
  readonly message?: string;
}

interface NativeSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onresult: ((event: NativeSpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: NativeSpeechRecognitionErrorEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type NativeSpeechRecognitionConstructor = new () => NativeSpeechRecognition;

interface SpeechRecognitionGlobals {
  SpeechRecognition?: NativeSpeechRecognitionConstructor;
  webkitSpeechRecognition?: NativeSpeechRecognitionConstructor;
}

type RecognitionState = "idle" | "starting" | "listening" | "stopping";

function normalizeLanguageCode(lang?: string): "th-TH" | "en-US" {
  if (!lang) return "en-US";
  const lower = lang.toLowerCase();
  if (lower.startsWith("th")) {
    return "th-TH";
  }
  return "en-US";
}

let currentLanguage: "th-TH" | "en-US" = "en-US";
let activeRecognizerInstance: SpeechRecognizer | null = null;

export function setLanguage(lang: string): void {
  currentLanguage = normalizeLanguageCode(lang);
  if (activeRecognizerInstance) {
    activeRecognizerInstance.setLanguage(currentLanguage);
  }
}

export function getLanguage(): string {
  return currentLanguage;
}

function getRecognitionConstructor():
  | NativeSpeechRecognitionConstructor
  | undefined {
  const globals = globalThis as unknown as SpeechRecognitionGlobals;

  if (typeof globals.SpeechRecognition === "function") {
    return globals.SpeechRecognition;
  }

  if (typeof globals.webkitSpeechRecognition === "function") {
    return globals.webkitSpeechRecognition;
  }

  return undefined;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionConstructor() !== undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function combineTranscripts(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  if (a.endsWith(" ") || b.startsWith(" ")) {
    return a + b;
  }
  const lastChar = a.charCodeAt(a.length - 1);
  const firstChar = b.charCodeAt(0);
  const isThai =
    (lastChar >= 0x0e00 && lastChar <= 0x0e7f) ||
    (firstChar >= 0x0e00 && firstChar <= 0x0e7f);
  if (isThai) {
    return a + b;
  }
  return a + " " + b;
}

export class SpeechRecognizer {
  private readonly handlers: SpeechRecognizerHandlers;
  private readonly continuous: boolean;
  private readonly interimResults: boolean;
  private language: "th-TH" | "en-US";
  private recognition: NativeSpeechRecognition | null = null;
  private state: RecognitionState = "idle";
  private destroyed = false;

  constructor(
    handlers: SpeechRecognizerHandlers = {},
    options: SpeechRecognizerOptions = {},
  ) {
    this.handlers = handlers;
    this.language = normalizeLanguageCode(options.lang ?? currentLanguage);
    this.continuous = options.continuous ?? true;
    this.interimResults = options.interimResults ?? true;

    activeRecognizerInstance = this;
  }

  public setLanguage(lang: string): void {
    if (this.destroyed) {
      return;
    }

    const prevLang = this.language;
    const targetLang = normalizeLanguageCode(lang);
    this.language = targetLang;

    if (this.recognition) {
      this.recognition.lang = targetLang;
      if (prevLang !== targetLang && this.isListening()) {
        try {
          this.recognition.stop();
        } catch {
          // ignore
        }
      }
    }
  }

  public getLanguage(): string {
    return this.language;
  }

  public isListening(): boolean {
    return this.state === "starting" || this.state === "listening";
  }

  public start(): void {
    if (this.destroyed) {
      return;
    }

    activeRecognizerInstance = this;

    if (this.state === "starting" || this.state === "listening") {
      return;
    }

    try {
      if (this.recognition) {
        this.recognition.onstart = null;
        this.recognition.onend = null;
        this.recognition.onspeechstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        try {
          this.recognition.abort();
        } catch {
          // ignore
        }
        this.recognition = null;
      }

      const Constructor = getRecognitionConstructor();

      if (!Constructor) {
        throw new Error(
          "Speech recognition is not supported in this environment.",
        );
      }

      const recognition = new Constructor();
      const targetLang = normalizeLanguageCode(this.language);
      recognition.lang = targetLang;
      recognition.continuous = this.continuous;
      recognition.interimResults = this.interimResults;
      this.attachHandlers(recognition);
      this.recognition = recognition;

      this.state = "starting";
      recognition.start();
    } catch (error: unknown) {
      this.state = "idle";
      this.handlers.onError?.(getErrorMessage(error));
    }
  }

  public stop(): void {
    if (
      this.destroyed ||
      !this.recognition ||
      this.state === "idle" ||
      this.state === "stopping"
    ) {
      return;
    }

    const previousState = this.state;
    this.state = "stopping";

    try {
      this.recognition.stop();
    } catch (error: unknown) {
      this.state = previousState;
      this.handlers.onError?.(getErrorMessage(error));
    }
  }

  public abort(): void {
    if (this.destroyed || !this.recognition || this.state === "idle") {
      return;
    }

    const previousState = this.state;
    this.state = "stopping";

    try {
      this.recognition.abort();
    } catch (error: unknown) {
      this.state = previousState;
      this.handlers.onError?.(getErrorMessage(error));
    }
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    const recognition = this.recognition;
    const wasActive = this.state !== "idle";

    this.recognition = null;
    this.state = "idle";

    if (activeRecognizerInstance === this) {
      activeRecognizerInstance = null;
    }

    if (recognition) {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onspeechstart = null;
      recognition.onresult = null;
      recognition.onerror = null;

      if (wasActive) {
        try {
          recognition.abort();
        } catch {
          // Cleanup remains complete if the native session has already ended.
        }
      }
    }
  }

  private notifySpeechDetected(): void {
    if (this.destroyed) {
      return;
    }

    this.handlers.onSpeechStart?.();

    if (!this.destroyed) {
      this.handlers.onSpeechDetected?.();
    }
  }

  private attachHandlers(recognition: NativeSpeechRecognition): void {
    recognition.onstart = () => {
      if (this.destroyed) {
        return;
      }

      if (this.state !== "stopping") {
        this.state = "listening";
      }

      this.handlers.onStart?.();
    };

    recognition.onend = () => {
      if (this.destroyed) {
        return;
      }

      this.state = "idle";
      this.handlers.onEnd?.();
    };

    recognition.onspeechstart = () => {
      this.notifySpeechDetected();
    };

    recognition.onresult = (event) => {
      if (this.destroyed) {
        return;
      }

      let cumulativeFinal = "";
      let currentInterim = "";

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const alternative = result?.[0];
        if (!result || !alternative) continue;
        const text = alternative.transcript;
        if (result.isFinal) {
          cumulativeFinal = combineTranscripts(cumulativeFinal, text);
        } else {
          currentInterim = combineTranscripts(currentInterim, text);
        }
      }

      const fullTranscript = combineTranscripts(cumulativeFinal, currentInterim).trim();
      const lastResult = event.results[event.results.length - 1];
      const isFinal = Boolean(lastResult?.isFinal) && currentInterim.trim().length === 0;

      if (!isFinal && fullTranscript.length > 0) {
        this.notifySpeechDetected();
      }

      if (!this.destroyed && fullTranscript.length > 0) {
        this.handlers.onResult?.(fullTranscript, isFinal);
      }
    };

    recognition.onerror = (event) => {
      if (this.destroyed) {
        return;
      }

      // Native recognition emits "end" after an error. Wait for it before
      // allowing another session to start.
      if (this.state !== "idle") {
        this.state = "stopping";
      }

      this.handlers.onError?.(
        event.error || event.message || "Unknown speech recognition error.",
      );
    };
  }
}

export function createSpeechRecognizer(
  handlers: SpeechRecognizerHandlers,
  options?: SpeechRecognizerOptions,
): SpeechRecognizer {
  return new SpeechRecognizer(handlers, options);
}