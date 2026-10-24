# BBen — Phase 4 ACL and Index Follow-up
Date: 2026-10-24
Scope: Read-only catalog queries against production Supabase. No writes or deployment.

## Effective EXECUTE grants
The exact function ACL query returned these grantees for each of the 10 reviewed SECURITY DEFINER functions:
- `authenticated`
- `postgres`
- `service_role`

Neither `PUBLIC` nor `anon` appeared as an EXECUTE grantee in the effective ACL output for the reviewed functions. This narrows the advisor warning: the existence of authenticated grants is intentional for app RPCs and is not, by itself, proof of an exposure. Keep the per-function authorization checks and add regression tests for non-admin/non-owner callers.

Functions covered: `admin_dashboard_summary`, `admin_get_platform_settings`, `admin_list_commission_ledger`, `admin_list_merchants`, `admin_set_store_status`, `admin_update_platform_commission`, `cancel_customer_order`, `checkout_cart`, `get_platform_commission_rate`, `update_merchant_order_status`.

## Index inventory
Read-only inventory found existing indexes on key access paths including:
- Cart: `customer_id`, `product_id`, and unique (`customer_id, product_id`).
- Orders: `customer_id`, `status`, unique `order_number`.
- Order items: `order_id`, `product_id`, `store_id`.
- Products: `category_id`, `status`, `store_id`.
- Coupons: unique `code`, active/date window.
- Coupon redemptions: (`coupon_id, customer_id`).
- Platform settings and commission audit primary keys.

This is not a full index-performance assessment: FK coverage and workload/query plans still need review. Do not add duplicate indexes just because the advisor reported missing FK indexes; compare the exact FK columns and leading index columns first.

## Recommendation
- No blanket permission revocation is recommended based on current evidence.
- Keep the existing app-required authenticated grants unless a function-by-function regression-tested change is justified.
- The next database change should be a narrowly scoped, evidence-backed migration, tested on an isolated Supabase branch. No branch was created because it incurs recurring cost and the user has not explicitly approved it.
- Production data, orders, stock, settings, commission rates, and audit rows remain unchanged by this review.
