# BBen — Phase 5: Foreign-Key Index Review
Date: 2026-10-24
Environment: read-only inspection of production Supabase catalog.
No database writes, data changes, commission changes, or deployment.

## Result
Compared foreign-key columns against the leading column of existing indexes for the checkout/order-related tables. The following FK columns currently have no matching leading-column index:
- `coupon_redemptions.customer_id`
- `coupons.created_by`
- `orders.coupon_id`
- `platform_commission_audit.admin_id`
- `platform_settings.updated_by`

The other inspected FK columns already have matching indexes, including cart customer/product, coupon_redemptions coupon, order_items order/product/store, orders customer, and product category/store. Avoid adding duplicate indexes to those columns.

## Candidate indexes for review (NOT APPLIED)
```sql
CREATE INDEX IF NOT EXISTS coupon_redemptions_customer_id_idx
  ON public.coupon_redemptions (customer_id);

CREATE INDEX IF NOT EXISTS coupons_created_by_idx
  ON public.coupons (created_by);

CREATE INDEX IF NOT EXISTS orders_coupon_id_idx
  ON public.orders (coupon_id);

CREATE INDEX IF NOT EXISTS platform_commission_audit_admin_id_idx
  ON public.platform_commission_audit (admin_id);

CREATE INDEX IF NOT EXISTS platform_settings_updated_by_idx
  ON public.platform_settings (updated_by);
```

These are candidates, not a blanket recommendation to run against production. Before applying, inspect table sizes, index usage, migration conventions, and expected query/delete/update paths. On a large live table, index creation can add I/O and locks; use an isolated test database first and choose concurrent index creation where supported by the migration workflow. The five indexes do not alter row contents, orders, stock, or commission values, but still require a reviewed migration and safe rollout.

## Next gate
Create and validate a migration on an isolated Supabase branch, check query plans and advisor output, then review the diff. The branch incurs a quoted recurring cost of $0.01344/hour and has not been created because explicit cost approval has not been given.
