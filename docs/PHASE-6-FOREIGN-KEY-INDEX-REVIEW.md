# BBen — Phase 6 Foreign-Key Index Review
Date: 2026-10-24
Environment: Production catalog metadata only (read-only).
Branch: `test/phase-3-isolated-validation`
No index was created and no database data or settings were changed.

## What was checked
Compared public-schema foreign-key columns with valid, non-partial indexes whose leading columns cover the FK columns. This is a catalog-level screen, not query-plan proof that every index is needed.

## FK columns without a matching leading index
The current catalog query identified these candidates:
- `chat_conversations(product_id)`
- `chat_messages(sender_id)`
- `coupon_redemptions(customer_id)`
- `coupons(created_by)`
- `marketing_campaigns(created_by)`
- `notifications(created_by)`
- `notifications(user_id)`
- `order_status_history(changed_by)`
- `orders(coupon_id)`
- `platform_commission_audit(admin_id)`
- `platform_settings(updated_by)`
- `product_favorites(product_id)`
- `product_reviews(order_id)`
- `store_reviews(order_id)`

The advisor previously reported 13 missing FK indexes. This direct catalog screen found 14 candidates; advisor output and this check may differ due to query definition or timing. Reconcile with the latest advisor output before implementing anything.

## Recommended prioritization
1. Evaluate operationally frequent paths first: `notifications(user_id)`, `chat_messages(sender_id)`, `chat_conversations(product_id)`, `product_favorites(product_id)`, `orders(coupon_id)`.
2. Check table row counts, existing compound-index leading columns, delete/update patterns, and query plans.
3. For small configuration/audit tables, weigh write overhead against actual query need before adding indexes.
4. Add only confirmed useful indexes in an isolated migration, preferably using `CREATE INDEX CONCURRENTLY` where the migration runner and deployment process support it (this cannot run inside a transaction block).
5. Re-run advisor and compare plans after test migration.

## Safety
No index changes are justified solely by the candidate list. Do not run this against production without a reviewed migration and approval. A Supabase development branch has not been created because its recurring cost has not been explicitly approved. Historical orders, inventory, commission settings, and audit rows remain unchanged.
