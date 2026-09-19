# CodeCast Product Requirements

## Product Name

CodeCast

## One-Line Description

A voice-native GitHub pull request review copilot.

## User Story

As an engineer, I want to open a pull request and speak to an AI reviewer so that I can understand the PR, flag issues, and post review comments without switching tabs or typing.

## MVP Features

### 1. Voice Session

The user can start a voice session and speak naturally.

### 2. PR Walkthrough

The user can say:

> Walk me through PR 3.

CodeCast fetches the PR diff and explains it.

### 3. Code Context Follow-Up

The user can ask about a specific file or line.

CodeCast fetches relevant context and answers.

### 4. Post Comment

The user can say:

> Post that as a comment.

CodeCast posts a real inline GitHub comment.

### 5. Submit Review

The user can say:

> Submit it as request changes.

CodeCast submits a real GitHub review.

### 6. Barge-In

The user can interrupt CodeCast while it is speaking.

Audio playback should stop immediately.

### 7. HUD Sync

The UI should highlight the file or line being discussed.

### 8. Review Digest

After the session, CodeCast generates a written review digest.

## Out of Scope

- Multi-repo support
- Production auth
- Billing
- Team management
- Automatic code edits
- GitHub App installation
- Destructive actions
- Private repo support
