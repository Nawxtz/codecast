import { Buffer } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const getPull = vi.fn();
  const listFiles = vi.fn();
  const getContent = vi.fn();
  const paginate = vi.fn();

  const octokit = {
    rest: {
      pulls: {
        get: getPull,
        listFiles,
      },
      repos: {
        getContent,
      },
    },
    paginate,
  };

  const Octokit = vi.fn(function MockOctokit() {
    return octokit;
  });

  return {
    Octokit,
    octokit,
    getPull,
    listFiles,
    getContent,
    paginate,
  };
});

vi.mock("@octokit/rest", () => ({
  Octokit: mocks.Octokit,
}));

type GitHubClient = typeof import("../lib/githubClient");

const OWNER = "codecast-owner";
const REPO = "codecast-repo";
const TOKEN = "offline-test-token";
const HEAD_SHA = "0123456789abcdef0123456789abcdef01234567";
const FILE_SHA = "abcdef0123456789abcdef0123456789abcdef01";
const FILE_PATH = "src/example.ts";

const SOURCE_LINES = [
  "export const first = 1;",
  "export const second = 2;",
  "export const third = 3;",
  "export const greeting = 'Hello, 世界 👋';",
  "export const last = 5;",
];
const SOURCE = SOURCE_LINES.join("\n");

const PULL_FILES = [
  {
    sha: FILE_SHA,
    filename: FILE_PATH,
    status: "modified",
    additions: 2,
    deletions: 1,
    changes: 3,
    patch: "@@ -1 +1,2 @@\n-export const first = 0;\n+export const first = 1;\n+export const second = 2;",
    blob_url: `https://github.com/${OWNER}/${REPO}/blob/${HEAD_SHA}/${FILE_PATH}`,
    raw_url: `https://github.com/${OWNER}/${REPO}/raw/${HEAD_SHA}/${FILE_PATH}`,
    contents_url: `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
  },
  {
    sha: "123456789abcdef0123456789abcdef012345678",
    filename: "README.md",
    status: "added",
    additions: 1,
    deletions: 0,
    changes: 1,
    patch: "@@ -0,0 +1 @@\n+# CodeCast",
    blob_url: `https://github.com/${OWNER}/${REPO}/blob/${HEAD_SHA}/README.md`,
    raw_url: `https://github.com/${OWNER}/${REPO}/raw/${HEAD_SHA}/README.md`,
    contents_url: `https://api.github.com/repos/${OWNER}/${REPO}/contents/README.md`,
  },
];

let client: GitHubClient;

function mockFileContent(content: string): void {
  mocks.getContent.mockResolvedValue({
    data: {
      type: "file",
      name: "example.ts",
      path: FILE_PATH,
      sha: FILE_SHA,
      size: Buffer.byteLength(content, "utf8"),
      encoding: "base64",
      content: Buffer.from(content, "utf8").toString("base64"),
    },
  });
}

function expectNoApiCalls(): void {
  expect(mocks.getPull).not.toHaveBeenCalled();
  expect(mocks.listFiles).not.toHaveBeenCalled();
  expect(mocks.paginate).not.toHaveBeenCalled();
  expect(mocks.getContent).not.toHaveBeenCalled();
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();

  vi.stubEnv("GITHUB_PAT", TOKEN);
  vi.stubEnv("CODECAST_REPO_OWNER", OWNER);
  vi.stubEnv("CODECAST_REPO_NAME", REPO);

  mocks.getPull.mockReset();
  mocks.listFiles.mockReset();
  mocks.getContent.mockReset();
  mocks.paginate.mockReset();

  mocks.getPull.mockResolvedValue({
    data: {
      number: 42,
      head: { sha: HEAD_SHA },
      changed_files: PULL_FILES.length,
    },
  });
  mocks.listFiles.mockResolvedValue({
    data: PULL_FILES.map((file) => ({ ...file })),
  });
  mocks.paginate.mockResolvedValue(
    PULL_FILES.map((file) => ({ ...file })),
  );
  mockFileContent(SOURCE);

  client = await import("../lib/githubClient");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getOctokit", () => {
  it("constructs the mocked Octokit client using GITHUB_PAT", () => {
    expect(client.getOctokit()).toBe(mocks.octokit);
    expect(mocks.Octokit).toHaveBeenCalledWith(
      expect.objectContaining({ auth: TOKEN }),
    );
    expectNoApiCalls();
  });

  it("throws when GITHUB_PAT is missing", () => {
    delete process.env.GITHUB_PAT;
    client._resetOctokitInstance();

    expect(() => client.getOctokit()).toThrow();
    expectNoApiCalls();
  });

  it("throws when GITHUB_PAT is empty", () => {
    vi.stubEnv("GITHUB_PAT", "");
    client._resetOctokitInstance();

    expect(() => client.getOctokit()).toThrow();
    expectNoApiCalls();
  });
});

describe("getRepoTarget", () => {
  it("returns the owner and repository from the environment", () => {
    expect(client.getRepoTarget()).toEqual({
      owner: OWNER,
      repo: REPO,
    });
    expectNoApiCalls();
  });

  it.each(["CODECAST_REPO_OWNER", "CODECAST_REPO_NAME"])(
    "throws when %s is missing",
    (variable) => {
      delete process.env[variable];

      expect(() => client.getRepoTarget()).toThrow();
      expectNoApiCalls();
    },
  );

  it.each(["CODECAST_REPO_OWNER", "CODECAST_REPO_NAME"])(
    "throws when %s is empty",
    (variable) => {
      vi.stubEnv(variable, "");

      expect(() => client.getRepoTarget()).toThrow();
      expectNoApiCalls();
    },
  );
});

describe("getPrDiff", () => {
  it.each([
    0,
    -1,
    -42,
    0.5,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid pull_number %s before making API calls", async (number) => {
    await expect(
      Promise.resolve().then(() => client.getPrDiff(number)),
    ).rejects.toThrow();

    expectNoApiCalls();
  });

  it("returns mapped files and the pull request head SHA", async () => {
    const result = await client.getPrDiff(42);

    expect(mocks.getPull).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: OWNER,
        repo: REPO,
        pull_number: 42,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        head_sha: HEAD_SHA,
        files: PULL_FILES.map((file) =>
          expect.objectContaining({
            filename: file.filename,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
            patch: file.patch,
          }),
        ),
      }),
    );
    expect(mocks.getContent).not.toHaveBeenCalled();
  });

  it("uses an explicit owner and repository instead of the defaults", async () => {
    const result = await client.getPrDiff(
      17,
      "alternate-owner",
      "alternate-repo",
    );

    expect(mocks.getPull).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "alternate-owner",
        repo: "alternate-repo",
        pull_number: 17,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        head_sha: HEAD_SHA,
        files: expect.any(Array),
      }),
    );
  });

  it("returns an empty file list when the pull request has no changed files", async () => {
    mocks.getPull.mockResolvedValue({
      data: {
        number: 42,
        head: { sha: HEAD_SHA },
        changed_files: 0,
      },
    });
    mocks.listFiles.mockResolvedValue({ data: [] });
    mocks.paginate.mockResolvedValue([]);

    await expect(client.getPrDiff(42)).resolves.toEqual(
      expect.objectContaining({
        head_sha: HEAD_SHA,
        files: [],
      }),
    );
  });
});

describe("getFileContext", () => {
  it("rejects an empty path before making API calls", async () => {
    await expect(
      Promise.resolve().then(() => client.getFileContext("")),
    ).rejects.toThrow();

    expectNoApiCalls();
  });

  it("rejects a range whose end_line is less than start_line", async () => {
    await expect(
      Promise.resolve().then(() =>
        client.getFileContext(FILE_PATH, {
          start_line: 4,
          end_line: 2,
        }),
      ),
    ).rejects.toThrow();

    expectNoApiCalls();
  });

  it("decodes base64 UTF-8 content and reports the full line count", async () => {
    const result = await client.getFileContext(FILE_PATH);

    expect(mocks.getContent).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: OWNER,
        repo: REPO,
        path: FILE_PATH,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        content: SOURCE,
        total_lines: SOURCE_LINES.length,
      }),
    );
    expect(mocks.getPull).not.toHaveBeenCalled();
    expect(mocks.listFiles).not.toHaveBeenCalled();
    expect(mocks.paginate).not.toHaveBeenCalled();
  });

  it("slices a 1-indexed inclusive range without changing total_lines", async () => {
    const result = await client.getFileContext(FILE_PATH, {
      start_line: 2,
      end_line: 4,
    });

    expect(result).toEqual(
      expect.objectContaining({
        content: SOURCE_LINES.slice(1, 4).join("\n"),
        start_line: 2,
        end_line: 4,
        total_lines: SOURCE_LINES.length,
      }),
    );
  });

  it.each([1, SOURCE_LINES.length])(
    "returns only line %s when start_line equals end_line",
    async (line) => {
      const result = await client.getFileContext(FILE_PATH, {
        start_line: line,
        end_line: line,
      });

      expect(result).toEqual(
        expect.objectContaining({
          content: SOURCE_LINES[line - 1],
          start_line: line,
          end_line: line,
          total_lines: SOURCE_LINES.length,
        }),
      );
    },
  );

  it("handles a single-line file without a trailing newline", async () => {
    const content = "export const value = 42;";
    mockFileContent(content);

    const result = await client.getFileContext(FILE_PATH, {
      start_line: 1,
      end_line: 1,
    });

    expect(result).toEqual(
      expect.objectContaining({
        content,
        start_line: 1,
        end_line: 1,
        total_lines: 1,
      }),
    );
  });

  it("preserves blank lines and includes them in the total line count", async () => {
    mockFileContent("first\n\nthird");

    const result = await client.getFileContext(FILE_PATH, {
      start_line: 1,
      end_line: 3,
    });

    expect(result).toEqual(
      expect.objectContaining({
        content: "first\n\nthird",
        start_line: 1,
        end_line: 3,
        total_lines: 3,
      }),
    );
  });
});
