import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getLocalGitDiff, scanLocalFiles } from "@/lib/localProjectService";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetPath = searchParams.get("path") || process.cwd();

  try {
    const resolvedPath = path.resolve(targetPath);
    const projectName = path.basename(resolvedPath);
    const diffFiles = await getLocalGitDiff(resolvedPath);
    const allFiles = await scanLocalFiles(resolvedPath);

    return NextResponse.json({
      success: true,
      folder: resolvedPath,
      projectName,
      diffFiles,
      allFilesCount: allFiles.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to read local git diff",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const targetPath = (typeof body.path === "string" && body.path) || process.cwd();
    const resolvedPath = path.resolve(targetPath);
    const projectName = path.basename(resolvedPath);
    const diffFiles = await getLocalGitDiff(resolvedPath);
    const allFiles = await scanLocalFiles(resolvedPath);

    return NextResponse.json({
      success: true,
      folder: resolvedPath,
      projectName,
      diffFiles,
      allFilesCount: allFiles.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to read local git diff",
      },
      { status: 400 },
    );
  }
}
