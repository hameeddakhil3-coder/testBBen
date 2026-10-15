-- Route new order notifications to the exact order in each role's order list.
-- Only notification URLs/functions change; existing order and inventory data remain untouched.
create or replace function public.notify_store_owner_new_order_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_order_number bigint;
  v_target_url text;
begin
  select o.order_number, s.owner_id
    into v_order_number, v_owner_id
  from public.orders o
  join public.stores s on s.id = new.store_id
  where o.id = new.order_id;

  if v_owner_id is not null then
    v_target_url := 'seller.html?view=orders&order_id=' || new.order_id::text;
    if not exists (
      select 1 from public.notifications n
      where n.user_id = v_owner_id
        and n.notification_type = 'new_order'
        and n.target_url = v_target_url
    ) then
      insert into public.notifications(user_id, title, body, notification_type, target_url)
      values (
        v_owner_id,
        'طلب جديد #' || coalesce(v_order_number::text, ''),
        'وصل طلب جديد إلى متجرك. افتح الطلب لمراجعته وتجهيزه.',
        'new_order',
        v_target_url
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.notify_customer_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_body text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_title := case new.status
    when 'pending' then 'تم تسجيل الطلب'
    when 'processing' then 'بدأ تجهيز طلبك'
    when 'shipped' then 'طلبك خرج للتوصيل'
    when 'delivered' then 'تم تسليم طلبك'
    when 'cancelled' then 'تم إلغاء الطلب'
    else 'تم تحديث حالة طلبك'
  end;

  v_body := case new.status
    when 'pending' then 'تم تسجيل طلبك بنجاح.'
    when 'processing' then 'بدأ المتجر تجهيز طلبك.'
    when 'shipped' then 'خرج طلبك للتوصيل.'
    when 'delivered' then 'تم تسليم طلبك. شكراً لتسوقك من BBen.'
    when 'cancelled' then 'تم إلغاء الطلب. يمكنك مراجعة تفاصيله في صفحة طلباتي.'
    else 'تم تحديث حالة طلبك إلى: ' || new.status
  end;

  insert into public.notifications(user_id, title, body, notification_type, target_url)
  values (new.customer_id, v_title, v_body, 'order_status', 'market.html?order_id=' || new.id::text);

  return new;
end;
$$;
