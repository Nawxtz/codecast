"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
  setLanguage as setRecognitionLanguage,
  type SpeechRecognizer,
} from "./speechRecognition";
import {
  speak,
  playNeuralAudio,
  cancelSpeech,
  cancelAllSpeech,
  isSpeechSynthesisSupported,
  isSpeaking as synthesisIsSpeaking,
  getVoicesForLanguage,
  getBestVoiceForLanguage,
  stripMarkdownForSpeech,
  getDefaultVoiceURIForLanguage,
  getStudioVoicesForLanguage,
} from "./speechSynthesis";
import { useCastStore } from "../stores/useCastStore";
import type { ToolCallLog, ToolExecuteResponse } from "../types";
import { heuristicDetectLanguage } from "@/lib/language/detector";

export interface VoiceSession {
  isSupported: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isPttActive: boolean;
  liveTranscript: string;
  voiceError: string | null;
  clearVoiceError: () => void;
  language: string;
  setLanguage: (lang: string) => void;
  selectedVoiceURI?: string;
  setSelectedVoiceURI: (uri: string) => void;
  availableVoices: SpeechSynthesisVoice[];
  previewVoice: (sampleText?: string) => void;
  startSession: () => void;
  stopSession: () => void;
  toggleSession: () => void;
  sendTextMessage: (text: string) => Promise<void>;
}

type ConnectionState =
  | "idle"
  | "listening"
  | "thinking"
  | "executing"
  | "speaking"
  | "error";

type JsonRecord = Record<string, unknown>;

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface AssistantResponse {
  content: string;
  toolCalls: ToolCall[];
  detectedLanguage?: string;
}

const TAIL_BUFFER_MS = 350;
const MIN_SPEECH_TIMEOUT_MS = 25_000;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_TOOL_ROUNDS = 8;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Keep store integration at one boundary. Existing store actions are preferred;
 * Zustand updates are used when the store exposes its collections directly.
 */
function storeState(): JsonRecord {
  return useCastStore.getState() as unknown as JsonRecord;
}

function updateStore(patch: JsonRecord): void {
  useCastStore.setState(
    patch as unknown as Partial<ReturnType<typeof useCastStore.getState>>,
  );
}

function callStoreAction(names: readonly string[], value: unknown): boolean {
  const state = storeState();

  for (const name of names) {
    const action = state[name];
    if (typeof action === "function") {
      Reflect.apply(action, state, [value]);
      return true;
    }
  }

  return false;
}

function setConnectionState(state: ConnectionState): void {
  if (!callStoreAction(["setConnectionState"], state)) {
    updateStore({ connectionState: state });
  }
}

function appendTranscript(role: "user" | "assistant", content: string): void {
  const message = { id: makeId(), role, text: content, content, timestamp: Date.now() };

  if (
    callStoreAction(
      ["addTranscriptMessage", "addMessage", "addTranscript"],
      message,
    )
  ) {
    return;
  }

  const state = storeState();
  const key = Array.isArray(state.transcript) ? "transcript" : "messages";
  const existing = state[key];

  updateStore({
    [key]: [...(Array.isArray(existing) ? existing : []), message],
  });
}

function appendToolLog(log: ToolCallLog): void {
  if (callStoreAction(["addToolLog", "addToolCallLog", "addToolCall"], log)) {
    return;
  }

  const state = storeState();
  const key = Array.isArray(state.toolLogs) ? "toolLogs" : "toolCalls";
  const existing = state[key];

  updateStore({
    [key]: [...(Array.isArray(existing) ? existing : []), log],
  });
}

function readInitialMessages(): ChatMessage[] {
  const state = storeState();
  const source = Array.isArray(state.transcript)
    ? state.transcript
    : state.messages;

  if (!Array.isArray(source)) return [];

  return source.flatMap((entry: unknown): ChatMessage[] => {
    if (!isRecord(entry) || typeof entry.content !== "string") return [];

    if (
      entry.role !== "user" &&
      entry.role !== "assistant" &&
      entry.role !== "system"
    ) {
      return [];
    }

    return [{ role: entry.role, content: entry.content }];
  });
}

function parseAssistantResponse(value: unknown): AssistantResponse {
  if (!isRecord(value)) {
    throw new Error("The chat endpoint returned an invalid response.");
  }

  if (value.error) {
    throw new Error(
      typeof value.error === "string"
        ? value.error
        : "The chat endpoint reported an error.",
    );
  }

  const message = isRecord(value.message) ? value.message : value;
  const content = message.content;
  const rawCalls = message.tool_calls ?? message.toolCalls ?? [];

  if (content != null && typeof content !== "string") {
    throw new Error("The assistant response contained invalid content.");
  }

  if (!Array.isArray(rawCalls)) {
    throw new Error("The assistant response contained invalid tool calls.");
  }

  const toolCalls = rawCalls.map((raw: unknown): ToolCall => {
    if (!isRecord(raw)) throw new Error("Invalid tool call.");

    const definition = isRecord(raw.function) ? raw.function : raw;
    const name = definition.name;
    const args = definition.arguments ?? definition.args ?? {};

    if (typeof name !== "string" || !name.trim()) {
      throw new Error("A tool call is missing its name.");
    }

    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : makeId(),
      type: "function",
      function: {
        name,
        arguments: typeof args === "string" ? args : JSON.stringify(args),
      },
    };
  });

  if (!content?.trim() && toolCalls.length === 0) {
    throw new Error("The assistant returned an empty response.");
  }

  const detectedLanguage =
    typeof value.detectedLanguage === "string" ? value.detectedLanguage : undefined;

  return { content: content ?? "", toolCalls, detectedLanguage };
}

async function postJson(
  url: string,
  body: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  if (signal.aborted) {
    throw new DOMException("The request was canceled.", "AbortError");
  }

  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();

  signal.addEventListener("abort", abort, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request to ${url} failed (${response.status}).`);
    }

    return (await response.json()) as unknown;
  } catch (error) {
    if (timedOut && !signal.aborted) {
      throw new Error(`Request to ${url} timed out.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

function isEditingText(): boolean {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement)) return false;

  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.isContentEditable
  );
}

function getInitialLanguage(): string {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("codecast_language");
      if (saved && (saved === "th-TH" || saved.toLowerCase().startsWith("th"))) {
        return "th-TH";
      }
      if (saved && (saved === "en-US" || saved.toLowerCase().startsWith("en"))) {
        return "en-US";
      }
    } catch {
      // ignore
    }
  }
  if (
    typeof navigator !== "undefined" &&
    navigator.language &&
    navigator.language.toLowerCase().startsWith("th")
  ) {
    return "th-TH";
  }
  return "en-US";
}

function greetingForLanguage(language: string): string {
  const langKey = language.split("-")[0].toLowerCase();
  if (langKey === "th") {
    return "สวัสดีครับ ผมคือผู้ช่วยตรวจโค้ด CodeCast มีอะไรให้ผมช่วยดูไหมครับ";
  }
  return "Hello! I'm your CodeCast assistant. How can I help you today?";
}

export function useVoiceSession(): VoiceSession {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPttActive, setIsPttActive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [language, setLanguageState] = useState<string>("en-US");
  const [selectedVoiceURI, setSelectedVoiceURIState] = useState<
    string | undefined
  >(() => getDefaultVoiceURIForLanguage("en-US"));
  const [availableVoices, setAvailableVoices] = useState<
    SpeechSynthesisVoice[]
  >(() => getStudioVoicesForLanguage("en-US"));

  const clearVoiceError = useCallback(() => {
    setVoiceError(null);
  }, []);

  const mountedRef = useRef(false);
  const recognizerRef = useRef<SpeechRecognizer | null>(null);
  const sessionActiveRef = useRef(false);
  const listeningRef = useRef(false);
  const speakingRef = useRef(false);
  const pttRef = useRef(false);
  const pendingRef = useRef(false);
  const languageRef = useRef("en-US");
  const voiceRef = useRef<string | undefined>(getDefaultVoiceURIForLanguage("en-US"));
  const lastTranscriptRef = useRef<string>("");
  const generationRef = useRef(0);
  const speechGenerationRef = useRef(0);
  const voicesGenerationRef = useRef(0);
  const voiceSelectionVersionRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const historyRef = useRef<ChatMessage[] | null>(null);
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tailBufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendMessageRef = useRef<(text: string) => Promise<void>>(
    async () => undefined,
  );

  const isCurrent = useCallback(
    (generation: number) =>
      mountedRef.current && generation === generationRef.current,
    [],
  );

  const clearRestart = useCallback(() => {
    if (restartTimeoutRef.current !== null) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  const stopRecognizer = useCallback(() => {
    clearRestart();
    if (tailBufferTimerRef.current !== null) {
      clearTimeout(tailBufferTimerRef.current);
      tailBufferTimerRef.current = null;
    }
    const wasListening = listeningRef.current;
    listeningRef.current = false;

    if (mountedRef.current) setIsListening(false);

    if (wasListening) {
      try {
        recognizerRef.current?.stop();
      } catch {
        // Browsers may already have stopped recognition.
      }
    }
  }, [clearRestart]);

  const startRecognizer = useCallback(() => {
    clearRestart();

    if (
      !mountedRef.current ||
      !recognizerRef.current ||
      listeningRef.current ||
      speakingRef.current ||
      pendingRef.current
    ) {
      return;
    }

    listeningRef.current = true;
    setIsListening(true);

    try {
      recognizerRef.current.start();
      if (listeningRef.current) setConnectionState("listening");
    } catch {
      listeningRef.current = false;
      sessionActiveRef.current = false;
      pttRef.current = false;
      setIsListening(false);
      setIsPttActive(false);
      setConnectionState("error");
    }
  }, [clearRestart]);

  const resumeListening = useCallback(() => {
    clearRestart();

    if (
      !mountedRef.current ||
      !(sessionActiveRef.current || pttRef.current) ||
      pendingRef.current ||
      speakingRef.current ||
      listeningRef.current
    ) {
      return;
    }

    restartTimeoutRef.current = setTimeout(() => {
      restartTimeoutRef.current = null;
      if (sessionActiveRef.current || pttRef.current) startRecognizer();
    }, 150);
  }, [clearRestart, startRecognizer]);

  const interruptSpeech = useCallback(() => {
    speechGenerationRef.current += 1;

    if (speechTimeoutRef.current !== null) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }

    speakingRef.current = false;
    if (mountedRef.current) setIsSpeaking(false);

    try {
      cancelAllSpeech();
    } catch {
      // Cancellation is best-effort on partially implemented browser APIs.
    }
  }, []);

  const cancelTurn = useCallback(() => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    pendingRef.current = false;
    interruptSpeech();
  }, [interruptSpeech]);

  const loadVoices = useCallback(async (lang: string) => {
    if (!isSpeechSynthesisSupported()) return;

    const generation = ++voicesGenerationRef.current;
    const selectionVersion = voiceSelectionVersionRef.current;

    try {
      const voices = await getVoicesForLanguage(lang);

      if (
        !mountedRef.current ||
        generation !== voicesGenerationRef.current ||
        lang !== languageRef.current
      ) {
        return;
      }

      setAvailableVoices(voices);
      const best = await getBestVoiceForLanguage(lang);

      if (
        !mountedRef.current ||
        generation !== voicesGenerationRef.current ||
        selectionVersion !== voiceSelectionVersionRef.current ||
        lang !== languageRef.current
      ) {
        return;
      }

      const uri = best?.voiceURI ?? voices[0]?.voiceURI;
      voiceRef.current = uri;
      setSelectedVoiceURIState(uri);
    } catch {
      // Voice discovery may fail temporarily while browser voices initialize.
    }
  }, []);

  const setLanguage = useCallback(
    (lang: string) => {
      const nextLanguage = lang.trim().toLowerCase().startsWith("th") ? "th-TH" : "en-US";
      if (!mountedRef.current) return;

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("codecast_language", nextLanguage);
        } catch {
          // ignore
        }
      }

      const studioVoices = getStudioVoicesForLanguage(nextLanguage);
      const defaultUri = getDefaultVoiceURIForLanguage(nextLanguage);

      languageRef.current = nextLanguage;
      setLanguageState(nextLanguage);
      voiceSelectionVersionRef.current += 1;
      voiceRef.current = defaultUri;
      setSelectedVoiceURIState(defaultUri);
      setAvailableVoices(studioVoices);

      try {
        setRecognitionLanguage(nextLanguage);
        recognizerRef.current?.setLanguage(nextLanguage);
      } catch {
        // Language selection still applies to chat and speech synthesis.
      }

      void loadVoices(nextLanguage);
    },
    [loadVoices],
  );

  const setSelectedVoiceURI = useCallback((uri: string) => {
    if (!mountedRef.current) return;
    voiceSelectionVersionRef.current += 1;
    voiceRef.current = uri || undefined;
    setSelectedVoiceURIState(uri || undefined);
  }, []);

  const speakAssistant = useCallback(
    (content: string, generation: number, spokenLang?: string): void => {
      if (!isCurrent(generation)) return;

      const activeLang = spokenLang || languageRef.current || "en-US";
      const activeVoiceURI =
        voiceRef.current && voiceRef.current.toLowerCase().includes(activeLang.split("-")[0].toLowerCase())
          ? voiceRef.current
          : getDefaultVoiceURIForLanguage(activeLang);

      const cleanedText = stripMarkdownForSpeech(
        content,
        activeLang,
      ).trim();
      if (!cleanedText) return;

      interruptSpeech();
      const speechGeneration = speechGenerationRef.current;
      stopRecognizer();

      let finished = false;

      const finish = () => {
        if (
          finished ||
          speechGeneration !== speechGenerationRef.current ||
          !isCurrent(generation)
        ) {
          return;
        }

        finished = true;
        if (speechTimeoutRef.current !== null) {
          clearTimeout(speechTimeoutRef.current);
          speechTimeoutRef.current = null;
        }

        speakingRef.current = false;
        setIsSpeaking(false);
        setConnectionState(pendingRef.current ? "thinking" : "idle");
        resumeListening();
      };

      const wordCount = cleanedText.trim().split(/\s+/).length;
      const dynamicTimeoutMs = Math.max(
        wordCount * 450 + 8_000,
        MIN_SPEECH_TIMEOUT_MS,
      );

      speechTimeoutRef.current = setTimeout(() => {
        if (
          speechGeneration !== speechGenerationRef.current ||
          !isCurrent(generation)
        ) {
          return;
        }

        try {
          cancelAllSpeech();
        } finally {
          finish();
        }
      }, dynamicTimeoutMs);

      try {
        // Deliberately non-blocking: play studio neural audio with instant barge-in
        const playback: unknown = playNeuralAudio(cleanedText, {
          voiceURI: activeVoiceURI,
          lang: activeLang,
          onStart: () => {
            if (speechGeneration !== speechGenerationRef.current || !isCurrent(generation)) return;
            speakingRef.current = true;
            setIsSpeaking(true);
            setConnectionState("speaking");
          },
          onEnd: finish,
          onError: finish,
        });

        void Promise.resolve(playback).catch(finish);
      } catch {
        finish();
      }
    },
    [
      interruptSpeech,
      isCurrent,
      resumeListening,
      stopRecognizer,
    ],
  );

  const processUserMessage = useCallback(
    async (userText: string, generation: number): Promise<void> => {
      if (!isCurrent(generation)) return;

      const controller = new AbortController();
      controllerRef.current = controller;
      let turnLanguage = languageRef.current;

      const detected = heuristicDetectLanguage(userText);
      if (detected && detected !== "en-US" && detected !== languageRef.current) {
        setLanguage(detected);
        turnLanguage = detected;
      }

      if (historyRef.current === null) {
        historyRef.current = readInitialMessages();
      }

      const userMessage: ChatMessage = { role: "user", content: userText };
      historyRef.current = [...historyRef.current, userMessage];
      const messages: ChatMessage[] = [...historyRef.current];

      try {
        appendTranscript("user", userText);
        setConnectionState("thinking");

        for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
          const data = await postJson(
            "/api/chat",
            { messages, language: turnLanguage },
            controller.signal,
          );

          if (!isCurrent(generation)) return;
          const response = parseAssistantResponse(data);

          if (response.toolCalls.length === 0) {
            messages.push({
              role: "assistant",
              content: response.content,
            });
            historyRef.current = messages;
            appendTranscript("assistant", response.content);

            const effectiveLang = response.detectedLanguage || turnLanguage;
            if (response.detectedLanguage && response.detectedLanguage !== languageRef.current) {
              setLanguage(response.detectedLanguage);
            }

            // Deliberately non-blocking: the message promise resolves while
            // playback continues, allowing immediate text input or barge-in.
            speakAssistant(response.content, generation, effectiveLang);
            return;
          }

          if (round === MAX_TOOL_ROUNDS) {
            throw new Error("The assistant exceeded the tool execution limit.");
          }

          messages.push({
            role: "assistant",
            content: response.content || null,
            tool_calls: response.toolCalls,
          });

          if (response.content.trim()) {
            appendTranscript("assistant", response.content);
          }

          for (const call of response.toolCalls) {
            if (!isCurrent(generation) || controller.signal.aborted) return;

            setConnectionState("executing");
            const startedAt = Date.now();
            let args: unknown = {};
            let result: unknown;
            let failure: string | undefined;

            try {
              args = JSON.parse(call.function.arguments) as unknown;
              if (!isRecord(args)) {
                throw new Error("Tool arguments must be a JSON object.");
              }

              const rawResult = await postJson(
                "/api/tools/execute",
                { tool: call.function.name, args },
                controller.signal,
              );

              if (!isRecord(rawResult)) {
                throw new Error("The tool returned an invalid response.");
              }

              const toolResponse = rawResult as unknown as ToolExecuteResponse;
              result = toolResponse;

              if (rawResult.success === false || rawResult.error) {
                failure =
                  typeof rawResult.error === "string"
                    ? rawResult.error
                    : "Tool execution failed.";
              }
            } catch (error) {
              if (!isCurrent(generation) || controller.signal.aborted) return;
              failure = errorMessage(error);
              result = { success: false, error: failure };
            }

            if (!isCurrent(generation)) return;

            appendToolLog({
              id: call.id,
              name: call.function.name,
              toolName: call.function.name,
              arguments: args,
              args,
              result,
              response: result,
              status: failure ? "error" : "success",
              success: !failure,
              error: failure,
              timestamp: startedAt,
              durationMs: Date.now() - startedAt,
            } as unknown as ToolCallLog);

            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify(result) ?? "null",
            });
          }

          setConnectionState("thinking");
        }
      } catch (error) {
        if (!isCurrent(generation) || controller.signal.aborted) return;

        const content = `Sorry, I couldn't complete that request. ${errorMessage(error)}`;
        historyRef.current = [
          ...(historyRef.current ?? []),
          { role: "assistant", content },
        ];
        appendTranscript("assistant", content);
        setConnectionState("error");
      } finally {
        if (isCurrent(generation)) {
          if (controllerRef.current === controller) {
            controllerRef.current = null;
          }

          pendingRef.current = false;

          if (!speakingRef.current) {
            if (storeState().connectionState !== "error") {
              setConnectionState("idle");
            }
            resumeListening();
          }
        }
      }
    },
    [isCurrent, resumeListening, setLanguage, speakAssistant],
  );

  const sendTextMessage = useCallback(
    async (text: string): Promise<void> => {
      const userText = text.trim();
      if (!userText || !mountedRef.current) return;

      cancelTurn();
      const generation = generationRef.current;
      pendingRef.current = true;
      stopRecognizer();

      await processUserMessage(userText, generation);
    },
    [cancelTurn, processUserMessage, stopRecognizer],
  );

  useEffect(() => {
    sendMessageRef.current = sendTextMessage;
  }, [sendTextMessage]);

  const previewVoice = useCallback(
    (sampleText?: string) => {
      if (!mountedRef.current || !isSpeechSynthesisSupported()) return;

      speakAssistant(
        sampleText?.trim() || greetingForLanguage(languageRef.current),
        generationRef.current,
        languageRef.current,
      );
    },
    [speakAssistant],
  );

  const startSession = useCallback(() => {
    if (!mountedRef.current || !recognizerRef.current) return;
    lastTranscriptRef.current = "";
    sessionActiveRef.current = true;
    if (!pendingRef.current && !speakingRef.current) startRecognizer();
  }, [startRecognizer]);

  const stopSession = useCallback(() => {
    sessionActiveRef.current = false;
    pttRef.current = false;
    lastTranscriptRef.current = "";

    if (mountedRef.current) setIsPttActive(false);

    cancelTurn();
    stopRecognizer();

    if (mountedRef.current) setConnectionState("idle");
  }, [cancelTurn, stopRecognizer]);

  const toggleSession = useCallback(() => {
    if (
      sessionActiveRef.current ||
      pttRef.current ||
      listeningRef.current ||
      speakingRef.current ||
      pendingRef.current
    ) {
      stopSession();
    } else {
      startSession();
    }
  }, [startSession, stopSession]);

  useEffect(() => {
    mountedRef.current = true;

    // Sync saved language from client storage without causing SSR hydration mismatch
    const initialLang = getInitialLanguage();
    if (initialLang && initialLang !== "en-US") {
      setLanguage(initialLang);
    } else {
      void loadVoices("en-US");
    }

    const recognitionSupported = isSpeechRecognitionSupported();
    setIsSupported(recognitionSupported && isSpeechSynthesisSupported());

    let disposed = false;
    let acceptingResults = false;

    if (recognitionSupported) {
      try {
        setRecognitionLanguage(initialLang || languageRef.current);

        const handlers = {
          onStart: () => {
            if (disposed) return;

            if (
              !(sessionActiveRef.current || pttRef.current) ||
              pendingRef.current ||
              speakingRef.current
            ) {
              stopRecognizer();
              return;
            }

            lastTranscriptRef.current = "";
            setLiveTranscript("");
            setVoiceError(null);
            acceptingResults = true;
            listeningRef.current = true;
            setIsListening(true);
            setConnectionState("listening");
          },
          onResult: (value: unknown, final?: boolean) => {
            if (disposed || pendingRef.current || speakingRef.current) return;

            let text: string | undefined;
            let isFinal = final ?? false;

            if (typeof value === "string") {
              text = value;
            } else if (isRecord(value)) {
              if (typeof value.transcript === "string") {
                text = value.transcript;
              }
              if (typeof value.isFinal === "boolean") {
                isFinal = value.isFinal;
              }
            }

            const trimmed = text?.trim();
            if (trimmed) {
              lastTranscriptRef.current = trimmed;
              setLiveTranscript(trimmed);
              setVoiceError(null);
            }

            // In Push-to-Talk mode, do not auto-submit while spacebar is still pressed!
            // Wait for onKeyUp to submit the user's complete statement.
            if (pttRef.current) {
              return;
            }

            if (!isFinal || !trimmed) return;

            // Permit a final result delivered after a PTT stop(), but ignore
            // results from an explicitly stopped session.
            if (
              !acceptingResults &&
              !sessionActiveRef.current
            ) {
              return;
            }

            lastTranscriptRef.current = "";
            setLiveTranscript("");
            acceptingResults = false;
            void sendMessageRef.current(trimmed).catch(() => {
              if (!disposed) {
                setConnectionState("error");
                setVoiceError("Failed to send speech message.");
              }
            });
          },
          onEnd: () => {
            if (disposed) return;
            listeningRef.current = false;
            setIsListening(false);

            const pendingText = lastTranscriptRef.current.trim();
            if (
              pendingText &&
              acceptingResults &&
              !pendingRef.current &&
              !speakingRef.current
            ) {
              lastTranscriptRef.current = "";
              setLiveTranscript("");
              acceptingResults = false;
              void sendMessageRef.current(pendingText).catch(() => {
                if (!disposed) {
                  setConnectionState("error");
                  setVoiceError("Failed to send speech message.");
                }
              });
            } else {
              setLiveTranscript("");
            }

            if (!pendingRef.current && !speakingRef.current) {
              setConnectionState("idle");
            }

            resumeListening();
          },
          onError: (error: unknown) => {
            if (disposed) return;

            const code =
              typeof error === "string"
                ? error
                : isRecord(error) && typeof error.error === "string"
                  ? error.error
                  : "";

            listeningRef.current = false;
            setIsListening(false);
            setLiveTranscript("");

            if (code === "aborted") return;

            if (code === "no-speech") {
              resumeListening();
              return;
            }

            let userFriendlyMsg = "Speech recognition error: " + (code || "unknown");
            if (code === "not-allowed" || code === "permission-denied") {
              userFriendlyMsg = "Microphone access denied. Please allow microphone permissions in browser.";
            } else if (code === "network") {
              userFriendlyMsg = "Speech recognition network error. Please check your connection.";
            } else if (code === "audio-capture") {
              userFriendlyMsg = "No microphone found on this device.";
            }

            setVoiceError(userFriendlyMsg);
            acceptingResults = false;
            sessionActiveRef.current = false;
            pttRef.current = false;
            clearRestart();
            setIsPttActive(false);
            setConnectionState("error");
          },
        };

        recognizerRef.current = createSpeechRecognizer(
          handlers as Parameters<typeof createSpeechRecognizer>[0],
          { lang: languageRef.current },
        );
      } catch {
        recognizerRef.current = null;
        setIsSupported(false);
      }
    }

    void loadVoices(languageRef.current);

    const onVoicesChanged = () => {
      if (!voiceRef.current) {
        void loadVoices(languageRef.current);
        return;
      }

      const lang = languageRef.current;
      const generation = ++voicesGenerationRef.current;

      void getVoicesForLanguage(lang)
        .then((voices) => {
          if (
            disposed ||
            generation !== voicesGenerationRef.current ||
            lang !== languageRef.current
          ) {
            return;
          }

          setAvailableVoices(voices);

          if (
            voices.length > 0 &&
            !voices.some((voice) => voice.voiceURI === voiceRef.current)
          ) {
            void loadVoices(lang);
          }
        })
        .catch(() => undefined);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        event.isComposing ||
        isEditingText() ||
        !recognizerRef.current
      ) {
        return;
      }

      event.preventDefault();

      if (tailBufferTimerRef.current !== null) {
        clearTimeout(tailBufferTimerRef.current);
        tailBufferTimerRef.current = null;
      }

      if (speakingRef.current || synthesisIsSpeaking()) {
        interruptSpeech();
      }

      if (pendingRef.current) cancelTurn();

      lastTranscriptRef.current = "";
      setLiveTranscript("");
      setVoiceError(null);
      acceptingResults = true;
      pttRef.current = true;
      setIsPttActive(true);

      if (!listeningRef.current) startRecognizer();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        isEditingText() ||
        !recognizerRef.current
      ) {
        return;
      }

      event.preventDefault();
      pttRef.current = false;
      setIsPttActive(false);

      if (tailBufferTimerRef.current !== null) {
        clearTimeout(tailBufferTimerRef.current);
      }

      tailBufferTimerRef.current = setTimeout(() => {
        tailBufferTimerRef.current = null;
        if (!pttRef.current && !sessionActiveRef.current) {
          const pendingText = lastTranscriptRef.current.trim();
          if (
            pendingText &&
            acceptingResults &&
            !pendingRef.current &&
            !speakingRef.current
          ) {
            lastTranscriptRef.current = "";
            setLiveTranscript("");
            acceptingResults = false;
            void sendMessageRef.current(pendingText).catch(() => {
              if (!disposed) {
                setConnectionState("error");
                setVoiceError("Failed to send speech message.");
              }
            });
          } else {
            setLiveTranscript("");
          }
          stopRecognizer();
        }
      }, TAIL_BUFFER_MS);
    };

    const onBlur = () => {
      if (tailBufferTimerRef.current !== null) {
        clearTimeout(tailBufferTimerRef.current);
        tailBufferTimerRef.current = null;
      }
      const wasActive = pttRef.current;
      pttRef.current = false;
      setIsPttActive(false);
      setLiveTranscript("");
      if (wasActive) stopRecognizer();
    };

    // Explicit session cancellation must also suppress late final results.
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      acceptingResults = false;
      stopSession();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const synthesis = isSpeechSynthesisSupported()
      ? window.speechSynthesis
      : null;
    synthesis?.addEventListener("voiceschanged", onVoicesChanged);

    return () => {
      disposed = true;
      mountedRef.current = false;
      acceptingResults = false;
      sessionActiveRef.current = false;
      pttRef.current = false;
      voicesGenerationRef.current += 1;

      if (tailBufferTimerRef.current !== null) {
        clearTimeout(tailBufferTimerRef.current);
        tailBufferTimerRef.current = null;
      }

      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      synthesis?.removeEventListener("voiceschanged", onVoicesChanged);

      cancelTurn();
      stopRecognizer();
      recognizerRef.current = null;
      setConnectionState("idle");
    };
  }, [
    cancelTurn,
    clearRestart,
    interruptSpeech,
    loadVoices,
    resumeListening,
    startRecognizer,
    stopRecognizer,
    stopSession,
  ]);

  return {
    isSupported,
    isListening,
    isSpeaking,
    isPttActive,
    liveTranscript,
    voiceError,
    clearVoiceError,
    language,
    setLanguage,
    selectedVoiceURI,
    setSelectedVoiceURI,
    availableVoices,
    previewVoice,
    startSession,
    stopSession,
    toggleSession,
    sendTextMessage,
  };
}

export default useVoiceSession;