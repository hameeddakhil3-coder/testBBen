# BBen — Phase 4 Function Review Findings
Date: 2026-10-24
Environment inspected: production Supabase catalog, read-only queries only.
Code branch: `test/phase-3-isolated-validation`
No database writes, migrations, data edits, commission changes, or deployment were performed.

## Functions inspected

### Admin RPCs
The following inspected definitions explicitly validate `auth.uid()` against `public.profiles.role = 'admin'` before returning admin data or performing the admin action:
- `admin_dashboard_summary()`
- `admin_get_platform_settings()`
- `admin_list_commission_ledger()`
- `admin_list_merchants()`
- `admin_set_store_status(uuid, text)`
- `admin_update_platform_commission(numeric)`

All inspected definitions set `search_path` to `public, pg_temp`. Keep server-side role checks; UI-only checks are insufficient.

### Buyer cancellation
`cancel_customer_order(uuid)` checks that the caller is signed in and has the customer role, selects an order belonging to that customer under row lock, only allows cancellation from `pending`, updates the status, and restores product quantities. This is a positive ownership/state guard. Regression tests should verify simultaneous cancellation cannot restore stock twice and only the order owner can cancel.

### Checkout
`checkout_cart(...)` checks signed-in customer role, validates required contact fields, reads only the caller's cart, locks product rows, verifies product/store active status and available quantity, reads price from database product rows, snapshots commission on created orders, and decrements stock within the function transaction. These are important safeguards. Remaining validation should confirm all cart and coupon constraints and verify concurrent checkouts cannot oversell.

### Merchant order status
`update_merchant_order_status(uuid, text)` checks signed-in merchant role, resolves a store owned by that merchant, ensures the order has an item from that store, locks the order, and restricts status transitions. Cancellation restores stock for that store's items. Test accounts with multiple stores and multi-store orders before changing behavior.

### Commission-rate read RPC
`get_platform_commission_rate()` is SECURITY DEFINER, fixes `search_path` to `public`, and reads the first available settings row, defaulting to 5.00 if none exists. The migration revokes PUBLIC and anon and grants EXECUTE to authenticated. Before changing this behavior, verify settings-table constraints and all callers. A missing settings row must not silently cause seller-facing commission information to disagree with checkout or admin settings.

## Important next verification: effective grants
Catalog metadata showed these functions executable by `authenticated`, as reported by the advisor. This is not automatically a vulnerability when function bodies enforce role/ownership checks. Verify exact ACLs for each function and check whether `PUBLIC` or `anon` retains EXECUTE. Do not blanket-revoke authenticated grants because buyer, merchant, and admin flows rely on RPCs.

## Remaining work before an executable remediation migration
1. Complete exact ACL review for all 10 functions and all overloads.
2. Inspect table constraints and indexes relevant to cart, orders, order_items, coupons, coupon_redemptions, products, and platform_settings.
3. Prepare SQL migration only after the exact required change is demonstrated; prefer no-op for functions already correctly guarded.
4. Run regression tests on an isolated Supabase database. The development branch is not created because it incurs recurring cost and has not been explicitly approved.
5. Only then review a diff for approval; do not deploy to production as part of this review.
