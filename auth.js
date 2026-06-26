// auth.js — ініціалізація Supabase-клієнта та робота з сесією.
// Підключається ПІСЛЯ config.js та CDN-скрипта @supabase/supabase-js.

// Глобальний клієнт (UMD-збірка кладе фабрику в window.supabase).
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Поточна сесія (або null).
async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

// Вхід за email + паролем.
async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Вихід.
async function signOut() {
  await sb.auth.signOut();
  window.location.href = "login.html";
}

// Гард для захищених сторінок: якщо немає сесії — на логін.
async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}
