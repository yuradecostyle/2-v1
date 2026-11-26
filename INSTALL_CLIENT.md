# Інструкція встановлення 2С ERP (v1.0.0) новому клієнту

Ця покрокова інструкція описує, як розгорнути базову версію **2С (v1.0.0)** для нового клієнта:
- **Сценарій А:** Production-сервер (VPS Ubuntu 22.04 / 24.04 + PostgreSQL + Nginx + HTTPS + автозапуск `systemd`) — **рекомендовано для реальної роботи команди**.
- **Сценарій Б:** Швидкий запуск на локальному комп’ютері / офісному ПК (без PostgreSQL — на вбудованій базі PGlite, за 3 хвилини).
- **Розділ 3:** Чекліст первинного налаштування системи під бізнес клієнта.
- **Розділ 4:** Резервне копіювання (бекапи) та оновлення версій.

---

## Мінімальні системні вимоги (для 1 клієнта)

| Параметр | Мінімум (до 15 користувачів) | Рекомендовано (15–100 користувачів) |
|---|---|---|
| ОС | Ubuntu 22.04 / 24.04 LTS | Ubuntu 24.04 LTS |
| CPU | 1–2 vCPU | 2–4 vCPU |
| RAM | 2 ГБ | 4 ГБ |
| Диск | 20 ГБ SSD | 40+ ГБ NVMe SSD |
| Node.js | **v20 LTS** або новіше | **v22 LTS** |
| База даних | PGlite (вбудована) або PostgreSQL 15+ | **PostgreSQL 16** |

---

## Сценарій А: Production-встановлення на VPS (Ubuntu + PostgreSQL + Nginx + HTTPS)

### Крок 1. Встановлення Node.js 22, PostgreSQL, Nginx та Git
Виконайте на чистому сервері під `root` або через `sudo`:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx postgresql postgresql-contrib certbot python3-certbot-nginx

# Встановлення Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Перевірка версій
node -v   # v22.x.x
npm -v    # 10.x.x
```

### Крок 2. Створення бази даних PostgreSQL для клієнта
Замініть `client_db`, `client_user` і `STRONG_DB_PASSWORD` на унікальні дані клієнта:

```bash
sudo -u postgres psql << 'EOF'
CREATE USER client_user WITH PASSWORD 'STRONG_DB_PASSWORD';
CREATE DATABASE client_db OWNER client_user;
GRANT ALL PRIVILEGES ON DATABASE client_db TO client_user;
EOF
```

### Крок 3. Завантаження базової версії `v1.0.0` із GitHub
> Якщо репозиторій приватний — на сервері додайте Deploy Key (Read-only SSH key у налаштуваннях репозиторію GitHub → **Settings → Deploy keys**) або клонуйте по HTTPS із токеном.

```bash
sudo mkdir -p /opt/2c-client
sudo chown -R $USER:$USER /opt/2c-client

git clone --branch v1.0.0 git@github.com:yuradecostyle/2-v1.git /opt/2c-client
# Або через HTTPS:
# git clone --branch v1.0.0 https://github.com/yuradecostyle/2-v1.git /opt/2c-client

cd /opt/2c-client
npm install
```

### Крок 4. Налаштування файлу `.env`
Створіть `.env` із шаблону та задайте дані клієнта:

```bash
cp .env.example .env
nano .env
```

Приклад заповненого `/opt/2c-client/.env`:
```env
PORT=4000
DATABASE_URL=postgres://client_user:STRONG_DB_PASSWORD@127.0.0.1:5432/client_db
PGLITE_DATA_DIR=/opt/2c-client/data/pglite
ADMIN_LOGIN=admin
ADMIN_PASSWORD=ЗадайтеНадійнийПарольКлієнта2026!
```

> **Порада:** якщо хочете запустити клієнта **без PostgreSQL** (на вбудованій локальній базі PGlite), просто залиште `DATABASE_URL=` порожнім.

### Крок 5. Збірка проєкту та перевірка автотестів
```bash
cd /opt/2c-client
npm run build
npm test
```
Очікуваний результат: усі 3 пакети (`@bas-alt/core`, `@bas-alt/api`, `@bas-alt/web`) збираються без помилок, тести показують `18 passed (18)`.

### Крок 6. Налаштування автозапуску API через `systemd`
Створіть сервіс `/etc/systemd/system/2c-api.service`:

```bash
sudo tee /etc/systemd/system/2c-api.service > /dev/null << 'EOF'
[Unit]
Description=2C ERP API Server
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/2c-client
EnvironmentFile=/opt/2c-client/.env
ExecStart=/usr/bin/npm --workspace @bas-alt/api run start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
```

> Якщо запускаєте не під `www-data`, а під вашим користувачем (наприклад, `ubuntu`), змініть `User=` і `Group=` та видайте права на папку `/opt/2c-client`:

```bash
sudo chown -R www-data:www-data /opt/2c-client
sudo systemctl daemon-reload
sudo systemctl enable --now 2c-api
sudo systemctl status 2c-api
```

Перевірка, що API відповідає:
```bash
curl http://127.0.0.1:4000/api/health
# Має повернути: {"status":"ok","version":"4.0.0","driver":"postgres",...}
```

### Крок 7. Налаштування Nginx та безкоштовного HTTPS (SSL)
Замініть `erp.client-domain.ua` на домен (або субдомен) клієнта, спрямований A-записом на IP сервера:

```bash
sudo tee /etc/nginx/sites-available/2c-erp > /dev/null << 'EOF'
server {
    listen 80;
    server_name erp.client-domain.ua;

    root /opt/2c-client/apps/web/dist;
    index index.html;

    # Проксіювання API на Fastify (порт 4000)
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 25M;
    }

    # SPA-маршрутизація (обов'язково для відкритих посилань клієнтам /share/:token)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/2c-erp /etc/nginx/sites-enabled/2c-erp
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Підключення безкоштовного SSL-сертифіката Let’s Encrypt:
```bash
sudo certbot --nginx -d erp.client-domain.ua
```

Після цього система клієнта доступна за адресою **`https://erp.client-domain.ua`** (і на комп’ютерах, і на смартфонах), а відкриті посилання на документи працюють у форматі `https://erp.client-domain.ua/share/<token>`.

---

## Сценарій Б: Швидкий запуск локально (Windows / macOS / Linux без PostgreSQL)

Підходить для демонстрації клієнту або роботи в локальній мережі офісу на вбудованій базі **PGlite**:

```bash
# 1. Клонування версії v1.0.0
git clone --branch v1.0.0 https://github.com/yuradecostyle/2-v1.git 2c-client
cd 2c-client

# 2. Залежності та конфіг
npm install
cp .env.example .env

# 3. Запуск API (термінал 1)
set -a && source .env && set +a
npm run dev:api

# 4. Запуск Web UI (термінал 2)
npm run dev:web
```

Відкрийте у браузері: **http://127.0.0.1:5173/**

---

## Розділ 3. Чекліст первинного налаштування під нового клієнта

Після першого входу під адміністратором (`admin` + пароль із `.env` або `admin123`):

1. **Безпека та користувачі:**
   - Відкрийте меню організації у правому верхньому куті → **«Користувачі»**.
   - Якщо використовувався стартовий пароль `admin123` — змініть пароль на вкладці **«Змінити мій пароль»**.
   - Видаліть або заблокуйте тестові акаунти (`buh`, `sales`, `zakup`, `sklad`), якщо вони не потрібні.
2. **Організації та ФОП клієнта:**
   - Відкрийте перемикач організації → **«Додати ФОП / Керувати»**.
   - Відредагуйте реквізити основної організації (назва, ЄДРПОУ/ІПН, IBAN, банк, адреса, ПІБ директора, система оподаткування та ПДВ).
   - Додайте всі додаткові **ФОП / ТОВ**, по яких працює клієнт.
3. **Підрозділи та філії:**
   - У шапці натисніть перемикач підрозділів → **«Керувати підрозділами»**.
   - Створіть реальну структуру клієнта (наприклад: *Головний офіс*, *Відділ продажів*, *Магазин №1*, *Склад*, *Виробництво*).
4. **Групи доступу та співробітники:**
   - У вікні **«Користувачі»** → **«Групи доступу»** за потреби підкоригуйте права груп або створіть власні групи.
   - Створіть логіни й паролі кожному співробітнику, оберіть:
     - **Групу доступу** (або індивідуальні **16 галочок прав**);
     - **Підрозділ співробітника**;
     - **Доступ до підрозділів** (`Усі підрозділи` / `Тільки свій підрозділ` / `Обрати галочками`);
     - **Доступ до ФОП/ТОВ**.
   - Натисніть **«Копіювати доступи»** і передайте співробітнику логін, пароль і посилання на програму.
5. **Склади, каси, номенклатура й залишки:**
   - Перейдіть у **«Довідники»** → перевірте склади, банківські рахунки/каси та штатний розпис (**«Співробітники»** з прив’язкою до підрозділів).
   - У розділі **«Інтеграції»** завантажте товари, контрагентів і початкові залишки з **1С/BAS** (через **OData** або **CSV-імпорт**).
   - За потреби підключіть API-ключі **Monobank**, **Приват24** та **Checkbox ПРРО**.

---

## Розділ 4. Резервне копіювання (бекапи) та оновлення клієнта

### Щоденний автоматичний бекап PostgreSQL (cron)
```bash
sudo mkdir -p /var/backups/2c-erp
# Додайте у crontab (`crontab -e`): щодня о 03:00 зберігати стиснений дамп і чистити файли старші 14 днів
0 3 * * * pg_dump -U client_user -h 127.0.0.1 client_db | gzip > /var/backups/2c-erp/db_$(date +\%F).sql.gz && find /var/backups/2c-erp -name "*.sql.gz" -mtime +14 -delete
```
*(Для режиму PGlite достатньо щодня архівувати папку `/opt/2c-client/data/pglite`.)*

### Оновлення встановленої системи клієнта на нову версію
```bash
cd /opt/2c-client
git fetch --tags
git checkout v1.0.0    # або git pull origin main / новий тег (напр. v1.1.0)
npm install
npm run build
sudo systemctl restart 2c-api
```
> Міграції таблиць і нових колонок виконуються автоматично та безпечно (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) при запуску API — дані клієнта зберігаються.

---

## Діагностика (якщо щось пішло не так)

| Проблема | Перевірка / рішення |
|---|---|
| Сайт не відкривається або `502 Bad Gateway` | Перевірте статус API: `sudo systemctl status 2c-api` та логи `sudo journalctl -u 2c-api -n 50` |
| Помилка підключення до PostgreSQL | Перевірте `DATABASE_URL` у `/opt/2c-client/.env` і статус БД `sudo systemctl status postgresql` |
| Публічне посилання `/share/...` дає `404` | Переконайтесь, що в конфігу Nginx є `try_files $uri $uri/ /index.html;` і виконайте `sudo systemctl reload nginx` |
| Забули пароль адміністратора | Створіть/оновіть пароль через інший акаунт `OWNER` або зверніться до адміністратора сервера |
