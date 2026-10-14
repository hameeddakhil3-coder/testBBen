-- Store the buyer's optional default delivery address for checkout prefill.
alter table public.profiles
  add column if not exists default_shipping_address text;

comment on column public.profiles.default_shipping_address is
  'Optional default delivery address saved by the profile owner for future checkouts.';
