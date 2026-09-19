# Voice Pipeline

## Speech-to-Text: Web Speech API

Uses the browser built-in SpeechRecognition API.

Chrome and Edge only. Not supported in Firefox.

```ts
const recognition = new webkitSpeechRecognition()
recognition.continuous = false
recognition.interimResults = false
recognition.lang = "en-US"

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript
  // send transcript to /api/chat
}

recognition.start()
```

On result: send transcript text to `/api/chat`.
On end: restart recognition if session is still open.

## Text-to-Speech: Web Speech API

Uses the browser built-in SpeechSynthesis API.

```ts
const utterance = new SpeechSynthesisUtterance(text)
utterance.rate = 1.0
utterance.pitch = 1.0
utterance.lang = "en-US"

window.speechSynthesis.cancel()
window.speechSynthesis.speak(utterance)
```

Barge-in (user interrupts assistant):
- `window.speechSynthesis.cancel()`
- Restart `SpeechRecognition` immediately after.

## LLM: OpenRouter

Endpoint: `https://openrouter.ai/api/v1`
SDK: `openai` npm package (OpenAI-compatible)

```ts
import OpenAI from "openai"

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
})
```

Default model: `stealth/union-alpha`
Configurable via: `OPENROUTER_MODEL` env var

## Tool Calling

Pass tool schemas in the OpenRouter chat request.
OpenRouter returns `tool_calls` in the response.
Browser routes each tool call to `/api/tools/execute`.
Browser sends tool results back to `/api/chat`.
Backend gets final assistant response.

## Tool Schemas

CodeCast uses these 4 tools:

### `get_pr_diff`

Fetch all files changed in a pull request, including diffs and patch content.

**JSON Schema:**

```json
{
  "name": "get_pr_diff",
  "description": "Fetch all files changed in a pull request, including their diffs and patch content.",
  "parameters": {
    "type": "object",
    "properties": {
      "pull_number": {
        "type": "number",
        "description": "The pull request number to fetch."
      }
    },
    "required": ["pull_number"]
  }
}
```

**Returns:**

```ts
{
  files: Array<{
    filename: string;
    status: "added" | "modified" | "removed" | "renamed";
    additions: number;
    deletions: number;
    patch: string;
  }>;
  pull_number: number;
  head_sha: string;
}
```

---

### `explain_context`

Fetch file content from the repository for a specific path and optional line range.

**JSON Schema:**

```json
{
  "name": "explain_context",
  "description": "Fetch file content from the repository for a specific path and optional line range.",
  "parameters": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "The file path relative to the repo root."
      },
      "start_line": {
        "type": "number",
        "description": "Optional start line number (1-indexed)."
      },
      "end_line": {
        "type": "number",
        "description": "Optional end line number (1-indexed, inclusive)."
      }
    },
    "required": ["path"]
  }
}
```

**Returns:**

```ts
{
  path: string;
  content: string;
  start_line: number;
  end_line: number;
  total_lines: number;
}
```

---

### `post_review_comment`

Post an inline review comment on a specific file and line in a pull request.

**JSON Schema:**

```json
{
  "name": "post_review_comment",
  "description": "Post an inline review comment on a specific file and line in a pull request.",
  "parameters": {
    "type": "object",
    "properties": {
      "pull_number": {
        "type": "number",
        "description": "The pull request number."
      },
      "path": {
        "type": "string",
        "description": "The file path to comment on."
      },
      "line": {
        "type": "number",
        "description": "The line number in the diff to anchor the comment to."
      },
      "body": {
        "type": "string",
        "description": "The comment text. Do NOT include the signature prefix — it is added automatically."
      }
    },
    "required": ["pull_number", "path", "line", "body"]
  }
}
```

**Returns:**

```ts
{
  status: "success" | "rejected" | "dry_run";
  github_url?: string;
  reason?: string;
}
```

---

### `submit_review`

Submit a GitHub pull request review with an overall verdict.

**JSON Schema:**

```json
{
  "name": "submit_review",
  "description": "Submit a GitHub pull request review with an overall verdict.",
  "parameters": {
    "type": "object",
    "properties": {
      "pull_number": {
        "type": "number",
        "description": "The pull request number."
      },
      "event": {
        "type": "string",
        "enum": ["COMMENT", "APPROVE", "REQUEST_CHANGES"],
        "description": "The review verdict."
      },
      "body": {
        "type": "string",
        "description": "Overall review summary body text."
      }
    },
    "required": ["pull_number", "event", "body"]
  }
}
```

**Returns:**

```ts
{
  status: "success" | "rejected" | "dry_run";
  github_url?: string;
  reason?: string;
}
```
