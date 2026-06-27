# Article Admin — веб-адмінка каталогу товарів

Статичний сайт (HTML + CSS + JS, без збирачів) для керування каталогом товарів у
Supabase. Хоститься на GitHub Pages. Supabase-клієнт підключений через CDN.

## Можливості

- Список усіх товарів з пошуком за артикулом і назвою, посторінкова підвантаження
  («Показати ще», по 20 шт).
- У кожного товару: артикул, назва, мініатюри фото.
- Inline-редагування назви товару.
- Додавання товару (артикул + назва).
- Видалення товару разом з усіма його фото.
- Завантаження фото в Storage (`product-photos/{артикул_без_пробілів}/{uuid}.jpg`) із записом
  у `product_photos` (`file_path` + `position`, `file_id` порожній — його проставляє бот).
- Видалення фото (зі Storage і з таблиці).
- Авторизація за email + паролем (Supabase Auth). Каталог доступний лише після входу,
  є кнопка «Вийти».

**Розділ «Доступи»** (`access.html`) — керування дозволеними користувачами бота
(таблиця `allowed_users`): список з пошуком, додавання (телефон нормалізується до
формату `+380XXXXXXXXX`, дублі ловляться по unique), редагування імені, видалення.

## Структура

```
index.html          каталог + редагування (потребує входу)
access.html         розділ «Доступи» (allowed_users)
login.html          вхід за email/паролем
auth.js             Supabase-клієнт, сесія, вхід/вихід
app.js              логіка каталогу
access.js           логіка розділу «Доступи»
styles.css          стилі
config.example.js   шаблон конфігу (комітиться)
config.js           реальні ключі (у .gitignore, НЕ комітиться)
.gitignore
```

## Налаштування

1. Скопіюй шаблон і встав свої значення:

   ```bash
   cp config.example.js config.js
   ```

   ```js
   const SUPABASE_URL = "https://<project-ref>.supabase.co";
   const SUPABASE_ANON_KEY = "<anon-або-publishable-ключ>";
   ```

   > Використовується **лише публічний anon / publishable** ключ — його можна світити.
   > `service_role` використовувати не можна ніколи.

2. Створи користувача: Supabase → **Authentication → Users → Add user** (email + пароль).

3. Застосуй SQL з RLS-політиками (нижче) у **SQL Editor**.

4. Переконайся, що bucket `product-photos` — **public** (Storage → product-photos →
   Settings → Public bucket = ON), щоб фото віддавались за public URL.

## Запуск локально

`config.js` поруч із HTML, відкрий `index.html` через будь-який статичний сервер
(щоб працювали відносні шляхи й Auth):

```bash
python3 -m http.server 8000
# далі http://localhost:8000/login.html
```

## Деплой на GitHub Pages

1. Запуш репозиторій на GitHub (файл `config.js` не потрапить — він у `.gitignore`).
2. На сервері, де працює сайт, `config.js` потрібен. Варіанти:
   - **Найпростіше:** тимчасово прибери `config.js` з `.gitignore` і закоміть його —
     там лише публічний anon-ключ, світити його безпечно. Тоді Pages підхопить конфіг.
   - Або генеруй `config.js` під час деплою (GitHub Actions).
3. Settings → **Pages** → Source: гілка `main`, тека `/ (root)` → Save.
4. Сайт буде доступний на `https://<username>.github.io/<repo>/login.html`.

> Оскільки використовується лише anon-ключ, реальний захист даних забезпечується
> **RLS-політиками** на стороні Supabase, а не приховуванням ключа.

## RLS-політики

Логіка: **читання `products` / `product_photos` і файлів з bucket — публічно**
(зокрема для бота з anon); **запис/оновлення/видалення та завантаження файлів — лише для
authenticated**.

Виконай у **Supabase SQL Editor**:

```sql
-- ============================================================
-- 1. Вмикаємо RLS на таблицях
-- ============================================================
alter table public.products       enable row level security;
alter table public.product_photos enable row level security;

-- ============================================================
-- 2. PRODUCTS
-- ============================================================
create policy "products_select_public"
  on public.products
  for select
  using (true);

create policy "products_insert_authenticated"
  on public.products
  for insert
  to authenticated
  with check (true);

create policy "products_update_authenticated"
  on public.products
  for update
  to authenticated
  using (true)
  with check (true);

create policy "products_delete_authenticated"
  on public.products
  for delete
  to authenticated
  using (true);

-- ============================================================
-- 3. PRODUCT_PHOTOS
-- ============================================================
create policy "product_photos_select_public"
  on public.product_photos
  for select
  using (true);

create policy "product_photos_insert_authenticated"
  on public.product_photos
  for insert
  to authenticated
  with check (true);

create policy "product_photos_update_authenticated"
  on public.product_photos
  for update
  to authenticated
  using (true)
  with check (true);

create policy "product_photos_delete_authenticated"
  on public.product_photos
  for delete
  to authenticated
  using (true);

-- ============================================================
-- 4. STORAGE: bucket product-photos
-- ============================================================
create policy "product_photos_storage_select_public"
  on storage.objects
  for select
  using (bucket_id = 'product-photos');

create policy "product_photos_storage_insert_authenticated"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'product-photos');

create policy "product_photos_storage_update_authenticated"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'product-photos')
  with check (bucket_id = 'product-photos');

create policy "product_photos_storage_delete_authenticated"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'product-photos');
```
