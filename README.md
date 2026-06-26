# Article Admin — веб-админка каталога товаров

Статичный сайт (HTML + CSS + JS, без сборщиков) для управления каталогом товаров в
Supabase. Хостится на GitHub Pages. Supabase-клиент подключён через CDN.

## Возможности

- Список всех товаров с поиском по артикулу и названию, постраничная подгрузка
  («Показать ещё», по 20 шт).
- У каждого товара: артикул, название, миниатюры фото.
- Inline-редактирование названия товара.
- Загрузка фото в Storage (`product-photos/{артикул_без_пробелов}/{uuid}.jpg`) с записью
  в `product_photos` (`file_path` + `position`, `file_id` пустой — его проставляет бот).
- Удаление фото (из Storage и из таблицы).
- Авторизация по email + паролю (Supabase Auth). Каталог доступен только после входа,
  есть кнопка «Выйти».

## Структура

```
index.html          каталог + редактирование (требует входа)
login.html          вход по email/паролю
auth.js             Supabase-клиент, сессия, вход/выход
app.js              логика каталога
styles.css          стили
config.example.js   шаблон конфига (коммитится)
config.js           реальные ключи (в .gitignore, НЕ коммитится)
.gitignore
```

## Настройка

1. Скопируй шаблон и подставь свои значения:

   ```bash
   cp config.example.js config.js
   ```

   ```js
   const SUPABASE_URL = "https://<project-ref>.supabase.co";
   const SUPABASE_ANON_KEY = "<anon-или-publishable-ключ>";
   ```

   > Используется **только публичный anon / publishable** ключ — его можно светить.
   > `service_role` использовать нельзя никогда.

2. Создай пользователя: Supabase → **Authentication → Users → Add user** (email + пароль).

3. Применить SQL с RLS-политиками (ниже) в **SQL Editor**.

4. Убедись, что bucket `product-photos` — **public** (Storage → product-photos →
   Settings → Public bucket = ON), чтобы фото отдавались по public URL.

## Запуск локально

`config.js` рядом с HTML, открой `index.html` через любой статический сервер
(чтобы работали относительные пути и Auth):

```bash
python3 -m http.server 8000
# затем http://localhost:8000/login.html
```

## Деплой на GitHub Pages

1. Запушь репозиторий на GitHub (файл `config.js` не попадёт — он в `.gitignore`).
2. На сервере, где работает сайт, `config.js` нужен. Варианты:
   - **Проще всего:** временно убери `config.js` из `.gitignore` и закоммить его —
     там только публичный anon-ключ, светить его безопасно. Тогда Pages подхватит конфиг.
   - Либо генерируй `config.js` при деплое (GitHub Actions).
3. Settings → **Pages** → Source: ветка `main`, папка `/ (root)` → Save.
4. Сайт будет доступен на `https://<username>.github.io/<repo>/login.html`.

> Так как используется только anon-ключ, реальная защита данных обеспечивается
> **RLS-политиками** на стороне Supabase, а не сокрытием ключа.

## RLS-политики

Логика: **чтение `products` / `product_photos` и файлов из bucket — публично**
(в т.ч. для бота с anon); **запись/обновление/удаление и загрузка файлов — только для
authenticated**.

Выполни в **Supabase SQL Editor**:

```sql
-- ============================================================
-- 1. Включаем RLS на таблицах
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
