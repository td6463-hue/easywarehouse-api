import axios from 'axios';

async function testConsoleBuckets() {
  const loginUrl = 'https://parking-st.freelixs.com/api/v1/login';
  const loginRes = await axios.post(
    loginUrl,
    { accessKey: 'minioadmin', secretKey: '2wsx@WSX' },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const cookie = loginRes.headers['set-cookie']?.[0]?.split(';')[0];
  console.log('Got cookie token:', cookie?.slice(0, 30));

  // List buckets via Console API
  const bucketsRes = await axios.get('https://parking-st.freelixs.com/api/v1/buckets', {
    headers: { Cookie: cookie },
  });

  console.log('✅ Buckets list status:', bucketsRes.status);
  console.log('Buckets:', bucketsRes.data);
}

testConsoleBuckets().catch(console.error).then(() => process.exit(0));
