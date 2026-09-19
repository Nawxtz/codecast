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

let currentLanguage = "en-US";
let activeRecognizerInstance: SpeechRecognizer | null = null;

export function setLanguage(lang: string): void {
  currentLanguage = lang;
  if (activeRecognizerInstance) {
    activeRecognizerInstance.setLanguage(lang);
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

export class SpeechRecognizer {
  private readonly handlers: SpeechRecognizerHandlers;
  private readonly continuous: boolean;
  private readonly interimResults: boolean;
  private language: string;
  private recognition: NativeSpeechRecognition | null = null;
  private state: RecognitionState = "idle";
  private destroyed = false;

  constructor(
    handlers: SpeechRecognizerHandlers = {},
    options: SpeechRecognizerOptions = {},
  ) {
    this.handlers = handlers;
    this.language = options.lang ?? currentLanguage;
    this.continuous = options.continuous ?? true;
    this.interimResults = options.interimResults ?? true;

    activeRecognizerInstance = this;
  }

  public setLanguage(lang: string): void {
    if (this.destroyed) {
      return;
    }

    const prevLang = this.language;
    this.language = lang;

    if (this.recognition) {
      this.recognition.lang = lang;
      if (prevLang !== lang && this.isListening()) {
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

    if (this.state !== "idle") {
      return;
    }

    try {
      if (!this.recognition) {
        const Constructor = getRecognitionConstructor();

        if (!Constructor) {
          throw new Error(
            "Speech recognition is not supported in this environment.",
          );
        }

        this.recognition = new Constructor();
        this.attachHandlers(this.recognition);
      }

      this.recognition.lang = this.language;
      this.recognition.continuous = this.continuous;
      this.recognition.interimResults = this.interimResults;

      this.state = "starting";
      this.recognition.start();
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

      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        if (this.destroyed) {
          return;
        }

        const result = event.results[index];
        const alternative = result?.[0];

        if (!result || !alternative) {
          continue;
        }

        const transcript = alternative.transcript;

        if (!result.isFinal && transcript.trim().length > 0) {
          this.notifySpeechDetected();
        }

        if (!this.destroyed) {
          this.handlers.onResult?.(transcript, result.isFinal);
        }
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