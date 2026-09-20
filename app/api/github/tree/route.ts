import { NextRequest, NextResponse } from "next/server";
import { getRepoTree } from "@/lib/githubClient";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const branch = searchParams.get("branch") || "main";
  const owner = searchParams.get("owner") || undefined;
  const repo = searchParams.get("repo") || undefined;

  try {
    const result = await getRepoTree(branch, owner, repo);
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load GitHub repository tree",
      },
      { status: 400 },
    );
  }
}
