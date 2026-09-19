# State Model

## Supporting Type Definitions

Define these types in `lib/types.ts`. All modules must import from this file — do not redefine them locally.

```ts
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
  status: "success" | "rejected" | "error";
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
```

## Core State Shape

```ts
type CastState = {
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
```

## HUD Focus Priority

Use this order:

1. Explicit `focus_hud` tool call, if implemented
2. `get_pr_diff` tool result
3. `explain_context` tool result
4. `post_review_comment` result
5. Transcript fuzzy matching fallback

Do not let fuzzy matching override validated tool results.
