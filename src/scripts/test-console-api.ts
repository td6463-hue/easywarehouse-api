import axios from 'axios';

async function testConsoleLogin() {
  const url = 'https://parking-st.freelixs.com/api/v1/login';
  try {
    const res = await axios.post(
      url,
      {
        accessKey: 'minioadmin',
        secretKey: '2wsx@WSX',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('✅ Console Login Status:', res.status);
    console.log('Response Headers:', res.headers['set-cookie']);
    console.log('Response Data:', res.data);
    return res.headers['set-cookie'];
  } catch (err: any) {
    console.error('❌ Console Login Failed:', err.response?.status, err.response?.data || err.message);
    return null;
  }
}

testConsoleLogin().then(() => process.exit(0));
