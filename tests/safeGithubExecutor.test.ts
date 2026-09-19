import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOctokit: vi.fn(),
  getRepoTarget: vi.fn(),
  getPrDiff: vi.fn(),
  createReviewComment: vi.fn(),
  createReview: vi.fn(),
}));

vi.mock("../lib/githubClient", () => ({
  getOctokit: mocks.getOctokit,
  getRepoTarget: mocks.getRepoTarget,
  getPrDiff: mocks.getPrDiff,
}));

import {
  COMMENT_SIGNATURE_PREFIX,
  MAX_WRITE_ACTIONS_PER_SESSION,
  getExecutorStats,
  resetExecutorSession,
  safePostReviewComment,
  safeSubmitReview,
} from "../lib/safeGithubExecutor";

const TARGET = {
  owner: "codecast-owner",
  repo: "codecast-repo",
};

const COMMENT_URL =
  "https://github.com/codecast-owner/codecast-repo/pull/1#discussion_r123";
const REVIEW_URL =
  "https://github.com/codecast-owner/codecast-repo/pull/1#pullrequestreview-456";

function validComment() {
  return {
    pull_number: 1,
    path: "src/index.ts",
    line: 1,
    body: "Please consider simplifying this expression.",
  };
}

function validReview() {
  return {
    pull_number: 1,
    body: "The changes look good overall.",
    event: "COMMENT" as const,
  };
}

/**
 * Accept either a thrown validation error or an explicit rejection result,
 * while requiring that neither GitHub write endpoint was called.
 */
async function expectRejected(
  operation: () => Promise<unknown>,
): Promise<void> {
  const commentCalls = mocks.createReviewComment.mock.calls.length;
  const reviewCalls = mocks.createReview.mock.calls.length;

  let result: unknown;
  let threw = false;
  let thrownError: unknown;

  try {
    result = await operation();
  } catch (error: unknown) {
    threw = true;
    thrownError = error;
  }

  expect(mocks.createReviewComment).toHaveBeenCalledTimes(commentCalls);
  expect(mocks.createReview).toHaveBeenCalledTimes(reviewCalls);

  if (threw) {
    expect(thrownError).toBeInstanceOf(Error);
    return;
  }

  expect(result).toEqual(
    expect.objectContaining({
      status: expect.stringMatching(/^(rejected|blocked|denied|error)$/),
    }),
  );
}

describe("safeGithubExecutor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("CODECAST_LIVE_WRITES", "false");

    mocks.getRepoTarget.mockReturnValue({ ...TARGET });
    mocks.getOctokit.mockReturnValue({
      rest: {
        pulls: {
          createReviewComment: mocks.createReviewComment,
          createReview: mocks.createReview,
        },
      },
    });

    mocks.getPrDiff.mockResolvedValue({
      pull_number: 1,
      head_sha: "head123",
      files: [
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 5,
          deletions: 2,
          patch: "@@ ...",
        },
        {
          filename: "README.md",
          status: "modified",
          additions: 1,
          deletions: 0,
          patch: "@@ ...",
        },
      ],
    });

    mocks.createReviewComment.mockResolvedValue({
      data: { id: 123, html_url: COMMENT_URL },
    });
    mocks.createReview.mockResolvedValue({
      data: { id: 456, html_url: REVIEW_URL },
    });

    resetExecutorSession();
  });

  afterEach(() => {
    resetExecutorSession();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("whitelist enforcement", () => {
    it.each([
      {
        field: "owner",
        target: { owner: "other-owner", repo: TARGET.repo },
      },
      {
        field: "repo",
        target: { owner: TARGET.owner, repo: "other-repo" },
      },
    ])("rejects a comment with a mismatched $field", async ({ target }) => {
      vi.stubEnv("CODECAST_LIVE_WRITES", "true");

      await expectRejected(() =>
        safePostReviewComment({
          ...validComment(),
          ...target,
        }),
      );
    });

    it.each([
      {
        field: "owner",
        target: { owner: "other-owner", repo: TARGET.repo },
      },
      {
        field: "repo",
        target: { owner: TARGET.owner, repo: "other-repo" },
      },
    ])("rejects a review with a mismatched $field", async ({ target }) => {
      vi.stubEnv("CODECAST_LIVE_WRITES", "true");

      await expectRejected(() =>
        safeSubmitReview({
          ...validReview(),
          ...target,
        }),
      );
    });
  });

  describe("input validation", () => {
    beforeEach(() => {
      vi.stubEnv("CODECAST_LIVE_WRITES", "true");
    });

    it("rejects a comment on a file absent from the PR diff", async () => {
      await expectRejected(() =>
        safePostReviewComment({
          ...validComment(),
          path: "missing.ts",
        }),
      );

      expect(mocks.getPrDiff).toHaveBeenCalled();
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      "rejects a comment with invalid pull_number %s",
      async (pull_number) => {
        await expectRejected(() =>
          safePostReviewComment({
            ...validComment(),
            pull_number,
          }),
        );
      },
    );

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      "rejects a review with invalid pull_number %s",
      async (pull_number) => {
        await expectRejected(() =>
          safeSubmitReview({
            ...validReview(),
            pull_number,
          }),
        );
      },
    );

    it.each([0, -1])("rejects comment line %s", async (line) => {
      await expectRejected(() =>
        safePostReviewComment({
          ...validComment(),
          line,
        }),
      );
    });

    it("rejects an empty comment body", async () => {
      await expectRejected(() =>
        safePostReviewComment({
          ...validComment(),
          body: "",
        }),
      );
    });

    it("rejects an empty review body", async () => {
      await expectRejected(() =>
        safeSubmitReview({
          ...validReview(),
          body: "",
        }),
      );
    });
  });

  describe("duplicate prevention", () => {
    it("rejects the second identical comment", async () => {
      vi.stubEnv("CODECAST_LIVE_WRITES", "true");

      const first = await safePostReviewComment(validComment());

      expect(first).toEqual(
        expect.objectContaining({
          status: "success",
          github_url: COMMENT_URL,
        }),
      );

      await expectRejected(() => safePostReviewComment(validComment()));

      expect(mocks.createReviewComment).toHaveBeenCalledTimes(1);
      expect(mocks.createReview).not.toHaveBeenCalled();
    });

    it("allows the same comment again after resetting the session", async () => {
      vi.stubEnv("CODECAST_LIVE_WRITES", "true");

      expect(await safePostReviewComment(validComment())).toEqual(
        expect.objectContaining({ status: "success" }),
      );

      resetExecutorSession();

      expect(await safePostReviewComment(validComment())).toEqual(
        expect.objectContaining({ status: "success" }),
      );
      expect(mocks.createReviewComment).toHaveBeenCalledTimes(2);
    });
  });

  describe("action cap enforcement", () => {
    it.each(["comment", "review"] as const)(
      "rejects a ninth write made through the %s endpoint",
      async (endpoint) => {
        vi.stubEnv("CODECAST_LIVE_WRITES", "true");

        expect(MAX_WRITE_ACTIONS_PER_SESSION).toBe(8);

        for (let index = 0; index < MAX_WRITE_ACTIONS_PER_SESSION; index += 1) {
          const result =
            index % 2 === 0
              ? await safePostReviewComment({
                  ...validComment(),
                  line: index + 1,
                  body: `Unique comment ${index + 1}.`,
                })
              : await safeSubmitReview({
                  ...validReview(),
                  body: `Unique review ${index + 1}.`,
                });

          expect(result).toEqual(
            expect.objectContaining({ status: "success" }),
          );
        }

        expect(
          mocks.createReviewComment.mock.calls.length +
            mocks.createReview.mock.calls.length,
        ).toBe(MAX_WRITE_ACTIONS_PER_SESSION);

        if (endpoint === "comment") {
          await expectRejected(() =>
            safePostReviewComment({
              ...validComment(),
              path: "README.md",
              body: "This ninth write must be rejected.",
            }),
          );
        } else {
          await expectRejected(() =>
            safeSubmitReview({
              ...validReview(),
              body: "This ninth write must be rejected.",
            }),
          );
        }
      },
    );
  });

  describe("dry-run mode", () => {
    it.each(["false", "", "TRUE", "1"])(
      "does not write when CODECAST_LIVE_WRITES is %j",
      async (value) => {
        vi.stubEnv("CODECAST_LIVE_WRITES", value);

        const comment = await safePostReviewComment(validComment());
        const review = await safeSubmitReview(validReview());

        expect(comment).toEqual(
          expect.objectContaining({ status: "dry_run" }),
        );
        expect(review).toEqual(
          expect.objectContaining({ status: "dry_run" }),
        );
        expect(mocks.createReviewComment).not.toHaveBeenCalled();
        expect(mocks.createReview).not.toHaveBeenCalled();
      },
    );

    it("does not write when CODECAST_LIVE_WRITES is unset", async () => {
      delete process.env.CODECAST_LIVE_WRITES;

      expect(await safePostReviewComment(validComment())).toEqual(
        expect.objectContaining({ status: "dry_run" }),
      );
      expect(await safeSubmitReview(validReview())).toEqual(
        expect.objectContaining({ status: "dry_run" }),
      );
      expect(mocks.createReviewComment).not.toHaveBeenCalled();
      expect(mocks.createReview).not.toHaveBeenCalled();
    });
  });

  describe("live-write mode", () => {
    beforeEach(() => {
      vi.stubEnv("CODECAST_LIVE_WRITES", "true");
    });

    it("posts a signed comment and returns its GitHub URL", async () => {
      const input = validComment();
      const result = await safePostReviewComment({
        ...input,
        ...TARGET,
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "success",
          github_url: COMMENT_URL,
        }),
      );
      expect(mocks.getOctokit).toHaveBeenCalled();
      expect(mocks.createReviewComment).toHaveBeenCalledTimes(1);
      expect(mocks.createReviewComment).toHaveBeenCalledWith(
        expect.objectContaining({
          ...TARGET,
          pull_number: input.pull_number,
          commit_id: "head123",
          path: input.path,
          line: input.line,
          body: expect.stringMatching(
            new RegExp(`^${escapeRegExp(COMMENT_SIGNATURE_PREFIX)}`),
          ),
        }),
      );
      expect(mocks.createReviewComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining(input.body),
        }),
      );
      expect(mocks.createReview).not.toHaveBeenCalled();
    });

    it("submits a signed review and returns its GitHub URL", async () => {
      const input = validReview();
      const result = await safeSubmitReview({
        ...input,
        ...TARGET,
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "success",
          github_url: REVIEW_URL,
        }),
      );
      expect(mocks.getOctokit).toHaveBeenCalled();
      expect(mocks.createReview).toHaveBeenCalledTimes(1);
      expect(mocks.createReview).toHaveBeenCalledWith(
        expect.objectContaining({
          ...TARGET,
          pull_number: input.pull_number,
          event: input.event,
          body: expect.stringMatching(
            new RegExp(`^${escapeRegExp(COMMENT_SIGNATURE_PREFIX)}`),
          ),
        }),
      );
      expect(mocks.createReview).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining(input.body),
        }),
      );
      expect(mocks.createReviewComment).not.toHaveBeenCalled();
    });
  });

  describe("session statistics", () => {
    it("tracks a write and restores initial statistics on reset", async () => {
      vi.stubEnv("CODECAST_LIVE_WRITES", "true");

      const initialStats = structuredClone(getExecutorStats());

      expect(await safePostReviewComment(validComment())).toEqual(
        expect.objectContaining({ status: "success" }),
      );
      expect(getExecutorStats()).not.toEqual(initialStats);

      resetExecutorSession();

      expect(getExecutorStats()).toEqual(initialStats);
    });
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}