import { NextRequest, NextResponse } from "next/server";
import { generateReviewDigest } from "@/lib/digestService";
import type { TranscriptMessage, ToolCallLog, PostedComment } from "@/lib/types";

interface DigestRequestBody {
  transcript?: TranscriptMessage[];
  toolCalls?: ToolCallLog[];
  postedComments?: PostedComment[];
  pull_number?: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: DigestRequestBody;

  try {
    const parsed: unknown = await req.json();

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    body = parsed as DigestRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await generateReviewDigest({
      transcript: body.transcript ?? [],
      toolCalls: body.toolCalls ?? [],
      postedComments: body.postedComments ?? [],
      pull_number: body.pull_number,
    });

    return NextResponse.json({
      markdownDigest: result.markdownDigest,
      spokenSummary: result.spokenSummary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}