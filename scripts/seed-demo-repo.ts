import fs from "node:fs";
import { getOctokit, getRepoTarget } from "../lib/githubClient";

const BRANCH = "codecast-demo/checkout-flow";
const BASE = "main";
const FILE_PATH = "src/checkout.ts";

const CHECKOUT_SOURCE = `export interface CheckoutItem {
  sku: string;
  unitPriceCents: number;
  quantity: number;
}

export interface Coupon {
  code: string;
  discount: number;
}

export interface CheckoutResult {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

export function checkout(
  items: readonly CheckoutItem[],
  coupon?: Coupon,
): CheckoutResult {
  if (items.length === 0) {
    throw new Error("Checkout requires at least one item.");
  }

  const subtotalCents = items.reduce((total, item) => {
    if (
      !Number.isSafeInteger(item.unitPriceCents) ||
      item.unitPriceCents < 0
    ) {
      throw new Error("Item prices must be non-negative integer cents.");
    }

    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Item quantities must be positive integers.");
    }

    return total + item.unitPriceCents * item.quantity;
  }, 0);

  if (coupon) {
    if (!coupon.code.trim()) {
      throw new Error("Coupon code must not be empty.");
    }

    if (
      !Number.isFinite(coupon.discount) ||
      coupon.discount < 0 ||
      coupon.discount > 1
    ) {
      throw new Error("Coupon discount must be between 0 and 1.");
    }
  }

  // Intentional review bug: the non-null assertion does not check at runtime.
  // Calling checkout(items) without a coupon throws here.
  const discountCents = Math.round(subtotalCents * coupon!.discount);

  return {
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
  };
}
`;

function hasStatus(error: unknown, status: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === status
  );
}

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
    throw new Error(
      "Live writes must be enabled to seed the GitHub repo. " +
        "Set CODECAST_LIVE_WRITES=true (or FORCE=true) and run this script again.",
    );
  }

  const octokit = await getOctokit();
  const { owner, repo } = await getRepoTarget();

  const { data: mainRef } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${BASE}`,
  });

  let branchExists = false;

  try {
    await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${BRANCH}`,
    });
    branchExists = true;
  } catch (error: unknown) {
    if (!hasStatus(error, 404)) {
      throw error;
    }
  }

  if (branchExists) {
    // Reset only this dedicated demo branch to the current main commit.
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${BRANCH}`,
      sha: mainRef.object.sha,
      force: true,
    });
  } else {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${BRANCH}`,
      sha: mainRef.object.sha,
    });
  }

  console.log(`✅ Created branch: ${BRANCH}`);

  let fileSha: string | undefined;

  try {
    const { data: existingFile } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: FILE_PATH,
      ref: BRANCH,
    });

    if (Array.isArray(existingFile) || existingFile.type !== "file") {
      throw new Error(
        `Cannot seed ${FILE_PATH}: the existing path is not a regular file.`,
      );
    }

    fileSha = existingFile.sha;
  } catch (error: unknown) {
    if (!hasStatus(error, 404)) {
      throw error;
    }
  }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: FILE_PATH,
    branch: BRANCH,
    message: "Seed demo checkout flow with intentional review issue",
    content: Buffer.from(CHECKOUT_SOURCE, "utf8").toString("base64"),
    ...(fileSha !== undefined ? { sha: fileSha } : {}),
  });

  console.log(`✅ Created file: ${FILE_PATH}`);

  const { data: existingPullRequests } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    head: `${owner}:${BRANCH}`,
    base: BASE,
    per_page: 1,
  });

  const existingPullRequest = existingPullRequests[0];
  let pullRequest: { number: number; html_url: string };

  if (existingPullRequest) {
    pullRequest = existingPullRequest;
    console.log(`Existing PR: #${pullRequest.number}`);
  } else {
    const { data: createdPullRequest } = await octokit.rest.pulls.create({
      owner,
      repo,
      title: "Add checkout flow and coupon validation",
      head: BRANCH,
      base: BASE,
      body: "Implements checkout flow, item totals calculation, and coupon application.",
    });

    pullRequest = createdPullRequest;
  }

  console.log(
    `✅ Pull request ready: #${pullRequest.number} (${pullRequest.html_url})`,
  );
  console.log("🎬 Demo repo is ready for CodeCast!");
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ Failed to seed demo repo: ${message}`);
  process.exitCode = 1;
});