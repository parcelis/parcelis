import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const docsOwner = "parcelis";
const docsRepo = "parcelis-docs";
const genericExemptionWords = new Set([
  "no",
  "not",
  "documentation",
  "docs",
  "change",
  "changes",
  "update",
  "updates",
  "needed",
  "necessary",
  "unnecessary",
  "required",
  "is",
  "are",
]);

export async function checkDocumentation(body, getPullRequest) {
  const text = (body ?? "").replace(/<!--[\s\S]*?-->/g, "");
  const section = text.split(/^### Documentation[ \t]*\r?$/m)[1]?.split(/^#{1,3}[ \t]/m)[0] ?? "";
  const link = section.match(/^- Companion docs PR:[ \t]*(.*)$/m)?.[1].trim() ?? "";
  const reason = section.match(/^- Documentation not needed:[ \t]*(.*)$/m)?.[1].trim() ?? "";

  if (Boolean(link) === Boolean(reason)) {
    throw new Error(
      "Under ### Documentation, provide either '- Companion docs PR: <URL>' or " +
        "'- Documentation not needed: <explanation>', leaving the other field empty.",
    );
  }

  if (reason) {
    const words = reason.toLowerCase().match(/\p{L}{2,}/gu) ?? [];
    if (reason.length < 20 || new Set(words).size < 4 || words.every((word) => genericExemptionWords.has(word))) {
      throw new Error(
        "Explain the changed scope and why documentation is unnecessary using at least 20 characters " +
          "and four distinct words; a placeholder is insufficient. Explanations require reviewer assessment.",
      );
    }
    return `Documentation exemption recorded for review: ${reason}`;
  }

  const match = link.match(/^https:\/\/github\.com\/parcelis\/parcelis-docs\/pull\/([1-9]\d*)\/?$/);
  if (!match || !Number.isSafeInteger(Number(match[1]))) {
    throw new Error("Companion docs PR must be a full https://github.com/parcelis/parcelis-docs/pull/<number> URL.");
  }

  let pr;
  try {
    pr = await getPullRequest({ owner: docsOwner, repo: docsRepo, pull_number: Number(match[1]) });
  } catch (error) {
    throw new Error(
      `Could not verify the companion docs PR (${error.status ?? "API error"}). Check the URL and repository access.`,
    );
  }

  if (pr.state !== "open" && !pr.merged_at) {
    throw new Error("The companion docs PR was closed without merging. Link an open or merged docs PR.");
  }

  return `Verified companion docs PR: ${link} (${pr.merged_at ? "merged" : "open"}).`;
}

export function readExcludedAuthors(exclusionsPath = ".github/PR_CHECK_EXCLUSIONS.md") {
  const exclusionsFile = resolve(fileURLToPath(new URL("..", import.meta.url)), exclusionsPath);
  return Array.from(readFileSync(exclusionsFile, "utf8").matchAll(/^- `([^`\r\n]+)`[ \t]*\r?$/gm), (match) => match[1]);
}

export async function evaluateDocumentation(github, context, exclusionsPath) {
  try {
    const excludedAuthors = new Set(readExcludedAuthors(exclusionsPath || undefined));
    const { data: pr } = await github.rest.pulls.get({
      ...context.repo,
      pull_number: context.payload.pull_request.number,
    });
    if (excludedAuthors.has(pr.user?.login)) {
      return { passed: true, message: `Documentation requirement excluded for PR author: ${pr.user.login}.` };
    }
    const message = await checkDocumentation(pr.body, async (params) => {
      const { data } = await github.rest.pulls.get(params);
      return data;
    });
    return { passed: true, message };
  } catch (error) {
    return { passed: false, message: error.message };
  }
}

const commentMarker = "<!-- parcelis-documentation-check -->";

function escapeMarkdown(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/@/g, "&#64;")
    .replace(/[\\`*_[\]~]/g, "\\$&");
}

export async function updateDocumentationComment(github, context, botLogin, result) {
  const { owner, repo } = context.repo;
  const issue_number = context.payload.pull_request.number;
  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
  const body = [
    commentMarker,
    `[![Documentation Update: ${result.passed ? "Passing" : "Failing"}](https://img.shields.io/badge/Documentation%20Update-${result.passed ? "Passing-green" : "Failing-red"})](${runUrl})`,
    "",
    escapeMarkdown(result.message),
    "",
    ...(!result.passed
      ? [
          "In the PR description's `### Documentation` section, fill exactly one field:",
          "",
          "- `Companion docs PR:` — full URL of an open or merged PR in `parcelis/parcelis-docs`.",
          "- `Documentation not needed:` — explain why this change needs no docs update.",
          "",
          "Leave the other field empty. Correct the description to rerun this check. For API or permission errors, inspect the run logs and rerun after resolving the issue.",
          "",
        ]
      : []),
    "Exemptions require reviewer assessment. This check verifies the link or explanation, not documentation content.",
    "",
    `[View run and logs](${runUrl})`,
  ].join("\n");

  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number,
    per_page: 100,
  });
  const existing = comments.find(
    (comment) => comment.user?.login === botLogin && comment.body?.startsWith(commentMarker),
  );

  if (existing) {
    if (existing.body !== body) {
      await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    }
  } else {
    await github.rest.issues.createComment({ owner, repo, issue_number, body });
  }
}
