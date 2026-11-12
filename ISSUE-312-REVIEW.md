# Issue #312: Income invoice directory

## What changed and why

Income now loads invoice records from `invoices.list` for every view. Property lease history still
provides property/unit labels and scheduled rent, but its nested invoice arrays no longer supply
financial rows. This keeps the directory aligned with persisted invoices and their recipient filter.
No invoice is invented for a lease without saved invoices.

Tenant links match invoice recipients even when a former co-tenant no longer belongs to the lease.
Current tenant leases without invoices remain visible as empty states and retain scheduled rent.
A shared invoice appears once with its whole shared balance, rather than once per recipient.

Property list/detail reads retain authorized leases without current tenants. Previously enabling
Tenants View could remove such leases and their invoices entirely. Tenant names remain redacted
when Tenants View is denied; lease and invoice permissions continue to apply.

The Filters panel now includes:

- Lease history: all history, current/scheduled, or ended/archived.
- Invoices: non-void (default), all saved, outstanding, fully paid, or voided.

Property/unit filters and direct links remain supported. Pending filter choices determine available
units; Apply Filters updates the table and invoice summaries together. Scheduled rent only follows property, unit, and current tenant scope; invoice status and history filters do not change contracted rent. Clear Filters resets all four filters,
keeping tenant scope, search, and grouping. Lease-history/invoice selections reset on reload; existing
property/unit URL parameters persist. Search narrows table rows without changing summary cards.

Paid history stays accessible. Void records can be inspected explicitly and contribute zero to group
and financial totals. Amounts remain integer cents until display. New Invoice requires Invoices Create.
Empty messages distinguish no saved invoices from invoices excluded by the filters.

## Review in the UI

1. Open Income with a saved overdue invoice on an ended or archived lease. Check both grouping modes.
2. Expand a unit. Its totals should equal its non-void saved invoices, including paid history.
3. Choose ended/archived history and fully paid invoices; apply. Then inspect voided invoices separately.
4. Open `/income?tenantId=<co-tenant-id>` for a shared invoice, including a former lease member.
   Confirm one invoice and one shared balance. An unrelated tenant must not see that invoice.
5. Open a lease without invoices. It should show an empty message without an invoice identifier/link.
6. Combine property/unit filters, search, and grouping. Clear Filters should retain the tenant restriction.
7. Deny Invoices Create while retaining View: New Invoice should disappear. Existing View restrictions
   and failed-query handling remain in force.

## Files and documentation

- `apps/web/app/(authenticated)/income/page.tsx`: authoritative invoice query, filters, rendering.
- `apps/api/src/router/app.router.ts`: retain tenantless lease context in property reads.
- API invoice/permission tests and `tests/e2e/income-directory.spec.ts`: regressions.
- `ARCHITECTURE.md`: directory data flow.
- Companion docs: `docusaurus-site/docs/Platform User Guide/app-functionality/income-dashboard.md`.
  Existing edits from the preceding invoice work were preserved.

No schema migration, dependency, deployment, or contributor-workflow changes are needed.
The public OpenAPI specification was regenerated and is unchanged; no generated API pages need updating.
README, CONTRIBUTING, and DEPENDENCIES need no changes for this bounded workflow correction.

## Validation

- Focused API invoice and nested-permission suites: 46 passed.
- API and web TypeScript checks: passed using the installed TypeScript binaries.
- Focused ESLint and Prettier: passed (ESLint reports an existing root pages-directory configuration warning).
- Chromium browser regressions: authenticated local session, mocked directory/property responses; no financial writes.
- Companion Docusaurus production build: passed using its installed build tool.
- CodeRabbit review: filter findings addressed (pending unit choices, invoice-free tenant leases, and independent scheduled rent). Final review completed with zero findings.
- OpenAPI regeneration and `git diff --check`: passed.
- The pnpm wrapper attempted an automatic version switch and failed registry signature verification.
  Checks used the already installed project binaries; no dependency or package-manager changes were made.

The full monorepo build and full end-to-end suite were not run; validation focused on the affected workflow.

Browser fixtures deliberately give property-nested invoices different IDs/amounts from the invoice directory
and cover former recipients, archived debt, paid/void filters, exact cents, empty leases, grouping, links,
and Create permission. They complement API query/authorization tests; they do not replace a production-data audit.
