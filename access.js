// access.js — розділ «Доступи»: керування дозволеними користувачами бота.
// Підключається ПІСЛЯ config.js / auth.js. Переюзає клієнт sb та сесію.

let query = "";
let loading = false;

// DOM
const rowsEl = document.getElementById("rows");
const searchEl = document.getElementById("search");
const countEl = document.getElementById("count");
const statusEl = document.getElementById("status");

// ---------- утиліти ----------

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Нормалізація номера до формату +380XXXXXXXXX.
// Прибираємо пробіли/дужки/дефіси; 0XX... → +380XX...; 380... → +380...
function normalizePhone(raw) {
  let d = String(raw).replace(/\D/g, ""); // лишаємо тільки цифри
  if (d.startsWith("00")) d = d.slice(2); // міжнародний префікс 00
  if (d.startsWith("380")) return "+" + d; // 380XXXXXXXXX → +380XXXXXXXXX
  if (d.startsWith("0")) return "+38" + d; // 0XXXXXXXXX → +380XXXXXXXXX
  if (d.length === 9) return "+380" + d; // лише абонентський номер
  return "+" + d; // запасний варіант
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------- завантаження ----------

async function loadUsers() {
  if (loading) return;
  loading = true;
  statusEl.textContent = "Завантаження…";
  rowsEl.innerHTML = "";

  try {
    let q = sb
      .from("allowed_users")
      .select("id, phone, name, telegram_id, created_at")
      .order("created_at", { ascending: false });

    if (query) {
      q = q.or(`phone.ilike.%${query}%,name.ilike.%${query}%`);
    }

    const { data, error } = await q;
    if (error) throw error;

    for (const user of data) {
      rowsEl.appendChild(renderRow(user));
    }

    countEl.textContent = `Усього: ${data.length}`;
    statusEl.textContent = data.length === 0 ? "Нічого не знайдено" : "";
  } catch (err) {
    statusEl.textContent = "Помилка завантаження: " + (err.message || err);
  } finally {
    loading = false;
  }
}

// ---------- рендер рядка ----------

function renderRow(user) {
  const tr = document.createElement("tr");
  tr.dataset.id = user.id;

  tr.innerHTML = `
    <td class="cell-phone">${escapeHtml(user.phone)}</td>
    <td class="cell-name">
      <span class="name">${user.name ? escapeHtml(user.name) : '<span class="muted">—</span>'}</span>
      <button class="btn-link edit-name">✎</button>
    </td>
    <td>${user.telegram_id ? escapeHtml(user.telegram_id) : '<span class="muted">не прив\'язано</span>'}</td>
    <td class="cell-date">${formatDate(user.created_at)}</td>
    <td class="cell-actions">
      <button class="btn-danger btn-sm delete-user">Видалити</button>
    </td>
  `;

  tr.querySelector(".edit-name").addEventListener("click", () =>
    startEditName(tr, user)
  );
  tr.querySelector(".delete-user").addEventListener("click", () =>
    deleteUser(tr, user)
  );

  return tr;
}

// ---------- редагування імені ----------

function startEditName(tr, user) {
  const cell = tr.querySelector(".cell-name");
  const current = user.name || "";

  cell.innerHTML = `
    <input class="name-input" type="text" value="${escapeHtml(current)}" />
    <button class="btn-primary btn-sm save-name">OK</button>
    <button class="btn-link cancel-name">✕</button>
  `;

  const input = cell.querySelector(".name-input");
  input.focus();
  input.select();

  const restore = (name) => {
    cell.innerHTML = `
      <span class="name">${name ? escapeHtml(name) : '<span class="muted">—</span>'}</span>
      <button class="btn-link edit-name">✎</button>
    `;
    cell.querySelector(".edit-name").addEventListener("click", () =>
      startEditName(tr, user)
    );
  };

  cell.querySelector(".cancel-name").addEventListener("click", () =>
    restore(user.name)
  );

  cell.querySelector(".save-name").addEventListener("click", async () => {
    const newName = input.value.trim();
    if (newName === (user.name || "")) {
      restore(user.name);
      return;
    }
    const btn = cell.querySelector(".save-name");
    btn.disabled = true;
    btn.textContent = "…";

    const { error } = await sb
      .from("allowed_users")
      .update({ name: newName || null })
      .eq("id", user.id);

    if (error) {
      alert("Не вдалося зберегти: " + error.message);
      btn.disabled = false;
      btn.textContent = "OK";
      return;
    }
    user.name = newName || null;
    restore(user.name);
  });
}

// ---------- видалення ----------

async function deleteUser(tr, user) {
  if (!confirm(`Видалити доступ для ${user.phone}? Дію не можна скасувати.`)) {
    return;
  }

  const btn = tr.querySelector(".delete-user");
  btn.disabled = true;
  btn.textContent = "…";

  const { error } = await sb.from("allowed_users").delete().eq("id", user.id);
  if (error) {
    alert("Не вдалося видалити: " + error.message);
    btn.disabled = false;
    btn.textContent = "Видалити";
    return;
  }
  tr.remove();
}

// ---------- додавання ----------

const addModal = document.getElementById("add-modal");
const addForm = document.getElementById("add-form");
const addPhone = document.getElementById("add-phone");
const addName = document.getElementById("add-name");
const addError = document.getElementById("add-error");
const addSave = document.getElementById("add-save");

function openAddModal() {
  addForm.reset();
  addError.hidden = true;
  addModal.hidden = false;
  addPhone.focus();
}

function closeAddModal() {
  addModal.hidden = true;
}

document.getElementById("add-user-btn").addEventListener("click", openAddModal);
document.getElementById("add-cancel").addEventListener("click", closeAddModal);

addModal.addEventListener("click", (e) => {
  if (e.target === addModal) closeAddModal();
});

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  addError.hidden = true;

  const rawPhone = addPhone.value.trim();
  const name = addName.value.trim();
  if (!rawPhone) {
    addError.textContent = "Телефон обов'язковий";
    addError.hidden = false;
    return;
  }

  const phone = normalizePhone(rawPhone);

  addSave.disabled = true;
  addSave.textContent = "…";

  const { error } = await sb
    .from("allowed_users")
    .insert({ phone, name: name || null });

  addSave.disabled = false;
  addSave.textContent = "Додати";

  if (error) {
    addError.textContent =
      error.code === "23505"
        ? `Номер ${phone} вже є в базі`
        : "Не вдалося додати: " + error.message;
    addError.hidden = false;
    return;
  }

  closeAddModal();
  await loadUsers();
});

// ---------- події ----------

searchEl.addEventListener(
  "input",
  debounce((e) => {
    query = e.target.value.trim();
    loadUsers();
  }, 300)
);

document.getElementById("logout-btn").addEventListener("click", signOut);

// ---------- старт ----------

(async function init() {
  const session = await requireAuth();
  if (!session) return;
  document.getElementById("user-email").textContent = session.user.email;
  await loadUsers();
})();
