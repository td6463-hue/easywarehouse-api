import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'easy-warehouse-secret-key-2026',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'easy-warehouse-refresh-secret-key-2026',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  minio: {
    endPoint: process.env.MINIO_ENDPOINT || 'parking-st.freelixs.com',
    port: parseInt(process.env.MINIO_PORT || '443', 10),
    useSSL: process.env.MINIO_USE_SSL !== 'false',
    accessKey: process.env.MINIO_ACCESS_KEY || '',
    secretKey: process.env.MINIO_SECRET_KEY || '',
    publicUrl: process.env.MINIO_PUBLIC_URL || 'https://parking-st.freelixs.com',
    buckets: {
      equipment: process.env.MINIO_BUCKET_EQUIPMENT || 'warehouse-equipment',
      user: process.env.MINIO_BUCKET_USER || 'warehouse-user',
    },
  },
};