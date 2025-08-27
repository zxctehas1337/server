# 🚀 Развертывание OAuth и Email для продакшн

## Быстрый старт

### 1. Обновление кода
```bash
# Убедитесь, что все изменения закоммичены
git add .
git commit -m "Add OAuth and Email functionality"
git push origin main
```

### 2. Настройка переменных окружения в Render

В Render Dashboard → ваш сервис → Environment Variables добавьте:

```env
# GitHub OAuth
GITHUB_CLIENT_ID=ваш_github_client_id
GITHUB_CLIENT_SECRET=ваш_github_client_secret
GITHUB_CALLBACK_URL=https://krackenx.onrender.com/api/auth/github/callback

# JWT
JWT_SECRET=ваш_супер_секретный_ключ

# Email (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=ваш_email@gmail.com
SMTP_PASS=ваш_app_password
SMTP_FROM=Kracken <ваш_email@gmail.com>
```

### 3. Выполнение миграции базы данных

После деплоя выполните миграцию:
```bash
# В Render Dashboard → ваш сервис → Shell
node scripts/add-email-logs-migration.js
```

### 4. Тестирование

#### Через веб-интерфейс:
https://krackenx.onrender.com/test-oauth.html

#### Через командную строку:
```bash
node test-endpoints.js
```

## 📋 Доступные эндпоинты

### Тестовые (для проверки):
- `GET /api/test/github-oauth` - Проверка OAuth конфигурации
- `POST /api/test/email` - Тестовая отправка email
- `POST /api/test/oauth-register` - Тестовая OAuth регистрация

### Продакшн (после настройки):
- `GET /api/auth/github` - GitHub OAuth инициация
- `GET /api/auth/github/callback` - OAuth callback
- `POST /api/email/send` - Отправка email

## 🔧 Настройка GitHub OAuth

1. Перейдите на https://github.com/settings/developers
2. Создайте новое OAuth App:
   - **Name**: Kracken Messenger
   - **Homepage URL**: https://krackenx.onrender.com
   - **Authorization callback URL**: https://krackenx.onrender.com/api/auth/github/callback
3. Скопируйте Client ID и Client Secret в Render

## 📧 Настройка Email (Gmail)

1. Включите 2FA в Google Account
2. Создайте App Password:
   - Google Account → Security → App passwords
   - Выберите "Mail" и "Other"
   - Название: "Kracken Messenger"
3. Используйте App Password в SMTP_PASS

## ✅ Проверка работоспособности

1. **Статус сервера**: https://krackenx.onrender.com/api/health
2. **OAuth конфигурация**: https://krackenx.onrender.com/api/test/github-oauth
3. **Тестовая страница**: https://krackenx.onrender.com/test-oauth.html

## 🐛 Устранение неполадок

### Сервер не отвечает
- Проверьте логи в Render Dashboard
- Убедитесь, что все переменные окружения установлены

### OAuth не работает
- Проверьте правильность GITHUB_CLIENT_ID и GITHUB_CLIENT_SECRET
- Убедитесь, что callback URL совпадает с настройками GitHub

### Email не отправляется
- Проверьте SMTP настройки
- Убедитесь, что используется App Password, а не обычный пароль

## 📊 Мониторинг

### Логи email:
```sql
SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT 10;
```

### OAuth пользователи:
```sql
SELECT is_oauth_user, COUNT(*) FROM users GROUP BY is_oauth_user;
```

---

**🎉 Готово! Ваш сервер поддерживает OAuth и Email!**
