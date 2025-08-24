// Simple test script for API endpoints
const http = require('http');

const API_BASE = 'http://localhost:3000';

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(url, options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        try {
          const parsedBody = responseBody ? JSON.parse(responseBody) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsedBody,
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: responseBody,
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testEndpoints() {
  console.log('🧪 Testing API endpoints...\n');

  try {
    // Test health endpoint
    console.log('1. Testing GET /api/health');
    const healthResponse = await makeRequest('GET', '/api/health');
    console.log('Status:', healthResponse.status);
    console.log('Response:', healthResponse.body);
    console.log('✅ Health check passed\n');

    // Test register endpoint
    console.log('2. Testing POST /api/auth/register');
    const testUser = {
      username: `testuser_${Date.now()}`,
      password: 'testpass123',
    };
    const registerResponse = await makeRequest('POST', '/api/auth/register', testUser);
    console.log('Status:', registerResponse.status);
    console.log('Response:', registerResponse.body);
    console.log('✅ Registration test passed\n');

    // Test login endpoint
    console.log('3. Testing POST /api/auth/login');
    const loginResponse = await makeRequest('POST', '/api/auth/login', testUser);
    console.log('Status:', loginResponse.status);
    console.log('Response:', loginResponse.body);
    console.log('✅ Login test passed\n');

    // Test duplicate registration (should fail)
    console.log('4. Testing duplicate registration');
    const duplicateResponse = await makeRequest('POST', '/api/auth/register', testUser);
    console.log('Status:', duplicateResponse.status);
    console.log('Response:', duplicateResponse.body);
    console.log('✅ Duplicate registration test passed\n');

    console.log('🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  testEndpoints();
}

module.exports = { testEndpoints, makeRequest };
