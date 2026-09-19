# CodeCast Task Plan

## Milestone 0: Repo Setup

Tasks:

- Scaffold Next.js TypeScript app
- Add ESLint
- Add TypeScript strict mode
- Add `.env.example`
- Add docs
- Add scripts folder

Done when:

- `npm run dev` works
- `npm run build` works
- Environment template exists

## Milestone 1: Environment Verification

Tasks:

- Create `scripts/verify-env.ts`
- Check required environment variables
- Fail with clear errors if missing

Done when:

- `npm run verify:env` passes with valid env
- `npm run verify:env` fails clearly without env

## Milestone 2: GitHub Read Client

Tasks:

- Create `lib/githubClient.ts`
- Implement fetch PR files
- Implement fetch file contents
- Add script `scripts/test-github-read.ts`

Done when:

- Script can fetch a real PR diff
- Script prints changed files

## Milestone 3: Safe GitHub Executor

Tasks:

- Create `lib/safeGithubExecutor.ts`
- Add repo whitelist
- Add dry-run mode
- Add action cap
- Add duplicate guard
- Add signature prefix
- Add file/line validation

Done when:

- Unit tests pass
- Dry-run mode logs payload without writing
- Live mode posts a test comment when enabled

## Milestone 4: Tool Execution Route

Tasks:

- Create `app/api/tools/execute/route.ts`
- Accept tool name and args
- Call safe executor
- Return sanitized response

Done when:

- Route rejects unknown tools
- Route rejects invalid repos
- Route executes valid tools safely

## Milestone 5: OpenRouter Chat Route

Tasks:

- Create `app/api/chat/route.ts`
- Accept transcript and conversation history
- Call OpenRouter with tool schemas
- Return LLM response text and tool calls

Done when:

- Route returns a text response for a plain message
- Route returns tool_calls when user asks about a PR
- `OPENROUTER_API_KEY` is never sent to the browser

## Milestone 6: Web Speech API Voice Pipeline

Tasks:

- Create `lib/voice/speechRecognition.ts`
- Create `lib/voice/speechSynthesis.ts`
- Handle recognition start, stop, result, error events
- Handle synthesis speak, cancel, barge-in
- No external packages — use browser built-in APIs only

Done when:

- Browser captures mic and returns transcript text
- Browser speaks text via SpeechSynthesis
- Calling `cancel()` stops speech immediately

## Milestone 7: Full Turn Loop

Tasks:

- Connect SpeechRecognition → `/api/chat` → SpeechSynthesis
- Handle tool call loop: `/api/tools/execute` → `/api/chat`
- Update Zustand state on each step
- Handle errors gracefully

Done when:

- User speaks, assistant responds by voice
- Tool calls trigger real GitHub operations
- Session state is visible in UI

## Milestone 8: HUD

Tasks:

- Build `DiffCanvasHUD.tsx`
- Show file tree
- Show diff pane
- Highlight active file
- Show posted comments

Done when:

- HUD updates when PR changes
- HUD highlights active file
- Posted comments appear with GitHub URLs

## Milestone 9: OpenRouter Digest

Tasks:

- Create `app/api/digest/route.ts`
- Create `lib/digestService.ts`
- Send full transcript + posted comments to OpenRouter
- Return markdown digest

Done when:

- Digest contains summary
- Digest contains issue list
- Digest contains merge recommendation

## Milestone 10: Demo Polish

Tasks:

- Add reset script
- Add rehearsal checklist
- Tune system prompt
- Tune HUD sync
- Record demo

Done when:

- Demo can be reset cleanly
- Final video can be recorded reliably
