"use client";

import { create } from "zustand";
import type {
  CastState,
  TranscriptMessage,
  ToolCallLog,
  PostedComment,
} from "../types";

export type CastActions = {
  setConnection: (status: CastState["connection"]) => void;
  setSessionReady: (ready: boolean) => void;
  setProjectMode: (mode: CastState["projectMode"]) => void;
  setLocalProject: (
    name: string | null,
    path: string | null,
    files: CastState["localFiles"],
  ) => void;
  setLocalViewMode: (mode: CastState["localViewMode"]) => void;
  setGithubBranch: (branch: string) => void;
  setActivePr: (prNumber: number | null) => void;
  setActiveLocation: (file: string | null, line?: number | null) => void;
  setIsAssistantSpeaking: (speaking: boolean) => void;
  setIsUserSpeaking: (speaking: boolean) => void;
  setLiveWritesEnabled: (enabled: boolean) => void;
  addTranscriptMessage: (
    msg: Omit<TranscriptMessage, "timestamp"> & { timestamp?: number },
  ) => void;
  addToolCall: (call: ToolCallLog) => void;
  updateToolCall: (id: string, update: Partial<ToolCallLog>) => void;
  addPostedComment: (comment: PostedComment) => void;
  setReviewDigest: (digest: string | null) => void;
  resetSession: () => void;
};

export type CastStore = CastState & CastActions;

const createInitialState = (): CastState => ({
  connection: "idle",
  sessionReady: false,
  projectMode: "github_pr",
  githubBranch: "main",
  localProjectName: null,
  localFolderPath: null,
  localFiles: [],
  localViewMode: "changes",
  activePrNumber: 1,
  activeFile: null,
  activeLine: null,
  isAssistantSpeaking: false,
  isUserSpeaking: false,
  liveWritesEnabled: false,
  transcript: [],
  toolCalls: [],
  postedComments: [],
  reviewDigest: null,
});

export const useCastStore = create<CastStore>()((set) => ({
  ...createInitialState(),

  setConnection: (status) => set({ connection: status }),

  setSessionReady: (ready) => set({ sessionReady: ready }),

  setProjectMode: (mode) => set({ projectMode: mode }),

  setGithubBranch: (branch) => set({ githubBranch: branch }),

  setLocalProject: (name, path, files) =>
    set({
      localProjectName: name,
      localFolderPath: path,
      localFiles: files,
    }),

  setLocalViewMode: (mode) => set({ localViewMode: mode }),

  setActivePr: (prNumber) => set({ activePrNumber: prNumber }),

  setActiveLocation: (file, line) =>
    set({
      activeFile: file,
      activeLine: file === null ? null : (line ?? null),
    }),

  setIsAssistantSpeaking: (speaking) =>
    set({ isAssistantSpeaking: speaking }),

  setIsUserSpeaking: (speaking) => set({ isUserSpeaking: speaking }),

  setLiveWritesEnabled: (enabled) => set({ liveWritesEnabled: enabled }),

  addTranscriptMessage: (msg) =>
    set((state) => ({
      transcript: [
        ...state.transcript,
        { ...msg, timestamp: msg.timestamp ?? Date.now() },
      ],
    })),

  addToolCall: (call) =>
    set((state) => ({
      toolCalls: [...state.toolCalls, { ...call }],
    })),

  updateToolCall: (id, update) =>
    set((state) => ({
      toolCalls: state.toolCalls.map((call) =>
        call.id === id ? { ...call, ...update } : call,
      ),
    })),

  addPostedComment: (comment) =>
    set((state) => ({
      postedComments: [...state.postedComments, { ...comment }],
    })),

  setReviewDigest: (digest) => set({ reviewDigest: digest }),

  resetSession: () => set(createInitialState()),
}));