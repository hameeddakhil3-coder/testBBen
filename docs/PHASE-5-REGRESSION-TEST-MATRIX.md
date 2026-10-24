# BBen — Phase 5 Regression Test Matrix
Date: 2026-10-24
Branch: `test/phase-3-isolated-validation`
Purpose: Turn the reviewed safeguards into a repeatable acceptance checklist.
Status: GitHub Actions passed on 2026-10-24: `BBen Build Input Validation` run 40077956682 and `BBen Static Validation` run 40077956702. Creating an isolated Supabase branch was attempted but the platform rejected it because database branching requires Pro or above. No branch was created; database/browser acceptance tests remain blocked. No production writes or deployments were performed.

## Preconditions
- Use an isolated Supabase development branch with synthetic accounts and products.
- Do not use production checkout or create real test orders.
- Record initial stock, order counts, settings/commission rate, and audit count in the isolated environment only.
- Use distinct customer, merchant, and admin test accounts.

## Security and workflow tests

| ID | Actor | Test | Expected result |
|---|---|---|---|
| SEC-01 | Anonymous | Invoke each admin RPC | Denied; no data or writes |
| SEC-02 | Customer | Invoke admin dashboard, merchant list, store status change, commission update | Denied; settings and store state unchanged |
| SEC-03 | Merchant | Invoke admin RPCs | Denied |
| SEC-04 | Customer A | Cancel Customer B's order | Denied; order status and stock unchanged |
| SEC-05 | Customer | Cancel own pending order | Status changes once; stock restored exactly once |
| SEC-06 | Customer | Cancel own processing/shipped/delivered order | Denied; stock unchanged |
| SEC-07 | Merchant A | Update order belonging only to Merchant B | Denied; order and stock unchanged |
| SEC-08 | Merchant | Attempt invalid order status transition | Denied; no stock changes |
| ORD-01 | Customer | Checkout empty cart | Denied; no order created |
| ORD-02 | Customer | Checkout with missing name/phone/address | Denied; no order or stock mutation |
| ORD-03 | Customer | Checkout with insufficient stock | Denied; no partial order and stock unchanged |
| ORD-04 | Customer | Checkout with inactive product/store | Denied; no order and stock unchanged |
| ORD-05 | Two customers concurrently | Buy final unit of one product | At most one checkout succeeds; stock never becomes negative |
| ORD-06 | Customer | Successful checkout | Price is read from DB; order item price and commission snapshot are persisted; stock decreases once |
| COUP-01 | Customer | Use inactive/expired/exhausted coupon | Denied; no order/stock/coupon counter mutation |
| COUP-02 | Two customers concurrently | Redeem last available coupon use | Usage limit is not exceeded |
| COM-01 | Admin | Read commission settings and audit | Current configured rate and audit history are shown |
| COM-02 | Non-admin | Update commission | Denied; rate and audit remain unchanged |
| COM-03 | Admin | Change rate in isolated environment | Only new test orders use new rate; old orders' snapshots stay unchanged |
| COM-04 | Test setup | Missing platform_settings row | Behavior is explicit and documented; no silent mismatch between seller display and checkout |
| MER-01 | Merchant with one store | Progress order through valid states | Allowed transitions succeed |
| MER-02 | Merchant | Try to operate on another store's order | Denied |
| MER-03 | Merchant with multiple stores | View/update orders from each owned store | Confirm intended store selection behavior; current function chooses the earliest-created owned store and may need a design decision |
| RLS-01 | Anonymous/authenticated | Read platform settings/audit tables directly | Direct access remains blocked unless explicitly intended |
| PWA-01 | Mobile browser | Load manifest and both PNG icons | Successful HTTP responses and valid image content |
| PWA-02 | Mobile browser | Test service worker, offline fallback, install prompt | Expected behavior recorded on supported browsers |

## Free validation actually completed on 2026-10-24

1. GitHub Actions workflow `BBen Static Validation` completed successfully (run #11, commit `f979bfea60efcd766409819649396422ec7a8004`). This run checks required source files, JavaScript syntax, manifest fields, PWA source references, the static regression tests, and test-branch deployment safeguards. This is CI evidence, not a fresh local execution.
   - Run: https://github.com/hameeddakhil3-coder/testBBen/actions/runs/40075784943
2. Read-only Supabase project inspection returned `ACTIVE_HEALTHY`; no development branch exists.
3. Read-only function ACL inspection covered the ten reviewed SECURITY DEFINER RPCs: all had `authenticated` EXECUTE, none had `anon` EXECUTE, and all had a fixed `search_path`. This does not replace role-specific behavioral tests.
4. Read-only settings inspection found exactly one `platform_settings` row, current configured commission rate `1.50`, and three commission audit rows. No values were changed. Preserve this configured rate; do not substitute the 5.00 fallback used only when settings are missing.
5. Read-only FK/index comparison found 14 FK constraints without a full, valid index whose leading columns cover the FK columns. This differs from the advisor's 13 warning count because the metadata query also identified `notifications.user_id`; compare partial/composite index semantics and the advisor scope before adding indexes. Candidate SQL remains unapplied.
6. Source review reconfirmed that `update_merchant_order_status` selects the earliest-created store owned by a merchant, then limits the update to that store. If multiple stores per merchant are supported, this is a confirmed limitation requiring a scoped fix and regression tests. Do not change it until the intended multi-store behavior and isolated tests are established.
7. Static PWA checks do not verify live PNG responses, browser installability, or private-page caching behavior. Those require a browser/preview environment.

## Not yet executed

- SEC-01 through SEC-08, ORD-01 through ORD-06, COUP-01 through COUP-02, COM-01 through COM-04, MER-01 through MER-03, and RLS-01 as behavioral database tests.
- Concurrent checkout/coupon tests.
- Mobile-browser PWA acceptance tests.
- Local execution of the static suite within this session.

Reason: no isolated Supabase branch exists, and its recurring cost has not been approved. No test orders were created in production.

## Pass criteria
- No unauthorized read or mutation succeeds.
- No failed checkout leaves partial orders, altered stock, or consumed coupon usage.
- Stock is never negative and cancellation never restores stock twice.
- Historical order commission snapshots remain unchanged.
- Existing order/account/settings data in production remains untouched.
- Every failure is captured with the actor, operation, expected result, actual result, and relevant logs.

## Approval gates
1. Do not run behavioral database tests against production.
2. A separate Supabase branch is required before database regression tests; its recurring cost has not been approved.
3. Do not merge or deploy based solely on this checklist; attach actual test evidence first.
