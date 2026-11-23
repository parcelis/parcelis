# Frontend currency consumers (#617)

The server's `organizations.currency` response supplies operating currency, supported
options, precision, and change restrictions. Production enables USD only. Currency is
independent of locale, dates, timezone, addresses, and payment methods. No conversion occurs.

`OrganizationCurrencyProvider` waits for saved currency before rendering organization
screens. The selected query client and component state change when the organization URL scope
changes; old requests cannot populate the next organization's cache. Currency requests use
a client bound to their organization slug and honor cancellation. Returning to a workspace confirms its
currency with the server before rendering; late mutations refresh that workspace’s own cache. Successful settings saves
refresh saved currency and organization data plus monetary queries. Failed saves preserve
entered organization fields and refresh the authoritative change restriction.

`useMoney` consumes server metadata and the shared `parseMinorUnits`, `formatMinorUnits`,
and storage limits. It supplies exact decimal entry, currency-aware steps/limits, and
formatting with code and full minor-unit precision. Invalid or oversized entries are
rejected without rounding, clamping, or accepting a numeric prefix. Existing `*Cents`
fields retain integer minor units (USD cents); the UI uses major units for entry.

| Consumer                                                 | Currency source and behavior                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Organization General settings                            | Server options and restriction; USD preselected; member/locked/single-option read-only; pending and failure states |
| Portfolio sample collection metric                       | Organization currency through shared formatting                                                                    |
| Property directory                                       | Organization currency for rent, overdue totals, and market rates                                                   |
| Property details                                         | Organization currency for totals/market rates; saved lease currency for individual rent and overdue amounts        |
| Unit details and collection chart                        | Organization currency for market rates; saved lease/invoice currency for obligations                               |
| Property drawer and initial unit state                   | Organization/property metadata for exact major-unit entry and stored minor-unit values                             |
| Application directory, details, drawer                   | Organization currency for annual income, including entry validation                                                |
| Lease directory and details                              | Saved lease currency, preserving fractions                                                                         |
| Lease wizard property selector                           | Organization currency for unit rates and ranges                                                                    |
| Lease wizard resident billing, allocation errors, review | Bound draft currency when present; otherwise organization currency; exact rent/deposit entry and review            |
| Tenant lease drawer and tenant details                   | Organization currency for new rent; saved lease/invoice currency for existing obligations                          |
| Tenant record drawer                                     | Saved lease/invoice currency for rent, payments, and balances; organization currency for aggregate totals          |
| Income summaries and grouped rows                        | Organization currency for same-organization totals; saved invoice currency for individual obligations              |
| New invoice drawer                                       | Selected saved lease currency for item rates, paid amount, subtotal, and balance                                   |
| Invoice details and payment activity                     | Saved invoice/event currency for rates, amounts, payments, and balances                                            |
| Edit invoice drawer                                      | Saved invoice currency for initial amounts, entry limits, totals, and balance                                      |
| Record payment drawer                                    | Saved invoice currency for entry, exact balance comparison, and total                                              |
| Invoice record drawer and actions                        | Delegate money rendering to invoice details/edit/payment components, retaining currency in props                   |
| Invoice PDF preview/download                             | Server-generated output from #616; frontend does not reinterpret amounts                                           |

No frontend monetary report/export generator exists beyond invoice PDF download. Monetary
activity uses invoice rendering; persisted historical reversal notes remain stored text.
Percentage allocations, occupancy, file sizes, and PDF zoom retain their independent scales.

Verification includes pure money tests for USD fractional regression, precision rejection,
limits, zero- and three-decimal fixtures; browser tests for settings roles, permanent locks,
stale eligibility, retained form values, successful currency refresh, loading/failure/retry,
and delayed requests across organization switches. Additional currency fixtures are confined
to tests and do not extend the production registry. Default and locked screenshots are
captured by `organization-currency.spec.ts`. Representative lease, invoice, and payment
browser checks exercise the existing workflows with shared money behavior.
