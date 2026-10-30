# PR check exclusions

PRs authored by these GitHub accounts pass the documentation requirement without
completing the documentation fields:

- `dependabot[bot]`
- `copilot`

To add an exclusion, add a bullet containing the exact GitHub login in backticks,
using the format above. The check matches the PR author case-insensitively, regardless of who
triggers or reruns the workflow. Other CI checks still apply.

The `PR_CHECK_EXCLUSIONS_FILE` GitHub Actions repository variable selects this file
using its repository-relative path. The default is `.github/PR_CHECK_EXCLUSIONS.md`.
