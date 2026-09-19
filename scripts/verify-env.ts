/**
 * scripts/verify-env.ts
 * Checks all required environment variables are present.
 * Run: npm run verify:env
 */

import fs from "node:fs";

if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

const REQUIRED_VARS = [
  "OPENROUTER_API_KEY",
  "GITHUB_PAT",
  "CODECAST_REPO_OWNER",
  "CODECAST_REPO_NAME",
] as const;

const OPTIONAL_VARS = [
  "OPENROUTER_MODEL",
  "CODECAST_LIVE_WRITES",
  "NEXT_PUBLIC_APP_URL",
] as const;

let hasError = false;

console.log("\n🔍 Verifying environment variables...\n");

for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    console.error(`  ❌ MISSING (required): ${key}`);
    hasError = true;
  } else {
    console.log(`  ✅ ${key}`);
  }
}

for (const key of OPTIONAL_VARS) {
  if (!process.env[key]) {
    console.warn(`  ⚠️  MISSING (optional): ${key}`);
  } else {
    console.log(`  ✅ ${key}`);
  }
}

console.log();

if (hasError) {
  console.error("❌ Environment verification FAILED. Copy .env.example to .env.local and fill in values.\n");
  process.exit(1);
}

console.log("✅ Environment verification PASSED.\n");
