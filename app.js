// app.js — каталог товаров: список, поиск, пагинация, редактирование, фото.
// Подключается ПОСЛЕ config.js / auth.js.

const BUCKET = "product-photos";
const PAGE_SIZE = 20;

// Состояние списка
let query = "";
let offset = 0;
let total = 0;
let loading = false;

// Текущий товар для загрузки фото (через скрытый file-input)
let uploadTargetId = null;

// DOM
const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const countEl = document.getElementById("count");
const statusEl = document.getElementById("status");
const loadMoreBtn = document.getElementById("load-more");
const photoInput = document.getElementById("photo-input");

// ---------- утилиты ----------

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

// Артикул без пробелов — для пути в Storage
function articleSlug(article) {
  return String(article).replace(/\s+/g, "");
}

// ---------- загрузка данных ----------

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
  statusEl.textContent = "Загрузка…";

  if (reset) {
    offset = 0;
    listEl.innerHTML = "";
  }

  try {
    let q = sb
      .from("products")
      .select("id, article, name", { count: "exact" })
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
    countEl.textContent = `Найдено: ${total}`;
    loadMoreBtn.hidden = offset >= total;
    statusEl.textContent = total === 0 ? "Ничего не найдено" : "";
  } catch (err) {
    statusEl.textContent = "Ошибка загрузки: " + (err.message || err);
  } finally {
    loading = false;
  }
}

// ---------- рендер карточки ----------

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
        <button class="btn-link edit-name">✎ изменить</button>
      </div>
    </div>
    <div class="gallery"></div>
    <div class="card-actions">
      <button class="btn-secondary add-photo">+ Добавить фото</button>
    </div>
  `;

  card.querySelector(".gallery").replaceWith(renderGallery(photos));

  // Редактирование названия
  card.querySelector(".edit-name").addEventListener("click", () =>
    startEditName(card, product)
  );

  // Добавление фото
  card.querySelector(".add-photo").addEventListener("click", () => {
    uploadTargetId = product.id;
    photoInput.value = "";
    photoInput.click();
  });

  return card;
}

function renderGallery(photos) {
  const gallery = document.createElement("div");
  gallery.className = "gallery";

  if (photos.length === 0) {
    gallery.innerHTML = `<span class="no-photos">нет фото</span>`;
    return gallery;
  }

  for (const photo of photos) {
    const thumb = document.createElement("div");
    thumb.className = "thumb";
    thumb.innerHTML = `
      <a href="${publicUrl(photo.file_path)}" target="_blank" rel="noopener">
        <img src="${publicUrl(photo.file_path)}" alt="" loading="lazy" />
      </a>
      <button class="thumb-del" title="Удалить">✕</button>
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

// ---------- редактирование названия ----------

function startEditName(card, product) {
  const nameRow = card.querySelector(".name-row");
  const currentName = card.querySelector(".name").textContent;

  nameRow.innerHTML = `
    <input class="name-input" type="text" value="${escapeHtml(currentName)}" />
    <button class="btn-primary save-name">Сохранить</button>
    <button class="btn-link cancel-name">Отмена</button>
  `;

  const input = nameRow.querySelector(".name-input");
  input.focus();
  input.select();

  const restore = (name) => {
    nameRow.innerHTML = `
      <span class="name">${escapeHtml(name)}</span>
      <button class="btn-link edit-name">✎ изменить</button>
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
      alert("Не удалось сохранить: " + error.message);
      btn.disabled = false;
      btn.textContent = "Сохранить";
      return;
    }
    product.name = newName;
    restore(newName);
  });
}

// ---------- загрузка фото ----------

photoInput.addEventListener("change", async () => {
  const files = Array.from(photoInput.files || []);
  if (files.length === 0 || uploadTargetId == null) return;

  const card = listEl.querySelector(`.card[data-id="${uploadTargetId}"]`);
  const article = card.dataset.article;
  const productId = Number(card.dataset.id);

  statusEl.textContent = `Загрузка фото (0/${files.length})…`;

  // Текущий максимум position для этого товара
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

      // file_id оставляем пустым — его проставляет бот
      const { error: insErr } = await sb.from("product_photos").insert({
        product_id: productId,
        file_path: path,
        position: nextPos,
        file_id: null,
      });
      if (insErr) throw insErr;

      nextPos += 1;
      done += 1;
      statusEl.textContent = `Загрузка фото (${done}/${files.length})…`;
    } catch (err) {
      alert("Ошибка загрузки фото: " + (err.message || err));
    }
  }

  await refreshGallery(card, productId);
  statusEl.textContent = "";
  uploadTargetId = null;
});

// ---------- удаление фото ----------

async function deletePhoto(photo, thumbEl) {
  if (!confirm("Удалить это фото?")) return;

  // Сначала из Storage
  const { error: rmErr } = await sb.storage.from(BUCKET).remove([photo.file_path]);
  if (rmErr) {
    alert("Не удалось удалить файл из Storage: " + rmErr.message);
    return;
  }

  // Затем запись в таблице
  const { error: delErr } = await sb
    .from("product_photos")
    .delete()
    .eq("id", photo.id);
  if (delErr) {
    alert("Файл удалён, но запись в БД не удалилась: " + delErr.message);
    return;
  }

  const gallery = thumbEl.parentElement;
  thumbEl.remove();
  if (!gallery.querySelector(".thumb")) {
    gallery.innerHTML = `<span class="no-photos">нет фото</span>`;
  }
}

// ---------- события ----------

searchEl.addEventListener(
  "input",
  debounce((e) => {
    query = e.target.value.trim();
    loadProducts(true);
  }, 300)
);

loadMoreBtn.addEventListener("click", () => loadProducts(false));

document.getElementById("logout-btn").addEventListener("click", signOut);

// ---------- старт ----------

(async function init() {
  const session = await requireAuth();
  if (!session) return;
  document.getElementById("user-email").textContent = session.user.email;
  await loadProducts(true);
})();
