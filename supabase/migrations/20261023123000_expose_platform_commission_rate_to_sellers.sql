-- Expose only the current platform commission rate to authenticated seller sessions.
create or replace function public.get_platform_commission_rate()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ps.commission_rate from public.platform_settings ps order by ps.id asc limit 1),
    5.00
  );
$$;

revoke all on function public.get_platform_commission_rate() from public, anon;
grant execute on function public.get_platform_commission_rate() to authenticated;
