# Currency inventory for #616

Source audit for [backend currency support](https://github.com/parcelis/parcelis/issues/616),
reviewed on November 12, 2026 against commit `84a8063454871ff769fa0efa5f5b12c3fa94170e`.
This records current behavior and recommended currency ownership/locking rules; it does not
implement them or inspect live database contents. Frontend implementation belongs to
[#617](https://github.com/parcelis/parcelis/issues/617).

## Shared currency contract (step 2)

[currency.ts](packages/schemas/src/currency.ts) exports the shared contract through
`@parcelis/schemas`:

- `currencyCodeValues` defines the enabled currency allowlist: USD only. `currencyCodeSchema`
  derives validation from that list.
- `defaultCurrencyCode` is explicitly `USD`. Validation does not supply a default for missing
  values; callers can make an update field optional without resetting an existing currency.
- `currencyMetadata` stores code, name (`US Dollar`), and `minorUnitDigits` (`2`, meaning 100
  minor units per dollar). `currencyMetadataSchema` validates the metadata structure.
- `CurrencyCode` and `CurrencyMetadata` are inferred from their Zod schemas.

Existing `*Cents` fields retain their USD cents semantics. This step adds no money conversion,
formatting, API settings, or automatic locale selection. Storage is implemented in step 3 below.
Unit API writes now apply transactional locking. Other monetary writers remain subsequent work in #616. Additional
enabled codes must have metadata and pass the later backend/frontend rollout checks.

## Currency models and migration (step 3)

Organization now stores `currencyCode` with a USD default and nullable `currencyLockedAt`.
Lease stores nullable `currencyCode`, and Invoice stores required `currencyCode` with a USD
default. These use portable Prisma `String` and `DateTime` fields.

The initial currency migration locks every existing organization and assigns USD to existing
completed leases and drafts with monetary evidence. Empty draft currency stays null. New
organizations start with USD and a null lock timestamp. Existing invoice write paths receive
the USD database default.

The migration and client generation have been run locally. An isolated PostgreSQL regression
test applies the actual migration to legacy-shaped records, compares all eleven monetary
columns before and after, and checks legacy locks, empty drafts, zero allocations, archived
leases, invoice defaults, and new-organization defaults. The database integration command
includes this test.

Subsequent backend work must bind lease currency on monetary saves, copy it into invoices,
and enforce permanent organization locking transactionally across the inventoried write paths.
The model fields provide storage for that enforcement.

## Shared transactional helper

`lockOrganizationCurrency(tx, organizationId)` is exported from `@parcelis/db`. It accepts
the caller's Prisma transaction, conditionally sets `currencyLockedAt` when null, then reads
and returns the stored `currencyCode`. Its return value follows the database model's string
type. Supported-code validation remains in the shared schema used by API boundaries.

The conditional update precedes the currency read so concurrent first saves and conditional
currency changes coordinate on the organization row. Existing lock timestamps are preserved.
Callers use the same transaction for their monetary save, including valid zero amounts, so
failure rolls back both the lock and the record. Future currency changes must also update
conditionally on a null lock timestamp.

Integration coverage exercises saved zero rates, organization isolation, an existing lock,
stored currency retrieval, rollback/retry, concurrent monetary saves and conditional currency
changes, and a missing organization.

## Unit write-path integration

`units.create`, `units.update`, `properties.create`, and `properties.update` call the shared
helper inside their save transaction whenever they save unit rates. Standalone unit routes
validate record ownership and option IDs inside that transaction. Property updates repeat
their organization ownership filter on the transactional property lookup.

A zero rate establishes the lock. Property saves with an empty submitted unit list add no
rate and skip the helper. Later edits preserve an existing timestamp, and failed saves roll
back both the record changes and any newly created lock.

API integration tests exercise all four writers, property-only saves, zero rates, existing
timestamps, rollback after duplicate unit names, foreign organization IDs, and real REST
token requests. CI includes the currency integration tests in the PostgreSQL API suite.
The companion Add a Property and Unit Details guides document the rate-locking behavior.

## Stored amounts

There are **11 monetary columns across seven models**, all currently Prisma `Int`/`Int?`
with implicit cents semantics and no stored currency code. No additional typed monetary
columns were found in the Prisma schema. Money also appears in activity JSON and a generated note.

| Model                                                   | Monetary columns                           | Current rules                                                                               | Recommended currency source                                                      |
| ------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Unit](packages/db/prisma/schema.prisma#L358)           | `marketRateCents`                          | Required; input permits zero; no database default.                                          | Locked organization through `Unit.property.organizationId`.                      |
| [Application](packages/db/prisma/schema.prisma#L534)    | `annualIncomeCents`                        | Required; input permits zero.                                                               | Locked organization through `Application.organizationId`.                        |
| [Lease](packages/db/prisma/schema.prisma#L602)          | `monthlyRentCents`, `securityDepositCents` | Rent nullable on drafts, positive when complete; deposit defaults to zero and permits zero. | Lease currency captured from the organization when monetary data is first saved. |
| [LeaseTenant](packages/db/prisma/schema.prisma#L655)    | `rentShareCents`, `depositShareCents`      | Both nullable; draft shares may be zero; complete individual rent shares must be positive.  | Parent lease currency.                                                           |
| [Invoice](packages/db/prisma/schema.prisma#L670)        | `amountCents`, `balanceCents`              | Derived total and outstanding balance; generated prorated invoices can have zero totals.    | Invoice currency copied from its lease.                                          |
| [InvoiceItem](packages/db/prisma/schema.prisma#L727)    | `rateCents`, `amountCents`                 | Rate input permits zero; line amount is quantity multiplied by rate.                        | Parent invoice currency.                                                         |
| [InvoicePayment](packages/db/prisma/schema.prisma#L742) | `amountCents`                              | Payment input must be positive; reversal retains the amount and restores invoice balance.   | Parent invoice currency.                                                         |

`paidCents` is an input/derived value, not a database column. `quantity`, percentages,
rent due day, and invoice counts are not monetary values. `InvoiceCharge` stores names and
description templates, not a price. Tenant and applicant identities, maintenance tickets,
and utility/amenity catalogs have no typed monetary fields in this schema.

## API write paths

The following **15 procedures** write entered or calculated monetary values. The four unit
writers now use the shared helper. The remaining eleven procedures need
the same transaction-safe organization currency gate. A gate must read currency inside the
transaction and keep currency selection and the monetary write consistent; request context
alone is insufficient for this decision. Existing updates must preserve the record's currency.

| Procedure                                                          | Monetary effect                                                                                | Required currency/lock behavior                                                                                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [properties.create](apps/api/src/router/app.router.ts#L1800)       | Creates nested units using `getUnitCreateData`.                                                | Lock when at least one unit rate is saved, including zero. A property with no units adds no amount.                                                           |
| [properties.update](apps/api/src/router/app.router.ts#L1864)       | Creates/updates nested units and can remove units.                                             | Lock for saved unit rates; removal must never unlock.                                                                                                         |
| [units.create](apps/api/src/router/app.router.ts#L5186)            | Creates a unit with required market rate.                                                      | Lock through the verified property's organization, including a zero rate, in the unit creation transaction.                                                   |
| [units.update](apps/api/src/router/app.router.ts#L5211)            | Writes market rate through `getUnitUpdateData`.                                                | Preserve organization currency and ensure the permanent lock.                                                                                                 |
| [applications.create](apps/api/src/router/app.router.ts#L3439)     | Creates application income alongside applicant details.                                        | Lock for saved income, including zero.                                                                                                                        |
| [applications.update](apps/api/src/router/app.router.ts#L3482)     | Updates application income.                                                                    | Preserve organization currency and ensure the lock.                                                                                                           |
| [tenants.createLease](apps/api/src/router/app.router.ts#L2435)     | Creates rent/deposit and nested allocations; complete leases generate invoices.                | Capture lease currency and lock even when this complete-input route saves status `draft`.                                                                     |
| [leases.create](apps/api/src/router/app.router.ts#L4945)           | Second complete-input lease creation path, including nested allocations and optional invoices. | Same rules as `tenants.createLease`; neither path may be omitted.                                                                                             |
| [leases.updateDraft](apps/api/src/router/app.router.ts#L4385)      | Writes rent/deposit, normalizes deposit to zero, and replaces allocation rows.                 | Lock for supplied non-null rent/deposit or actual allocation values, including explicit zero. Preserve a previous lock after clearing amounts or allocations. |
| [leases.finalizeDraft](apps/api/src/router/app.router.ts#L4596)    | Validates persisted amounts and generates rent invoices; supports retry.                       | Require a bound lease currency matching the locked organization; generated invoices inherit it. Finalization must be safe if the lock is already set.         |
| [invoices.createManual](apps/api/src/router/app.router.ts#L2833)   | Creates total, balance, nested items, and an optional payment from `paidCents`.                | Inherit lease currency for all amounts, including the initial payment.                                                                                        |
| [invoices.update](apps/api/src/router/app.router.ts#L3141)         | Replaces items and recalculates total/balance while preserving money already paid.             | Retain invoice currency; do not rebind from browser or current request preferences.                                                                           |
| [invoices.recordPayment](apps/api/src/router/app.router.ts#L2963)  | Writes payment and subtracts from invoice balance.                                             | Inherit invoice currency and reject any supplied mismatch.                                                                                                    |
| [invoices.recordPayments](apps/api/src/router/app.router.ts#L3048) | Writes a payment batch against one invoice and subtracts its total.                            | Every payment uses that invoice's currency.                                                                                                                   |
| [invoices.reversePayment](apps/api/src/router/app.router.ts#L3245) | Marks payment reversed, adds its amount back to balance, and writes history/note.              | Preserve invoice/payment currency and the lock; reversal is not conversion or deletion.                                                                       |

[leases.createDraft](apps/api/src/router/app.router.ts#L4203) is an additional default-only
write: it creates a draft without entered amounts, but the database supplies a zero deposit.
That default alone should not trigger a new currency lock. The current route requires an
existing unit, whose required market rate would ordinarily have already locked the organization.

The public [REST property/unit routes](apps/api/src/router/public.router.ts#L44) delegate to
these same procedures. Put the guard in the shared backend write path so tRPC, REST, and API
tokens receive the same protection. There are no separate REST money writers in this router.

The future currency-changing [organizations.update](apps/api/src/router/app.router.ts#L916)
must use the same concurrency boundary as first monetary writes. It currently performs a direct
organization update. Merely checking for monetary rows before that update would leave a race.

## Generated amounts, scripts, and historical data

| Path                                                                                                                                 | Current behavior                                                                                             | Currency consequence                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [writeLeaseRentSchedule](apps/api/src/router/app.router.ts#L552)                                                                     | Called by both complete-input lease creation routes and draft finalization.                                  | Thread the saved lease currency into its invoice helper.                                                                                          |
| [createLeaseRentInvoices](apps/api/src/leases/lease-rent-invoices.ts#L22)                                                            | Creates invoices, recipients, and items from a charge plan.                                                  | Persist invoice currency and preserve the existing source keys/idempotency behavior. This helper must not assume USD independently of its caller. |
| [seedRequiredUnits / seedUnitsForProperty](packages/db/prisma/seed.mjs#L120)                                                         | Directly upsert unit market rates.                                                                           | Demo seed writes bypass API guards; establish the USD lock with the first successful monetary write.                                              |
| [upsertLease / seedInvoice](packages/db/prisma/seed.mjs#L219)                                                                        | Directly write leases and nested invoice items/payments; reseeding also deletes and replaces financial rows. | Set/inherit USD explicitly and never reset a permanent lock during reseeding.                                                                     |
| [application seeding](packages/db/prisma/seed.mjs#L901)                                                                              | Directly creates/updates annual income.                                                                      | Apply the same organization currency and lock rules.                                                                                              |
| [deployment smoke setup](apps/api/src/tests/runtime/deployment-smoke.ts#L127)                                                        | Creates a unit directly, then exercises draft finalization and payment APIs.                                 | Update setup and other direct-Prisma test fixtures to satisfy the new invariants. They are not production entry points.                           |
| [manual-payment backfill migration](packages/db/prisma/migrations/20261111000000_backfill_manual_invoice_payments/migration.sql#L11) | Inserts legacy payment rows with SQL.                                                                        | Verify upgraded data receives USD consistently. Do not edit an already applied migration; add a new currency migration.                           |

The [lease worker](apps/worker/src/lease-activation.ts#L77) changes lease status and occupancy;
it does not write monetary amounts or create invoices. Current rent invoices are generated
in API lease-completion transactions, not by a periodic billing worker. No additional money
writers were found in worker/job/email source or production import/export scripts.

## Calculations and persisted history

- [Rent proration](packages/schemas/src/lease-rent-schedule.ts#L72) rounds monthly rent
  multiplied by occupied days divided by days in the month to integer minor units.
- [Individual billing](packages/schemas/src/lease-rent-schedule.ts#L178) floors prorated
  shares and distributes remaining minor units deterministically. Keep allocations and the
  invoice total in the same currency and preserve these sum invariants.
- Manual invoices derive `sum(quantity × rateCents)`; edits subtract previously received
  payments; payment writes subtract from balance; reversals add back the original amount.
- [getLeaseRentInvoiceSummary](apps/api/src/leases/lease-rent-invoices.ts#L69) produces
  `rentTotalCents`. Property and tenant reads also aggregate rents and balances. These are
  derived amounts, not extra monetary columns; their responses need currency context.
- [Invoice activity](apps/api/src/router/app.router.ts#L3027) persists `amountCents` in
  `ActivityEvent.metadata`; lease creation/finalization persists `rentTotalCents` there too.
  Include the applicable currency in new monetary events so their meaning survives deletion
  of the parent record. Existing metadata values remain USD; no amount conversion is needed.
- [Payment reversal notes](apps/api/src/router/app.router.ts#L3290) persist a dollar label
  and division by 100 in generated text. Format future notes with the invoice currency;
  historical USD notes remain historical text.
- [Invoice PDFs](apps/api/src/modules/invoice-pdf.tsx#L202) hardcode USD and division by 100.
  Add currency to their input contract and formatter. This is backend work in #616.

All eleven columns currently have a signed 32-bit storage ceiling of `2,147,483,647` minor
units: `21,474,836.47` at a scale of two. Shared schemas explicitly use this ceiling for
many lease, invoice, and income values, but [unit rates](packages/schemas/src/index.ts#L466)
and [payment inputs](packages/schemas/src/index.ts#L865) lack that explicit database cap.
Review input bounds, products, sums, serialization, and storage together before widening
amounts or enabling another currency.

## Recommended locking and draft rules

1. Saving a meaningful monetary value locks currency, including valid zero rates, zero income,
   explicit zero deposits, and zero allocations. Do not use truthiness or `amount > 0` to
   detect all monetary writes.
2. Omitted/null draft amounts and the automatically defaulted zero deposit alone are not
   monetary entry. [Draft autosave](<apps/web/app/(authenticated)/leases/new/page.tsx#L157>)
   submits nullable monetary keys, so checking only whether a key exists is insufficient.
   An empty allocation list alone adds no monetary value.
3. Draft currency is nullable for an unbound draft and must be assigned on its first monetary
   save in the subsequent backend stage. Once bound, it never
   changes. Do not stamp a permanent USD currency onto an empty draft that could later be
   resumed after an otherwise eligible organization changes currency.
4. Current storage loses the distinction between an explicitly saved zero deposit and an
   untouched default zero. Use the submitted patch for future writes and the permanent lock
   to remember monetary history; do not reconstruct eligibility from the latest amounts.
5. Clearing amounts, replacing/deleting a draft, deleting a unit/application, archiving,
   settling an invoice, reversing a payment, and reseeding must never clear the lock.
6. Every first-write gate and currency-setting change must serialize against the same
   organization record, with currency read inside the transaction. Rollback must also undo
   a newly applied lock if the monetary write fails.

## Migration evidence and limits

The migration backfills USD while preserving the numeric amounts. Historical deletion can
remove all evidence of prior rates or income. The selected migration policy therefore locks
every pre-existing organization, including apparently empty ones, at the migration time.

For lease currency binding, monetary evidence includes non-draft status, non-null rent,
nonzero deposit, non-null allocation values including zero, or an invoice. An empty draft's
default zero deposit is insufficient evidence to bind the draft. An explicitly entered legacy
zero deposit is indistinguishable from that default, and its organization is already locked
to USD by the conservative backfill policy.

## Implementation verification checklist

- [ ] Exercise all 15 monetary procedures, the default-only draft route, and both lease
      creation entry points; verify currency assignment and the permanent lock.
- [ ] Cover nested property units and direct unit routes over both REST and tRPC, including
      API-token organization scope.
- [ ] Cover zero, omitted/null amounts, empty allocations, draft clearing/replacement,
      resumed drafts, and preserved locks after deletion/archive/payment/reversal.
- [ ] Race the first unit/application/draft monetary save against an organization currency
      change; prove no mixed currency or stale assignment is committed. Test failure rollback.
- [ ] Preserve invoice sums, joint/individual billing, proration, partial payment, batch
      payment, reversal, and finalization retry behavior.
- [ ] Verify seed/reseed, direct-Prisma fixtures, and legacy SQL upgrade paths receive the
      intended USD currency and locks.
- [ ] Verify activity metadata, reversal notes, PDFs, and aggregate responses carry the
      correct currency; preserve meaningful fractional balances.
- [ ] Verify database/input limits, intermediate arithmetic, large-value fixtures, and
      JSON-safe serialization before enabling non-USD currencies.

The original inventory was a source-only audit. Step 3 adds database storage and migration
coverage, with the storage stage documented in ARCHITECTURE.md. Organization currency
selection, backend assignment/locking, and corresponding user-facing documentation remain
subsequent work in #616/#617.
