# Привязка Android TV к Умному Дому Яндекса

Этот репозиторий содержит полный стек для интеграции Android TV (Салют ТВ) с Умным домом Яндекса без использования Serverless-функций (мгновенный отклик через WebSocket).

## Структура проекта
* `/backend` - Node.js монолит (OAuth2, Yandex API v1.0, WebSocket Server).
* `/android-client` - Android-приложение (Kotlin) для TV.

---

## 1. Запуск Backend на вашем VPS

### Требования
* Node.js (v18+)
* Nginx
* PM2 (`npm install -g pm2`)
* Зарегистрированный домен и SSL-сертификат (Certbot/Let's Encrypt).

### Установка

1. Перейдите в папку бэкенда:
   ```bash
   cd backend
   npm install
   ```
2. Откройте `ecosystem.config.js` и задайте свои секретные ключи (`OAUTH_CLIENT_SECRET`, `JWT_SECRET`).
3. Запустите сервер через PM2:
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

### Настройка Nginx

Вам нужно настроить Nginx как reverse-proxy, который также поддерживает проксирование WebSocket соединений.

Создайте файл `/etc/nginx/sites-available/yandex-tv`:

```nginx
server {
    listen 80;
    server_name your-domain.com; # ЗАМЕНИТЕ НА ВАШ ДОМЕН
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com; # ЗАМЕНИТЕ НА ВАШ ДОМЕН

    # Пути к сертификатам (Certbot создаст их автоматически)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Основной API (Yandex + OAuth)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400; # Важно для поддержания долгих соединений
    }
}
```

Не забудьте активировать конфиг:
```bash
ln -s /etc/nginx/sites-available/yandex-tv /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

---

## 2. Настройка Android-клиента

1. Откройте папку `/android-client` в Android Studio.
2. В файле `app/src/main/java/com/example/tvsmarthome/SmartHomeService.kt` найдите строку:
   ```kotlin
   private val WEBSOCKET_URL = "ws://10.0.2.2:3000/ws"
   ```
   и замените её на ваш настроенный домен по протоколу WSS:
   ```kotlin
   private val WEBSOCKET_URL = "wss://your-domain.com/ws"
   ```
3. Соберите APK (`Build -> Build Bundle(s) / APK(s) -> Build APK(s)`).
4. Установите APK на ваш телевизор (через USB-флешку или ADB).

---

## 3. Регистрация навыка в Яндекс Диалогах

1. Перейдите в [Яндекс Диалоги](https://dialogs.yandex.ru/developer).
2. Создайте навык "Умный дом".
3. **Endpoint URL:** `https://your-domain.com/v1.0`
4. **Связка аккаунтов (OAuth2):**
   * Идентификатор приложения: `yandex_smart_home_client` (или тот, что в `ecosystem.config.js`)
   * Секрет приложения: `your_secret_key_here` (из `ecosystem.config.js`)
   * URL авторизации: `https://your-domain.com/oauth/authorize`
   * URL для получения токена: `https://your-domain.com/oauth/token`
5. Сохраните и опубликуйте (можно сделать навык приватным).

## 4. Как пользоваться

1. Откройте приложение "Yandex Smart TV" на вашем телевизоре.
2. Вы увидите **4-значный код**.
3. В приложении "Дом с Алисой" на телефоне найдите созданный вами навык и нажмите "Привязать к Яндексу".
4. Откроется веб-страница на вашем домене. Введите 4-значный код с телевизора.
5. Готово! Устройство добавится в дом, и вы сможете говорить "Алиса, выключи звук на телевизоре", "Алиса, включи Кинопоиск на телевизоре".
