#!/usr/bin/env node

const fetch = require('node-fetch');

const SERVER_URL = 'https://beckend-yaj1.onrender.com';

async function testEndpoint(url, options = {}) {
    try {
        console.log(`\n🔍 Тестирую: ${url}`);
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (response.ok) {
            console.log('✅ Успех:', JSON.stringify(data, null, 2));
        } else {
            console.log('❌ Ошибка:', JSON.stringify(data, null, 2));
        }
        
        return { success: response.ok, data };
    } catch (error) {
        console.log('❌ Сетевая ошибка:', error.message);
        return { success: false, error: error.message };
    }
}

async function runTests() {
    console.log('🧪 Тестирование эндпоинтов Kracken');
    console.log('🌐 Сервер:', SERVER_URL);
    console.log('='.repeat(50));

    // Тест 1: Проверка статуса сервера
    await testEndpoint(`${SERVER_URL}/api/health`);

    // Тест 2: Проверка OAuth конфигурации
    await testEndpoint(`${SERVER_URL}/api/test/github-oauth`);

    // Тест 3: Тестовая отправка email
    await testEndpoint(`${SERVER_URL}/api/test/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            to: 'test@example.com',
            template: 'welcome',
            data: { username: 'TestUser' }
        })
    });

    // Тест 4: Тестовая OAuth регистрация
    await testEndpoint(`${SERVER_URL}/api/test/oauth-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            githubId: '123456',
            username: 'testuser',
            email: 'test@example.com',
            avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=testuser'
        })
    });

    // Тест 5: Проверка существующего пользователя
    await testEndpoint(`${SERVER_URL}/api/test/oauth-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            githubId: '123456',
            username: 'testuser',
            email: 'test@example.com',
            avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=testuser'
        })
    });

    console.log('\n' + '='.repeat(50));
    console.log('🎉 Тестирование завершено!');
    console.log('\n📝 Следующие шаги:');
    console.log('1. Настройте GitHub OAuth App');
    console.log('2. Добавьте переменные окружения в Render');
    console.log('3. Выполните миграцию базы данных');
    console.log('4. Протестируйте через веб-интерфейс: https://beckend-yaj1.onrender.com/test-oauth.html');
}

// Запуск тестов
runTests().catch(console.error);
