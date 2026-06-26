// auth.js — инициализация Supabase-клиента и работа с сессией.
// Подключается ПОСЛЕ config.js и CDN-скрипта @supabase/supabase-js.

// Глобальный клиент (UMD-сборка кладёт фабрику в window.supabase).
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Текущая сессия (или null).
async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

// Вход по email + паролю.
async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Выход.
async function signOut() {
  await sb.auth.signOut();
  window.location.href = "login.html";
}

// Гард для защищённых страниц: если нет сессии — на логин.
async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}
