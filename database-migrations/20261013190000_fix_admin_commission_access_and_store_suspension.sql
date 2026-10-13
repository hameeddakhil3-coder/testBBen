-- Applied to the Supabase production project on 2026-10-13.
-- Allow the store suspension state used by admin_set_store_status while
-- preserving the existing active, inactive, and pending states.
alter table public.stores
  drop constraint if exists stores_status_check;

alter table public.stores
  add constraint stores_status_check
  check (status = any (array['active'::text, 'inactive'::text, 'pending'::text, 'suspended'::text]));

-- Enforce admin authorization inside this SECURITY DEFINER RPC.
create or replace function public.admin_list_commission_ledger()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles where id = v_user_id and role = 'admin'
  ) then
    raise exception 'الوصول متاح لمسؤول المنصة فقط.';
  end if;

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'order_id', o.id,
      'order_number', o.order_number,
      'status', o.status,
      'created_at', o.created_at,
      'customer_name', o.customer_name,
      'subtotal', o.subtotal,
      'delivery_fee', o.delivery_fee,
      'total', o.total,
      'commission_rate', o.commission_rate,
      'commission_amount', o.commission_amount,
      'commission_state', case
        when o.status = 'cancelled' then 'cancelled'
        when o.status = 'delivered' and o.commission_rate = 0 then 'legacy_exempt'
        when o.commission_rate = 0 then 'no_commission_snapshot'
        when o.status = 'delivered' then 'due'
        else 'pending'
      end,
      'store_names', (
        select coalesce(string_agg(distinct s.name, ', ' order by s.name), 'غير معروف')
        from public.order_items oi join public.stores s on s.id = oi.store_id
        where oi.order_id = o.id
      )
    ) as row_data,
    o.created_at
    from public.orders o
  ) q;
  return v_result;
end;
$function$;
