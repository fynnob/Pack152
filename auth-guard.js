/* auth-guard.js - Root Auth Guard */
(async function authGuard() {
  const SUPABASE_URL = 'https://ygoxjtgoyoxjcvtypoii.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_yfKBDqPQsdXY2dNhkuUPRw_7pea76ia';

  if (!window.supabase) {
    console.warn('Supabase SDK missing. Redirecting...');
    window.location.href = '/?toast=not_logged_in';
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const { data: { session } } = await client.auth.getSession();
  if (!session || !session.user) {
    window.location.href = '/?toast=not_logged_in';
    return;
  }

  // Fetch profile to verify approval status
  const { data: profile } = await client
    .from('profile')
    .select('status, role')
    .eq('id', session.user.id)
    .single();

  if (!profile || profile.status !== 'approved') {
    window.location.href = '/onBoarding/profile.html';
  }
})();