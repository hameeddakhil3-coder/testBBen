-- PROPOSAL ONLY — do not apply to production without review.
-- BBen FK supporting indexes proposed after a read-only catalog inventory.
-- Intended for an isolated Supabase development branch first.
-- Index creation may consume I/O and take locks; assess table sizes and run off-peak.
-- These are additive indexes only: no rows, orders, stock, settings, or commission values are modified.

create index if not exists chat_conversations_product_id_idx
  on public.chat_conversations (product_id);

create index if not exists chat_messages_sender_id_idx
  on public.chat_messages (sender_id);

create index if not exists coupon_redemptions_customer_id_idx
  on public.coupon_redemptions (customer_id);

create index if not exists coupons_created_by_idx
  on public.coupons (created_by);

create index if not exists marketing_campaigns_created_by_idx
  on public.marketing_campaigns (created_by);

create index if not exists notifications_created_by_idx
  on public.notifications (created_by);

create index if not exists order_status_history_changed_by_idx
  on public.order_status_history (changed_by);

create index if not exists orders_coupon_id_idx
  on public.orders (coupon_id);

create index if not exists platform_commission_audit_admin_id_idx
  on public.platform_commission_audit (admin_id);

create index if not exists platform_settings_updated_by_idx
  on public.platform_settings (updated_by);

create index if not exists product_favorites_product_id_idx
  on public.product_favorites (product_id);

create index if not exists product_reviews_order_id_idx
  on public.product_reviews (order_id);

create index if not exists store_reviews_order_id_idx
  on public.store_reviews (order_id);

-- Validation after applying on isolated DB:
-- 1. Re-run Supabase performance advisor and confirm these FK warnings clear.
-- 2. Inspect query plans and index sizes.
-- 3. Check whether any index duplicates an existing composite index's leading column.
-- 4. If a table is large, consider CREATE INDEX CONCURRENTLY in a separately managed
--    non-transactional operation rather than a standard migration.
-- 5. Do not merge/apply until an isolated branch exists and results are reviewed.
