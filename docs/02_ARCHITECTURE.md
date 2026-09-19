# CodeCast Architecture

## High-Level Architecture

```text
Browser
  - SpeechRecognition (mic capture → text)
  - SpeechSynthesis (text → voice output)
  - DiffCanvasHUD rendering
  - Zustand state
  - Tool call orchestration loop

Backend
  - /api/chat — OpenRouter LLM call with tool schemas
  - /api/tools/execute — safe GitHub tool execution
  - /api/digest — post-session OpenRouter summary call
```

## Critical Rule

The browser handles voice capture and playback locally via Web Speech
API. It does NOT call OpenRouter or GitHub directly with secrets.

Turn flow:

```text
User speaks
  ↓
SpeechRecognition → text transcript
  ↓
Browser sends transcript to /api/chat
  ↓
Backend calls OpenRouter (with tool schemas)
  ↓
OpenRouter returns response + tool calls
  ↓
Browser sends tool calls to /api/tools/execute
  ↓
Backend executes GitHub API safely
  ↓
Browser sends tool results to /api/chat
  ↓
Backend gets final response from OpenRouter
  ↓
SpeechSynthesis speaks the response
```

## Core Backend Routes

### `/api/chat`

Sends transcript and tool schemas to OpenRouter.

Returns LLM response text and any tool calls.

### `/api/tools/execute`

Executes GitHub tools safely.

Inputs:

```ts
type ToolExecuteRequest = {
  tool: string;
  args: Record<string, unknown>;
};
```

Outputs:

```ts
type ToolExecuteResponse = {
  status: "success" | "rejected" | "error";
  result?: unknown;
  reason?: string;
};
```

### `/api/digest`

Sends full session transcript to OpenRouter.

Returns markdown summary of the review session.

## Core Modules

### `lib/githubClient.ts`

Octokit wrapper for GitHub API operations.

### `lib/safeGithubExecutor.ts`

Safety layer for all GitHub writes.

### `lib/digestService.ts`

Calls OpenRouter to generate post-session review summary.

### `lib/voice/speechRecognition.ts`

Wrapper around Web Speech API SpeechRecognition.

### `lib/voice/speechSynthesis.ts`

Wrapper around Web Speech API SpeechSynthesis.

### `lib/stores/useCastStore.ts`

Zustand store for UI and session state.

### `components/DiffCanvasHUD.tsx`

Main visual interface for file tree, diff, comments, and active line highlighting.
