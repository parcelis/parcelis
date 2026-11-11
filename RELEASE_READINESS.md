# Public MVP readiness review

Reviewed October 3, 2026 against the current working tree. This is a source review of the seven proposed release milestones, not a production certification or a full browser acceptance test. GitHub tracking was added after the review: 18 new issues and 15 existing issues updated, with native blocked-by relationships and release scope boundaries.

Priority: **P0** = resolve before using real customer or financial records; **P1** = required to complete the proposed MVP; **P2** = optional or suitable to defer. Findings below distinguish implemented foundations, confirmed gaps, and recommended validation.

## Milestone status

| Milestone | Implemented foundation | Remaining work |
| --- | --- | --- |
| Properties | Database-backed creation, editing, archive/restore, deletion guards, images and notes | Archive eligibility rules, trustworthy metrics, aggregate permissions, lifecycle acceptance tests |
| Units | Creation, editing, deletion with history guards; archive column exists | Archive/restore API and UI, archive filters, consistent property counts |
| Tenants | Creation, editing, archive/restore, images, emergency contact and lease history | Safe deletion policy, archive eligibility, tenant account scope |
| Leasing | Persistent drafts, tenant assignments, joint/individual allocations, overlap checks, finalization, scheduled activation and expiration with recovery | Finalization billing, finalized edits, tenant amendments, renewal, notice/termination |
| Income | Manual invoices, invoice editing, PDFs, staff-recorded single/batch payments, partial-payment rules | Real invoice lists and accurate totals, recurring generation, payment-history protection, tenant self-service if required |
| Account notifications | Verification/reset email flows, SMTP settings, durable outbox, retries and delivery state | Security-change notifications; inbox/preferences and billing notifications if included in MVP |
| Account profiles | Name, phone, photo, email/password changes; user administration | Verify replacement email before changing sign-in identity; complete acceptance coverage |

## P0: data correctness and release blockers

### R01 — Connect lease finalization to invoice generation

**Confirmed gap.** The current wizard calls `leases.finalizeDraft`. That procedure changes lease status, occupancy, and scheduling but does not create invoices or enqueue billing. The activation worker also does not generate invoices. A different `leases.create` endpoint has optional invoice generation, which does not complete the wizard workflow.

- Evidence: `apps/web/app/(authenticated)/leases/new/page.tsx:1722`; `apps/api/src/router/app.router.ts:3940`, `:4232`; `apps/worker/src/lease-activation.ts`. The current test explicitly asserts no invoices are generated (`apps/api/src/tests/leases/lease-finalization.router.test.ts:318`), so this is a missing release capability rather than a failure of that existing test contract.
- Complete when: finalizing an eligible lease produces the intended first rent/deposit invoices exactly once, with correct recipients, allocations and due dates. Future leases have an explicit billing start policy. Retries cannot duplicate charges.

### R02 — Generate recurring rent invoices

**Confirmed gap.** Existing generation runs only inside a creation request. Open-ended leases get a bounded initial horizon; there is no billing processor in the worker to extend that horizon or bill leases created by the draft workflow.

- Evidence: `apps/api/src/router/app.router.ts:4339`; `apps/worker/src/main.ts`.
- Complete when: a recoverable, idempotent monthly job handles active and continuing month-to-month leases, catches up after downtime, respects termination and amendments, and exposes failures. Define first/last-month proration and deposit behavior explicitly.

### R03 — Remove fabricated invoices and fix the income directory

**Confirmed defect.** `getCurrentInvoice` manufactures a current-month invoice ID, balance and status when the database has no invoices. The income screen includes only active/notice leases, consumes the nonarchived lease projection, and matches a tenant filter against only the first tenant. Consequently, ended/archived lease receivables and co-tenants can be missing from this screen.

- Evidence: `apps/web/app/(authenticated)/income/page.tsx:52`, `:121`, `:165`, `:372`.
- Complete when: invoice rows come from persisted invoices, missing invoices show a truthful empty/action state, historical receivables remain discoverable, and filtering works for every responsible tenant. Keep rent forecasts separate from invoices.

### R04 — Correct overdue and income calculations

**Confirmed defect.** Property list/detail projections sum all invoice balances into `amountOverdueCents`, without checking due date/status. Income then subtracts that balance from monthly scheduled rent to calculate expected income. Future invoices can therefore inflate overdue totals; the result is not a collections calculation. Property summary calculations also restrict debt aggregation to active/notice leases.

- Evidence: `apps/api/src/router/app.router.ts:400`, `:1317`, `:1395`; `apps/web/app/(authenticated)/income/page.tsx:144`.
- Complete when: current charges, future charges, overdue balances and collected payments are separate, date-scoped figures; ended leases with debt remain included where appropriate. Verify cents and organization-time-zone boundaries.

### R05 — Protect invoice and payment history

**Confirmed destructive behavior.** `invoices.delete` unconditionally deletes an authorized invoice, and the payment relation cascades deletion. `deletePayment` hard-deletes a payment and recalculates the balance using a read/write transaction without the serializable protection used by payment recording. Editing a fully paid invoice upward changes its balance/status but leaves `paidOn`, `paidByTenantId` and `paymentMethod` unchanged.

- Evidence: `apps/api/src/router/app.router.ts:2682`, `:2734`, `:2741`; `packages/db/prisma/schema.prisma:712`.
- Complete when: settled history cannot disappear through ordinary deletion; corrections use an explicit void/reversal policy with actor/reason; concurrent payment changes preserve balances; invoice settlement metadata agrees with status. Test simultaneous recording/reversal and paid-invoice edits.

### R06 — Prevent tenant deletion from removing lease and invoice history

**Confirmed destructive behavior.** Tenant deletion blocks payment history but deletes unpaid invoices, removes lease assignments, and deletes leases left without tenants, including finalized leases. This is more permissive than direct lease deletion, which allows only invoice-free drafts. Removing a tenant from a shared lease also needs an allocation policy.

- Evidence: `apps/api/src/router/app.router.ts:2205`, `:4201`.
- Complete when: tenants with finalized lease or financial history must be archived or handled by an explicit correction workflow. Deletion cannot bypass lease protections or silently change shared billing responsibility. Cover concurrent payments/deletions.

### R07 — Enforce permissions on nested data

**Confirmed authorization gap in projections.** Property queries gate leases on `leases.view`, but include their invoices without an `invoices.view` gate; units and maintenance are also included without their respective view checks. Tenant listing includes lease details under tenant-view permission. Direct endpoint restrictions alone do not protect those nested responses.

- Evidence: `apps/api/src/router/app.router.ts:1226`, `:1349`, `:1803`; `apps/api/src/tests/permissions/permissions.router.test.ts`.
- Complete when: restricted roles cannot retrieve denied financial, tenant, maintenance or lease data through related resources. Add response-content tests for custom roles and cross-organization requests, not only direct endpoint rejection tests.

### R08 — Provide a production bootstrap separate from demo seeding

**Confirmed setup gap in reviewed entry points.** The seed creates the demo organization, properties, tenants and invoices together with the administrator and lookup catalogs. Re-running its lease seeding deletes existing invoices for matching demo leases. There is no separate clean-install provisioning entry point in the reviewed scripts/router.

- Evidence: `packages/db/prisma/seed.mjs:218`, `:288`; `package.json` (`db:seed`, `db:demo:prepare`); [contributor getting started guide](https://docs.parcelis.dev/docs/contributor-getting-started).
- Complete when: a fresh installation can create its first owner, organization and required catalogs without sample records; demo seeding is explicitly separated and guarded; production installation/upgrade instructions do not require it. Validate a fresh migration and an upgrade on disposable databases.

## P1: complete the requested workflows

### R09 — Finish unit archive and restore

**Confirmed gap.** `Unit.archivedAt` exists and the lease wizard excludes archived units, but the units router has no archive/restore procedure and list queries do not filter archived units. There is no complete lifecycle flow in the unit detail screen.

- Evidence: `packages/db/prisma/schema.prisma:349`; `apps/api/src/router/app.router.ts:4446`; `apps/web/app/(authenticated)/properties/[id]/units/[unitId]/page.tsx`; `apps/web/app/(authenticated)/leases/new/page.tsx:290`.
- Complete when: authorized users can archive/restore units, inspect archived history, and cannot assign archived units to new leases. Define how active leases affect archival and totals.

### R10 — Keep unit and occupancy totals consistent

**Confirmed consistency gap.** Standalone unit creation/deletion does not adjust stored `Property.unitCount`; property create/update accepts a separate input count. Dashboard occupancy uses stored counts, while unit occupancy is also derived from leases.

- Evidence: `apps/api/src/router/app.router.ts:1513`, `:1601`, `:4488`, `:4541`; `apps/web/app/(authenticated)/page.tsx:70`.
- Complete when: define whether count means actual units or planned capacity, derive/update each metric consistently across all write paths, and test creation, deletion, finalization, activation, expiration and archival together.

### R11 — Implement finalized lease editing and tenant amendments

**Confirmed gap.** Edit Lease and Edit Tenants controls have no action handlers. The router supports updating drafts, not amending finalized terms or assignments.

- Evidence: `apps/web/app/(authenticated)/leases/[id]/page.tsx:175`; `apps/api/src/router/app.router.ts:3772`.
- Complete when: rent, dates, due day and tenant changes have effective dates, validation, revision history and defined effects on future invoices. Previously billed recipients and payments remain historically accurate.

### R12 — Implement renewal, notice and termination

**Confirmed gap.** Renew Lease and Terminate are visible without handlers. Automatic scheduled activation/expiration exists, but does not replace an operator-driven move-out or renewal flow.

- Evidence: `apps/web/app/(authenticated)/leases/[id]/page.tsx:181`; `apps/worker/src/lease-activation.ts`.
- Complete when: operators can end a lease early, record notice and renew/continue a lease, with overlap protection, occupancy updates, job rescheduling and final billing policy. Archiving must continue to be clearly distinct from termination.

### R13 — Apply archive eligibility rules at the API boundary

**Confirmed validation gap; policy needs a decision.** Property/tenant archival is a simple status update. The wizard excludes archived properties/units in its selector, but finalization checks entity existence rather than archive state. Archived tenant eligibility likewise needs enforcement. A draft can outlive an entity's archival.

- Evidence: `apps/api/src/router/app.router.ts:1673`, `:1961`, `:4012`; `apps/web/app/(authenticated)/leases/new/page.tsx:288`.
- Complete when: define archival with active leases, preserve receivables, and reject newly archived selections at finalization across every creation API. Test archive-after-draft and restore flows.

### R14 — Decide whether tenants themselves can mark payments

**Confirmed scope gap if “paid by the tenant” means tenant self-service.** Current payment recording is a staff action protected by invoice-edit permission, with a selected tenant as payer. Tenant records are separate from authenticated user accounts; the reviewed app has no tenant-scoped portal/payment route.

- Evidence: `apps/api/src/router/app.router.ts:2504`; `apps/web/components/record-payment-drawer.tsx`; `packages/db/prisma/schema.prisma` (`User`, `Tenant`).
- Complete when: either explicitly launch staff-recorded payments only, or add tenant invitations/login linkage, own-invoice authorization and a tenant-reported-payment workflow. A tenant's claim should have a defined confirmation status before counting as collected funds. Online card/ACH collection is a separate scope decision.

### R15 — Complete account notification scope

**Partially implemented.** Verification and password reset emails have real delivery infrastructure. No in-app notification inbox, unread state/preferences, or rent/invoice notification producers were found. Password and email changes do not enqueue security-change notices.

- Evidence: `apps/api/src/modules/notification-outbox.ts`; `apps/api/src/router/auth.router.ts:376`; `apps/api/src/router/app.router.ts:905`; `apps/worker/src/main.ts`; `packages/db/prisma/schema.prisma:820`.
- Complete when: choose required event types/channels; implement producers, recipients and user-facing delivery behavior. For an email-only MVP, verify invitation, verification, reset and security-change delivery/recovery. Add invoice notices/reminders if promised. Inbox/preferences can be a later feature if explicitly excluded.

### R16 — Verify replacement sign-in email

**Confirmed gap.** Self-service email changes check the password, then immediately replace the email. They do not verify ownership of the new address first. Profile editing, photos, password changes and initial account verification already exist.

- Evidence: `apps/api/src/router/auth.router.ts:399`; `apps/web/components/account-info-card.tsx`.
- Complete when: a pending address is verified with an expiring, single-use token before replacing the current sign-in address; the old address receives a notice; expiry, duplicate addresses and recovery are tested.

### R17 — Replace dummy dashboard content and remove inactive actions

**Confirmed dummy content.** The dashboard hardcodes “July Rent Roll,” `$184,220`, 18 work orders, approval counts and task descriptions. Search is display text and Invite has no handler. Lease detail includes inactive Notes and Damage Report actions; generic note files show “coming soon.” Application templates and sent requests are placeholder pages.

- Evidence: `apps/web/app/(authenticated)/page.tsx:19`, `:90`, `:134`; `apps/web/app/(authenticated)/leases/[id]/page.tsx`; `apps/web/components/notes-drawer.tsx:581`; `apps/web/app/(authenticated)/applications/templates/page.tsx`; `apps/web/app/(authenticated)/applications/request-sent/page.tsx`.
- Complete when: public navigation exposes working features and truthful empty states. Replace financial/operational numbers with scoped queries. Hide or clearly disable deferred actions. Application form building and damage reports need not block the seven milestones.

### R18 — Add release acceptance coverage and enforce it in CI

**Confirmed coverage/enforcement gap.** Existing tests cover useful lease, invoice, auth, permission and worker cases. The main quality workflow runs script tests, lint, typecheck and build, but not API/worker suites or Playwright. Browser tests are limited to login, session idle and lease drafts.

- Evidence: `.github/workflows/ci.yml:25`; `tests/e2e`; `apps/api/src/tests`; `apps/worker/src/tests`.
- Complete when: CI runs isolated database/worker tests and a clean-organization browser path: property → unit → tenants → finalized lease → generated invoice → payment → remaining balance → archive/history. Include restricted roles, co-tenants, expired leases, upload failure, worker restart, calendar boundaries and mobile forms. Add focused property/unit/tenant CRUD lifecycle acceptance tests.

## Additional MVP recommendations

- **Operational readiness:** verify backups and a restore drill for PostgreSQL and object storage, migration rollback/recovery procedures, worker failure alerts and production SMTP delivery. This review does not establish whether deployment-side controls already exist.
- **Financial export:** provide a CSV invoice/payment ledger and tenant statement so early users can reconcile records and leave with their data.
- **Lease documents:** basic attachment/download support is useful; e-signatures, a full document builder and damage reports can follow later.
- **Keep initial scope narrow:** staff-operated property management with manual payment recording is a smaller release than a tenant portal plus online payment processing. The latter should be an explicit milestone, not implied by a payer dropdown.
- **Maintenance:** an existing implementation is present. Either smoke-test and include its basic create/update/resolve flow, or remove it from the MVP navigation until reviewed more deeply.
- **Multi-organization model:** document that administrator access is system-wide (`apps/api/src/router/context.ts`) and test organization-owner/custom-role isolation before a hosted multi-customer release.

## Suggested order

1. Financial and access correctness: R03–R08.
2. Complete lease-to-billing chain: R01–R02, R11–R12.
3. Finish entity lifecycle behavior: R09–R10, R13.
4. Resolve payment audience and notification scope: R14–R16.
5. Remove placeholders and pass clean-install release acceptance: R17–R18.

## GitHub release tracking

[Parcelis: First Key 🔑 milestone](https://github.com/parcelis/parcelis/milestone/3) contains 24 issues, including [release acceptance gate #324](https://github.com/parcelis/parcelis/issues/324). The gate has native blocked-by links to its 23 required deliverables. The dependency graph was verified to have no open deferred issue blocking First Key directly or transitively.

| Audit finding | First Key issue(s) |
| --- | --- |
| R01 — Finalization billing | [#307](https://github.com/parcelis/parcelis/issues/307), [#308](https://github.com/parcelis/parcelis/issues/308), with allocation/deposit integration in [#186](https://github.com/parcelis/parcelis/issues/186), [#187](https://github.com/parcelis/parcelis/issues/187) |
| R02 — Recurring generation | [#310](https://github.com/parcelis/parcelis/issues/310) |
| R03 — Persisted invoice directory | [#312](https://github.com/parcelis/parcelis/issues/312) |
| R04 — Financial calculations | [#151](https://github.com/parcelis/parcelis/issues/151) |
| R05 — Invoice/payment history | [#313](https://github.com/parcelis/parcelis/issues/313) |
| R06 — Safe tenant deletion | [#314](https://github.com/parcelis/parcelis/issues/314) |
| R07 — Nested permissions | [#315](https://github.com/parcelis/parcelis/issues/315) |
| R08 — Clean bootstrap | [#316](https://github.com/parcelis/parcelis/issues/316) |
| R09 — Unit archival | [#95](https://github.com/parcelis/parcelis/issues/95) |
| R10 — Unit/occupancy counts | [#317](https://github.com/parcelis/parcelis/issues/317) |
| R11 — Finalized edits | [#318](https://github.com/parcelis/parcelis/issues/318) |
| R12 — Notice/renewal/termination | [#319](https://github.com/parcelis/parcelis/issues/319), existing automation verification in [#246](https://github.com/parcelis/parcelis/issues/246) |
| R13 — Archive eligibility | [#320](https://github.com/parcelis/parcelis/issues/320) |
| R14 — Payment audience | Staff-recorded payments verified in [#324](https://github.com/parcelis/parcelis/issues/324); tenant self-service deferred to [#326](https://github.com/parcelis/parcelis/issues/326) in Tenant Portal |
| R15 — Account emails | [#247](https://github.com/parcelis/parcelis/issues/247), [#272](https://github.com/parcelis/parcelis/issues/272), [#321](https://github.com/parcelis/parcelis/issues/321) |
| R16 — Replacement email verification | [#322](https://github.com/parcelis/parcelis/issues/322) |
| R17 — Dummy content/inactive actions | [#323](https://github.com/parcelis/parcelis/issues/323) |
| R18 — Acceptance and operations | [#324](https://github.com/parcelis/parcelis/issues/324), [#325](https://github.com/parcelis/parcelis/issues/325) |

Explicitly separated from First Key:

- [#188](https://github.com/parcelis/parcelis/issues/188): richer live billing preview presentation; minimum accurate review stays in #308.
- [#309](https://github.com/parcelis/parcelis/issues/309): advanced credit/refund and protected-invoice amendments; basic supported edits/lifecycle are #318/#319.
- [#311](https://github.com/parcelis/parcelis/issues/311): bulk legacy schedule adoption; reporting correctness stays in #151/#312.
- [#248](https://github.com/parcelis/parcelis/issues/248), [#270](https://github.com/parcelis/parcelis/issues/270): expanded monitoring/status features; essential operations are #325.
- [#326](https://github.com/parcelis/parcelis/issues/326): tenant portal payment reporting, assigned to the Tenant Portal milestone.
- [#327](https://github.com/parcelis/parcelis/issues/327): optional notification inbox/preferences/billing reminders.
- [#328](https://github.com/parcelis/parcelis/issues/328): non-monthly billing frequencies.
- [#329](https://github.com/parcelis/parcelis/issues/329): ledger export and tenant statements.

Issue types, existing repository labels and priorities in issue bodies were applied. Unresolved design choices remain marked for design/triage; creating this backlog does not certify implementation completion. Existing implementation work and discussions were preserved.

## Verification and documentation

API and web typechecks passed. All 28 focused tests in `invoices.router.test.ts`, `lease-finalization.router.test.ts` and `lease-lifecycle.router.test.ts` passed. These router tests use database doubles; they do not validate database constraints, concurrent transactions or the browser workflow. No production database, demo seed, migration or browser workflow was run as part of the review. Source-proven behavior above should become regression tests when fixes are implemented; concurrency and deployment findings require isolated runtime validation. Full build, lint, remaining suites and end-to-end tests were not run for this source audit.

This document is the review artifact. Product behavior was not changed, so no user-guide, dependency, contributor, README or architecture updates were needed for this audit. The fixes should update their applicable documentation when implemented.
