# BBen — Phase 6 Release Readiness Review
Date: 2026-10-24
Branch: `test/phase-3-isolated-validation`
Scope: Static review of deployment workflow and application source; no deployment or production changes.

## Findings

### 1. Deployment is gated to main
The Cloudflare deploy workflow runs on pushes to `main` or manual dispatch. Commits made only to the test branch do not automatically deploy through this workflow. Keep production protected from test-only changes.

### 2. Asset preparation is explicit
The workflow copies a fixed list of storefront, merchant, customer, market, admin/platform, manifest, service-worker, and offline files into `public/`. It generates PNG PWA icons from a Python routine and copies the platform page to the deployed admin route. Any new runtime asset must be added to the explicit copy list or it may be absent from deployment.

### 3. CI checks are not aligned with browser code
The Deno workflow runs `deno lint` and `deno test -A`, and its triggers target pushes/PRs on `main`. This does not provide useful feedback on commits confined to the test branch unless they are part of a PR into main. The repository is predominantly browser JavaScript/HTML and does not show an obvious Deno test suite in the reviewed tree. Before changing CI, inspect the full tree and current workflow run logs; avoid disabling tests merely because they fail.

### 4. Multi-store merchant behavior needs an explicit product decision
The reviewed `update_merchant_order_status` function selects the earliest-created store owned by the merchant, then checks whether the order contains an item from that one store. If a merchant can own multiple stores, the function may reject valid orders from their other stores. Confirm whether the platform guarantees one store per merchant. If multiple stores are supported, a scoped store identifier or a query over all stores owned by the caller may be required, followed by tests for multi-store and multi-store orders.

### 5. PWA remains unverified on a live browser
The workflow generates PNG icons, but static inspection cannot prove that the deployed URLs return valid images or that installability/offline behavior works on a phone. Test the deployed manifest, icons, service worker, offline fallback, and install prompt in a real browser before marking PWA complete.

## Recommended next actions
1. Decide whether one merchant can own multiple stores.
2. Review actual CI run logs and identify whether the Deno job fails for real defects or because it is the wrong validation method.
3. Add branch/PR-safe checks appropriate for this JavaScript project, then run them on the test branch.
4. Run isolated database regression tests before any permission/schema changes.
5. Run mobile-browser acceptance tests for PWA.
6. Merge/deploy only after reviewing test evidence.

## Safety status
No production SQL writes, no account/order/stock/commission changes, no database branch creation, and no Cloudflare deployment occurred during this review.
