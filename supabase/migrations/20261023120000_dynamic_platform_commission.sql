-- Dynamic AL Reem platform commission; previous orders retain their commission snapshots.
create table if not exists public.platform_settings (
  id integer primary key check (id = 1),
  commission_rate numeric(5,2) not null default 5.00 check (commission_rate >= 0 and commission_rate <= 20),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
insert into public.platform_settings (id, commission_rate) values (1, 5.00) on conflict (id) do nothing;
create table if not exists public.platform_commission_audit (
  id bigint generated always as identity primary key,
  admin_id uuid not null references public.profiles(id),
  old_rate numeric(5,2) not null,
  new_rate numeric(5,2) not null,
  changed_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
alter table public.platform_commission_audit enable row level security;
revoke all on public.platform_settings from anon, authenticated;
revoke all on public.platform_commission_audit from anon, authenticated;
grant select, insert, update on public.platform_settings to service_role;
grant select, insert on public.platform_commission_audit to service_role;

create or replace function public.admin_get_platform_settings()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_user_id uuid := auth.uid(); v_settings public.platform_settings%rowtype; v_audit jsonb;
begin
 if v_user_id is null or not exists (select 1 from public.profiles where id=v_user_id and role='admin') then
   raise exception 'الوصول متاح لمسؤول المنصة فقط.';
 end if;
 select * into v_settings from public.platform_settings where id=1;
 select coalesce(jsonb_agg(jsonb_build_object('old_rate',old_rate,'new_rate',new_rate,'changed_at',changed_at,'admin_id',admin_id) order by changed_at desc),'[]'::jsonb)
 into v_audit from (select * from public.platform_commission_audit order by changed_at desc limit 20) a;
 return jsonb_build_object('commission_rate',coalesce(v_settings.commission_rate,5.00),'updated_at',v_settings.updated_at,'updated_by',v_settings.updated_by,'audit',v_audit);
end;
$function$;

create or replace function public.admin_update_platform_commission(p_commission_rate numeric)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_user_id uuid := auth.uid(); v_old_rate numeric(5,2);
begin
 if v_user_id is null or not exists (select 1 from public.profiles where id=v_user_id and role='admin') then
   raise exception 'الوصول متاح لمسؤول المنصة فقط.';
 end if;
 if p_commission_rate is null or p_commission_rate < 0 or p_commission_rate > 20 or p_commission_rate <> round(p_commission_rate,2) then
   raise exception 'نسبة العمولة يجب أن تكون بين 0 و20 وبحد أقصى منزلتين عشريتين.';
 end if;
 select commission_rate into v_old_rate from public.platform_settings where id=1 for update;
 insert into public.platform_settings(id,commission_rate,updated_at,updated_by)
 values(1,p_commission_rate,now(),v_user_id)
 on conflict(id) do update set commission_rate=excluded.commission_rate,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 insert into public.platform_commission_audit(admin_id,old_rate,new_rate,changed_at)
 values(v_user_id,coalesce(v_old_rate,5.00),p_commission_rate,now());
 return jsonb_build_object('commission_rate',p_commission_rate,'previous_rate',coalesce(v_old_rate,5.00));
end;
$function$;

CREATE OR REPLACE FUNCTION public.checkout_cart(p_customer_name text, p_customer_phone text, p_shipping_address text, p_notes text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_customer_id uuid := auth.uid();
  v_role text;
  v_item record;
  v_store record;
  v_coupon public.coupons%rowtype;
  v_item_count integer := 0;
  v_subtotal numeric := 0;
  v_delivery_total numeric := 0;
  v_commission_total numeric := 0;
  v_store_subtotal numeric := 0;
  v_store_discount numeric := 0;
  v_store_delivery_fee numeric := 0;
  v_store_commission numeric := 0;
  v_total_discount numeric := 0;
  v_discount_remaining numeric := 0;
  v_coupon_code text := nullif(upper(trim(coalesce(p_coupon_code,''))), '');
  v_coupon_id uuid := null;
  v_funding_source text := null;
  v_commission_basis numeric := 0;
  v_order_id uuid;
  v_order_number bigint;
  v_orders jsonb := '[]'::jsonb;
  v_order_ids uuid[] := '{}';
  v_store_index integer := 0;
  v_store_count integer := 0;
  v_commission_rate numeric := 5.00;
begin
  select commission_rate into v_commission_rate from public.platform_settings where id = 1;
  v_commission_rate := coalesce(v_commission_rate, 5.00);
  if v_customer_id is null then raise exception 'يجب تسجيل الدخول قبل إتمام الطلب.'; end if;
  select role into v_role from public.profiles where id = v_customer_id;
  if v_role is distinct from 'customer' then raise exception 'إتمام الطلب متاح لحساب المشتري فقط.'; end if;
  if nullif(trim(p_customer_name), '') is null then raise exception 'يرجى إدخال اسم المستلم.'; end if;
  if nullif(trim(p_customer_phone), '') is null then raise exception 'يرجى إدخال رقم الهاتف.'; end if;
  if nullif(trim(p_shipping_address), '') is null then raise exception 'يرجى إدخال عنوان التوصيل.'; end if;

  for v_item in
    select ci.product_id, ci.quantity, p.name, p.price, p.stock_quantity,
           p.status as product_status, p.store_id, s.status as store_status
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    join public.stores s on s.id = p.store_id
    where ci.customer_id = v_customer_id
    order by p.id
    for update of p
  loop
    v_item_count := v_item_count + 1;
    if v_item.product_status <> 'active' or v_item.store_status <> 'active' then
      raise exception 'أحد المنتجات في السلة لم يعد متاحاً للبيع: %', v_item.name;
    end if;
    if v_item.quantity < 1 or v_item.stock_quantity < v_item.quantity then
      raise exception 'الكمية المطلوبة غير متوفرة حالياً للمنتج: %', v_item.name;
    end if;
    v_subtotal := v_subtotal + (v_item.price * v_item.quantity);
  end loop;
  if v_item_count = 0 then raise exception 'السلة فارغة. أضف منتجاً واحداً على الأقل.'; end if;

  if v_coupon_code is not null then
    select * into v_coupon from public.coupons
      where code = v_coupon_code
      for update;
    if not found or not v_coupon.is_active
       or (v_coupon.starts_at is not null and v_coupon.starts_at > now())
       or (v_coupon.ends_at is not null and v_coupon.ends_at <= now()) then
      raise exception 'الكوبون غير صالح أو غير متاح حالياً.';
    end if;
    if v_subtotal < v_coupon.min_subtotal then
      raise exception 'قيمة المنتجات لا تحقق الحد الأدنى لاستخدام هذا الكوبون.';
    end if;
    if v_coupon.total_usage_limit is not null and v_coupon.usage_count >= v_coupon.total_usage_limit then
      raise exception 'انتهى عدد مرات استخدام هذا الكوبون.';
    end if;
    if (select count(*) from public.coupon_redemptions r
        where r.coupon_id = v_coupon.id and r.customer_id = v_customer_id) >= v_coupon.per_customer_limit then
      raise exception 'لقد استنفدت الحد المسموح لاستخدام هذا الكوبون.';
    end if;
    v_coupon_id := v_coupon.id;
    v_funding_source := v_coupon.funding_source;
    if v_coupon.discount_type = 'percent' then
      v_total_discount := round(v_subtotal * v_coupon.discount_value / 100, 2);
      if v_coupon.max_discount is not null then
        v_total_discount := least(v_total_discount, v_coupon.max_discount);
      end if;
    else
      v_total_discount := least(v_subtotal, v_coupon.discount_value);
    end if;
    v_total_discount := least(v_subtotal, greatest(0, v_total_discount));
  end if;

  select count(*) into v_store_count
  from (
    select distinct p.store_id
    from public.cart_items ci join public.products p on p.id=ci.product_id
    where ci.customer_id=v_customer_id
  ) x;
  v_discount_remaining := v_total_discount;

  for v_store in
    select s.id as store_id, s.delivery_fee
    from public.stores s
    where s.id in (
      select distinct p.store_id from public.cart_items ci
      join public.products p on p.id=ci.product_id
      where ci.customer_id=v_customer_id
    )
    order by s.id
    for update of s
  loop
    v_store_index := v_store_index + 1;
    select coalesce(sum(p.price * ci.quantity), 0)
      into v_store_subtotal
    from public.cart_items ci join public.products p on p.id=ci.product_id
    where ci.customer_id=v_customer_id and p.store_id=v_store.store_id;

    if v_coupon_id is null then
      v_store_discount := 0;
    elsif v_store_index = v_store_count then
      v_store_discount := v_discount_remaining;
    else
      v_store_discount := round(v_total_discount * v_store_subtotal / nullif(v_subtotal,0), 2);
      v_store_discount := least(v_store_subtotal, v_store_discount, v_discount_remaining);
    end if;
    v_discount_remaining := v_discount_remaining - v_store_discount;

    v_store_delivery_fee := coalesce(v_store.delivery_fee, 0);
    if v_funding_source = 'merchant' then
      v_commission_basis := greatest(0, v_store_subtotal - v_store_discount);
    else
      v_commission_basis := v_store_subtotal;
    end if;
    v_store_commission := round(v_commission_basis * v_commission_rate / 100, 2);
    v_delivery_total := v_delivery_total + v_store_delivery_fee;
    v_commission_total := v_commission_total + v_store_commission;

    insert into public.orders (
      customer_id, status, currency, subtotal, original_subtotal, discount_amount,
      coupon_id, coupon_code, discount_funding_source, commission_basis_amount,
      delivery_fee, total, commission_rate, commission_amount,
      customer_name, customer_phone, shipping_address, notes
    ) values (
      v_customer_id, 'pending', 'IQD', v_store_subtotal - v_store_discount, v_store_subtotal,
      v_store_discount, v_coupon_id, v_coupon_code, v_funding_source, v_commission_basis,
      v_store_delivery_fee, v_store_subtotal - v_store_discount + v_store_delivery_fee,
      v_commission_rate, v_store_commission, trim(p_customer_name), trim(p_customer_phone),
      nullif(trim(coalesce(p_shipping_address, '')), ''),
      nullif(trim(coalesce(p_notes, '')), '')
    ) returning id, order_number into v_order_id, v_order_number;

    v_order_ids := array_append(v_order_ids, v_order_id);
    insert into public.order_items (
      order_id, product_id, store_id, product_name, unit_price, quantity
    )
    select v_order_id, p.id, p.store_id, p.name, p.price, ci.quantity
    from public.cart_items ci join public.products p on p.id=ci.product_id
    where ci.customer_id=v_customer_id and p.store_id=v_store.store_id;

    v_orders := v_orders || jsonb_build_array(jsonb_build_object(
      'id', v_order_id, 'order_number', v_order_number, 'store_id', v_store.store_id,
      'subtotal', v_store_subtotal - v_store_discount, 'original_subtotal', v_store_subtotal,
      'discount_amount', v_store_discount, 'coupon_code', v_coupon_code,
      'discount_funding_source', v_funding_source, 'delivery_fee', v_store_delivery_fee,
      'total', v_store_subtotal - v_store_discount + v_store_delivery_fee,
      'commission_rate', v_commission_rate, 'commission_amount', v_store_commission,
      'commission_basis_amount', v_commission_basis, 'status', 'pending'
    ));
  end loop;

  if v_coupon_id is not null then
    insert into public.coupon_redemptions(coupon_id, customer_id, order_ids, discount_amount, funding_source)
    values (v_coupon_id, v_customer_id, v_order_ids, v_total_discount, v_funding_source);
    update public.coupons set usage_count=usage_count+1, updated_at=now() where id=v_coupon_id;
  end if;

  update public.products p
  set stock_quantity = p.stock_quantity - ci.quantity, updated_at = now()
  from public.cart_items ci
  where ci.customer_id = v_customer_id and ci.product_id = p.id;
  delete from public.cart_items where customer_id = v_customer_id;

  insert into public.notifications(user_id,title,body,notification_type,target_url)
  values(v_customer_id,'تم تسجيل طلبك','تم تسجيل طلبك بنجاح. يمكنك متابعة حالته من صفحة طلباتي.','order','market.html');

  return jsonb_build_object(
    'orders', v_orders, 'order_count', jsonb_array_length(v_orders),
    'subtotal', v_subtotal - v_total_discount, 'original_subtotal', v_subtotal,
    'discount_amount', v_total_discount, 'coupon_code', v_coupon_code,
    'discount_funding_source', v_funding_source, 'delivery_fee', v_delivery_total,
    'commission_rate', v_commission_rate, 'commission_amount', v_commission_total,
    'total', v_subtotal - v_total_discount + v_delivery_total, 'status', 'pending'
  );
end;
$function$;
