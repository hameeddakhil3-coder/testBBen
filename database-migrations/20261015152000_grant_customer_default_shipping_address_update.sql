-- Allow signed-in users to update only their own default delivery address column.
-- Row-level security policies still restrict profile rows to auth.uid().
GRANT UPDATE (default_shipping_address) ON TABLE public.profiles TO authenticated;
