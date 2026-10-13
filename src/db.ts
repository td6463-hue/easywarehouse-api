import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '202.137.130.37',
  port: parseInt(process.env.DB_PORT || '12789', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'warehouse_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function testDbConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Connected to MySQL Database:', process.env.DB_NAME || 'warehouse_db');
    connection.release();
    return true;
  } catch (error: any) {
    console.warn('⚠️ Database connection warning:', error.message);
    return false;
  }
}
