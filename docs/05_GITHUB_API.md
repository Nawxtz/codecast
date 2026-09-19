# GitHub API Mapping

## `get_pr_diff`

Use:

```text
GET /repos/{owner}/{repo}/pulls/{pull_number}/files
```

Returns changed files and patches.

## `explain_context`

Use:

```text
GET /repos/{owner}/{repo}/contents/{path}
```

May require branch/ref handling.

## `post_review_comment`

Use:

```text
POST /repos/{owner}/{repo}/pulls/{pull_number}/comments
```

Important:

GitHub inline comments may require:

- `commit_id`
- `path`
- `line`
- `side`
- `body`

Do not assume file path and line alone are always enough.

## `submit_review`

Use:

```text
POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
```

Supported events:

```text
COMMENT
APPROVE
REQUEST_CHANGES
```

## Validation Rules

Before posting a comment:

1. Confirm the file exists in the PR diff.
2. Confirm the line is within the diff.
3. Confirm the comment can be unlocked/anchored.
4. If invalid, return a rejected result instead of calling GitHub.
