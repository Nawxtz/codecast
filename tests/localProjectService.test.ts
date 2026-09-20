import { describe, it, expect } from "vitest";
import path from "path";
import {
  isSafeRelativePath,
  scanLocalFiles,
  readLocalFileContent,
  getLocalGitDiff,
} from "../lib/localProjectService";

describe("localProjectService", () => {
  const projectRoot = process.cwd();

  describe("isSafeRelativePath", () => {
    it("allows valid relative paths within the base directory", () => {
      expect(isSafeRelativePath(projectRoot, "package.json")).toBe(true);
      expect(isSafeRelativePath(projectRoot, "lib/types.ts")).toBe(true);
      expect(isSafeRelativePath(projectRoot, "src/components/DiffViewer.tsx")).toBe(true);
    });

    it("rejects path traversal attempts with ../", () => {
      expect(isSafeRelativePath(projectRoot, "../../../etc/passwd")).toBe(false);
      expect(isSafeRelativePath(projectRoot, "..")).toBe(false);
      expect(isSafeRelativePath(projectRoot, "lib/../../..")).toBe(false);
    });
  });

  describe("scanLocalFiles", () => {
    it("scans current project and ignores node_modules and .git", async () => {
      const files = await scanLocalFiles(projectRoot, 100);
      expect(files.length).toBeGreaterThan(0);
      const paths = files.map((f) => f.path);
      expect(paths.some((p) => p.includes("package.json"))).toBe(true);
      expect(paths.some((p) => p.startsWith("node_modules/"))).toBe(false);
      expect(paths.some((p) => p.startsWith(".git/"))).toBe(false);
    });
  });

  describe("readLocalFileContent", () => {
    it("reads valid local file content", async () => {
      const content = await readLocalFileContent(projectRoot, "package.json");
      expect(content).toContain('"name": "codecast"');
    });

    it("throws on path traversal attempt", async () => {
      await expect(
        readLocalFileContent(projectRoot, "../../../etc/passwd"),
      ).rejects.toThrow("Access denied");
    });
  });

  describe("getLocalGitDiff", () => {
    it("detects uncommitted changes or returns empty array on clean repo", async () => {
      const diffs = await getLocalGitDiff(projectRoot);
      expect(Array.isArray(diffs)).toBe(true);
    });
  });
});
