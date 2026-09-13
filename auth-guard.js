/* auth-guard.js - Strict Role & Status Guard */
(async function authGuard() {
  const SUPABASE_URL = 'https://ygoxjtgoyoxjcvtypoii.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_yfKBDqPQsdXY2dNhkuUPRw_7pea76ia';

  if (!window.supabase) {
    window.location.href = '/?toast=not_logged_in';
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const { data: { session } } = await client.auth.getSession();
  if (!session || !session.user) {
    window.location.href = '/?toast=not_logged_in';
    return;
  }

  // Fetch true database role and approval status
  const { data: profile } = await client
    .from('profile')
    .select('status, role')
    .eq('id', session.user.id)
    .single();

  // 1. Unapproved profiles locked to onboarding review page
  if (!profile || profile.status !== 'approved') {
    if (!window.location.pathname.includes('/onBoarding/profile.html')) {
      window.location.href = '/onBoarding/profile.html';
    }
    return;
  }

  const path = window.location.pathname.toLowerCase();
  const isLeader = profile.role === 'leader' || profile.role === 'cub_master';

  // 2. Prevent Parents from accessing /select or /Leader/*
  if ((path.includes('/select') || path.includes('/leader')) && !isLeader) {
    window.location.href = '/Platform/';
  }
})();