# CodeCast

> **Voice-Native GitHub Pull Request Review & Codebase Copilot**  
> Review, explore, and discuss pull requests and entire repositories hands-free with low-latency voice, studio-grade neural speech, interactive diff canvas, recursive file tree explorer, and safe GitHub tool execution.

[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black.svg)](https://nextjs.org/)
[![Tests](https://img.shields.io/badge/Tests-126%2F126%20Passing-brightgreen.svg)]()
[![Neural TTS](https://img.shields.io/badge/Neural%20TTS-Sub--second%20Edge--TTS-orange.svg)]()
[![Model](https://img.shields.io/badge/AI-OpenRouter%20%2F%20Hermes%20Union%20Alpha-purple.svg)]()
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FNawxtz%2Fcodecast&env=OPENROUTER_API_KEY,GITHUB_TOKEN)

<div align="center">
  <br />
  <img src="docs/codecast-hero.png" alt="CodeCast Workspace Demo" width="100%" style="border-radius: 8px; border: 1px solid #30363d;" />
  <p><em>CodeCast IDE Workspace: Voice Review Orb, Interactive Recursive File Tree, Syntax-Highlighted Diff Viewer, and AI Intelligence Panel</em></p>
  <br />
</div>

---

## Overview

Reviewing pull requests or understanding unfamiliar codebases by clicking through endless files and typing inline suggestions is slow and tiring. CodeCast transforms pull request reviews and codebase exploration into a natural conversation:

- **Dual GitHub Modes**:
  - **🐙 GitHub PR**: Inspect live pull request diffs, highlight line-by-line changes, discuss logic, and post official review comments.
  - **🌐 GitHub Repo**: Explore entire repository directory trees across any branch (🌿 main), browse code files, and ask architectural questions.
- **IDE-Style Resizable Workspace**: Multi-panel workspace with draggable splitters (col-resize), drag-to-collapse (pulling past threshold snaps panels shut into margin strips), and instant restore controls via edge tabs and header toggles.
- **Interactive File Tree Explorer**: VS Code / Cursor-style recursive file tree with folder expansion/collapse, folder file counts, file type badges (TS, TSX, CSS, JSON, SQL, MD), and real-time search filtering.
- **Speak Naturally**: Hold `Space` (Push-to-Talk) or use continuous voice to explore diffs, question logic, and check edge cases.
- **Instant Neural Speech**: The assistant speaks in studio-quality neural voices ($0 cost via Edge-TTS) with zero robotic speech artifacts.
- **Instant Barge-In**: Interrupt the assistant at any millisecond by speaking or tapping `Space`. Audio playback halts instantly without buffering lag.
- **Real GitHub Tool Execution**: Inspect diffs, validate files, post inline code review comments, and submit official reviews directly to GitHub.
- **Bilingual Native**: Full auto-detection and fluent review in English and Thai (`th-TH`).

---

## System Architecture

CodeCast uses a clean separation of concerns between the browser-based client, the Next.js backend, and external cloud services.

```mermaid
graph TD
    subgraph Client [Client Browser]
        UI[HUD & Resizable Panels]
        Tree[File Tree Explorer]
        Viewer[Diff & Code Viewer]
        Voice[Voice Orb & PTT Spacebar]
        Audio[Audio Player & Instant Barge-in]
    end

    subgraph Backend [Next.js App Router Backend]
        Chat[Chat API /api/chat]
        Tools[Tool Executor /api/tools/execute]
        RepoTree[Repo Tree API /api/github/tree]
        TTS[TTS Engine /api/tts]
        Digest[Digest Service /api/digest]
        Safe[Safe GitHub Guard]
    end

    subgraph External [External Cloud Services]
        LLM[OpenRouter LLM]
        Edge[Microsoft Azure Edge-TTS]
        GH[GitHub REST API]
    end

    %% Client Interactions
    Voice -->|Voice Input| Chat
    Audio -->|Barge-in Interrupt| Voice
    UI -->|Layout & Mode State| Chat
    Tree -->|Select File / Path| Viewer

    %% Backend Interactions
    Chat <-->|Tool Calling / Responses| LLM
    Chat -->|Execute Tool| Tools
    Tools -->|Verify Permissions & Action Caps| Safe
    Safe <-->|Authenticated Requests| GH
    RepoTree <-->|Fetch Branch Tree| GH
    
    %% Voice Pipeline
    Chat -->|Synthesize Speech| TTS
    TTS <-->|Neural Voice Stream| Edge
    TTS -->|Audio Stream| Audio
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
    Exec-->>UI: Update UI with diff & file tree
    
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

## Studio Neural Voice Pipeline

CodeCast replaces robotic browser voices with Microsoft Azure Cognitive Speech neural voices via `@seepine/edge-tts` with sub-second response times, zero API fees, and no credit limits.

| Language | Default Neural Voice | Acoustic & Linguistic Profile | Speed |
| :--- | :--- | :--- | :--- |
| **Thai** | `th-TH-NiwatNeural` | Fast neural engine, natural conversational dev tone, smooth English loanwords. | **~0.6s (Fast)** |
| **Thai (Alt)** | `th-TH-PremwadeeNeural` | Studio-grade prosody; formal clarity for detailed code reviews. | ~3.5s |
| **English** | `en-US-JennyNeural` | Studio prosody; handles technical code heteronyms without pitch drift. | **~0.8s (Fast)** |
| **English (Alt)**| `en-US-GuyNeural` | Natural developer pair programming tone; casual cadence. | **~0.6s (Fast)** |

---

## Workspace & Resizable Panels

CodeCast features a modern, IDE-inspired workspace designed for focused code exploration and review:

<div align="center">
  <br />
  <img src="docs/codecast-repo-tree.png" alt="CodeCast Recursive File Tree Explorer" width="100%" style="border-radius: 8px; border: 1px solid #30363d;" />
  <p><em>Recursive File Tree Explorer: Folder Expansion, Live File Counters, Colorized Language Badges, and Real-Time Search Filtering</em></p>
  <br />
</div>

- **Draggable Splitters**: Adjust the width of the Voice panel, File Tree Explorer, Code Canvas, and Intelligence panel via `.splitter-handle` dividers with a cyan hover glow.
- **Drag-to-Collapse**: Dragging any side panel past its collapse threshold (`< 100px` for side panels, `< 75px` for file tree) automatically snaps it closed into the margin, giving 100% screen width to the code canvas.
- **Quick Collapse Buttons**: Built-in `◀` and `▶` buttons in each panel header allow instant one-click collapse.
- **Instant Restore Controls**:
  - **Collapsed Edge Strips**: Slim vertical tabs appear on screen margins (`🎙️ VOICE` on the left, `🧠 INTEL` on the right) for one-click reopening.
  - **Header Layout Toggles**: `[ 🎙️ Voice ]`, `[ 🌲 Files ]`, and `[ 🧠 Intel ]` toggle buttons in the top navigation bar allow reopening any panel at any time.
  - **Explorer Restore Button**: When the file tree is collapsed, a `🌲 Explorer (<count>)` restore pill appears in the code canvas.

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

## 🚀 Deployment (Vercel)

CodeCast is built on Next.js 14 and deploys seamlessly to [Vercel](https://vercel.com).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FNawxtz%2Fcodecast&env=OPENROUTER_API_KEY,GITHUB_TOKEN)

### Deploy in 2 Minutes:
1. Push your code to GitHub:
   ```bash
   git push origin main
   ```
2. Import repository at [vercel.com/new](https://vercel.com/new).
3. Add Environment Variables in the Vercel Dashboard:
   - `OPENROUTER_API_KEY`: Your OpenRouter API Key (sk-or-v1-...)
   - `OPENROUTER_MODEL`: `openrouter/free` (or your preferred model)
   - `GITHUB_TOKEN`: Your GitHub Personal Access Token (repo scope)
   - `NEXT_PUBLIC_APP_URL`: Your Vercel deployment URL (e.g. `https://codecast.vercel.app`)
4. Click **Deploy**. Vercel will build and assign your live production link!

---

## Testing & Verification

CodeCast includes a comprehensive automated test suite covering voice pipelines, speech synthesis, GitHub integrations, file trees, and security executor guardrails:

```bash
# Run TypeScript strict typecheck (0 errors)
npm run typecheck

# Run Vitest unit & integration test suite (126 tests across 10 test files)
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
│   │   ├── chat/route.ts          # LLM prompt, auto-detection, tool dispatch
│   │   ├── digest/route.ts        # Post-review markdown digest generator
│   │   ├── github/
│   │   │   └── tree/route.ts      # GitHub repository tree fetcher
│   │   ├── local/                 # Local workspace diff & file APIs
│   │   ├── tools/execute/route.ts # Safe GitHub tool executor endpoint
│   │   └── tts/route.ts           # Edge-TTS neural voice streaming
│   ├── globals.css                # Minimalist dark theme & responsive HUD styles
│   ├── layout.tsx                 # App root layout & metadata
│   └── page.tsx                   # Application entry point
├── components/
│   ├── DiffCanvasHUD.tsx          # Resizable HUD, splitters, edge tabs & layout state
│   ├── DiffViewer.tsx             # Line-by-line diff viewer with comment anchors
│   ├── FileTreeExplorer.tsx       # Recursive file tree with search & type badges
│   ├── FixRecommendationCard.tsx  # Recommendation cards for code fixes
│   └── VoiceOrb.tsx               # Animated SVG voice orb with listening states
├── lib/
│   ├── githubClient.ts            # Octokit client for reading diffs, trees & files
│   ├── safeGithubExecutor.ts      # Whitelist, dry-run, action cap, deduplication
│   ├── localProjectService.ts     # Local folder analysis & git diff parser
│   ├── digestService.ts           # Post-review digest synthesis service
│   ├── stores/
│   │   └── useCastStore.ts        # Zustand global state store
│   ├── types.ts                   # Shared TypeScript interfaces & types
│   ├── language/
│   │   └── detector.ts            # Multilingual heuristics & tag extractors
│   └── voice/
│       ├── speechRecognition.ts   # Web Speech API wrapper with tail buffer
│       ├── speechSynthesis.ts     # Edge-TTS streaming audio player & barge-in
│       └── useVoiceSession.ts     # Main voice session hook & turn-taking state
├── docs/                          # Specification, PRD, architecture, security docs
├── scripts/                       # Seed, reset, and verification scripts
└── tests/                         # Vitest test suite (126 unit & route tests)
```

---

Built by [Nawxtz](https://github.com/Nawxtz)
