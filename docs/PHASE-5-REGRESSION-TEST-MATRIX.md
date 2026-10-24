# BBen — Phase 5 Regression Test Matrix
Date: 2026-10-24
Branch: `test/phase-3-isolated-validation`
Purpose: Turn the reviewed safeguards into a repeatable acceptance checklist.
Status: Test plan only. No test orders were created and no production writes/deployments were performed.

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

## Pass criteria
- No unauthorized read or mutation succeeds.
- No failed checkout leaves partial orders, altered stock, or consumed coupon usage.
- Stock is never negative and cancellation never restores stock twice.
- Historical order commission snapshots remain unchanged.
- Existing order/account/settings data in production remains untouched.
- Every failure is captured with the actor, operation, expected result, actual result, and relevant logs.

## Approval gates
1. Do not run these tests against production.
2. A separate Supabase branch is required before database regression tests; its recurring cost has not been approved.
3. Do not merge or deploy based solely on this checklist; attach actual test evidence first.
