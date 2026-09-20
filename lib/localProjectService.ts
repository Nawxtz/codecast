import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import type { LocalProjectFile, PrDiffFile } from "./types";

const execAsync = promisify(exec);

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".turbo",
  ".cache",
  ".vscode",
  ".idea",
  "coverage",
  "__pycache__",
]);

const BINARY_EXTENSIONS = new Set([
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

export function isSafeRelativePath(baseDir: string, relativePath: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, relativePath);
  return (
    resolvedTarget.startsWith(resolvedBase + path.sep) ||
    resolvedTarget === resolvedBase
  );
}

export async function scanLocalFiles(
  dirPath: string,
  maxFiles = 200,
): Promise<LocalProjectFile[]> {
  const resolved = path.resolve(dirPath);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${dirPath}`);
  }

  const results: LocalProjectFile[] = [];

  async function walk(currentDir: string, relativePrefix = ""): Promise<void> {
    if (results.length >= maxFiles) return;

    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => {
      if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
      return a.isDirectory() ? -1 : 1;
    });

    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      if (entry.name.startsWith(".") && entry.name !== ".env.example") {
        if (entry.isDirectory()) continue;
      }
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        const nextDir = path.join(currentDir, entry.name);
        const nextRel = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
        await walk(nextDir, nextRel);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;

        const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
        try {
          const fileStat = await fs.stat(path.join(currentDir, entry.name));
          if (fileStat.size > 500 * 1024) continue;
          results.push({
            path: relPath,
            size: fileStat.size,
            status: "unchanged",
          });
        } catch {
          // ignore
        }
      }
    }
  }

  await walk(resolved);
  return results;
}

export async function readLocalFileContent(
  dirPath: string,
  relativePath: string,
): Promise<string> {
  if (!isSafeRelativePath(dirPath, relativePath)) {
    throw new Error(`Access denied: Invalid path traversal attempt.`);
  }

  const fullPath = path.resolve(dirPath, relativePath);
  const stat = await fs.stat(fullPath);
  if (!stat.isFile()) {
    throw new Error(`File not found or is a directory: ${relativePath}`);
  }
  if (stat.size > 1024 * 1024) {
    throw new Error(`File is too large (> 1MB).`);
  }

  return await fs.readFile(fullPath, "utf-8");
}

function parseGitNumstat(raw: string): Map<string, { additions: number; deletions: number }> {
  const map = new Map<string, { additions: number; deletions: number }>();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 3) {
      const adds = parts[0] === "-" ? 0 : parseInt(parts[0], 10) || 0;
      const dels = parts[1] === "-" ? 0 : parseInt(parts[1], 10) || 0;
      const file = parts.slice(2).join(" ");
      map.set(file, { additions: adds, deletions: dels });
    }
  }
  return map;
}

function splitGitPatches(rawDiff: string): Map<string, string> {
  const patches = new Map<string, string>();
  const diffChunks = rawDiff.split(/^diff --git /m);

  for (const chunk of diffChunks) {
    if (!chunk.trim()) continue;
    const firstLine = chunk.split("\n")[0];
    const match = /a\/(.+?)\s+b\/(.+?)$/.exec(firstLine);
    if (match) {
      const filename = match[2];
      const hunkIndex = chunk.indexOf("@@");
      const patchContent = hunkIndex !== -1 ? chunk.slice(hunkIndex) : chunk;
      patches.set(filename, patchContent);
    }
  }
  return patches;
}

export async function getLocalGitDiff(dirPath: string): Promise<PrDiffFile[]> {
  const resolved = path.resolve(dirPath);

  try {
    await execAsync("git rev-parse --is-inside-work-tree", { cwd: resolved });

    const { stdout: statusOut } = await execAsync("git status --porcelain -uall", {
      cwd: resolved,
      maxBuffer: 1024 * 1024,
    });

    if (!statusOut.trim()) {
      return [];
    }

    let numstatMap = new Map<string, { additions: number; deletions: number }>();
    try {
      const { stdout: numstatOut } = await execAsync("git diff HEAD --numstat", {
        cwd: resolved,
      });
      numstatMap = parseGitNumstat(numstatOut);
    } catch {
      try {
        const { stdout: numstatOut } = await execAsync("git diff --numstat", {
          cwd: resolved,
        });
        numstatMap = parseGitNumstat(numstatOut);
      } catch {}
    }

    let patchMap = new Map<string, string>();
    try {
      const { stdout: diffOut } = await execAsync("git diff HEAD", {
        cwd: resolved,
        maxBuffer: 2 * 1024 * 1024,
      });
      patchMap = splitGitPatches(diffOut);
    } catch {
      try {
        const { stdout: diffOut } = await execAsync("git diff", {
          cwd: resolved,
          maxBuffer: 2 * 1024 * 1024,
        });
        patchMap = splitGitPatches(diffOut);
      } catch {}
    }

    const results: PrDiffFile[] = [];
    const lines = statusOut.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;
      const statusCode = line.slice(0, 2);
      const filename = line.slice(3).trim().replace(/^"|"$/g, "");

      let status: PrDiffFile["status"] = "modified";
      if (statusCode.includes("?")) status = "added";
      else if (statusCode.includes("A")) status = "added";
      else if (statusCode.includes("D")) status = "removed";
      else if (statusCode.includes("R")) status = "renamed";

      const stats = numstatMap.get(filename) ?? { additions: 0, deletions: 0 };
      let patch = patchMap.get(filename) ?? "";

      if (status === "added" && !patch) {
        try {
          const content = await readLocalFileContent(resolved, filename);
          const fileLines = content.split("\n");
          stats.additions = fileLines.length;
          patch = `@@ -0,0 +1,${fileLines.length} @@\n` + fileLines.map((l) => `+${l}`).join("\n");
        } catch {}
      }

      results.push({
        filename,
        status,
        additions: stats.additions,
        deletions: stats.deletions,
        patch,
      });
    }

    return results;
  } catch {
    return [];
  }
}
