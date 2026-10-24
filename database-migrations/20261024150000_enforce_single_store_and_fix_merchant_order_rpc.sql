-- Draft remediation for test/phase-3-isolated-validation only.
-- Do not apply to production until reviewed and approved.
-- The product rule is one store per merchant. Existing production read-only
-- inspection found no duplicate store owners at the time of review.
create unique index if not exists stores_owner_id_unique_idx
  on public.stores (owner_id);

-- Resolve the merchant's sole store deterministically. The unique index above
-- makes multiple-store ownership impossible instead of silently choosing the
-- oldest store. Keep role, ownership, and transition guards server-side.
create or replace function public.update_merchant_order_status(
  p_order_id uuid,
  p_next_status text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_store_id uuid;
begin
  if v_user_id is null then
    raise exception 'يجب تسجيل الدخول لتحديث حالة الطلب.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.role = 'merchant'
  ) then
    raise exception 'تحديث الطلبات متاح لحساب التاجر فقط.';
  end if;

  if p_next_status is null or p_next_status not in ('pending', 'processing', 'shipped', 'delivered', 'cancelled') then
    raise exception 'حالة الطلب المطلوبة غير صالحة.';
  end if;

  select s.id into v_store_id
  from public.stores s
  where s.owner_id = v_user_id;

  if v_store_id is null then
    raise exception 'لا يوجد متجر مرتبط بهذا الحساب.';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
    and exists (
      select 1 from public.order_items oi
      where oi.order_id = o.id and oi.store_id = v_store_id
    )
  for update;

  if not found then
    raise exception 'لم نعثر على الطلب ضمن متجرك.';
  end if;

  if p_next_status = v_order.status then
    return jsonb_build_object('success', true, 'order_id', v_order.id, 'status', v_order.status);
  end if;

  if not (
    (v_order.status = 'pending' and p_next_status in ('processing', 'cancelled'))
    or (v_order.status = 'processing' and p_next_status in ('shipped', 'cancelled'))
    or (v_order.status = 'shipped' and p_next_status = 'delivered')
  ) then
    raise exception 'لا يمكن الانتقال من حالة «%» إلى الحالة المطلوبة.', v_order.status;
  end if;

  update public.orders
  set status = p_next_status, updated_at = now()
  where id = v_order.id;

  if p_next_status = 'cancelled' then
    update public.products p
    set stock_quantity = p.stock_quantity + oi.quantity,
        updated_at = now()
    from public.order_items oi
    where oi.order_id = v_order.id
      and oi.store_id = v_store_id
      and oi.product_id = p.id;
  end if;

  return jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', p_next_status
  );
end;
$function$;

revoke all on function public.update_merchant_order_status(uuid, text) from public, anon;
grant execute on function public.update_merchant_order_status(uuid, text) to authenticated;
