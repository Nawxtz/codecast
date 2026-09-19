# Acceptance Criteria

## Session

- User can start a voice session.
- Session connects reliably.
- Assistant responds within 3 seconds per turn.
- User can interrupt the assistant.
- Barge-in stops speech and restarts listening.

## GitHub

- Agent can fetch a real PR diff.
- Agent can explain code context.
- Agent can post a real inline comment.
- Agent can submit a real review.
- All writes are safe and validated.

## Safety

- No secrets are exposed.
- Dry-run mode works.
- Repo whitelist works.
- Duplicate comments are blocked.
- Action cap works.

## UI

- HUD shows active file.
- HUD shows posted comments.
- Posted comments include GitHub URLs.
- Session state is visible.

## Digest (OpenRouter)

- A written digest is generated after the session ends.
- Digest includes summary, issues, and merge recommendation.
