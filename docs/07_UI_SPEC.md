# UI Specification

## Main Screen

The main screen is a dark developer-style HUD.

## Layout

Left panel:

- Demo repository file tree
- PR selector

Center panel:

- Diff viewer
- Active file highlight
- Active line highlight

Right panel:

- Posted comments
- GitHub comment links
- Session status
- Tool call log

Bottom bar:

- Microphone status
- Connection status
- Live-write mode indicator
- Start/stop session button

## Important UX Rules

- Barge-in should visually reflect that the assistant stopped speaking.
- Posted comments should show real GitHub URLs.
- Invalid tool calls should show a graceful rejected state.
- The UI should not expose secrets.
