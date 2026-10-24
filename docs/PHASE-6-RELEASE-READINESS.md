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

The second workflow was renamed from the misleading `BBen Static Validation` display name; its path remains `.github/workflows/deno.yml` for now. This avoids duplicate workflow names without changing its triggers or validation behavior. Both workflows use read-only repository permissions and do not deploy or modify the database. The latest checked code commit `cb4698179311e38f22c6c83ad27976ccdf70829c` passed `BBen Build Input Validation` run [40078298360](https://github.com/hameeddakhil3-coder/testBBen/actions/runs/40078298360) and `BBen Static Validation` run [40078298368](https://github.com/hameeddakhil3-coder/testBBen/actions/runs/40078298368), including all steps in both jobs. This documentation update will itself trigger CI on the test branch.

### 3. Merchant multi-store behavior
The reviewed `update_merchant_order_status` function selects the earliest-created store owned by the authenticated merchant and limits order operations to that store. If the product permits multiple stores per merchant, valid orders from other owned stores may be rejected. This is a code-level limitation; the intended product rule still needs confirmation. No runtime fix was applied because order-status and stock-restoration behavior requires isolated regression tests.

### 4. Commission fallback
The current production settings row was observed read-only with commission rate `1.50`; three audit rows were present. The read RPC and checkout path include a `5.00` fallback if settings are absent. The fallback is not active while the existing settings row is present. Do not change the configured rate or fallback without a tested migration and explicit approval.

### 5. Foreign-key index candidates
Read-only catalog comparison identified 14 foreign-key constraints without a full valid index whose leading columns cover the FK columns. This is a candidate list, not proof that all 14 indexes should be added: inspect workload, existing partial/composite indexes, and the advisor's scope before preparing any migration. No indexes were created.

### 6. Merchant image-upload validation
The merchant product-image uploader now accepts only JPEG, PNG, and WebP, enforces the existing 5 MB per-image limit in both selection and upload paths, and derives the stored extension from the MIME type instead of trusting the filename. A static regression test covers these constraints. This reduces accidental acceptance of active/unsupported image formats, but does not replace server-side storage policy and content validation.

### 7. Merchant order-status controls
A static regression test now verifies that the merchant UI offers cancellation only from `pending` and `processing`, permits `shipped` to advance to `delivered`, and keeps `delivered`/`cancelled` terminal in the displayed transition map. Status changes continue to go through the `update_merchant_order_status` RPC and the UI requires an explicit success response before updating local state. This does not prove server-side transition enforcement or exactly-once stock restoration; those remain blocked on isolated behavioral database tests. The multi-store ownership limitation described above also remains unresolved.

### 8. PWA
Static source confirms manifest entries, service-worker registration, offline fallback, and a deployment step that generates 192px/512px PNG icons. Live HTTP responses, icon appearance, installability, offline behavior, and cache behavior still require browser/device acceptance testing. The service worker was hardened on the test branch: version bumped to `bben-pwa-v2` to retire old caches, private seller/admin/profile navigation routes are excluded from the page cache, and navigations with query strings are not cached. Public same-origin HTML navigation can still be cached for offline fallback. This is a source-level mitigation; browser/device acceptance remains outstanding.

## Current phase status

| Area | Status | Evidence / remaining gate |
|---|---|---|
| Source syntax and static regressions | Latest verified run passed before the merchant-upload hardening; new upload regression test added | Check CI triggered by the latest branch commit |
| Deployment isolation | Source-reviewed; test branch does not auto-deploy | Do not dispatch deployment |
| Function ACL and role guards | Read-only catalog review completed for 10 SECURITY DEFINER functions | Role-specific behavioral tests remain |
| Checkout, coupon, cancellation, stock concurrency | Not behaviorally tested | Requires isolated database and synthetic data |
| Commission snapshot/history | Source-reviewed; current rate observed as 1.50 | Behavioral regression in isolation |
| Multi-store merchant orders | Known conditional limitation | Confirm intended product behavior, then test |
| FK indexes | 14 candidates identified | Workload/advisor review before proposing migration |
| PWA | Static tests include private-route/query cache exclusions | Browser/device acceptance still required |
| Production deployment readiness | **Not approved** | Do not merge/deploy until blocked tests are evidenced |

## Remaining blockers (not safe to claim complete)

1. Database behavioral and concurrency tests have been deliberately deferred per the user's instruction to skip the Supabase test-database stage.
2. Checkout, coupon, cancellation, stock concurrency, and role-specific behavior remain unverified at runtime.
3. Mobile/browser PWA acceptance tests have not been run.
4. The multi-store product rule is unresolved.
5. Check the CI runs triggered by this documentation update before considering the current branch snapshot statically verified.

## Safety record

No production SQL writes or schema changes were performed. No users, orders, products, stock, commission settings, or audit records were changed. No test orders were created. No paid database branch/project was created. No Cloudflare deployment was performed.
