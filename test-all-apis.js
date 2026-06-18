const axios = require('axios');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6SUtXVCJ9.eyJpZCI6MTMsInVzZXJuYW1lIjoiYWRtaW la...'; // I will use the token provided in the user prompt below
const BASE_URL = 'http://localhost:3001/api';

async function testEndpoint(name, method, endpoint, body = null, params = {}) {
    console.log(`Testing ${name}...`);
    try {
        const response = await axios({
            method,
            url: `${BASE_URL}${endpoint}`,
            data: body,
            params,
            headers: { 'Authorization': `Bearer ${TOKEN}` }
        });
        console.log(`✅ ${name}: ${response.status}`);
    } catch (error) {
        console.log(`❌ ${name}: ${error.response?.status || 'Error'} - ${JSON.stringify(error.response?.data || error.message)}`);
    }
}

async function runAll() {
    console.log('Starting API Test Suite...\\n');

    await testEndpoint('Health', 'GET', '/health');
    await testEndpoint('Columns', 'GET', '/columns');
    await testEndpoint('Query', 'POST', '/query', {
        filters: { dateFrom: '2026-05-30', protocol: 'TCP' },
        page: 1,
        pageSize: 50
    });
    await testEndpoint('Stats', 'POST', '/stats', {
        filters: { dateFrom: '2026-05-30' }
    });
    await testEndpoint('Related', 'GET', '/related', null, { src_ip: '1.1.1.1', timestamp: '2026-05-30T10:00:00Z' });
    await testEndpoint('Favs Get', 'GET', '/filters/favorites');
    await testEndpoint('Pref Get', 'GET', '/preferences');
    await testEndpoint('Admin Conns', 'GET', '/admin/connections');
    await testEndpoint('Admin Users', 'GET', '/admin/users');
    await testEndpoint('Admin Settings', 'GET', '/admin/settings');
    await testEndpoint('Admin Notifs', 'GET', '/admin/notifications');
    await testEndpoint('Admin Warrants', 'GET', '/admin/warrants');
    await testEndpoint('Alerts', 'GET', '/alerts');

    console.log('\\nTest Suite Completed.');
}

runAll();
