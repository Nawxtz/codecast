import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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

import { POST } from "../app/api/chat/route";

const API_KEY = "test-openrouter-api-key-do-not-expose";

const messages = [{ role: "user", content: "Hello!" }];

function createRequest(body: unknown = { messages }): NextRequest {
  return new NextRequest("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createCompletion(content: string) {
  return {
    id: "chatcmpl_test",
    object: "chat.completion",
    created: 1_700_000_000,
    model: "test-model",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
  };
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
    vi.stubEnv("OPENROUTER_API_KEY", API_KEY);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 500 when OPENROUTER_API_KEY is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid JSON body", async () => {
    const request = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"messages":',
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("handles a simple message using a model and tools and returns content", async () => {
    mockCreate.mockResolvedValueOnce(createCompletion("Hello from OpenRouter!"));

    const response = await POST(createRequest());
    const body: unknown = await response.json();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.any(String),
        tools: expect.any(Array),
      }),
    );
    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        content: "Hello from OpenRouter!",
      }),
    );
  });

  it("handles a tool calling response and returns tool_calls", async () => {
    const toolCalls = [
      {
        id: "call_1",
        type: "function",
        function: {
          name: "get_pr_diff",
          arguments: '{"pull_number":1}',
        },
      },
    ];

    mockCreate.mockResolvedValueOnce({
      ...createCompletion(""),
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: toolCalls,
          },
          finish_reason: "tool_calls",
        },
      ],
    });

    const response = await POST(
      createRequest({
        messages: [
          {
            role: "user",
            content: "Show me the diff for pull request 1.",
          },
        ],
      }),
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(body).toEqual(
      expect.objectContaining({
        tool_calls: toolCalls,
      }),
    );
  });

  it("never exposes OPENROUTER_API_KEY in response JSON", async () => {
    mockCreate.mockResolvedValueOnce(createCompletion("Safe response."));

    const successResponse = await POST(createRequest());
    const successBody: unknown = await successResponse.json();

    expect(successResponse.status).toBe(200);
    expect(JSON.stringify(successBody)).not.toContain(API_KEY);

    mockCreate.mockRejectedValueOnce(
      new Error(`OpenRouter authentication failed for API key ${API_KEY}`),
    );

    const errorResponse = await POST(createRequest());
    const errorBody: unknown = await errorResponse.json();

    expect(errorResponse.status).toBe(500);
    expect(JSON.stringify(errorBody)).not.toContain(API_KEY);
  });

  it("returns 500 when the OpenRouter API throws an error", async () => {
    mockCreate.mockRejectedValueOnce(new Error("OpenRouter API unavailable"));

    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});