import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateReviewDigest } from "../lib/digestService";

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: vi.fn(function MockOpenAI() {
    return {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };
  }),
}));

describe("generateReviewDigest", () => {
  const reviewInput = {
    transcript: [
      { role: "user" as const, text: "Can you review PR 1?", timestamp: 1000 },
      { role: "assistant" as const, text: "Sure, let me check.", timestamp: 2000 },
    ],
    toolCalls: [],
    postedComments: [],
    pull_number: 1,
  };

  beforeEach(() => {
    mockCreate.mockReset();
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("generates a digest when OpenAI returns a structured response", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              markdownDigest: "### Review Summary\n\nLooks good overall.",
              spokenSummary: "The review is complete with no major issues.",
            }),
          },
        },
      ],
    });

    const result = await generateReviewDigest(reviewInput);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.markdownDigest).toContain("### Review Summary");
    expect(result.markdownDigest).toContain("Looks good overall.");
    expect(result.spokenSummary).toBe(
      "The review is complete with no major issues.",
    );
  });

  it("returns a fallback markdown digest when OpenAI throws", async () => {
    mockCreate.mockRejectedValueOnce(new Error("API rate limit"));

    const result = await generateReviewDigest(reviewInput);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty("markdownDigest", expect.any(String));
    expect(result.markdownDigest.trim().length).toBeGreaterThan(0);
  });
});