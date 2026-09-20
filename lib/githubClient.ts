import { Buffer } from "node:buffer";
import { Octokit } from "@octokit/rest";
import type { PrDiffResult, PrDiffFile, FileContextResult } from "./types";

let cachedOctokit: Octokit | undefined;

export function _resetOctokitInstance(): void {
  cachedOctokit = undefined;
}

export function getOctokit(): Octokit {
  if (cachedOctokit) {
    return cachedOctokit;
  }

  const token = (process.env.GITHUB_PAT || process.env.GITHUB_TOKEN)?.trim();

  if (!token) {
    throw new Error("Missing required environment variable: GITHUB_PAT (or GITHUB_TOKEN).");
  }

  cachedOctokit = new Octokit({
    auth: token,
    userAgent: "CodeCast",
    request: {
      timeout: 30_000,
    },
  });

  return cachedOctokit;
}

function resolveRepoTarget(
  targetOwner?: string,
  targetRepo?: string,
): { owner: string; repo: string } {
  const owner = (targetOwner ?? process.env.CODECAST_REPO_OWNER)?.trim();
  const repo = (targetRepo ?? process.env.CODECAST_REPO_NAME)?.trim();

  if (!owner) {
    throw new Error(
      "Missing GitHub repository owner. Provide an owner or set CODECAST_REPO_OWNER.",
    );
  }

  if (!repo) {
    throw new Error(
      "Missing GitHub repository name. Provide a repo or set CODECAST_REPO_NAME.",
    );
  }

  return { owner, repo };
}

export function getRepoTarget(): { owner: string; repo: string } {
  return resolveRepoTarget();
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

export async function getPrDiff(
  pull_number: number,
  targetOwner?: string,
  targetRepo?: string,
): Promise<PrDiffResult> {
  assertPositiveInteger(pull_number, "pull_number");

  const { owner, repo } = resolveRepoTarget(targetOwner, targetRepo);
  const octokit = getOctokit();

  const [pullResponse, githubFiles] = await Promise.all([
    octokit.rest.pulls.get({
      owner,
      repo,
      pull_number,
    }),
    octokit.paginate(octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number,
      per_page: 100,
    }),
  ]);

  // GitHub's PR files endpoint returns at most 3,000 files. Do not silently
  // present a capped response as a complete diff.
  if (githubFiles.length < pullResponse.data.changed_files) {
    throw new Error(
      `Incomplete diff for ${owner}/${repo}#${pull_number}: ` +
        `GitHub returned ${githubFiles.length} of ` +
        `${pullResponse.data.changed_files} changed files.`,
    );
  }

  const files: PrDiffFile[] = githubFiles.map((file) => ({
    filename: file.filename,
    status: file.status as PrDiffFile["status"],
    additions: file.additions ?? 0,
    deletions: file.deletions ?? 0,
    patch: file.patch ?? "",
  }));

  const result: PrDiffResult = {
    pull_number,
    head_sha: pullResponse.data.head.sha,
    files,
  };

  return result;
}

export async function getFileContext(
  path: string,
  options: {
    start_line?: number;
    end_line?: number;
    ref?: string;
    owner?: string;
    repo?: string;
  } = {},
): Promise<FileContextResult> {
  if (!path.trim()) {
    throw new Error("A non-empty repository file path is required.");
  }

  const requestedStart = options.start_line ?? 1;

  assertPositiveInteger(requestedStart, "start_line");

  if (options.end_line !== undefined) {
    assertPositiveInteger(options.end_line, "end_line");

    if (options.end_line < requestedStart) {
      throw new RangeError(
        "end_line must be greater than or equal to start_line.",
      );
    }
  }

  if (options.ref !== undefined && !options.ref.trim()) {
    throw new Error("ref must be non-empty when provided.");
  }

  const { owner, repo } = resolveRepoTarget(options.owner, options.repo);
  const octokit = getOctokit();

  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
    ...(options.ref !== undefined ? { ref: options.ref } : {}),
  });

  if (Array.isArray(data) || data.type !== "file") {
    throw new Error(
      `Expected a file at "${path}" in ${owner}/${repo}, but GitHub returned a non-file resource.`,
    );
  }

  if (data.encoding !== "base64") {
    throw new Error(
      `Cannot read "${path}" in ${owner}/${repo}: GitHub returned ` +
        `encoding "${data.encoding}" instead of base64. ` +
        "The file may exceed the repository contents API's inline content limit.",
    );
  }

  const decodedContent = Buffer.from(data.content, "base64").toString("utf8");

  // A terminal newline terminates the final line; it does not create another
  // line. An empty file has zero lines.
  const lines = decodedContent === "" ? [] : decodedContent.split(/\r?\n/);

  if (decodedContent.endsWith("\n")) {
    lines.pop();
  }

  const total_lines = lines.length;

  if (requestedStart > Math.max(total_lines, 1)) {
    throw new RangeError(
      `start_line (${requestedStart}) exceeds the file's line count (${total_lines}).`,
    );
  }

  // Empty files use the empty interval [1, 0].
  const start_line = requestedStart;
  const end_line = Math.min(options.end_line ?? total_lines, total_lines);
  const content = lines.slice(start_line - 1, end_line).join("\n");

  const result: FileContextResult = {
    path,
    start_line,
    end_line,
    total_lines,
    content,
  };

  return result;
}

export interface RepoTreeItem {
  path: string;
  size?: number;
  sha?: string;
  type?: string;
}

export async function getRepoTree(
  branch = "main",
  targetOwner?: string,
  targetRepo?: string,
): Promise<{ owner: string; repo: string; branch: string; files: RepoTreeItem[] }> {
  const { owner, repo } = resolveRepoTarget(targetOwner, targetRepo);
  const octokit = getOctokit();

  const { data } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: "1",
  });

  const BINARY_EXTS = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".svg",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".mp3",
    ".mp4",
    ".db",
    ".sqlite",
  ]);

  const files = (data.tree || [])
    .filter((item) => {
      if (item.type !== "blob" || !item.path) return false;
      const lower = item.path.toLowerCase();
      if (lower.startsWith("node_modules/") || lower.startsWith(".git/")) return false;
      const ext = lower.slice(lower.lastIndexOf("."));
      if (BINARY_EXTS.has(ext)) return false;
      return true;
    })
    .map((item) => ({
      path: item.path as string,
      size: item.size,
      sha: item.sha,
      type: item.type,
    }));

  return { owner, repo, branch, files };
}

