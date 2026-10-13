import { pool } from '../db.js';

async function migrate() {
  console.log('🔄 Starting migration to UUID primary keys...');
  
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  await pool.query('DROP TABLE IF EXISTS user');
  await pool.query('DROP TABLE IF EXISTS role');
  await pool.query('DROP TABLE IF EXISTS equipment');
  
  await pool.query(`CREATE TABLE role (
    role_id VARCHAR(36) NOT NULL PRIMARY KEY,
    rolename VARCHAR(50) NOT NULL UNIQUE,
    status TINYINT NOT NULL DEFAULT 1,
    createdate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updateat TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  
  await pool.query(`CREATE TABLE user (
    user_id VARCHAR(36) NOT NULL PRIMARY KEY,
    phonenumber VARCHAR(25) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    lastname VARCHAR(100) NULL DEFAULT NULL,
    user_profile VARCHAR(500) NULL DEFAULT NULL,
    status TINYINT NOT NULL DEFAULT 1,
    role_id VARCHAR(36) NOT NULL,
    createdate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updateat TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_phonenumber (phonenumber),
    INDEX idx_user_role_id (role_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  
  await pool.query(`CREATE TABLE equipment (
    equipment_id VARCHAR(36) NOT NULL PRIMARY KEY,
    equipment_code VARCHAR(50) NOT NULL UNIQUE,
    equipment_name VARCHAR(150) NOT NULL,
    category VARCHAR(50) DEFAULT 'GENERAL',
    serial_number VARCHAR(100) DEFAULT NULL,
    warehouse_id VARCHAR(36) DEFAULT NULL,
    status TINYINT NOT NULL DEFAULT 1,
    description TEXT,
    img VARCHAR(500) DEFAULT NULL,
    createdate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updateat TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_equipment_warehouse (warehouse_id),
    INDEX idx_equipment_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  
  await pool.query(`INSERT INTO role (role_id, rolename, status) VALUES
    ('d1b1a001-0000-4000-8000-000000000001', 'SUPER_ADMIN', 1),
    ('d1b1a002-0000-4000-8000-000000000002', 'WAREHOUSE_MANAGER', 1),
    ('d1b1a003-0000-4000-8000-000000000003', 'STAFF', 1)`);
    
  await pool.query(`INSERT INTO user (user_id, phonenumber, password, name, lastname, status, role_id) VALUES
    ('090dcb92-f56d-4b73-bd05-d2500cd2a216', '2055112233', '$2a$10$wE8q6U6U5B4k2bV7J9.wCe9oE2/a6p4mD9eJqC8vQ9cK5p7vY.X6K', 'Super', 'Admin', 1, 'd1b1a001-0000-4000-8000-000000000001')`);
    
  console.log('✅ Migration to UUID successfully completed!');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
