#!/usr/bin/env node

/**
 * Скрипт для настройки корпоративного email аккаунта
 * 
 * Этот скрипт поможет настроить отправку писем через ваш корпоративный аккаунт
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function setupCorporateEmail() {
    console.log('🚀 Настройка корпоративного email для Kracken Messenger\n');
    
    console.log('📧 Для настройки корпоративного email вам нужно:');
    console.log('1. Включить двухфакторную аутентификацию в вашем Google аккаунте');
    console.log('2. Создать App Password для приложения');
    console.log('3. Использовать этот пароль вместо обычного пароля\n');
    
    const email = await question('Введите ваш корпоративный email (например: your@company.com): ');
    
    if (!email.includes('@')) {
        console.log('❌ Неверный формат email');
        rl.close();
        return;
    }
    
    const appPassword = await question('Введите App Password (16 символов): ');
    
    if (appPassword.length !== 16) {
        console.log('❌ App Password должен содержать 16 символов');
        rl.close();
        return;
    }
    
    const displayName = await question('Введите отображаемое имя (например: Kracken Support): ');
    
    // Создаем содержимое .env файла
    const envContent = `# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here

# Email Configuration (Corporate Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=${email}
SMTP_PASS=${appPassword}
SMTP_FROM=${displayName} <${email}>

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Database (PostgreSQL)
DATABASE_URL=postgresql://username:password@localhost:5432/kracken_db

# Server Configuration
PORT=3000
NODE_ENV=development
`;
    
    // Записываем в .env файл
    const envPath = path.join(__dirname, '..', '.env');
    fs.writeFileSync(envPath, envContent);
    
    console.log('\n✅ Настройка завершена!');
    console.log(`📁 Файл .env создан: ${envPath}`);
    console.log('\n📋 Следующие шаги:');
    console.log('1. Замените "your_github_client_id" и "your_github_client_secret" на ваши реальные данные GitHub OAuth');
    console.log('2. Замените "your_super_secret_jwt_key_here" на случайную строку для JWT');
    console.log('3. Настройте DATABASE_URL для вашей базы данных');
    console.log('4. Запустите сервер: npm run dev');
    console.log('\n🧪 Для тестирования email используйте:');
    console.log('POST /api/test/email');
    console.log('Body: { "template": "test", "to": "test@example.com" }');
    
    rl.close();
}

// Запускаем настройку
setupCorporateEmail().catch(console.error);
