/**
 * scripts/test-github-read.ts
 * Fetches PR diff and file contents from the demo repository.
 * Run: npm run verify:github:read
 */

import fs from "node:fs";
import { getPrDiff, getFileContext, getRepoTarget } from "../lib/githubClient";

if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

async function main() {
  const { owner, repo } = getRepoTarget();
  console.log(`\n🔍 Testing GitHub read for repository: ${owner}/${repo}\n`);

  // 1. Test fetching file context (README.md)
  try {
    const readme = await getFileContext("README.md");
    console.log(`✅ Fetched file context for "${readme.path}" (${readme.total_lines} lines):`);
    console.log(`   "${readme.content.trim()}"\n`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Failed to fetch file context: ${message}`);
  }

  // 2. Test fetching PR diff
  const pullNumber = Number(process.env.PULL_NUMBER ?? "1");
  try {
    const prDiff = await getPrDiff(pullNumber);
    console.log(`✅ Fetched PR #${prDiff.pull_number} (Head SHA: ${prDiff.head_sha})`);
    console.log(`   Changed files count: ${prDiff.files.length}`);
    for (const file of prDiff.files) {
      console.log(`   - ${file.filename} [${file.status}] (+${file.additions} / -${file.deletions})`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`ℹ️  Note on PR #${pullNumber}: ${message}`);
    console.log("   (Run seed script when ready to create demo PR #1)");
  }

  console.log("\n✅ GitHub read client verified.\n");
}

main().catch((err) => {
  console.error("Fatal error during GitHub read test:", err);
  process.exit(1);
});
