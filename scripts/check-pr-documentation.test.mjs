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
  referencesApplicationPullRequest,
  updateDocumentationComment,
} from "./check-pr-documentation.mjs";

const exclusionsFixture = fileURLToPath(new URL("./fixtures/pr-check-exclusions.md", import.meta.url));
const url = "https://github.com/parcelis/parcelis-docs/pull/123";
const appUrl = "https://github.com/parcelis/parcelis/pull/42";
const body = (link = "", reason = "") =>
  `### Documentation\n\n- Companion docs PR: ${link}\n- Documentation not needed: ${reason}\n\n### Checklist\n`;
const docsPR = (overrides = {}) => ({
  number: 123,
  body: `Related application PR: ${appUrl}`,
  state: "open",
  merged_at: null,
  ...overrides,
});

test("discovers documentation without a companion URL or documentation section", async () => {
  for (const description of [null, body(), "A feature PR"]) {
    assert.match(
      await checkDocumentation(description, 42, async (params) => {
        assert.deepEqual(params, {
          owner: "parcelis",
          repo: "parcelis-docs",
          state: "all",
          sort: "created",
          direction: "desc",
          per_page: 100,
        });
        return [docsPR()];
      }),
      /Verified companion docs PR:.*\/123/,
    );
  }
});

test("recognizes exact full URLs and cross-repository references", () => {
  for (const reference of [
    appUrl,
    `Related: ${appUrl}.`,
    `[Application PR](${appUrl})`,
    `${appUrl}/`,
    `${appUrl}#discussion_r1`,
    "parcelis/parcelis#42",
    "Related: Parcelis/Parcelis#42.",
  ])
    assert.equal(referencesApplicationPullRequest(reference, 42), true, reference);
  for (const reference of [
    null,
    "#42",
    "parcelis/other#42",
    "other/parcelis/parcelis#42",
    "parcelis/parcelis#420",
    "parcelis/parcelis#42abc",
    "parcelis/parcelis#42-extra",
    appUrl + "0",
    appUrl + "/files",
    appUrl + "garbage",
    appUrl.replace("github.com", "github.com.example.com"),
    appUrl.replace("github.com", "evil.example/github.com"),
    appUrl.replace("https:", "http:"),
    appUrl.replace("/pull/", "/issues/"),
    `<!-- ${appUrl} -->`,
    "https://evil.example/parcelis/parcelis#42",
  ])
    assert.equal(referencesApplicationPullRequest(reference, 42), false, reference);
});

test("accepts open drafts and merged PRs, rejecting unrelated and closed unmerged PRs", async () => {
  for (const overrides of [{ draft: true }, { state: "closed", merged_at: "2026-10-29" }])
    assert.match(await checkDocumentation(body(), 42, async () => [docsPR(overrides)]), /Verified/);
  for (const prs of [[], [docsPR({ body: "Unrelated change" })], [docsPR({ state: "closed" })]])
    await assert.rejects(
      checkDocumentation(body(), 42, async () => prs),
      /No open or merged/,
    );
});

test("a valid companion can follow unrelated or closed PRs", async () => {
  const prs = [docsPR({ number: 1, state: "closed" }), docsPR({ number: 2, body: "Unrelated" }), docsPR()];
  assert.match(await checkDocumentation(body(), 42, async () => prs), /pull\/123/);
});

test("optional companion URL must select a PR that references the application PR", async () => {
  const listPullRequests = () => assert.fail("Explicit companion URLs must not list docs PRs");
  assert.match(
    await checkDocumentation(body(url), 42, listPullRequests, async (params) => {
      assert.deepEqual(params, { owner: "parcelis", repo: "parcelis-docs", pull_number: 123 });
      return docsPR();
    }),
    /Verified/,
  );
  for (const pr of [docsPR({ number: 456 }), docsPR({ body: "parcelis/parcelis#43" }), docsPR({ state: "closed" })])
    await assert.rejects(
      checkDocumentation(body(url), 42, listPullRequests, async () => pr),
      /No open or merged/,
    );
  for (const link of [
    "https://github.com/other/docs/pull/123",
    url.replace("/pull/", "/issues/"),
    url.replace("github.com", "github.com.example.com"),
    url + "garbage",
    url.replace("123", "9007199254740992"),
  ])
    await assert.rejects(checkDocumentation(body(link), 42), /full https/);
});

test("valid exemptions bypass GitHub and still require a meaningful explanation", async () => {
  for (const reason of [
    "Only internal tests changed.",
    "Seuls les tests internes ont changé.",
    "No documentation changes are needed for this PR; only CI tests changed.",
  ])
    assert.match(await checkDocumentation(body("", reason), 42, () => assert.fail()), /exemption/);
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
    "No documentation changes are needed for this PR",
    "  NO documentation changes are needed FOR THIS PR!!!  ",
    "No documentation changes are needed for this pull request.",
    "This PR does not require any documentation updates.",
    "Ｎｏ documentation changes are needed for this ＰＲ.",
  ])
    await assert.rejects(checkDocumentation(body("", reason), 42), /placeholder/);
  await assert.rejects(checkDocumentation(body(url, "Only internal tests changed."), 42), /not both/);
});

test("template supports discovery and exemptions; hidden and misplaced fields are ignored", async () => {
  const template = readFileSync(new URL("../.github/pull_request_template.md", import.meta.url), "utf8");
  assert.match(await checkDocumentation(template, 42, async () => [docsPR()]), /Verified/);
  const withoutDocs = template.replace(
    "- Documentation not needed:",
    "- Documentation not needed: Only internal tests changed.",
  );
  assert.match(await checkDocumentation(withoutDocs, 42), /exemption/);
  for (const description of [
    `<!-- ${body("", "Only internal tests changed.")} -->`,
    "### Description\n- Documentation not needed: Only internal tests changed.",
    "### Documentation\n\n### Checklist\n- Documentation not needed: Only internal tests changed.",
  ])
    await assert.rejects(
      checkDocumentation(description, 42, async () => []),
      /No open or merged/,
    );
});

test("reports docs API errors rather than silently passing", async () => {
  for (const status of [403, 404, 500]) {
    const fail = async () => {
      throw Object.assign(new Error("API failure"), { status });
    };
    for (const link of ["", url]) {
      await assert.rejects(
        checkDocumentation(body(link), 42, fail, fail),
        link && status === 404
          ? { message: `The linked docs PR was not found: ${url}. Check the companion URL and repository access.` }
          : new RegExp(`Could not check documentation PRs.*${status}`),
      );
    }
  }
});

const context = {
  repo: { owner: "parcelis", repo: "parcelis" },
  payload: { pull_request: { number: 42 } },
  serverUrl: "https://github.com",
  runId: 789,
};

test("evaluation fetches an explicit companion directly without pagination", async () => {
  const calls = [];
  const github = {
    rest: {
      pulls: {
        async get(params) {
          calls.push(params);
          return {
            data:
              params.repo === "parcelis"
                ? { body: body(url), user: { login: "contributor" } }
                : docsPR({ state: "closed", merged_at: "2026-10-29" }),
          };
        },
      },
    },
    paginate() {
      assert.fail("Explicit companion URLs must not paginate");
    },
  };
  const result = await evaluateDocumentation(github, context, exclusionsFixture);
  assert.equal(result.passed, true);
  assert.match(result.message, /pull\/123 \(merged\)/);
  assert.deepEqual(calls, [
    { owner: "parcelis", repo: "parcelis", pull_number: 42 },
    { owner: "parcelis", repo: "parcelis-docs", pull_number: 123 },
  ]);
});

test("captures validation and application PR API failures for reporting", async () => {
  const github = {
    rest: { pulls: { get: async () => ({ data: { body: body() } }), list() {} } },
    async paginate() {
      return [];
    },
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

test("rerunning a failed check discovers a new docs PR without editing the application PR", async () => {
  const application = { body: body(), user: { login: "contributor" } };
  let docs = [];
  let reads = 0;
  let listings = 0;
  const github = {
    rest: {
      pulls: {
        async get() {
          reads++;
          return { data: application };
        },
        list() {},
      },
    },
    async paginate() {
      listings++;
      return docs;
    },
  };
  assert.equal((await evaluateDocumentation(github, context, exclusionsFixture)).passed, false);
  docs = [docsPR()];
  const result = await evaluateDocumentation(github, context, exclusionsFixture);
  assert.equal(result.passed, true);
  assert.match(result.message, /Verified companion docs PR/);
  assert.equal(reads, 2);
  assert.equal(listings, 2);
});

test("uses default exclusions when the path is omitted or empty", async (t) => {
  const defaultAuthors = readExcludedAuthors(".github/PR_CHECK_EXCLUSIONS.md");
  if (!defaultAuthors.length) return t.skip("The default exclusions file has no authors.");

  for (const login of defaultAuthors) {
    const github = {
      rest: { pulls: { get: async () => ({ data: { user: { login }, body: null } }) } },
    };
    const expected = {
      passed: true,
      message: `Documentation requirement excluded for PR author: ${login}.`,
    };
    assert.deepEqual(await evaluateDocumentation(github, context), expected);
    assert.deepEqual(await evaluateDocumentation(github, context, ""), expected);
  }
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
      rest: { pulls: { get: async () => ({ data: { user: { login }, body: null } }), list() {} } },
      async paginate() {
        return [];
      },
    };
    const result = await evaluateDocumentation(github, { ...context, actor: "dependabot[bot]" }, exclusionsFixture);
    assert.equal(result.passed, false);
    assert.match(result.message, /No open or merged/);
  }
});

test("returns author entries from the fixed exclusions fixture", () => {
  assert.deepEqual(readExcludedAuthors(exclusionsFixture), ["dependabot[bot]", "copilot"]);
});

test("reads exclusions from the configured file and reports missing files", async () => {
  const directory = mkdtempSync(join(tmpdir(), "parcelis-pr-exclusions-"));
  const github = {
    rest: {
      pulls: { get: async () => ({ data: { user: { login: "custom-bot[bot]" }, body: null } }) },
    },
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
  const spoof = {
    id: 1,
    user: { login: "contributor" },
    body: "<!-- parcelis-documentation-check -->\nFake pass",
  };
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
    updateDocumentationComment(github, context, "parcels-bot[bot]", {
      passed: true,
      message: "Verified",
    }),
    /Comment permission denied/,
  );
});

test("evaluation paginates every docs PR page before checking the exact reference", async () => {
  const list = () => {};
  const github = {
    rest: {
      pulls: {
        list,
        get: async () => ({ data: { body: body(), user: { login: "contributor" } } }),
      },
    },
    async paginate(method, params) {
      assert.equal(method, list);
      assert.equal(params.per_page, 100);
      assert.equal(params.repo, "parcelis-docs");
      return [...Array.from({ length: 100 }, (_, i) => docsPR({ number: i + 1000, body: "Unrelated" })), docsPR()];
    },
  };
  const result = await evaluateDocumentation(github, context, exclusionsFixture);
  assert.equal(result.passed, true);
  assert.match(result.message, /pull\/123/);
});
