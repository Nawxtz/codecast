import fs from "node:fs";
import { getOctokit, getRepoTarget } from "../lib/githubClient";
import { COMMENT_SIGNATURE_PREFIX } from "../lib/safeGithubExecutor";

async function main(): Promise<void> {
  if (fs.existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  } else if (fs.existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  if (
    process.env.CODECAST_LIVE_WRITES !== "true" &&
    process.env.FORCE !== "true"
  ) {
    console.error(
      "❌ CODECAST_LIVE_WRITES must be true (or FORCE=true) to reset the demo repo.",
    );
    process.exit(1);
  }

  if (
    typeof COMMENT_SIGNATURE_PREFIX !== "string" ||
    COMMENT_SIGNATURE_PREFIX.trim().length === 0
  ) {
    throw new Error("COMMENT_SIGNATURE_PREFIX must not be empty.");
  }

  const rawPullNumber = process.env.PULL_NUMBER ?? "1";
  const pull_number = Number(rawPullNumber);

  if (
    !/^\d+$/.test(rawPullNumber) ||
    !Number.isSafeInteger(pull_number) ||
    pull_number < 1
  ) {
    throw new Error("PULL_NUMBER must be a positive safe integer.");
  }

  const { owner, repo } = getRepoTarget();
  const octokit = getOctokit();

  console.log(
    `🧹 Resetting demo repository ${owner}/${repo} (PR #${pull_number})...`,
  );

  // Collect every page before deleting to avoid shifting pagination.
  const reviewComments = await octokit.paginate(
    octokit.rest.pulls.listReviewComments,
    { owner, repo, pull_number, per_page: 100 },
  );

  for (const comment of reviewComments) {
    if (!comment.body?.startsWith(COMMENT_SIGNATURE_PREFIX)) continue;

    await octokit.rest.pulls.deleteReviewComment({
      owner,
      repo,
      comment_id: comment.id,
    });
    console.log(`  - Deleted comment #${comment.id}`);
  }

  const issueComments = await octokit.paginate(
    octokit.rest.issues.listComments,
    { owner, repo, issue_number: pull_number, per_page: 100 },
  );

  for (const comment of issueComments) {
    if (!comment.body?.startsWith(COMMENT_SIGNATURE_PREFIX)) continue;

    await octokit.rest.issues.deleteComment({
      owner,
      repo,
      comment_id: comment.id,
    });
    console.log(`  - Deleted comment #${comment.id}`);
  }

  const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
    owner,
    repo,
    pull_number,
    per_page: 100,
  });

  for (const review of reviews) {
    if (!review.body?.startsWith(COMMENT_SIGNATURE_PREFIX)) continue;

    // Only approvals and change requests have a decision to dismiss.
    if (
      review.state !== "APPROVED" &&
      review.state !== "CHANGES_REQUESTED"
    ) {
      continue;
    }

    await octokit.rest.pulls.dismissReview({
      owner,
      repo,
      pull_number,
      review_id: review.id,
      message: "Resetting demo session.",
    });
    console.log(`  - Dismissed review #${review.id}`);
  }

  console.log("✅ Demo repo is clean and ready.");
}

main().catch((error: unknown) => {
  console.error(
    `❌ Failed to reset demo repository: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});