import axios from 'axios';
import FormData from 'form-data';

async function testUpload() {
  // 1. Login to MinIO Console
  const loginRes = await axios.post(
    'https://parking-st.freelixs.com/api/v1/login',
    { accessKey: 'minioadmin', secretKey: '2wsx@WSX' },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const cookie = loginRes.headers['set-cookie']?.[0]?.split(';')[0];
  console.log('Got cookie session');

  // 2. Prepare multipart upload
  const form = new FormData();
  const testBuffer = Buffer.from('test-image-content-for-warehouse-equipment');
  const fileName = `test-upload-${Date.now()}.txt`;
  
  form.append('files', testBuffer, {
    filename: fileName,
    contentType: 'text/plain',
  });

  const uploadUrl = `https://parking-st.freelixs.com/api/v1/buckets/warehouse-equipment/objects/upload`;

  const uploadRes = await axios.post(uploadUrl, form, {
    headers: {
      ...form.getHeaders(),
      Cookie: cookie,
    },
  });

  console.log('✅ Upload status:', uploadRes.status);
  console.log('Upload response:', uploadRes.data);

  // 3. Check public URL accessibility
  const publicUrl = `https://parking-st.freelixs.com/warehouse-equipment/${fileName}`;
  console.log('Checking public URL:', publicUrl);
  try {
    const getRes = await axios.get(publicUrl);
    console.log('✅ Public URL status:', getRes.status, 'Data:', getRes.data);
  } catch(e: any) {
    console.log('Public URL status:', e.response?.status || e.message);
  }
}

testUpload().catch((err) => {
  console.error('❌ Upload failed:', err.response?.status, err.response?.data || err.message);
}).then(() => process.exit(0));
