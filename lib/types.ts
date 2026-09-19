// lib/types.ts

export type TranscriptMessage = {
  role: "user" | "assistant";
  text: string;
  timestamp: number; // Unix ms
};

export type ToolCallLog = {
  id: string;          // unique call ID
  tool: string;        // tool name e.g. "get_pr_diff"
  args: unknown;       // raw args from OpenRouter tool_calls
  status: "pending" | "success" | "rejected" | "error" | "dry_run";
  result?: unknown;    // sanitized result returned to /api/chat
  reason?: string;     // rejection or error reason
  timestamp: number;   // Unix ms
};

export type PostedComment = {
  pull_number: number;
  path: string;
  line: number;
  body: string;
  github_url: string;  // full URL to the comment on GitHub
  timestamp: number;   // Unix ms
};

export type CastState = {
  connection: "idle" | "connecting" | "open" | "reconnecting" | "error";
  sessionReady: boolean;
  activePrNumber: number | null;
  activeFile: string | null;
  activeLine: number | null;
  isAssistantSpeaking: boolean;
  isUserSpeaking: boolean;
  liveWritesEnabled: boolean;
  transcript: TranscriptMessage[];
  toolCalls: ToolCallLog[];
  postedComments: PostedComment[];
  reviewDigest: string | null;
};

export type PrDiffFile = {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  patch: string;
};

export type PrDiffResult = {
  files: PrDiffFile[];
  pull_number: number;
  head_sha: string;
};

export type FileContextResult = {
  path: string;
  content: string;
  start_line: number;
  end_line: number;
  total_lines: number;
};

export type ToolExecuteRequest = {
  tool: string;
  args: Record<string, unknown>;
};

export type ToolExecuteResponse = {
  status: "success" | "rejected" | "error" | "dry_run";
  result?: unknown;
  reason?: string;
  github_url?: string;
};
