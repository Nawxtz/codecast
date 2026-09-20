import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { scanLocalFiles, readLocalFileContent } from "@/lib/localProjectService";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetPath = searchParams.get("path") || process.cwd();
  const file = searchParams.get("file");

  try {
    const resolvedPath = path.resolve(targetPath);

    if (file) {
      const content = await readLocalFileContent(resolvedPath, file);
      return NextResponse.json({
        success: true,
        path: file,
        content,
      });
    }

    const files = await scanLocalFiles(resolvedPath);
    return NextResponse.json({
      success: true,
      folder: resolvedPath,
      projectName: path.basename(resolvedPath),
      files,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to scan local files",
      },
      { status: 400 },
    );
  }
}
