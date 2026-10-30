import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  checkDocumentation,
  evaluateDocumentation,
  readExcludedAuthors,
  updateDocumentationComment,
} from "./check-pr-documentation.mjs";

const exclusionsFixture = fileURLToPath(new URL("./fixtures/pr-check-exclusions.md", import.meta.url));

const url = "https://github.com/parcelis/parcelis-docs/pull/123";
const body = (link = "", reason = "") =>
  `### Documentation\n\n- Companion docs PR: ${link}\n- Documentation not needed: ${reason}\n\n### Checklist\n`;

test("repository PR template supports both documentation decisions", async () => {
  const template = readFileSync(new URL("../.github/pull_request_template.md", import.meta.url), "utf8");
  await assert.rejects(checkDocumentation(template), /provide either/);

  const withDocs = template.replace("- Companion docs PR:", `- Companion docs PR: ${url}`);
  let verified = false;
  assert.match(
    await checkDocumentation(withDocs, async (params) => {
      assert.deepEqual(params, { owner: "parcelis", repo: "parcelis-docs", pull_number: 123 });
      verified = true;
      return { state: "open", merged_at: null };
    }),
    /Verified companion docs PR/,
  );
  assert.ok(verified);

  const withoutDocs = template.replace(
    "- Documentation not needed:",
    "- Documentation not needed: Internal tooling change with no product behavior changes.",
  );
  assert.match(
    await checkDocumentation(withoutDocs, () => assert.fail("Exemptions must not call GitHub")),
    /exemption recorded for review/,
  );
});

test("verifies an open or merged PR in the docs repository", async () => {
  for (const pr of [
    { state: "open", merged_at: null },
    { state: "closed", merged_at: "2026-10-29" },
  ]) {
    const result = await checkDocumentation(body(url), async (params) => {
      assert.deepEqual(params, { owner: "parcelis", repo: "parcelis-docs", pull_number: 123 });
      return pr;
    });
    assert.match(result, /Verified companion docs PR/);
  }
});

test("allows a documented exemption without making an API call", async () => {
  const result = await checkDocumentation(body("", "Internal refactor with no behavior changes."), () => {
    assert.fail("An exemption must not call GitHub");
  });
  assert.match(result, /exemption recorded for review/);
});

test("requires one explicit decision in the documentation section", async () => {
  for (const value of [
    null,
    body(),
    body(url, "No user-facing changes"),
    `<!-- ${body(url)} -->`,
    `### Description\n- Companion docs PR: ${url}\n### Documentation\n\n### Checklist\n`,
    `### Documentation\n\n### Checklist\n- Companion docs PR: ${url}`,
  ]) {
    await assert.rejects(checkDocumentation(value), /provide either/);
  }
});

test("rejects placeholder exemptions", async () => {
  for (const reason of [
    "N/A",
    "none",
    "Not needed.",
    "TODO",
    "TBD",
    "-",
    "abc",
    "abcdefghijklmnopqrstuvwxyz",
    "test test test test test test",
    "No documentation changes are needed.",
    "Documentation is not needed.",
  ]) {
    await assert.rejects(checkDocumentation(body("", reason)), /placeholder/);
  }
});

test("accepts concise explanations of the changed scope", async () => {
  for (const reason of ["Only internal tests changed.", "Seuls les tests internes ont changé."]) {
    assert.match(await checkDocumentation(body("", reason)), /exemption recorded for review/);
  }
});

test("rejects links to other repositories, issues, or lookalike hosts", async () => {
  for (const link of [
    "https://github.com/other/docs/pull/123",
    url.replace("/pull/", "/issues/"),
    url.replace("github.com", "github.com.example.com"),
    `${url}garbage`,
    url.replace("123", "9007199254740992"),
  ]) {
    await assert.rejects(checkDocumentation(body(link)), /full https/);
  }
});

test("rejects closed unmerged PRs and API failures", async () => {
  await assert.rejects(
    checkDocumentation(body(url), async () => ({ state: "closed", merged_at: null })),
    /closed without merging/,
  );
  for (const status of [404, 403, 500]) {
    await assert.rejects(
      checkDocumentation(body(url), async () => {
        throw Object.assign(new Error("API failure"), { status });
      }),
      new RegExp(`Could not verify.*${status}`),
    );
  }
});

const context = {
  repo: { owner: "parcelis", repo: "parcelis" },
  payload: { pull_request: { number: 42 } },
  serverUrl: "https://github.com",
  runId: 789,
};

test("captures validation and application PR API failures for reporting", async () => {
  const github = {
    rest: { pulls: { get: async () => ({ data: { body: body() } }) } },
  };
  assert.equal((await evaluateDocumentation(github, context, exclusionsFixture)).passed, false);
  github.rest.pulls.get = async () => {
    throw new Error("API unavailable");
  };
  assert.deepEqual(await evaluateDocumentation(github, context, exclusionsFixture), {
    passed: false,
    message: "API unavailable",
  });
  github.rest.pulls.get = async (params) => {
    assert.deepEqual(params, { owner: "parcelis", repo: "parcelis", pull_number: 42 });
    return { data: { body: body("", "Only internal build tooling changed.") } };
  };
  assert.equal((await evaluateDocumentation(github, context, exclusionsFixture)).passed, true);
});

test("uses default exclusions when the path is omitted or empty", async (t) => {
  const defaultAuthors = readExcludedAuthors();
  assert.deepEqual(defaultAuthors, ["dependabot[bot]", "copilot"]);
  const [login] = defaultAuthors;
  if (!login) return t.skip("The default exclusions file has no authors.");

  const github = {
    rest: { pulls: { get: async () => ({ data: { user: { login }, body: null } }) } },
  };
  const expected = {
    passed: true,
    message: `Documentation requirement excluded for PR author: ${login}.`,
  };
  assert.deepEqual(await evaluateDocumentation(github, context), expected);
  assert.deepEqual(await evaluateDocumentation(github, context, ""), expected);
});

test("excludes Dependabot PRs even when a human triggers the check", async () => {
  const github = {
    rest: {
      pulls: {
        get: async (params) => {
          assert.deepEqual(params, { owner: "parcelis", repo: "parcelis", pull_number: 42 });
          return { data: { user: { login: "dependabot[bot]" }, body: null } };
        },
      },
    },
  };
  assert.deepEqual(await evaluateDocumentation(github, { ...context, actor: "maintainer" }, exclusionsFixture), {
    passed: true,
    message: "Documentation requirement excluded for PR author: dependabot[bot].",
  });
});

test("excludes API-reported Copilot using a lowercase fixture entry", async () => {
  const github = {
    rest: { pulls: { get: async () => ({ data: { user: { login: "Copilot" }, body: null } }) } },
  };
  assert.deepEqual(await evaluateDocumentation(github, context, exclusionsFixture), {
    passed: true,
    message: "Documentation requirement excluded for PR author: Copilot.",
  });
});

test("does not exclude other PR authors when Dependabot triggers the check", async () => {
  for (const login of ["contributor", "renovate[bot]", "dependabot"]) {
    const github = {
      rest: { pulls: { get: async () => ({ data: { user: { login }, body: null } }) } },
    };
    const result = await evaluateDocumentation(github, { ...context, actor: "dependabot[bot]" }, exclusionsFixture);
    assert.equal(result.passed, false);
    assert.match(result.message, /provide either/);
  }
});

test("returns author entries from the fixed exclusions fixture", () => {
  assert.deepEqual(readExcludedAuthors(exclusionsFixture), ["dependabot[bot]", "copilot"]);
});

test("reads exclusions from the configured file and reports missing files", async () => {
  const directory = mkdtempSync(join(tmpdir(), "parcelis-pr-exclusions-"));
  const github = {
    rest: { pulls: { get: async () => ({ data: { user: { login: "custom-bot[bot]" }, body: null } }) } },
  };
  try {
    const file = join(directory, "exclusions.md");
    writeFileSync(file, "# Exclusions\n\n- `custom-bot[bot]`\n");
    const exclusionsPath = relative(fileURLToPath(new URL("..", import.meta.url)), file);
    assert.deepEqual(readExcludedAuthors(exclusionsPath), ["custom-bot[bot]"]);
    assert.equal((await evaluateDocumentation(github, context, exclusionsPath)).passed, true);

    writeFileSync(file, "# Exclusions\n\n- `dependabot[bot]`\n");
    assert.equal((await evaluateDocumentation(github, context, exclusionsPath)).passed, false);

    const result = await evaluateDocumentation(github, context, join(directory, "missing.md"));
    assert.equal(result.passed, false);
    assert.match(result.message, /ENOENT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function commentClient(comments = []) {
  const writes = [];
  const issues = {
    listComments() {},
    async createComment(params) {
      writes.push({ action: "create", ...params });
      comments.push({ id: 123, user: { login: "parcels-bot[bot]" }, body: params.body });
    },
    async updateComment(params) {
      writes.push({ action: "update", ...params });
      comments.find((comment) => comment.id === params.comment_id).body = params.body;
    },
  };
  const github = {
    rest: { issues },
    async paginate(method, params) {
      assert.equal(method, issues.listComments);
      assert.deepEqual(params, {
        owner: "parcelis",
        repo: "parcelis",
        issue_number: 42,
        per_page: 100,
      });
      return comments;
    },
  };
  return { github, writes, comments };
}

test("updates one bot comment from failure to pass and back to failure", async () => {
  const { github, writes, comments } = commentClient();
  for (const passed of [false, true, false]) {
    await updateDocumentationComment(github, context, "parcels-bot[bot]", {
      passed,
      message: passed ? "Verified docs PR" : "Missing documentation decision",
    });
  }
  assert.equal(comments.length, 1);
  assert.deepEqual(
    writes.map((write) => write.action),
    ["create", "update", "update"],
  );
  assert.ok(writes[0].body.includes("https://img.shields.io/badge/Documentation%20Update-Failing-red"));
  assert.ok(writes[1].body.includes("https://img.shields.io/badge/Documentation%20Update-Passing-green"));
  assert.ok(writes[2].body.includes("https://img.shields.io/badge/Documentation%20Update-Failing-red"));
  assert.match(writes[2].body, /Missing documentation decision/);
  assert.match(writes[2].body, /Correct the description/);
  assert.match(writes[2].body, /https:\/\/github.com\/parcelis\/parcelis\/actions\/runs\/789/);
});

test("ignores comments from other authors and escapes user-controlled Markdown and mentions", async () => {
  const spoof = { id: 1, user: { login: "contributor" }, body: "<!-- parcelis-documentation-check -->\nFake pass" };
  const { github, writes } = commentClient([spoof]);
  const result = { passed: true, message: "Exemption: @parcelis/team <b>test</b> [link](url)" };
  await updateDocumentationComment(github, context, "parcels-bot[bot]", result);
  assert.equal(writes[0].action, "create");
  assert.equal(spoof.body, "<!-- parcelis-documentation-check -->\nFake pass");
  assert.ok(!writes[0].body.includes("@parcelis/team"));
  assert.ok(!writes[0].body.includes("<b>"));
  assert.match(writes[0].body, /\\\[link\\\]/);
  await updateDocumentationComment(github, context, "parcels-bot[bot]", result);
  assert.equal(writes.length, 1);
});

test("comment API failures propagate so the workflow cannot silently pass", async () => {
  const { github } = commentClient();
  github.rest.issues.createComment = async () => {
    throw new Error("Comment permission denied");
  };
  await assert.rejects(
    updateDocumentationComment(github, context, "parcels-bot[bot]", { passed: true, message: "Verified" }),
    /Comment permission denied/,
  );
});
