import { getOctokit, getRepoTarget, getPrDiff } from "./githubClient";
import type { ToolExecuteResponse } from "./types";

export const COMMENT_SIGNATURE_PREFIX = "🎙️ CodeCast (AI Voice Review): ";
export const MAX_WRITE_ACTIONS_PER_SESSION = 8;

const ACTION_CAP_REASON =
  "Action cap reached (maximum 8 write operations allowed per session).";
const DRY_RUN_REASON =
  "Dry-run mode active. GitHub changes were not applied.";
const DUPLICATE_REASON =
  "Duplicate comment detected on this file and line.";

interface ExecutorSession {
  writeCount: number;
  postedCommentKeys: Set<string>;
  pendingCommentKeys: Set<string>;
}

interface TargetParams {
  owner?: string;
  repo?: string;
}

interface ReviewCommentParams extends TargetParams {
  pull_number: number;
  path: string;
  line: number;
  body: string;
}

interface SubmitReviewParams extends TargetParams {
  pull_number: number;
  event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
  body: string;
}

function createSession(): ExecutorSession {
  return {
    writeCount: 0,
    postedCommentKeys: new Set<string>(),
    pendingCommentKeys: new Set<string>(),
  };
}

let session = createSession();

function rejected(reason: string): ToolExecuteResponse {
  return { status: "rejected", reason };
}

function errorResponse(error: unknown): ToolExecuteResponse {
  return {
    status: "error",
    reason: error instanceof Error ? error.message : String(error),
  };
}

function isPositiveSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePullNumber(pullNumber: unknown): string | undefined {
  return isPositiveSafeInteger(pullNumber)
    ? undefined
    : "pull_number must be a positive safe integer.";
}

function validateTarget(
  params: TargetParams,
  allowed: { owner: string; repo: string },
): string | undefined {
  const owner = params.owner === undefined ? allowed.owner : params.owner;
  const repo = params.repo === undefined ? allowed.repo : params.repo;

  if (owner !== allowed.owner || repo !== allowed.repo) {
    return `Target repository ${owner}/${repo} is not whitelisted.`;
  }

  return undefined;
}

function getDiffFiles(diff: unknown): readonly unknown[] {
  if (!isRecord(diff)) {
    throw new Error("GitHub returned an invalid PR diff.");
  }

  const files: unknown = diff.files;
  if (!Array.isArray(files)) {
    throw new Error("GitHub returned an invalid PR changed-files list.");
  }

  return files;
}

function getChangedFilePath(file: unknown): string | undefined {
  if (typeof file === "string") {
    return file;
  }

  if (!isRecord(file)) {
    return undefined;
  }

  // Accept GitHub's filename field and normalized githubClient path fields.
  if (typeof file.filename === "string") {
    return file.filename;
  }

  return typeof file.path === "string" ? file.path : undefined;
}

function getHeadSha(diff: unknown): string {
  if (!isRecord(diff) || !isNonEmptyString(diff.head_sha)) {
    throw new Error("GitHub returned a PR diff without a valid head SHA.");
  }

  return diff.head_sha;
}

function hasDuplicate(
  currentSession: ExecutorSession,
  key: string,
): boolean {
  return (
    currentSession.postedCommentKeys.has(key) ||
    currentSession.pendingCommentKeys.has(key)
  );
}

function checkSession(
  currentSession: ExecutorSession,
): ToolExecuteResponse | undefined {
  if (currentSession !== session) {
    return rejected("Executor session changed before the operation could run.");
  }

  if (currentSession.writeCount >= MAX_WRITE_ACTIONS_PER_SESSION) {
    return rejected(ACTION_CAP_REASON);
  }

  return undefined;
}

export async function safePostReviewComment(
  params: ReviewCommentParams,
): Promise<ToolExecuteResponse> {
  const currentSession = session;

  try {
    const initialRejection = checkSession(currentSession);
    if (initialRejection) {
      return initialRejection;
    }

    if (!params || typeof params !== "object") {
      return rejected("Review comment parameters must be an object.");
    }

    const pullNumberError = validatePullNumber(params.pull_number);
    if (pullNumberError) {
      return rejected(pullNumberError);
    }

    if (!isNonEmptyString(params.path)) {
      return rejected("path must be a non-empty string.");
    }

    if (!isPositiveSafeInteger(params.line)) {
      return rejected("line must be a positive safe integer.");
    }

    if (!isNonEmptyString(params.body)) {
      return rejected("body must be a non-empty string.");
    }

    const target = getRepoTarget();
    const targetError = validateTarget(params, target);
    if (targetError) {
      return rejected(targetError);
    }

    // Snapshot caller-owned values before awaiting external work.
    const { owner, repo } = target;
    const pullNumber = params.pull_number;
    const path = params.path;
    const line = params.line;
    const body = params.body.trim();
    const key = `${pullNumber}:${path}:${line}:${body}`;
    const liveWrites = process.env.CODECAST_LIVE_WRITES === "true";

    if (hasDuplicate(currentSession, key)) {
      return rejected(DUPLICATE_REASON);
    }

    const prDiff: unknown = await getPrDiff(pullNumber);

    // Another operation may have consumed capacity or posted this comment
    // while the diff request was pending.
    const subsequentRejection = checkSession(currentSession);
    if (subsequentRejection) {
      return subsequentRejection;
    }

    if (hasDuplicate(currentSession, key)) {
      return rejected(DUPLICATE_REASON);
    }

    if (!getDiffFiles(prDiff).some((file) => getChangedFilePath(file) === path)) {
      return rejected(
        `File "${path}" does not exist in PR #${pullNumber} diff.`,
      );
    }

    if (!liveWrites) {
      currentSession.writeCount += 1;
      currentSession.postedCommentKeys.add(key);
      return { status: "dry_run", reason: DRY_RUN_REASON };
    }

    const headSha = getHeadSha(prDiff);
    const octokit = getOctokit();

    // Reserve both capacity and the key synchronously before issuing a write.
    // Failed write attempts consume capacity, but permit an explicit retry.
    currentSession.writeCount += 1;
    currentSession.pendingCommentKeys.add(key);

    try {
      const response = await octokit.rest.pulls.createReviewComment({
        owner,
        repo,
        pull_number: pullNumber,
        body: `${COMMENT_SIGNATURE_PREFIX}${body}`,
        commit_id: headSha,
        path,
        line,
        side: "RIGHT",
      });

      currentSession.postedCommentKeys.add(key);

      return {
        status: "success",
        github_url: response.data.html_url,
      };
    } finally {
      currentSession.pendingCommentKeys.delete(key);
    }
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function safeSubmitReview(
  params: SubmitReviewParams,
): Promise<ToolExecuteResponse> {
  const currentSession = session;

  try {
    const initialRejection = checkSession(currentSession);
    if (initialRejection) {
      return initialRejection;
    }

    if (!params || typeof params !== "object") {
      return rejected("Review parameters must be an object.");
    }

    const pullNumberError = validatePullNumber(params.pull_number);
    if (pullNumberError) {
      return rejected(pullNumberError);
    }

    if (
      params.event !== "COMMENT" &&
      params.event !== "APPROVE" &&
      params.event !== "REQUEST_CHANGES"
    ) {
      return rejected(
        'event must be "COMMENT", "APPROVE", or "REQUEST_CHANGES".',
      );
    }

    if (!isNonEmptyString(params.body)) {
      return rejected("body must be a non-empty string.");
    }

    const target = getRepoTarget();
    const targetError = validateTarget(params, target);
    if (targetError) {
      return rejected(targetError);
    }

    const { owner, repo } = target;
    const pullNumber = params.pull_number;
    const event = params.event;
    const body = `${COMMENT_SIGNATURE_PREFIX}${params.body.trim()}`;

    if (process.env.CODECAST_LIVE_WRITES !== "true") {
      currentSession.writeCount += 1;
      return { status: "dry_run", reason: DRY_RUN_REASON };
    }

    const octokit = getOctokit();

    // Count the attempt before awaiting GitHub, including failed requests.
    currentSession.writeCount += 1;

    const response = await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      event,
      body,
    });

    return {
      status: "success",
      github_url: response.data.html_url,
    };
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export function resetExecutorSession(): void {
  // In-flight requests retain their old state and cannot mutate the new session.
  session = createSession();
}

export function getExecutorStats(): {
  writeCount: number;
  duplicateCount: number;
} {
  return {
    writeCount: session.writeCount,
    // Number of successful or simulated comment keys retained for deduplication.
    duplicateCount: session.postedCommentKeys.size,
  };
}