/* Include in protected pages like /select and /Platform/ */
(async function authGuard() {
  const SUPABASE_URL = 'https://ygoxjtgoyoxjcvtypoii.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_yfKBDqPQsdXY2dNhkuUPRw_7pea76ia';

  if (!window.supabase) return;
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    window.location.href = '/?toast=not_logged_in';
  }
})();