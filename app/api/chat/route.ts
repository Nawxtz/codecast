import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { extractLanguageTag, heuristicDetectLanguage } from "@/lib/language/detector";

const CODECAST_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_pr_diff",
      description: "Get the diff of a pull request",
      parameters: {
        type: "object",
        properties: {
          pull_number: { type: "number" },
        },
        required: ["pull_number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "explain_context",
      description: "Explain the context of a code section",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string" },
          line_start: { type: "number" },
          line_end: { type: "number" },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "post_review_comment",
      description: "Post a review comment on a pull request",
      parameters: {
        type: "object",
        properties: {
          body: { type: "string" },
          path: { type: "string" },
          line: { type: "number" },
        },
        required: ["body", "path", "line"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_review",
      description: "Submit a review for a pull request",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string" },
          action: { type: "string", enum: ["approve", "request_changes", "comment"] },
        },
        required: ["summary", "action"],
      },
    },
  },
];

function getLanguageInstruction(language: string): string {
  switch (language) {
    case "th-TH":
      return "The user is using Thai. You MUST reply in authentic, natural Thai for peer developers. Start response with [LANG:th-TH].";
    case "ja-JP":
      return "The user is using Japanese. You MUST reply in authentic, natural Japanese for peer developers. Start response with [LANG:ja-JP].";
    case "es-ES":
      return "The user is using Spanish. You MUST reply in authentic, natural Spanish for peer developers. Start response with [LANG:es-ES].";
    default:
      return "Reply in English. Start response with [LANG:en-US].";
  }
}

function hasToolResults(messages: Array<{ role: string; content?: string | null; tool_calls?: Array<{ function?: { name?: string } }> }>): boolean {
  return messages.some(
    (msg) =>
      msg.role === "tool" ||
      (msg.role === "assistant" &&
        msg.tool_calls?.some(
          (tc) =>
            tc.function?.name === "get_pr_diff" ||
            tc.function?.name === "submit_review",
        )),
  );
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENROUTER_API_KEY" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || !Array.isArray((body as { messages?: unknown }).messages)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages, language: requestedLanguage } = body as {
    messages: Array<{ role: string; content?: string | null }>;
    language?: string;
  };

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const lastUserText = lastUserMessage?.content ?? "";

  const detected = heuristicDetectLanguage(lastUserText);
  const language =
    detected !== "en-US"
      ? detected
      : requestedLanguage || detected || "en-US";

  const languageInstruction = getLanguageInstruction(language);
  const systemPrompt = `You are CodeCast Voice Reviewer, an expert code review assistant. ${languageInstruction}`;

  const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "CodeCast Voice Reviewer",
    },
  });

  let model = process.env.OPENROUTER_MODEL || "openrouter/free";
  if (model === "stealth/union-alpha" || model === "unbiased/pareto") {
    model = "openrouter/free";
  }

  const shouldUseTools = !hasToolResults(messages);

  const requestParams: any = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
  };

  if (shouldUseTools) {
    requestParams.tools = CODECAST_TOOLS;
  }

  let completion;
  try {
    try {
      completion = await openai.chat.completions.create(requestParams);
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      if (status === 429 || status === 502 || status === 503) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        completion = await openai.chat.completions.create(requestParams);
      } else {
        throw error;
      }
    }
  } catch (error: unknown) {
    const message = (error as Error)?.message || "Internal server error";
    const safeError = message.replaceAll(apiKey, "[REDACTED]");
    return NextResponse.json({ error: safeError }, { status: 500 });
  }

  const choice = completion.choices?.[0];
  const rawContent = choice?.message?.content ?? "";
  const { language: detectedLanguage, cleanContent } = extractLanguageTag(rawContent, lastUserText);

  return NextResponse.json({
    content: cleanContent || null,
    tool_calls: choice?.message?.tool_calls ?? null,
    detectedLanguage,
  });
}