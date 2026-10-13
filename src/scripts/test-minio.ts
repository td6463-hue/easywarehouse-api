import axios from 'axios';
import * as Minio from 'minio';

async function testHttp(url: string) {
  try {
    const res = await axios.get(url, { timeout: 3000, maxRedirects: 0, validateStatus: () => true });
    console.log(url, 'status:', res.status, 'server:', res.headers['server']);
  } catch (e: any) {
    console.log(url, 'error:', e.message);
  }
}

async function testMinioClient(endpoint: string, port: number, useSSL: boolean) {
  try {
    const client = new Minio.Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey: 'minioadmin',
      secretKey: '2wsx@WSX',
    });
    const buckets = await client.listBuckets();
    console.log(`✅ SUCCESS connecting to ${endpoint}:${port} (SSL: ${useSSL})! Buckets:`, buckets.map(b => b.name));
    return true;
  } catch (err: any) {
    console.log(`❌ Failed on ${endpoint}:${port} (SSL: ${useSSL}):`, err.message);
    return false;
  }
}

async function main() {
  console.log('--- Testing HTTP endpoints ---');
  await testHttp('http://202.137.130.37');
  await testHttp('https://202.137.130.37');
  await testHttp('http://202.137.130.37:9001');

  console.log('\n--- Testing MinIO configurations ---');
  await testMinioClient('202.137.130.37', 9001, false);
  await testMinioClient('202.137.130.37', 80, false);
  await testMinioClient('202.137.130.37', 443, true);
  await testMinioClient('parking-st.freelixs.com', 443, true);

  process.exit(0);
}

main();
