// Public browser configuration. Publishable keys are intended for client-side use.
// Never place a Supabase service_role/secret key in this file.
(() => {
  const SUPABASE_URL = "https://cbzqbqqecnhijqvpvtzd.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_z1XLZ4eEisrtPmIAid6EBg_XbDg6VZc";
  if (!globalThis.supabase || typeof globalThis.supabase.createClient !== "function") {
    console.error("Supabase JS client failed to load.");
    return;
  }
  globalThis.bbenSupabase = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
})();