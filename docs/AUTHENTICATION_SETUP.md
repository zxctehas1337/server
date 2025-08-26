# Настройка системы аутентификации Kracken Messenger

## Обзор

Kracken Messenger теперь поддерживает два способа аутентификации:

1. **GitHub OAuth** - быстрый вход через GitHub аккаунт
2. **Email регистрация** - регистрация с подтверждением email

## Требования

### База данных
- PostgreSQL (рекомендуется версия 12+)
- Обновленная схема с полями для email верификации

### Переменные окружения

Создайте файл `.env` в папке `apps/server/` со следующими переменными:

```env
# База данных
DATABASE_URL=postgresql://username:password@localhost:5432/kracken_messenger
# или отдельные переменные:
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=kracken_messenger

# GitHub OAuth (обязательно для OAuth входа)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=https://your-domain.com/api/auth/github/callback

# JWT секрет для токенов
JWT_SECRET=your_super_secret_jwt_key

# Email настройки (для отправки кодов подтверждения)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# URL фронтенда (для ссылок в email)
FRONTEND_URL=https://your-domain.com
```

## Настройка GitHub OAuth

1. Перейдите в [GitHub Developer Settings](https://github.com/settings/developers)
2. Создайте новое OAuth App:
   - **Application name**: Kracken Messenger
   - **Homepage URL**: `https://your-domain.com`
   - **Authorization callback URL**: `https://your-domain.com/api/auth/github/callback`
3. Скопируйте Client ID и Client Secret в `.env` файл

## Настройка Email (Gmail)

Для отправки кодов подтверждения:

1. Включите двухфакторную аутентификацию в Google аккаунте
2. Создайте App Password:
   - Перейдите в [Google Account Settings](https://myaccount.google.com/apppasswords)
   - Выберите "Mail" и "Other (Custom name)"
   - Введите название (например, "Kracken Messenger")
   - Скопируйте сгенерированный пароль в `SMTP_PASS`

## Установка и настройка

### 1. Установка зависимостей

```bash
cd apps/server
npm install
```

### 2. Инициализация базы данных

```bash
# Создание таблиц
npm run init-db

# Применение миграций для email верификации
node scripts/add-email-verification-migration.js
```

### 3. Запуск сервера

```bash
# Разработка
npm run dev

# Продакшн
npm start
```

## Функциональность

### GitHub OAuth
- Пользователи могут войти одним кликом через GitHub
- Автоматическое создание аккаунта при первом входе
- Email автоматически подтверждается для OAuth пользователей

### Email регистрация
- Пользователи регистрируются с email и паролем
- Отправляется код подтверждения на email
- Пользователь должен ввести код для активации аккаунта
- Возможность повторной отправки кода

### Безопасность
- Пароли хешируются с помощью bcrypt
- JWT токены для OAuth пользователей
- Коды подтверждения истекают через 15 минут
- Защита от брутфорс атак

## API Endpoints

### Аутентификация
- `POST /api/auth/register` - Регистрация нового пользователя
- `POST /api/auth/verify-email` - Подтверждение email
- `POST /api/auth/resend-code` - Повторная отправка кода
- `GET /api/auth/github` - GitHub OAuth инициация
- `GET /api/auth/github/callback` - GitHub OAuth callback

### Socket.IO Events
- `login` - Вход с username/password
- `authenticate_with_token` - Вход с JWT токеном
- `login_success` - Успешный вход
- `login_error` - Ошибка входа

## Структура базы данных

### Таблица users
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    github_id VARCHAR(255) UNIQUE,
    avatar_url VARCHAR(500),
    email_verified BOOLEAN DEFAULT FALSE,
    verification_code VARCHAR(6),
    verification_code_expires TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_oauth_user BOOLEAN DEFAULT FALSE
);
```

## Устранение неполадок

### Проблемы с GitHub OAuth
1. Проверьте правильность Client ID и Secret
2. Убедитесь, что callback URL точно совпадает с настройками в GitHub
3. Проверьте, что домен добавлен в разрешенные в GitHub OAuth App

### Проблемы с Email
1. Проверьте настройки SMTP в `.env`
2. Убедитесь, что используется App Password для Gmail
3. Проверьте логи сервера на наличие ошибок отправки email

### Проблемы с базой данных
1. Убедитесь, что PostgreSQL запущен
2. Проверьте правильность DATABASE_URL
3. Запустите миграции: `node scripts/add-email-verification-migration.js`

## Тестирование

### Тест GitHub OAuth
1. Откройте приложение
2. Нажмите "Продолжить с GitHub"
3. Авторизуйтесь в GitHub
4. Должны вернуться в приложение авторизованным

### Тест Email регистрации
1. Откройте приложение
2. Нажмите "Зарегистрироваться"
3. Заполните форму регистрации
4. Проверьте email на наличие кода подтверждения
5. Введите код в форму подтверждения
6. Попробуйте войти с созданными учетными данными

## Безопасность

- Все пароли хешируются с помощью bcrypt
- JWT токены имеют ограниченное время жизни
- Коды подтверждения истекают через 15 минут
- Email адреса проверяются на уникальность
- Защита от SQL инъекций через параметризованные запросы
