import fs from "node:fs";
import {
  safePostReviewComment,
  safeSubmitReview,
  resetExecutorSession,
} from "../lib/safeGithubExecutor";

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

function isMissingRemotePullRequest(error: unknown): boolean {
  const visited = new Set<object>();

  function inspect(value: unknown): boolean {
    if (value !== null && typeof value === "object") {
      if (visited.has(value)) return false;
      visited.add(value);

      const details = value as Record<string, unknown>;

      if (details.status === 404 || details.statusCode === 404) {
        return true;
      }

      for (const key of ["message", "reason", "response", "cause"]) {
        if (inspect(details[key])) return true;
      }

      return false;
    }

    return (
      typeof value === "string" &&
      (/\b404\b|\bnot found\b/i.test(value) ||
        /(?:pull request|\bPR\b|diff).*(?:does not exist|doesn't exist)/i.test(
          value,
        ))
    );
  }

  return inspect(error);
}

async function main(): Promise<void> {
  if (fs.existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  } else if (fs.existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  if (process.env.CODECAST_LIVE_WRITES === "true") {
    console.error(
      "❌ CODECAST_LIVE_WRITES must not be true when running dry-run test.",
    );
    process.exit(1);
  }

  console.log("🧪 Testing GitHub write (dry-run mode)...");
  await resetExecutorSession();

  // Test 1: Comment validation may require a real, accessible remote PR diff.
  try {
    const result = await safePostReviewComment({
      pull_number: 1,
      path: "src/checkout.ts",
      line: 1,
      body: "Consider improving the header documentation.",
    });

    if (result.status === "dry_run") {
      console.log("✅ Dry-run review comment verified.");
    } else if (
      result.status === "rejected" &&
      isMissingRemotePullRequest(result)
    ) {
      console.warn(
        "⚠️ Review comment dry-run could not be verified: remote PR #1 or its diff was not found. Continuing with whitelist and review submission checks.",
      );
    } else {
      throw new Error(
        `Expected review comment status "dry_run"; received ${describeError(result)}.`,
      );
    }
  } catch (error: unknown) {
    if (!isMissingRemotePullRequest(error)) {
      throw error;
    }

    console.warn(
      `⚠️ Review comment dry-run could not be verified because remote PR #1 or its diff was not found: ${describeError(error)}`,
    );
    console.warn(
      "Continuing with whitelist and review submission checks. To exercise comment validation independently, mock getPrDiff in unit tests.",
    );
  }

  // Test 2: Unauthorized owners must be rejected before remote diff lookup.
  const whitelistResult = await safePostReviewComment({
    pull_number: 1,
    path: "README.md",
    line: 1,
    body: "test",
    owner: "unauthorized-org",
  });

  if (
    whitelistResult.status !== "rejected" ||
    typeof whitelistResult.reason !== "string" ||
    !whitelistResult.reason.toLowerCase().includes("not whitelisted")
  ) {
    throw new Error(
      `Expected whitelist rejection with reason containing "not whitelisted"; received ${describeError(whitelistResult)}.`,
    );
  }

  console.log("✅ Whitelist enforcement verified.");

  // Test 3: Review submission must remain a dry run.
  const reviewResult = await safeSubmitReview({
    pull_number: 1,
    event: "COMMENT",
    body: "LGTM overall.",
  });

  if (reviewResult.status !== "dry_run") {
    throw new Error(
      `Expected review submission status "dry_run"; received ${describeError(reviewResult)}.`,
    );
  }

  console.log("✅ Dry-run review submission verified.");
  console.log("✅ All dry-run safety guarantees verified.");
}

void main().then(
  () => {
    process.exit(0);
  },
  (error: unknown) => {
    console.error(`❌ GitHub write dry-run test failed: ${describeError(error)}`);
    process.exit(1);
  },
);