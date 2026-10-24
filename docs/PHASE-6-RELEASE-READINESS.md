# BBen — Phase 6 Release Readiness Review

Date: 2026-10-24
Branch: `test/phase-3-isolated-validation`
Scope: Final static/read-only release review. No production writes, migrations, account/order/stock/commission changes, or deployment.

## Verified findings

### 1. Deployment boundary
The Cloudflare deployment workflow triggers on pushes to `main` or manual dispatch; test-branch pushes do not deploy automatically. It builds static assets and generated PNG icons before invoking Wrangler. Do not manually dispatch the deploy workflow for this validation branch.

### 2. CI responsibilities clarified
Two separate, read-only workflows run checks:
- `BBen Static Validation` checks required files, JavaScript syntax, manifest/PWA references, and `tests/phase6-static.test.mjs`.
- `BBen Build Input Validation` runs `node scripts/validate-build.mjs` to check deployment inputs and PWA metadata.

The second workflow was renamed from the misleading `BBen Static Validation` display name; its path remains `.github/workflows/deno.yml` for now. This avoids duplicate workflow names without changing its triggers or validation behavior. Both workflows use read-only repository permissions and do not deploy or modify the database. The tested branch head passed `BBen Build Input Validation` run [40077956682](https://github.com/hameeddakhil3-coder/testBBen/actions/runs/40077956682) and `BBen Static Validation` run [40077956702](https://github.com/hameeddakhil3-coder/testBBen/actions/runs/40077956702). Subsequent documentation-only commits require their own CI results before this exact HEAD is considered verified.

### 3. Merchant multi-store behavior
The reviewed `update_merchant_order_status` function selects the earliest-created store owned by the authenticated merchant and limits order operations to that store. If the product permits multiple stores per merchant, valid orders from other owned stores may be rejected. This is a code-level limitation; the intended product rule still needs confirmation. No runtime fix was applied because order-status and stock-restoration behavior requires isolated regression tests.

### 4. Commission fallback
The current production settings row was observed read-only with commission rate `1.50`; three audit rows were present. The read RPC and checkout path include a `5.00` fallback if settings are absent. The fallback is not active while the existing settings row is present. Do not change the configured rate or fallback without a tested migration and explicit approval.

### 5. Foreign-key index candidates
Read-only catalog comparison identified 14 foreign-key constraints without a full valid index whose leading columns cover the FK columns. This is a candidate list, not proof that all 14 indexes should be added: inspect workload, existing partial/composite indexes, and the advisor's scope before preparing any migration. No indexes were created.

### 6. PWA
Static source confirms manifest entries, service-worker registration, offline fallback, and a deployment step that generates 192px/512px PNG icons. Live HTTP responses, icon appearance, installability, offline behavior, and cache behavior still require browser/device acceptance testing. The service worker caches successful same-origin HTML navigations for offline fallback; verify on a real browser that no personalized HTML is ever embedded in those responses before considering private-page caching fully accepted.

## Current phase status

| Area | Status | Evidence / remaining gate |
|---|---|---|
| Source syntax and static regressions | CI has passed on previously checked commits | Re-check Actions for the newest commits |
| Deployment isolation | Source-reviewed; test branch does not auto-deploy | Do not dispatch deployment |
| Function ACL and role guards | Read-only catalog review completed for 10 SECURITY DEFINER functions | Role-specific behavioral tests remain |
| Checkout, coupon, cancellation, stock concurrency | Not behaviorally tested | Requires isolated database and synthetic data |
| Commission snapshot/history | Source-reviewed; current rate observed as 1.50 | Behavioral regression in isolation |
| Multi-store merchant orders | Known conditional limitation | Confirm intended product behavior, then test |
| FK indexes | 14 candidates identified | Workload/advisor review before proposing migration |
| PWA | Static checks only | Browser/device acceptance still required |
| Production deployment readiness | **Not approved** | Do not merge/deploy until blocked tests are evidenced |

## Remaining blockers (not safe to claim complete)

1. No isolated Supabase development branch exists; recurring cost has not been approved.
2. Database behavioral and concurrency tests have not been run.
3. Mobile/browser PWA acceptance tests have not been run.
4. The multi-store product rule is unresolved.
5. The latest GitHub Actions runs must be checked after the latest test-branch commits.

## Safety record

No production SQL writes or schema changes were performed. No users, orders, products, stock, commission settings, or audit records were changed. No test orders were created. No paid database branch/project was created. No Cloudflare deployment was performed.
