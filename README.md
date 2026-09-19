# CodeCast

> **Voice-Native GitHub Pull Request Review Copilot**  
> Review, discuss, and comment on pull requests hands-free with low-latency voice, studio-grade neural speech, interactive diff canvas, and safe GitHub tool execution.

[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black.svg)](https://nextjs.org/)
[![Tests](https://img.shields.io/badge/Tests-114%2F114%20Passing-brightgreen.svg)]()
[![TTS](https://img.shields.io/badge/Neural%20TTS-100%25%20Free%20Edge--TTS-orange.svg)]()
[![Model](https://img.shields.io/badge/AI-OpenRouter%20%2F%20Hermes%20Union%20Alpha-purple.svg)]()

---

## Overview

Reviewing large pull requests by clicking through endless files and typing inline suggestions is slow and tiring. CodeCast transforms pull request reviews into a natural conversation:

- **Speak Naturally**: Hold `Space` (Push-to-Talk) or use continuous voice to explore diffs, question logic, and check edge cases.
- **Instant Neural Speech**: The assistant speaks in studio-quality neural voices ($0 cost via Edge-TTS) with zero robotic speech artifacts.
- **Instant Barge-In**: Interrupt the assistant at any millisecond by speaking or tapping `Space`. Audio playback halts instantly without buffering lag.
- **Real GitHub Tool Execution**: Inspect diffs, validate files, post inline code review comments, and submit official reviews directly to GitHub.
- **Enterprise Safety & Dry-Run**: Hardened executor with repository whitelisting, action caps, duplicate guards, and secret isolation.
- **Multi-Language Native**: Full auto-detection and fluent review in English, Thai, Japanese, and Spanish.

---

## System Architecture

CodeCast uses a clean separation of concerns between the browser-based client, the Next.js backend, and external cloud services.

```mermaid
graph TD
    subgraph Client [Client Browser]
        UI[HUD & Diff Viewer]
        Voice[Voice Orb & Mic]
        Audio[Audio Player]
    end

    subgraph Backend [Next.js Backend]
        Chat[Chat API]
        Tools[Tool Executor]
        TTS[TTS Engine]
        Safe[Safe Executor]
    end

    subgraph External [External Services]
        LLM[OpenRouter LLM]
        Edge[Edge-TTS]
        GH[GitHub API]
    end

    %% Client Interactions
    Voice -->|Speech| Chat
    Audio -->|Interrupt| Voice
    UI -->|State| Chat

    %% Backend Interactions
    Chat <-->|Tool Calls| LLM
    Chat -->|Execute| Tools
    Tools -->|Verify| Safe
    Safe <-->|REST API| GH
    
    %% Voice Pipeline
    Chat -->|Synthesize| TTS
    TTS <-->|Audio Stream| Edge
    TTS -->|MP3 Stream| Audio
```

---

## Voice & Tool Calling Interaction Loop

The following diagram illustrates how a voice command is processed, validated, and executed against the GitHub API.

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant UI as Client HUD
    participant API as Chat API
    participant Exec as Tool Executor
    participant Safe as Safe Guard
    participant GH as GitHub API
    participant TTS as Edge-TTS

    Dev->>UI: Hold Space & speak ("Walk me through PR 1")
    UI->>API: Send transcript & context
    API-->>UI: Request tool: get_pr_diff
    UI->>Exec: Execute tool
    Exec->>Safe: Validate permissions
    Safe->>GH: Fetch pull request files
    GH-->>Safe: Return diffs
    Safe-->>Exec: Return sanitized diff
    Exec-->>UI: Update UI with diff
    
    UI->>API: Send diff context
    API-->>UI: Generate spoken summary
    UI->>TTS: Request audio stream
    TTS-->>UI: Return neural audio
    UI->>Dev: Play audio
    
    opt Developer Interrupts
        Dev->>UI: Press Space or speak ("Wait, check line 60")
        UI->>UI: Halt audio instantly
    end

    Dev->>UI: "Post that recommendation as a comment"
    UI->>API: Send command
    API-->>UI: Request tool: post_comment
    UI->>Exec: Execute tool
    Exec->>Safe: Validate action cap & path
    Safe->>GH: Post inline comment
    GH-->>Safe: Return success
    Safe-->>UI: Confirm action
    UI->>Dev: Speak confirmation
```

---

## Studio Neural Voice Pipeline

CodeCast replaces robotic browser voices with Microsoft Azure Cognitive Speech neural voices via `@seepine/edge-tts` with zero API fees and no credit limits.

| Language | Default Neural Voice | Acoustic & Linguistic Profile |
| :--- | :--- | :--- |
| **English** | `en-US-JennyNeural` | Studio-grade prosody, handles technical code heteronyms without pitch drift. |
| **Thai** | `th-TH-PremwadeeNeural` | Flawless 5-tone contour precision; smooth code-switching for dev terms. |
| **Japanese** | `ja-JP-NanamiNeural` | Natural pitch accent, authentic peer-developer register. |
| **Spanish** | `es-ES-ElviraNeural` | Crisp, natural conversational cadence for technical terms. |

---

## Security & Enterprise Guardrails

Every mutation against GitHub is guarded by `safeGithubExecutor.ts`:

- **Backend Secret Isolation**: `GITHUB_PAT` and `OPENROUTER_API_KEY` reside strictly on the server and are never exposed to client-side code.
- **Dry-Run Mode by Default**: `CODECAST_LIVE_WRITES=false` simulates write actions, previews payloads, and logs them in the HUD Audit Log without touching GitHub.
- **Repository Whitelisting**: Strict checks ensure the agent only interacts with the explicitly authorized repository.
- **Duplicate Comment Prevention**: Automatically hashes file paths and line numbers to prevent duplicate comments on the same line.
- **Action Cap**: Caps write operations to 8 actions per session to prevent accidental loops or spam.
- **Audit Signature Prefix**: All posted comments are prepended with `CodeCast (AI Voice Review):` for complete provenance and team transparency.

---

## Quickstart

### 1. Prerequisites
- **Node.js**: v20+ or v24+
- **npm** or **pnpm**
- **GitHub Personal Access Token (PAT)**: Scoped to your target repository (`Pull requests: Read & Write`, `Contents: Read-only`).
- **OpenRouter API Key**: Free tier access (`sk-or-...`).

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/Nawxtz/codecast.git
cd codecast

# Install dependencies
npm install
```

### 3. Environment Configuration
Create a `.env.local` file based on `.env.example`:
```env
# OpenRouter API Configuration
OPENROUTER_API_KEY=sk-or-v1-your-key-here
OPENROUTER_MODEL=openrouter/free

# Target GitHub Repository
GITHUB_PAT=ghp_your_github_token_here
CODECAST_REPO_OWNER=Nawxtz
CODECAST_REPO_NAME=codecast-demo

# Safety: Set to true only when you want comments to publish to GitHub
CODECAST_LIVE_WRITES=false

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Testing & Verification

CodeCast includes a comprehensive automated test suite:

```bash
# Run TypeScript strict typecheck (0 errors)
npm run typecheck

# Run Vitest unit & integration test suite (114 tests)
npm test

# Run Next.js production build
npm run build
```

---

## Project Structure

```text
codecast/
├── app/
│   ├── api/
│   │   ├── chat/route.ts         # LLM prompt, auto-detection, tool dispatch
│   │   ├── digest/route.ts       # Post-review markdown digest generator
│   │   ├── tools/execute/route.ts # Safe GitHub tool executor endpoint
│   │   └── tts/route.ts          # Edge-TTS neural voice streaming
│   ├── globals.css               # Linear/Vercel minimalist theme
│   ├── layout.tsx                # App root layout & metadata
│   └── page.tsx                  # Application entry point
├── components/
│   ├── DiffCanvasHUD.tsx         # Unified review HUD (Diff, File Tree, Audit Log)
│   ├── DiffViewer.tsx            # Line-by-line diff viewer with comment anchors
│   ├── FixRecommendationCard.tsx # Recommendation cards for code fixes
│   └── VoiceOrb.tsx              # Animated SVG voice orb with listening states
├── lib/
│   ├── githubClient.ts           # Octokit client for reading diffs & files
│   ├── safeGithubExecutor.ts     # Whitelist, dry-run, action cap, deduplication
│   ├── digestService.ts          # Post-review digest synthesis service
│   ├── types.ts                  # Shared TypeScript interfaces & types
│   ├── language/
│   │   └── detector.ts           # Multilingual heuristics & tag extractors
│   └── voice/
│       ├── speechRecognition.ts  # Web Speech API wrapper with tail buffer
│       ├── speechSynthesis.ts    # Edge-TTS streaming audio player & barge-in
│       └── useVoiceSession.ts    # Main voice session hook & turn-taking state
├── docs/                         # Specification, PRD, architecture, security docs
├── scripts/                      # Seed, reset, and verification scripts
└── tests/                        # Vitest test suite (114 unit & route tests)
```

---

Built by [Nawxtz](https://github.com/Nawxtz)
