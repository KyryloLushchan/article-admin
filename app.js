// app.js — каталог товарів: список, пошук, пагінація, редагування, фото.
// Підключається ПІСЛЯ config.js / auth.js.

const BUCKET = "product-photos";
const PAGE_SIZE = 20;

// Стан списку
let query = "";
let offset = 0;
let total = 0;
let loading = false;

// Поточний товар для завантаження фото (через прихований file-input)
let uploadTargetId = null;

// DOM
const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const countEl = document.getElementById("count");
const statusEl = document.getElementById("status");
const loadMoreBtn = document.getElementById("load-more");
const photoInput = document.getElementById("photo-input");

// ---------- утиліти ----------

function publicUrl(filePath) {
  return sb.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl;
}

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

// Артикул без пробілів — для шляху в Storage
function articleSlug(article) {
  return String(article).replace(/\s+/g, "");
}

// ---------- завантаження даних ----------

async function fetchPhotos(productIds) {
  if (productIds.length === 0) return {};
  const { data, error } = await sb
    .from("product_photos")
    .select("id, product_id, file_path, position")
    .in("product_id", productIds)
    .order("position", { ascending: true });
  if (error) throw error;

  const byProduct = {};
  for (const p of data) {
    (byProduct[p.product_id] ||= []).push(p);
  }
  return byProduct;
}

async function loadProducts(reset) {
  if (loading) return;
  loading = true;
  statusEl.textContent = "Завантаження…";

  if (reset) {
    offset = 0;
    listEl.innerHTML = "";
  }

  try {
    let q = sb
      .from("products")
      .select("id, article, name, characteristics", { count: "exact" })
      .order("article", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (query) {
      q = q.or(`article.ilike.%${query}%,name.ilike.%${query}%`);
    }

    const { data: products, count, error } = await q;
    if (error) throw error;

    total = count ?? 0;
    const photosByProduct = await fetchPhotos(products.map((p) => p.id));

    for (const product of products) {
      listEl.appendChild(renderCard(product, photosByProduct[product.id] || []));
    }

    offset += products.length;
    countEl.textContent = `Знайдено: ${total}`;
    loadMoreBtn.hidden = offset >= total;
    statusEl.textContent = total === 0 ? "Нічого не знайдено" : "";
  } catch (err) {
    statusEl.textContent = "Помилка завантаження: " + (err.message || err);
  } finally {
    loading = false;
  }
}

// ---------- рендер картки ----------

function renderCard(product, photos) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = product.id;
  card.dataset.article = product.article;

  card.innerHTML = `
    <div class="card-head">
      <span class="article">${escapeHtml(product.article)}</span>
      <div class="name-row">
        <span class="name">${escapeHtml(product.name)}</span>
        <button class="btn-link edit-name">✎ змінити</button>
      </div>
    </div>
    <div class="char-block"></div>
    <div class="gallery"></div>
    <div class="card-actions">
      <button class="btn-secondary add-photo">+ Додати фото</button>
      <button class="btn-danger delete-product">Видалити товар</button>
    </div>
  `;

  card.querySelector(".gallery").replaceWith(renderGallery(photos));
  card.querySelector(".char-block").replaceWith(renderCharBlock(product));

  // Редагування назви
  card.querySelector(".edit-name").addEventListener("click", () =>
    startEditName(card, product)
  );

  // Додавання фото
  card.querySelector(".add-photo").addEventListener("click", () => {
    uploadTargetId = product.id;
    photoInput.value = "";
    photoInput.click();
  });

  // Видалення товару
  card.querySelector(".delete-product").addEventListener("click", () =>
    deleteProduct(card, product)
  );

  return card;
}

// ---------- блок характеристик ----------

function renderCharBlock(product) {
  const block = document.createElement("div");
  block.className = "char-block";
  renderCharView(block, product);
  return block;
}

function renderCharView(block, product) {
  const value = product.characteristics;
  block.innerHTML = `
    <div class="char-head">
      <span class="char-label">Характеристики</span>
      <button class="btn-link edit-char">✎ змінити</button>
    </div>
    <div class="char-value">${
      value ? escapeHtml(value) : '<span class="muted">—</span>'
    }</div>
  `;
  block.querySelector(".edit-char").addEventListener("click", () =>
    startEditCharacteristics(block, product)
  );
}

function startEditCharacteristics(block, product) {
  const current = product.characteristics || "";
  block.innerHTML = `
    <div class="char-head">
      <span class="char-label">Характеристики</span>
    </div>
    <textarea class="char-input" rows="4">${escapeHtml(current)}</textarea>
    <div class="char-actions">
      <button class="btn-primary btn-sm save-char">Зберегти</button>
      <button class="btn-link cancel-char">Скасувати</button>
    </div>
  `;

  const textarea = block.querySelector(".char-input");
  textarea.focus();

  block.querySelector(".cancel-char").addEventListener("click", () =>
    renderCharView(block, product)
  );

  block.querySelector(".save-char").addEventListener("click", async () => {
    const newVal = textarea.value.trim();
    if (newVal === (product.characteristics || "")) {
      renderCharView(block, product);
      return;
    }
    const btn = block.querySelector(".save-char");
    btn.disabled = true;
    btn.textContent = "…";

    const { error } = await sb
      .from("products")
      .update({ characteristics: newVal || null })
      .eq("id", product.id);

    if (error) {
      alert("Не вдалося зберегти: " + error.message);
      btn.disabled = false;
      btn.textContent = "Зберегти";
      return;
    }
    product.characteristics = newVal || null;
    renderCharView(block, product);
  });
}

function renderGallery(photos) {
  const gallery = document.createElement("div");
  gallery.className = "gallery";

  if (photos.length === 0) {
    gallery.innerHTML = `<span class="no-photos">немає фото</span>`;
    return gallery;
  }

  for (const photo of photos) {
    const thumb = document.createElement("div");
    thumb.className = "thumb";
    thumb.innerHTML = `
      <a href="${publicUrl(photo.file_path)}" target="_blank" rel="noopener">
        <img src="${publicUrl(photo.file_path)}" alt="" loading="lazy" />
      </a>
      <button class="thumb-del" title="Видалити">✕</button>
    `;
    thumb
      .querySelector(".thumb-del")
      .addEventListener("click", () => deletePhoto(photo, thumb));
    gallery.appendChild(thumb);
  }
  return gallery;
}

async function refreshGallery(card, productId) {
  const photosByProduct = await fetchPhotos([productId]);
  const photos = photosByProduct[productId] || [];
  card.querySelector(".gallery").replaceWith(renderGallery(photos));
}

// ---------- редагування назви ----------

function startEditName(card, product) {
  const nameRow = card.querySelector(".name-row");
  const currentName = card.querySelector(".name").textContent;

  nameRow.innerHTML = `
    <input class="name-input" type="text" value="${escapeHtml(currentName)}" />
    <button class="btn-primary save-name">Зберегти</button>
    <button class="btn-link cancel-name">Скасувати</button>
  `;

  const input = nameRow.querySelector(".name-input");
  input.focus();
  input.select();

  const restore = (name) => {
    nameRow.innerHTML = `
      <span class="name">${escapeHtml(name)}</span>
      <button class="btn-link edit-name">✎ змінити</button>
    `;
    nameRow
      .querySelector(".edit-name")
      .addEventListener("click", () => startEditName(card, product));
  };

  nameRow.querySelector(".cancel-name").addEventListener("click", () =>
    restore(currentName)
  );

  nameRow.querySelector(".save-name").addEventListener("click", async () => {
    const newName = input.value.trim();
    if (!newName || newName === currentName) {
      restore(currentName);
      return;
    }
    const btn = nameRow.querySelector(".save-name");
    btn.disabled = true;
    btn.textContent = "…";

    const { error } = await sb
      .from("products")
      .update({ name: newName })
      .eq("id", product.id);

    if (error) {
      alert("Не вдалося зберегти: " + error.message);
      btn.disabled = false;
      btn.textContent = "Зберегти";
      return;
    }
    product.name = newName;
    restore(newName);
  });
}

// ---------- завантаження фото ----------

photoInput.addEventListener("change", async () => {
  const files = Array.from(photoInput.files || []);
  if (files.length === 0 || uploadTargetId == null) return;

  const card = listEl.querySelector(`.card[data-id="${uploadTargetId}"]`);
  const article = card.dataset.article;
  const productId = Number(card.dataset.id);

  statusEl.textContent = `Завантаження фото (0/${files.length})…`;

  // Поточний максимум position для цього товару
  const { data: existing } = await sb
    .from("product_photos")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(1);
  let nextPos = existing && existing.length ? (existing[0].position ?? 0) + 1 : 0;

  let done = 0;
  for (const file of files) {
    try {
      const path = `${articleSlug(article)}/${crypto.randomUUID()}.jpg`;

      const { error: upErr } = await sb.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
      if (upErr) throw upErr;

      // file_id залишаємо порожнім — його проставляє бот
      const { error: insErr } = await sb.from("product_photos").insert({
        product_id: productId,
        file_path: path,
        position: nextPos,
        file_id: null,
      });
      if (insErr) throw insErr;

      nextPos += 1;
      done += 1;
      statusEl.textContent = `Завантаження фото (${done}/${files.length})…`;
    } catch (err) {
      alert("Помилка завантаження фото: " + (err.message || err));
    }
  }

  await refreshGallery(card, productId);
  statusEl.textContent = "";
  uploadTargetId = null;
});

// ---------- видалення фото ----------

async function deletePhoto(photo, thumbEl) {
  if (!confirm("Видалити це фото?")) return;

  // Спочатку зі Storage
  const { error: rmErr } = await sb.storage.from(BUCKET).remove([photo.file_path]);
  if (rmErr) {
    alert("Не вдалося видалити файл зі Storage: " + rmErr.message);
    return;
  }

  // Потім запис у таблиці
  const { error: delErr } = await sb
    .from("product_photos")
    .delete()
    .eq("id", photo.id);
  if (delErr) {
    alert("Файл видалено, але запис у БД не видалився: " + delErr.message);
    return;
  }

  const gallery = thumbEl.parentElement;
  thumbEl.remove();
  if (!gallery.querySelector(".thumb")) {
    gallery.innerHTML = `<span class="no-photos">немає фото</span>`;
  }
}

// ---------- видалення товару ----------

async function deleteProduct(card, product) {
  if (
    !confirm(
      `Видалити товар «${product.article}» та всі його фото? Дію не можна скасувати.`
    )
  ) {
    return;
  }

  const btn = card.querySelector(".delete-product");
  btn.disabled = true;
  btn.textContent = "Видалення…";

  try {
    // 1. Беремо всі фото товару
    const { data: photos, error: phErr } = await sb
      .from("product_photos")
      .select("id, file_path")
      .eq("product_id", product.id);
    if (phErr) throw phErr;

    // 2. Видаляємо файли зі Storage
    if (photos && photos.length) {
      const { error: rmErr } = await sb.storage
        .from(BUCKET)
        .remove(photos.map((p) => p.file_path));
      if (rmErr) throw rmErr;

      // 3. Видаляємо записи про фото
      const { error: delPhErr } = await sb
        .from("product_photos")
        .delete()
        .eq("product_id", product.id);
      if (delPhErr) throw delPhErr;
    }

    // 4. Видаляємо сам товар
    const { error: delErr } = await sb
      .from("products")
      .delete()
      .eq("id", product.id);
    if (delErr) throw delErr;

    card.remove();
    total = Math.max(0, total - 1);
    countEl.textContent = `Знайдено: ${total}`;
  } catch (err) {
    alert("Не вдалося видалити товар: " + (err.message || err));
    btn.disabled = false;
    btn.textContent = "Видалити товар";
  }
}

// ---------- події ----------

searchEl.addEventListener(
  "input",
  debounce((e) => {
    query = e.target.value.trim();
    loadProducts(true);
  }, 300)
);

loadMoreBtn.addEventListener("click", () => loadProducts(false));

document.getElementById("logout-btn").addEventListener("click", signOut);

// ---------- додавання товару ----------

const addModal = document.getElementById("add-modal");
const addForm = document.getElementById("add-form");
const addArticle = document.getElementById("add-article");
const addName = document.getElementById("add-name");
const addError = document.getElementById("add-error");
const addSave = document.getElementById("add-save");

function openAddModal() {
  addForm.reset();
  addError.hidden = true;
  addModal.hidden = false;
  addArticle.focus();
}

function closeAddModal() {
  addModal.hidden = true;
}

document.getElementById("add-product-btn").addEventListener("click", openAddModal);
document.getElementById("add-cancel").addEventListener("click", closeAddModal);

// Закриття по кліку на фон
addModal.addEventListener("click", (e) => {
  if (e.target === addModal) closeAddModal();
});

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  addError.hidden = true;

  const article = addArticle.value.trim();
  const name = addName.value.trim();
  if (!article) {
    addError.textContent = "Артикул обов'язковий";
    addError.hidden = false;
    return;
  }

  addSave.disabled = true;
  addSave.textContent = "…";

  const { data, error } = await sb
    .from("products")
    .insert({ article, name })
    .select("id, article, name, characteristics")
    .single();

  addSave.disabled = false;
  addSave.textContent = "Створити";

  if (error) {
    addError.textContent =
      error.code === "23505"
        ? `Товар з артикулом «${article}» вже існує`
        : "Не вдалося створити: " + error.message;
    addError.hidden = false;
    return;
  }

  // Нову картку показуємо зверху списку
  listEl.prepend(renderCard(data, []));
  total += 1;
  countEl.textContent = `Знайдено: ${total}`;
  closeAddModal();
});

// ---------- старт ----------

(async function init() {
  const session = await requireAuth();
  if (!session) return;
  document.getElementById("user-email").textContent = session.user.email;
  await loadProducts(true);
})();
