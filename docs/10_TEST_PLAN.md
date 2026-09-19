# Test Plan

## Unit Tests

Test:

- Safe executor rejects wrong repo
- Safe executor blocks duplicate comments
- Safe executor respects dry-run mode
- Safe executor enforces action cap
- Safe executor validates file path
- Safe executor validates line number

## Integration Tests

Test:

- GitHub client can fetch PR files
- GitHub client can fetch file contents
- Tool route can execute read-only tools
- Tool route can execute write tools in dry-run mode

## Manual Tests

Test:

- Voice session connects
- Assistant responds
- Barge-in stops audio
- Tool call triggers backend execution
- Comment appears on GitHub in live mode
- Review is submitted in live mode
- Reset script cleans demo repo
