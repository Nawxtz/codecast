import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "../app/api/tools/execute/route";
import { getFileContext, getPrDiff } from "../lib/githubClient";
import {
  safePostReviewComment,
  safeSubmitReview,
} from "../lib/safeGithubExecutor";

vi.mock("../lib/githubClient", () => ({
  getPrDiff: vi.fn(),
  getFileContext: vi.fn(),
}));

vi.mock("../lib/safeGithubExecutor", () => ({
  safePostReviewComment: vi.fn(),
  safeSubmitReview: vi.fn(),
}));

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/tools/execute", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const getPrDiffMock = vi.mocked(getPrDiff);
const getFileContextMock = vi.mocked(getFileContext);
const safePostReviewCommentMock = vi.mocked(safePostReviewComment);
const safeSubmitReviewMock = vi.mocked(safeSubmitReview);

const repository = {
  owner: "example-owner",
  repo: "example-repository",
};

function expectNoToolCalls(): void {
  expect(getPrDiffMock).not.toHaveBeenCalled();
  expect(getFileContextMock).not.toHaveBeenCalled();
  expect(safePostReviewCommentMock).not.toHaveBeenCalled();
  expect(safeSubmitReviewMock).not.toHaveBeenCalled();
}

describe("POST /api/tools/execute", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects invalid JSON with 400", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/tools/execute",
      {
        method: "POST",
        body: '{"tool":',
        headers: { "Content-Type": "application/json" },
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
    expectNoToolCalls();
  });

  it("rejects a missing body with 400", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/tools/execute",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
    expectNoToolCalls();
  });

  it("rejects an unknown tool with 400", async () => {
    const response = await POST(
      createRequest({
        tool: "unknown_tool",
        args: {},
      }),
    );

    expect(response.status).toBe(400);
    expectNoToolCalls();
  });

  describe("get_pr_diff", () => {
    it.each([
      { label: "missing", value: undefined },
      { label: "null", value: null },
      { label: "zero", value: 0 },
      { label: "negative", value: -1 },
      { label: "fractional", value: 1.5 },
      { label: "nonnumeric", value: "not-a-number" },
    ])("rejects a $label pull_number with 400", async ({ value }) => {
      const response = await POST(
        createRequest({
          tool: "get_pr_diff",
          args: {
            ...repository,
            pull_number: value,
          },
        }),
      );

      expect(response.status).toBe(400);
      expectNoToolCalls();
    });

    it("calls getPrDiff and returns 200 with the result", async () => {
      const result: Awaited<ReturnType<typeof getPrDiff>> = {
        pull_number: 42,
        head_sha: "head123",
        files: [
          {
            filename: "src/example.ts",
            status: "modified",
            additions: 1,
            deletions: 0,
            patch: "@@ -0,0 +1 @@",
          },
        ],
      };

      getPrDiffMock.mockResolvedValueOnce(result);

      const response = await POST(
        createRequest({
          tool: "get_pr_diff",
          args: {
            ...repository,
            pull_number: 42,
          },
        }),
      );
      const body: unknown = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ status: "success", result });
      expect(getPrDiffMock).toHaveBeenCalledWith(
        42,
        repository.owner,
        repository.repo,
      );
      expect(getFileContextMock).not.toHaveBeenCalled();
      expect(safePostReviewCommentMock).not.toHaveBeenCalled();
      expect(safeSubmitReviewMock).not.toHaveBeenCalled();
    });
  });

  describe("explain_context", () => {
    it("rejects an empty path with 400", async () => {
      const response = await POST(
        createRequest({
          tool: "explain_context",
          args: {
            ...repository,
            path: "",
            ref: "main",
          },
        }),
      );

      expect(response.status).toBe(400);
      expectNoToolCalls();
    });

    it("calls getFileContext and returns 200 with the result", async () => {
      const result = {
        path: "src/example.ts",
        content: "export const answer = 42;\n",
      } as Awaited<ReturnType<typeof getFileContext>>;

      getFileContextMock.mockResolvedValueOnce(result);

      const response = await POST(
        createRequest({
          tool: "explain_context",
          args: {
            ...repository,
            path: "src/example.ts",
            ref: "main",
          },
        }),
      );
      const body: unknown = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ status: "success", result });
      expect(getFileContextMock).toHaveBeenCalledWith(
        "src/example.ts",
        expect.objectContaining({
          owner: repository.owner,
          repo: repository.repo,
          ref: "main",
        }),
      );
      expect(getPrDiffMock).not.toHaveBeenCalled();
      expect(safePostReviewCommentMock).not.toHaveBeenCalled();
      expect(safeSubmitReviewMock).not.toHaveBeenCalled();
    });
  });

  describe("post_review_comment", () => {
    it("calls safePostReviewComment and returns the executor result", async () => {
      const args = {
        ...repository,
        pull_number: 42,
        commit_id: "0123456789abcdef0123456789abcdef01234567",
        path: "src/example.ts",
        line: 1,
        side: "RIGHT",
        body: "Please add a test for this branch.",
      };

      const result = {
        status: "success",
        github_url: "https://github.com/owner/repo/pull/42#comment-1",
      } as Awaited<ReturnType<typeof safePostReviewComment>>;

      safePostReviewCommentMock.mockResolvedValueOnce(result);

      const response = await POST(
        createRequest({
          tool: "post_review_comment",
          args,
        }),
      );
      const body: unknown = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual(result);
      expect(safePostReviewCommentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          pull_number: 42,
          path: "src/example.ts",
          line: 1,
        }),
      );
      expect(getPrDiffMock).not.toHaveBeenCalled();
      expect(getFileContextMock).not.toHaveBeenCalled();
      expect(safeSubmitReviewMock).not.toHaveBeenCalled();
    });
  });

  describe("submit_review", () => {
    it("calls safeSubmitReview and returns the executor result", async () => {
      const args = {
        ...repository,
        pull_number: 42,
        event: "COMMENT",
        body: "Reviewed the proposed changes.",
      };

      const result = {
        status: "success",
        github_url: "https://github.com/owner/repo/pull/42#review-1",
      } as Awaited<ReturnType<typeof safeSubmitReview>>;

      safeSubmitReviewMock.mockResolvedValueOnce(result);

      const response = await POST(
        createRequest({
          tool: "submit_review",
          args,
        }),
      );
      const body: unknown = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual(result);
      expect(safeSubmitReviewMock).toHaveBeenCalledWith(
        expect.objectContaining({
          pull_number: 42,
          event: "COMMENT",
        }),
      );
      expect(getPrDiffMock).not.toHaveBeenCalled();
      expect(getFileContextMock).not.toHaveBeenCalled();
      expect(safePostReviewCommentMock).not.toHaveBeenCalled();
    });
  });

  describe("exception handling", () => {
    it("returns 500 when getPrDiff throws", async () => {
      getPrDiffMock.mockRejectedValueOnce(new Error("GitHub request failed"));

      const response = await POST(
        createRequest({
          tool: "get_pr_diff",
          args: { ...repository, pull_number: 42 },
        }),
      );

      expect(response.status).toBe(500);
      expect(getPrDiffMock).toHaveBeenCalledOnce();
    });

    it("returns 500 when getFileContext throws", async () => {
      getFileContextMock.mockRejectedValueOnce(
        new Error("GitHub request failed"),
      );

      const response = await POST(
        createRequest({
          tool: "explain_context",
          args: {
            ...repository,
            path: "src/example.ts",
            ref: "main",
          },
        }),
      );

      expect(response.status).toBe(500);
      expect(getFileContextMock).toHaveBeenCalledOnce();
    });

    it("returns 500 when safePostReviewComment throws", async () => {
      safePostReviewCommentMock.mockRejectedValueOnce(
        new Error("Executor failed"),
      );

      const response = await POST(
        createRequest({
          tool: "post_review_comment",
          args: {
            ...repository,
            pull_number: 42,
            commit_id: "0123456789abcdef0123456789abcdef01234567",
            path: "src/example.ts",
            line: 1,
            side: "RIGHT",
            body: "Please add a test.",
          },
        }),
      );

      expect(response.status).toBe(500);
      expect(safePostReviewCommentMock).toHaveBeenCalledOnce();
    });

    it("returns 500 when safeSubmitReview throws", async () => {
      safeSubmitReviewMock.mockRejectedValueOnce(
        new Error("Executor failed"),
      );

      const response = await POST(
        createRequest({
          tool: "submit_review",
          args: {
            ...repository,
            pull_number: 42,
            event: "COMMENT",
            body: "Reviewed the proposed changes.",
          },
        }),
      );

      expect(response.status).toBe(500);
      expect(safeSubmitReviewMock).toHaveBeenCalledOnce();
    });
  });
});