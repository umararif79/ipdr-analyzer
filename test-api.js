const axios = require('axios');
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6SUtXVCJ9.eyJpZCI6MTMsInVzZXJuYW1lIjoiYWRtaW la...'; // I will replace this with the full token from user prompt
const BASE_URL = 'http://localhost:3001/api';

async function test() {
  try {
    const res = await axios.post(`${BASE_URL}/query`, {
      filters: { dateFrom: '2026-05-30', protocol: 'TCP' },
      page: 1,
      pageSize: 50
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Query Success:', res.data);
  } catch (e) {
    console.log('Query Error:', e.response?.data || e.message);
  }
}
test();
