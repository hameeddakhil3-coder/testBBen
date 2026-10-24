# BBen — Phase 6 Read-only Diagnostics and Next Gate
Date: 2026-10-24
Branch: `test/phase-3-isolated-validation`
Status: Diagnostic SQL templates only. These queries are intended for review; no migration is applied.

## Why no migration yet
The inspected SECURITY DEFINER functions currently show authenticated-only application grants (plus postgres/service_role) and server-side role/ownership checks. The evidence so far does not justify a blanket grant change. Schema and workload context is needed before index changes. The next useful step is to collect narrow, read-only metadata and query plans in a safe environment.

## Read-only FK/index coverage query
Run in the isolated database once approved. It lists foreign keys for which no index begins with the same ordered FK columns on the referencing table.

```sql
WITH fk AS (
  SELECT conrelid, conname, conkey
  FROM pg_constraint
  WHERE contype = 'f'
),
coverage AS (
  SELECT fk.conrelid, fk.conname, fk.conkey,
         EXISTS (
           SELECT 1
           FROM pg_index i
           WHERE i.indrelid = fk.conrelid
             AND i.indisvalid
             AND i.indkey::smallint[] [0:cardinality(fk.conkey)-1] = fk.conkey
         ) AS covered
  FROM fk
)
SELECT n.nspname AS schema_name, c.relname AS table_name, coverage.conname AS foreign_key
FROM coverage
JOIN pg_class c ON c.oid = coverage.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT covered
ORDER BY c.relname, coverage.conname;
```

Note: review composite key column order and existing partial indexes manually before recommending any index. Do not run CREATE INDEX in production as part of diagnostics.

## Read-only table constraints and settings shape
```sql
SELECT c.table_name, c.constraint_name, c.constraint_type
FROM information_schema.table_constraints c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'cart_items','orders','order_items','coupons','coupon_redemptions',
    'products','platform_settings','platform_commission_audit'
  )
ORDER BY c.table_name, c.constraint_type, c.constraint_name;

SELECT id, commission_rate, updated_at, updated_by
FROM public.platform_settings
ORDER BY id;
```

The second query contains operational settings; do not paste sensitive output into a public issue. It must only be run by an authorized operator in an appropriate environment.

## Safe execution order
1. Confirm whether a separate Supabase development branch is approved. Quoted recurring cost: $0.01344/hour (~$9.68 for 30 days if continuously running).
2. Run the read-only FK/constraint checks on that isolated branch.
3. Compare exact FK columns to existing indexes and review query plans.
4. Add only justified indexes or permission changes to a migration on the test branch.
5. Execute the regression matrix with synthetic accounts/products.
6. Review test evidence before any merge or deployment.

## Do not do
- Do not change the commission rate or historical commission snapshots.
- Do not edit production orders, stock, accounts, or settings.
- Do not create test orders in production.
- Do not revoke all authenticated EXECUTE grants.
- Do not merge or deploy without test evidence and explicit approval.
