# BBen — Phase 4: Proposed Security Fixes and Validation Plan
Date: 2026-10-24
Branch: `test/phase-3-isolated-validation`
Status: Review plan only. No SQL, production data, settings, or deployment changed.

## Findings requiring careful treatment

### 1. SECURITY DEFINER RPCs
The security advisor reported 10 functions executable by `authenticated`. This alone does not prove an exploit. Review each function's full body, effective grants, ownership, and caller before changing permissions:
- `admin_dashboard_summary`
- `admin_get_platform_settings`
- `admin_list_commission_ledger`
- `admin_list_merchants`
- `admin_set_store_status`
- `admin_update_platform_commission`
- `cancel_customer_order`
- `checkout_cart`
- `get_platform_commission_rate`
- `update_merchant_order_status`

Required checks:
- Admin RPCs reject non-admin users server-side, not only in UI.
- Customer cancellation checks order ownership and allowed order states.
- Checkout derives price/commission from trusted database values, validates stock and quantity atomically, and cannot accept a client-supplied lower price.
- Merchant order updates are limited to orders belonging to that merchant and valid state transitions.
- Public/anon execution is not granted unless explicitly needed.
- `search_path` is fixed for every SECURITY DEFINER function, and object references are schema-qualified where practical.

Do not revoke EXECUTE from `authenticated` globally; the buyer, merchant, and admin flows may depend on these grants.

### 2. Commission-rate read RPC
Current migration `20261023123000_expose_platform_commission_rate_to_sellers.sql` returns the stored `platform_settings.commission_rate`, but falls back to `5.00` if no row exists. This default could misrepresent the actual configured rate if settings are missing. Before changing it, inspect the settings table's constraints, row cardinality, and all callers. Preserve the configured rate and historical order commission snapshots; do not write a new rate as part of this review.

### 3. RLS
The advisor reports RLS enabled without policies on `platform_settings` and `platform_commission_audit`. Keep direct access blocked unless a concrete user-facing requirement proves otherwise. Prefer narrowly scoped, server-checked RPCs over broad table policies.

### 4. Auth and performance
- Review enabling leaked-password protection in Supabase Auth; this is a configuration change and should be separately approved/tested.
- Inspect the 13 missing foreign-key indexes and four auth/current_setting policy warnings. Add indexes only after checking existing indexes and query plans; optimize policies without weakening access control.

## Required regression tests before merging
- Unauthenticated and ordinary authenticated users cannot invoke admin actions.
- Admin dashboard, merchant listing, store activation/suspension, and commission audit work for admin only.
- Seller sees the configured commission rate; no settings row or duplicate settings rows produce an explicitly handled result.
- Buyer checkout validates stock and price; failed checkout does not partially mutate stock/orders.
- Customer cancellation enforces ownership and allowed status.
- Merchant order updates enforce merchant ownership and valid transitions.
- Historical orders, inventory, user accounts, commission snapshots, and audit history remain unchanged.
- Browser tests cover Arabic/RTL, English/LTR, PWA manifest/icons, service-worker offline behavior, and installability.

## Safety gates
1. A separate Supabase development branch is required for schema/grant changes. Its quoted recurring cost is $0.01344/hour; no branch is created without explicit approval.
2. Prepare proposed migration(s) on this GitHub test branch only.
3. Run regression tests against isolated test data, never production orders.
4. Review the diff and test evidence before merging or deploying.
