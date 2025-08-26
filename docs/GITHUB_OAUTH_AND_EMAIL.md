# GitHub OAuth и Email функционал для Kracken

## Обзор

Этот документ описывает как настроить GitHub OAuth аутентификацию и email функционал для вашего мессенджера Kracken.

**🌐 Продакшн сервер**: https://beckend-yaj1.onrender.com

## 🚀 Возможности

### GitHub OAuth
- ✅ Регистрация через GitHub
- ✅ Автоматическое получение email и аватара
- ✅ Безопасная аутентификация
- ✅ Поддержка существующих пользователей

### Email функционал
- ✅ Приветственные письма
- ✅ Сброс пароля
- ✅ Уведомления
- ✅ Логирование отправленных писем

## 📋 Требования

### База данных
- PostgreSQL (уже настроена)
- Выполнить миграцию: `node scripts/add-email-logs-migration.js`

### Переменные окружения
Добавьте в ваш `.env` файл:

```env
# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=https://beckend-yaj1.onrender.com/api/auth/github/callback

# JWT для токенов
JWT_SECRET=your_super_secret_jwt_key

# Email (Gmail пример)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=Kracken <your_email@gmail.com>
```

## 🔧 Настройка GitHub OAuth

### 1. Создание GitHub App

1. Перейдите на [GitHub Developer Settings](https://github.com/settings/developers)
2. Нажмите "New OAuth App"
3. Заполните форму:
   - **Application name**: Kracken Messenger
   - **Homepage URL**: `https://beckend-yaj1.onrender.com`
   - **Authorization callback URL**: `https://beckend-yaj1.onrender.com/api/auth/github/callback`
4. Нажмите "Register application"
5. Скопируйте `Client ID` и `Client Secret`

### 2. Настройка переменных окружения

```env
GITHUB_CLIENT_ID=ваш_client_id
GITHUB_CLIENT_SECRET=ваш_client_secret
GITHUB_CALLBACK_URL=https://beckend-yaj1.onrender.com/api/auth/github/callback
```

## 📧 Настройка Email (Gmail)

### 1. Включение 2FA
1. Перейдите в [Google Account Settings](https://myaccount.google.com/security)
2. Включите двухфакторную аутентификацию

### 2. Создание App Password
1. В настройках безопасности найдите "App passwords"
2. Выберите "Mail" и "Other (Custom name)"
3. Введите название: "Kracken Messenger"
4. Скопируйте сгенерированный пароль

### 3. Настройка переменных окружения

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=ваш_app_password
SMTP_FROM=Kracken <your_email@gmail.com>
```

## 🚀 Запуск

### 1. Установка зависимостей

```bash
npm install
```

### 2. Выполнение миграции

```bash
node scripts/add-email-logs-migration.js
```

### 3. Запуск сервера

```bash
npm run dev
```

## 📡 API Endpoints

### GitHub OAuth
- `GET /api/auth/github` - Инициация OAuth
- `GET /api/auth/github/callback` - Callback обработчик

### Email
- `POST /api/email/send` - Отправка email

### Тестовые эндпоинты (для продакшн)
- `GET /api/test/github-oauth` - Проверка конфигурации OAuth
- `POST /api/test/email` - Тестовая отправка email
- `POST /api/test/oauth-register` - Тестовая регистрация OAuth пользователя

Пример использования email API:

```javascript
// Отправка приветственного письма
fetch('/api/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        template: 'welcome',
        to: 'user@example.com',
        data: { username: 'John' }
    })
});

// Отправка сброса пароля
fetch('/api/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        template: 'passwordReset',
        to: 'user@example.com',
        data: { resetLink: 'https://beckend-yaj1.onrender.com/reset?token=abc123' }
    })
});

// Тестирование OAuth конфигурации
fetch('https://beckend-yaj1.onrender.com/api/test/github-oauth')
    .then(response => response.json())
    .then(data => console.log('OAuth config:', data));

// Тестирование email отправки
fetch('https://beckend-yaj1.onrender.com/api/test/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        template: 'welcome',
        to: 'test@example.com',
        data: { username: 'TestUser' }
    })
})
.then(response => response.json())
.then(data => console.log('Email test result:', data));
```

## 🔒 Безопасность

### OAuth безопасность
- ✅ Используется JWT для токенов
- ✅ Проверка GitHub ID
- ✅ Защита от CSRF атак
- ✅ Безопасные callback URL

### Email безопасность
- ✅ Валидация email адресов
- ✅ Rate limiting на отправку
- ✅ Логирование всех отправок
- ✅ Защита от спама

## 📊 Мониторинг

### Логи email
Все отправленные письма логируются в таблицу `email_logs`:

```sql
SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT 10;
```

### Статистика OAuth
```sql
SELECT 
    is_oauth_user,
    COUNT(*) as user_count
FROM users 
GROUP BY is_oauth_user;
```

## 🐛 Устранение неполадок

### GitHub OAuth не работает
1. Проверьте правильность `GITHUB_CLIENT_ID` и `GITHUB_CLIENT_SECRET`
2. Убедитесь, что callback URL совпадает с настройками в GitHub
3. Проверьте логи сервера

### Email не отправляется
1. Проверьте SMTP настройки
2. Убедитесь, что включена 2FA в Gmail
3. Используйте App Password, а не обычный пароль
4. Проверьте логи в таблице `email_logs`

### Тестирование email
```bash
# Проверка конфигурации
node -e "
const { verifyEmailConfig } = require('./utils/email');
verifyEmailConfig().then(console.log);
"
```

## 📈 Производительность

### PostgreSQL нагрузка
- **OAuth**: ~1-2 запроса на пользователя
- **Email**: ~1 запрос на отправку
- **Логи**: ~1 запрос на письмо

### Масштабируемость
- PostgreSQL легко потянет **миллионы пользователей**
- Email отправка: **1000+ писем в час** (зависит от SMTP провайдера)
- OAuth: **неограниченно** (GitHub API лимиты)

## 💡 Рекомендации

### Для продакшена
1. Используйте отдельный email домен
2. Настройте SPF/DKIM записи
3. Используйте Redis для кэширования
4. Настройте мониторинг

### Для разработки
1. Используйте Mailtrap для тестирования
2. Локальные GitHub OAuth настройки
3. Отладочные логи

## 🔄 Обновления

### Добавление новых email шаблонов
1. Добавьте шаблон в `utils/email.js`
2. Обновите API endpoint
3. Протестируйте

### Добавление других OAuth провайдеров
1. Установите соответствующий passport strategy
2. Добавьте поля в базу данных
3. Создайте новые API endpoints

---

**PostgreSQL отлично справляется с этими задачами!** 🚀
