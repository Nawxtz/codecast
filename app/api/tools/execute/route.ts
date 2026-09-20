import { NextRequest, NextResponse } from "next/server";
import { getPrDiff, getFileContext } from "@/lib/githubClient";
import { safePostReviewComment, safeSubmitReview } from "@/lib/safeGithubExecutor";
import { getLocalGitDiff, readLocalFileContent } from "@/lib/localProjectService";
import type { ToolExecuteRequest, ToolExecuteResponse } from "@/lib/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ToolExecuteRequest;

  try {
    body = (await req.json()) as ToolExecuteRequest;
  } catch {
    return NextResponse.json(
      { status: "error", reason: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof body.tool !== "string" ||
    body.args === null ||
    typeof body.args !== "object" ||
    Array.isArray(body.args)
  ) {
    return NextResponse.json(
      { status: "error", reason: "Missing or invalid 'tool' or 'args'" },
      { status: 400 }
    );
  }

  const args = body.args as Record<string, unknown>;

  try {
    switch (body.tool) {
      case "get_pr_diff": {
        const pullNumber = Number(args.pull_number ?? args.pr_number);
        if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
          return NextResponse.json(
            { status: "error", reason: "Invalid pull_number" },
            { status: 400 }
          );
        }

        const diff = await getPrDiff(
          pullNumber,
          args.owner as string | undefined,
          args.repo as string | undefined
        );

        return NextResponse.json({ status: "success", result: diff });
      }

      case "explain_context": {
        if (typeof args.path !== "string" || args.path.trim() === "") {
          return NextResponse.json(
            { status: "error", reason: "Invalid path" },
            { status: 400 }
          );
        }

        const context = await getFileContext(args.path, {
          start_line: args.start_line ? Number(args.start_line) : undefined,
          end_line: args.end_line ? Number(args.end_line) : undefined,
          ref: args.ref as string | undefined,
          owner: args.owner as string | undefined,
          repo: args.repo as string | undefined,
        });

        return NextResponse.json({ status: "success", result: context });
      }

      case "post_review_comment": {
        const executorResult = await safePostReviewComment({
          pull_number: Number(args.pull_number ?? args.pr_number),
          path: String(args.path ?? ""),
          line: Number(args.line),
          body: String(args.body ?? ""),
          owner: args.owner as string | undefined,
          repo: args.repo as string | undefined,
        });

        return NextResponse.json(executorResult, {
          status: executorResult.status === "error" ? 500 : 200,
        });
      }

      case "submit_review": {
        const executorResult = await safeSubmitReview({
          pull_number: Number(args.pull_number ?? args.pr_number),
          event: args.event as "COMMENT" | "APPROVE" | "REQUEST_CHANGES",
          body: String(args.body ?? ""),
          owner: args.owner as string | undefined,
          repo: args.repo as string | undefined,
        });

        return NextResponse.json(executorResult, {
          status: executorResult.status === "error" ? 500 : 200,
        });
      }

      case "get_local_diff": {
        const targetPath =
          (typeof args.path === "string" && args.path) || process.cwd();
        const files = await getLocalGitDiff(targetPath);
        return NextResponse.json({
          status: "success",
          result: { files, path: targetPath },
        });
      }

      case "read_local_file": {
        const file = String(args.file ?? args.filename ?? args.path ?? "");
        if (!file.trim()) {
          return NextResponse.json(
            { status: "error", reason: "Missing file parameter" },
            { status: 400 },
          );
        }
        const targetPath =
          (typeof args.project_path === "string" && args.project_path) ||
          process.cwd();
        const content = await readLocalFileContent(targetPath, file);
        return NextResponse.json({
          status: "success",
          result: { file, content },
        });
      }

      default:
        return NextResponse.json(
          { status: "rejected", reason: `Unknown tool: ${body.tool}` },
          { status: 400 }
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { status: "error", reason: message },
      { status: 500 }
    );
  }
}