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
  "for",
  "this",
  "that",
  "these",
  "the",
  "a",
  "an",
  "pr",
  "pull",
  "request",
  "in",
  "to",
  "be",
  "been",
  "does",
  "do",
  "any",
  "need",
  "needs",
  "require",
  "requires",
]);

export function referencesApplicationPullRequest(body, number) {
  const text = (body ?? "").replace(/<!--[\s\S]*?-->/g, "");
  const references = text.match(/https?:\/\/[^\s<>"'`]+|(?<![\w./-])parcelis\/parcelis#\d+(?![\w-])/gi) ?? [];
  return references.some((reference) => {
    if (/^parcelis\/parcelis#/i.test(reference)) {
      return reference.toLowerCase() === `parcelis/parcelis#${number}`;
    }
    try {
      const url = new URL(reference.replace(/[).,;!]+$/, ""));
      return (
        url.origin === "https://github.com" &&
        url.pathname.toLowerCase().replace(/\/$/, "") === `/parcelis/parcelis/pull/${number}`
      );
    } catch {
      return false;
    }
  });
}

export async function checkDocumentation(body, applicationNumber, listPullRequests, getPullRequest) {
  const text = (body ?? "").replace(/<!--[\s\S]*?-->/g, "");
  const section = text.split(/^### Documentation[ \t]*\r?$/m)[1]?.split(/^#{1,3}[ \t]/m)[0] ?? "";
  const link = section.match(/^- Companion docs PR:[ \t]*(.*)$/m)?.[1].trim() ?? "";
  const reason = section.match(/^- Documentation not needed:[ \t]*(.*)$/m)?.[1].trim() ?? "";

  if (link && reason) {
    throw new Error("Provide either a companion docs PR or a documentation exemption, not both.");
  }

  if (reason) {
    const words =
      reason
        .normalize("NFKC")
        .toLowerCase()
        .match(/\p{L}{2,}/gu) ?? [];
    if (reason.length < 20 || new Set(words).size < 4 || words.every((word) => genericExemptionWords.has(word))) {
      throw new Error(
        "Explain the changed scope and why documentation is unnecessary using at least 20 characters " +
          "and four distinct words; a placeholder is insufficient. Explanations require reviewer assessment.",
      );
    }
    return `Documentation exemption recorded for review: ${reason}`;
  }

  const match = link.match(/^https:\/\/github\.com\/parcelis\/parcelis-docs\/pull\/([1-9]\d*)\/?$/);
  if (link && (!match || !Number.isSafeInteger(Number(match[1])))) {
    throw new Error("Companion docs PR must be a full https://github.com/parcelis/parcelis-docs/pull/<number> URL.");
  }

  let pullRequests;
  try {
    pullRequests = match
      ? [await getPullRequest({ owner: docsOwner, repo: docsRepo, pull_number: Number(match[1]) })]
      : await listPullRequests({
          owner: docsOwner,
          repo: docsRepo,
          state: "all",
          sort: "created",
          direction: "desc",
          per_page: 100,
        });
  } catch (error) {
    throw new Error(
      `Could not check documentation PRs (${error.status ?? "API error"}). Check repository access and rerun.`,
    );
  }

  const linked = pullRequests.filter(
    (pr) => (!match || pr.number === Number(match[1])) && referencesApplicationPullRequest(pr.body, applicationNumber),
  );
  const companion = linked.find((pr) => pr.state === "open" || pr.merged_at);
  if (!companion) {
    throw new Error(
      `No open or merged documentation PR ${link ? `matching ${link} ` : ""}` +
        `references parcelis/parcelis#${applicationNumber}. Add ` +
        `https://github.com/parcelis/parcelis/pull/${applicationNumber} to the docs PR description ` +
        "or provide a specific 'Documentation not needed:' explanation in the application PR.",
    );
  }

  return (
    `Verified companion docs PR: https://github.com/${docsOwner}/${docsRepo}/pull/${companion.number} ` +
    `(${companion.merged_at ? "merged" : "open"}); references parcelis/parcelis#${applicationNumber}.`
  );
}

export function readExcludedAuthors(exclusionsPath = ".github/PR_CHECK_EXCLUSIONS.md") {
  const exclusionsFile = resolve(fileURLToPath(new URL("..", import.meta.url)), exclusionsPath);
  return Array.from(readFileSync(exclusionsFile, "utf8").matchAll(/^- `([^`\r\n]+)`[ \t]*\r?$/gm), (match) => match[1]);
}

export async function evaluateDocumentation(github, context, exclusionsPath) {
  try {
    const excludedAuthors = new Set(
      readExcludedAuthors(exclusionsPath || undefined).map((login) => login.toLowerCase()),
    );
    const { data: pr } = await github.rest.pulls.get({
      ...context.repo,
      pull_number: context.payload.pull_request.number,
    });
    if (excludedAuthors.has(pr.user?.login?.toLowerCase())) {
      return {
        passed: true,
        message: `Documentation requirement excluded for PR author: ${pr.user.login}.`,
      };
    }
    const message = await checkDocumentation(
      pr.body,
      context.payload.pull_request.number,
      (params) => github.paginate(github.rest.pulls.list, params),
      async (params) => (await github.rest.pulls.get(params)).data,
    );
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
          `Open a PR in parcelis/parcelis-docs and reference https://github.com/${owner}/${repo}/pull/${issue_number} in its description.`,
          "",
          "- `Companion docs PR:` — optional full URL to select a specific linked docs PR.",
          "- `Documentation not needed:` — explain why this change needs no docs update.",
          "",
          "Leave the exemption empty when documentation is required. Correct the description to rerun this check, or rerun the check after opening or editing the docs PR. For API or permission errors, inspect the run logs and rerun after resolving the issue.",
          "",
        ]
      : []),
    "Exemptions require reviewer assessment. This check verifies a reference in the docs PR description or an exemption, not documentation content.",
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
