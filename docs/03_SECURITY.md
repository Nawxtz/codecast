# Security Rules

## Secrets

Never expose these to the browser:

```text
OPENROUTER_API_KEY
GITHUB_PAT
```

## GitHub Access

Use a Fine-Grained GitHub PAT scoped to one demo repository only.

Required permissions:

- Pull requests: Read & Write
- Contents: Read-only

Do not request:

- Admin access
- Organization-wide access
- Repo deletion
- Workflow access unless required

## Safe Executor Requirements

Every GitHub write must pass through `safeGithubExecutor`.

The executor must enforce:

1. Repository whitelist
2. Dry-run mode
3. Duplicate prevention
4. Action cap
5. Signature tagging
6. File path validation
7. Line number validation
8. Audit logging

## Dry-Run Default

Default:

```env
CODECAST_LIVE_WRITES=false
```

Live writes should only happen when explicitly enabled.

## Comment Signature

All comments must start with:

```text
🎙️ CodeCast (AI Voice Review):
```

## Action Cap

Default:

```ts
const MAX_WRITE_ACTIONS_PER_SESSION = 8;
```
