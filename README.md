<p align="center">
  <img src="https://i.imgur.com/9fKiINL.png" alt="Parcelis Dark Banner" style="text-align:center;" />
</p>
Parcelis (PAR-suhl-iss) is an open-source property management platform for landlords, small operators, and local property teams.

<h4 align="center">
  ,🚀
  <a href="http://kan.bn/dothuxv6abhw/parcelis-roadmap">Roadmap</a>
    <span>&nbsp; &nbsp; &nbsp; · &nbsp; &nbsp; &nbsp;</span>
  🧩
  <a href="https://github.com/parcelis/parcelis/discussions/categories/ideas">Request a feature</a>
  <span>&nbsp; &nbsp; &nbsp; · &nbsp; &nbsp; &nbsp;</span>
  🐞
  <a href="https://github.com/parcelis/parcelis/issues">Report a bug</a>
  <span>&nbsp; &nbsp; &nbsp; · &nbsp; &nbsp; &nbsp;</span>
  👥💬
  <a href="https://github.com/parcelis/parcelis/discussions">Community Discussions</a>
</h3>

<br />

<p align="center">
<a href="https://discord.gg/4XYkWmVpWH"><img src="https://i.imgur.com/d7JM2wK.png" width="150px" /></a>
<span>&nbsp; &nbsp; &nbsp;</span>
<a href="https://parcelis.dev/"><img width="50" height="50" alt="image" src="https://github.com/user-attachments/assets/9f838f54-df0d-4f52-bfa8-8d21e8c99735" /></a>
<span>&nbsp; &nbsp; &nbsp;</span>
<a href="https://snyk.io/?utm_source=open-source&utm_medium=pg-ptr&utm_campaign=ref-2501-osp&utm_content=pg-cta"><img src="https://github.com/snyk-labs/secure-developer-sample-repo/blob/main/badge_round.svg" width="60px" /></a>
</p>

<br />

![GitHub Tag](https://img.shields.io/github/v/tag/parcelis/parcelis)
![Docker Automated build](https://img.shields.io/docker/automated/ndcallahan/parcelis)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/parcelis/parcelis/publish-images.yml)
[![CI](https://github.com/parcelis/parcelis/actions/workflows/ci.yml/badge.svg)](https://github.com/parcelis/parcelis/actions/workflows/ci.yml) [![Linter](https://github.com/parcelis/parcelis/actions/workflows/lint.yml/badge.svg)](https://github.com/parcelis/parcelis/actions/workflows/lint.yml) ![GitHub commit activity](https://img.shields.io/github/commit-activity/m/parcelis/parcelis) ![GitHub Issues](https://img.shields.io/github/issues/parcelis/parcelis) ![GitHub Pull Requests](https://img.shields.io/github/issues-pr/parcelis/parcelis) ![GitHub Discussions (all)](https://img.shields.io/github/discussions/all/parcelis/parcelis)
![GitHub License](https://img.shields.io/github/license/parcelis/parcelis)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-3.0-4baaaa.svg)](CODE_OF_CONDUCT.md)

## <p align="center"> Currently under development. Will update once we have a basic MVP to pilot.</p>

<br /><br />

## 🧩 Features

### Run your rentals in one place

Keep your properties, units, tenants, maintenance, and day-to-day operations organized in one shared workspace—without juggling spreadsheets, email threads, and separate tools.

### Keep your team on the same page

Give every team member visibility into what needs attention, who owns it, and what has already been completed. Parcelis keeps operational work clear, accountable, and moving forward.

### Work in the right organization

Keep each organization's properties, tenants, leases, income, and maintenance records separate. Team members can switch between the organizations they are allowed to access.

### Manage tenants with confidence

Maintain a complete view of each tenant alongside the property information, requests, and activity that matter—so your team always has the context to respond quickly.

### Stay ahead of maintenance

Create, assign, track, and resolve maintenance tickets in one place. Keep residents informed, coordinate work internally, and make sure important issues do not slip through the cracks.

### Bring everyday operations into the app

Tenant questions, repair needs, follow-ups, and other operational tasks happen every day. Parcelis gives your team a simple way to capture, manage, and close the loop on that work.

### Built for growing portfolios

Whether you manage a handful of homes or a growing portfolio, Parcelis gives your team a consistent operational system that scales with the way you work.

### Collect rent

Coming soon. Give tenants a straightforward way to pay rent while keeping payment activity connected to the rest of your rental operations.

### Handle non-maintenance requests

Coming soon. Manage questions, move-in needs, access requests, and other tenant needs alongside maintenance—so every request has a clear owner and outcome.

Parcelis is the operating system for rental teams—bringing properties, tenants, maintenance, and everyday requests into one place.

## Technology

Parcelis is built with open-source tools and services. See [DEPENDENCIES.md](DEPENDENCIES.md) for the maintained technology inventory and each tool's role.

### Tech Stack

---

<p align="left">
  <a href="https://www.typescriptlang.org"><img src="https://shields.io/badge/TypeScript-3178C6?logo=TypeScript&logoColor=FFF&style=flat-square" alt="TypeScript"></a>
  <a href="https://prisma.io"><img width="122" height="20" src="http://made-with.prisma.io/indigo.svg" alt="Made with Prisma" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/tailwindcss-0F172A?&logo=tailwindcss" alt="Tailwind CSS"></a>
  <a href=""><img src="" alt=""></a>
  <a href=""><img src="" alt=""></a>
  <a href=""><img src="" alt=""></a>
  <a href=""><img src="" alt=""></a>
  <a href=""><img src="" alt=""></a>
</p>

- [TypeScript](https://www.typescriptlang.org/) - Language
- [Prisma](https://www.prisma.io/) - ORM
- [Tailwind CSS](https://tailwindcss.com/) - CSS
- [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/) - Component Library
- [tRPC](https://trpc.io/) - API
- [Biome](https://biomejs.dev/) - Linting & Formatting
- [Docusaurus](https://docusaurus.io/) - Documentation
- [TanStack Hotkeys](https://tanstack.com/hotkeys/latest) - Keyboard Shortcuts

## Contributing

Every contribution is appreciated, from bug reports to pull requests. Before implementing a new feature or changing the API, please open an issue so the approach can be discussed first. See [CONTRIBUTING.md](CONTRIBUTING.md) for environment setup, contributor expectations, and the Conventional Commit format enforced for pull requests.

### Not sure where to start?

Browse [good first issues](https://github.com/parcelis/parcelis/labels/good%20first%20issue) for approachable contributions.

### How the repository is organized

Parcelis is a pnpm/Turbo monorepo. At a high level, it contains:

- [`apps/web`](apps/web): the main Parcelis web app.
- [`apps/api`](apps/api): the service that handles app data and requests.
- [`apps/docs`](apps/docs): the Parcelis documentation site.
- [`packages/ui`](packages/ui): reusable interface components and branding.
- [`packages/schemas`](packages/schemas): shared rules for validating app data.
- [`packages/db`](packages/db): database definitions, updates, and access code.
- [`packages/config`](packages/config): shared development-tool configuration.

For detailed local setup and contributor workflows, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Licensing
Parcelis is licensed under the GNU Affero General Public License version 3. See
[LICENSING.md](LICENSING.md) for details.
