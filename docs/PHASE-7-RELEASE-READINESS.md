# BBen — Phase 7 Production Release Readiness Gate
Date: 2026-10-24
Branch: `test/phase-3-isolated-validation`
Status: Release checklist only. No production changes or deployment were performed.

## Current release decision
**NO-GO for production release at this time.** This is not a finding that the app is broken; it means the evidence required to safely release has not yet been collected.

Reasons:
- The Phase 5 regression matrix has been authored but has not been executed against an isolated Supabase database.
- No isolated Supabase development branch exists; the quoted recurring cost has not been explicitly approved.
- No live mobile-browser acceptance evidence has been collected for the PWA manifest, generated PNG icons, service worker, offline behavior, and install prompt.
- No final deployment artifact/build has been verified against the exact source revision intended for release.

## Mandatory release gates

### A. Data and backup
- Verify a current recoverable backup of database data and storage objects, and document the restore procedure.
- Confirm a restore test or an equivalent validated recovery method.
- Record production order count, inventory state, platform commission setting, and commission audit count before any approved release.
- Do not delete or rewrite historical orders, inventory, accounts, commission snapshots, or audit records.

### B. Security
- Run all Phase 5 authorization tests against isolated synthetic users.
- Verify anonymous and non-admin users cannot read admin summaries or mutate platform settings.
- Verify customer ownership checks, merchant store ownership checks, and allowed order-state transitions.
- Review the Supabase security advisor again after any approved database migration.
- Keep direct RLS access to platform settings and commission audit blocked unless a documented requirement justifies a narrowly scoped policy.

### C. Functional regression
- Pass buyer browse/cart/checkout/order-history/cancel flows.
- Pass merchant product/order management and store-specific order handling.
- Pass admin dashboard, merchant listing/status, commission settings, and commission audit history.
- Verify checkout/cancellation concurrency cannot oversell or restore stock twice.
- Verify failed operations leave no partial order, stock, or coupon-counter mutations.

### D. Commission and financial integrity
- Read the configured rate from the actual settings row and confirm seller-facing display agrees with checkout.
- Verify new test orders snapshot the configured rate and historical order snapshots remain unchanged.
- Verify delivery fees are excluded from the commission basis if that is the platform rule.
- Verify audit entries record authorized changes and that unauthorized users cannot change the rate.
- Do not change the production commission rate as part of release testing.

### E. PWA and deployment
- Test manifest and generated 192px/512px icons return valid content.
- Test service-worker update and offline fallback on supported mobile browsers.
- Test Arabic RTL and English LTR layouts on phone and desktop.
- Verify the release is built from the intended source files rather than editing embedded generated output only.
- Confirm GitHub Actions checks pass and deployment logs contain no errors.
- Verify the production URL after a separately approved deployment.

### F. Release controls
- Review the exact commit SHA and diff.
- Attach test evidence and list known limitations.
- Prepare rollback steps and identify the prior stable deployment.
- Obtain explicit user approval before merging to the production branch or deploying.
- Do not use production to create synthetic orders or test account changes.

## Go/no-go rule
Release only when every mandatory gate has evidence, all high-severity failures are resolved, the rollback plan is ready, and the user explicitly approves the deployment. Otherwise retain the current production release and continue isolated testing.
