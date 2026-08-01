# Contributing to Parcelis

Thanks for contributing to Parcelis. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## Contributor License Agreement

By submitting a contribution, you accept the [Contributor License Agreement](CLA.md). It lets
Parcelis use and relicense contributions while you retain ownership. If you contribute for an
organization, ensure that you are authorized to accept the agreement on its behalf.

The public [CLA Gist](https://gist.github.com/NDCallahan/580fbbc25333ebc1deaf66dcfd853635)
is available for CLA-bot configuration.

## Commit messages

Parcelis uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Write commit subjects in this form:

```text
type(optional-scope): short imperative description
```

Use lowercase types. The allowed types are:

- `feat`: a new user-facing capability.
- `fix`: a bug correction.
- `docs`: documentation-only changes.
- `refactor`: code restructuring without changing behavior.
- `test`: test additions or corrections.
- `perf`: a performance improvement.
- `build`: build system or dependency changes.
- `ci`: continuous-integration changes.
- `chore`: maintenance that does not fit another type.
- `revert`: reverses an earlier change.

Scopes are optional. When useful, use a concise area of the monorepo, such as `web`, `api`, `db`, `ui`, `docs`, or `infra`.

```text
feat(web): add property filters
fix(api): reject duplicate unit names
docs: explain production deployment
ci: validate pull request commit messages
```

Indicate a breaking change with `!` before the colon or a `BREAKING CHANGE:` footer:

```text
feat(api)!: rename the properties endpoint

BREAKING CHANGE: clients must use the new endpoint name.
```

Pull requests validate every commit message in CI. If the repository uses squash merging, make the pull-request title follow the same format because it becomes the final commit message.

## Development

Follow the setup and local-development instructions in the [README](README.md). Keep changes focused, run the relevant checks, and update user-facing documentation with workflow changes.
