import { Router, Request } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import { sanitizeImageFilename, getFileUrl } from '../services/minio.service.js';

const router = Router();

// Helper to format user, resolve MinIO user avatar URL
const formatUser = (u: any, req?: Request) => {
  const cleanFileName = sanitizeImageFilename(u.user_profile);
  const viewUrl = getFileUrl(cleanFileName, 'warehouse-user', req);
  return {
    ...u,
    file_name: cleanFileName,
    user_profile: viewUrl,
    img: viewUrl,
  };
};

// GET: List all users from database
router.get('/', async (req, res) => {
  /*  #swagger.tags = ['Users']
      #swagger.summary = 'List all users from database'
  */
  try {
    const { store_id, role_id, status } = req.query;
    let query = `
      SELECT 
        u.user_id, 
        u.phonenumber, 
        u.name, 
        u.lastname, 
        u.user_profile,
        u.user_profile AS img,
        u.status, 
        u.role_id, 
        r.rolename, 
        u.store_id,
        s.store_name,
        s.store_code,
        u.createdate, 
        u.updateat 
       FROM user u
       LEFT JOIN role r ON u.role_id = r.role_id
       LEFT JOIN store s ON u.store_id = s.store_id
       WHERE 1=1
    `;
    const params: any[] = [];

    if (store_id) {
      query += ' AND u.store_id = ?';
      params.push(String(store_id).trim());
    }
    if (role_id) {
      query += ' AND u.role_id = ?';
      params.push(String(role_id).trim());
    }
    if (status !== undefined) {
      query += ' AND u.status = ?';
      params.push(Number(status));
    }

    query += ' ORDER BY u.createdate DESC';

    const [rows]: any = await pool.query(query, params);

    return res.json({
      success: true,
      total: rows.length,
      data: rows.map((r: any) => formatUser(r, req)),
    });
  } catch (error: any) {
    console.error('Database query error in GET /users:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch users from database',
      error: error.message,
    });
  }
});

// GET: Get user by ID
router.get('/:id', async (req, res) => {
  /*  #swagger.tags = ['Users']
      #swagger.summary = 'Get user by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'User UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
  */
  try {
    const userId = req.params.id;
    const [rows]: any = await pool.query(
      `SELECT 
        u.user_id, 
        u.phonenumber, 
        u.name, 
        u.lastname, 
        u.user_profile,
        u.user_profile AS img,
        u.status, 
        u.role_id, 
        r.rolename, 
        u.store_id,
        s.store_name,
        s.store_code,
        u.createdate, 
        u.updateat 
       FROM user u
       LEFT JOIN role r ON u.role_id = r.role_id
       LEFT JOIN store s ON u.store_id = s.store_id
       WHERE u.user_id = ?`,
      [userId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, data: formatUser(rows[0], req) });
  } catch (error: any) {
    console.error('Database query error in GET /users/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user details',
      error: error.message,
    });
  }
});

// POST: Create user (generates UUID format: 090dcb92-f56d-4b73-bd05-d2500cd2a216)
router.post('/', async (req, res) => {
  /*  #swagger.tags = ['Users']
      #swagger.summary = 'Create a new user with UUID'
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'User creation payload',
        required: true,
        schema: {
          phonenumber: '02055998877',
          password: 'password123',
          name: 'Keomany',
          lastname: 'Sengdala',
          user_profile: 'https://parking-st.freelixs.com/warehouse-user/avatar.png',
          status: 1,
          role_id: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
        }
      }
  */
  try {
    const { phonenumber, password, name, lastname = '', user_profile = null, img = null, status = 1, role_id, store_id = null, company_id = null } = req.body;

    if (!phonenumber || !password || !name || role_id === undefined) {
      return res.status(400).json({
        success: false,
        message: 'phonenumber, password, name, and role_id are required fields',
      });
    }

    const [existing]: any = await pool.query(
      'SELECT user_id FROM user WHERE phonenumber = ?',
      [phonenumber.trim()]
    );

    if (existing && existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `User with phone number ${phonenumber} already exists`,
      });
    }

    const user_id = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);
    const profileImg = sanitizeImageFilename(user_profile || img);
    const finalStoreId = store_id || company_id || null;

    const insertSql = `
      INSERT INTO user 
        (user_id, phonenumber, password, name, lastname, user_profile, status, role_id, store_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await pool.query(insertSql, [
      user_id,
      phonenumber.trim(),
      hashedPassword,
      name.trim(),
      lastname ? lastname.trim() : null,
      profileImg,
      Number(status),
      String(role_id).trim(),
      finalStoreId ? String(finalStoreId).trim() : null,
    ]);

    const [createdRows]: any = await pool.query(
      `SELECT 
        u.user_id, u.phonenumber, u.name, u.lastname, u.user_profile, u.user_profile AS img, u.status, u.role_id, r.rolename, u.store_id, s.store_name, s.store_code, u.createdate, u.updateat 
       FROM user u
       LEFT JOIN role r ON u.role_id = r.role_id
       LEFT JOIN store s ON u.store_id = s.store_id
       WHERE u.user_id = ?`,
      [user_id]
    );

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: formatUser(createdRows[0], req),
    });
  } catch (error: any) {
    console.error('Database query error in POST /users:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create user in database',
      error: error.message,
    });
  }
});

// PUT: Update user
router.put('/:id', async (req, res) => {
  /*  #swagger.tags = ['Users']
      #swagger.summary = 'Update an existing user'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'User UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'User update payload',
        required: true,
        schema: {
          phonenumber: '02055998877',
          password: 'newpassword123',
          name: 'Keomany',
          lastname: 'Updated',
          user_profile: 'https://parking-st.freelixs.com/warehouse-user/avatar-updated.png',
          status: 1,
          role_id: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
        }
      }
  */
  try {
    const userId = req.params.id;

    const [existingRows]: any = await pool.query('SELECT * FROM user WHERE user_id = ?', [userId]);
    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { phonenumber, password, name, lastname, user_profile, img, status, role_id, store_id, company_id } = req.body;

    if (phonenumber) {
      const [dupe]: any = await pool.query(
        'SELECT user_id FROM user WHERE phonenumber = ? AND user_id != ?',
        [phonenumber.trim(), userId]
      );
      if (dupe && dupe.length > 0) {
        return res.status(400).json({ success: false, message: 'Phone number is already in use by another user' });
      }
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (phonenumber !== undefined) {
      updates.push('phonenumber = ?');
      params.push(phonenumber.trim());
    }
    if (password) {
      updates.push('password = ?');
      params.push(await bcrypt.hash(password, 10));
    }
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (lastname !== undefined) {
      updates.push('lastname = ?');
      params.push(lastname ? lastname.trim() : null);
    }
    const profileImg = user_profile !== undefined ? user_profile : img;
    if (profileImg !== undefined) {
      updates.push('user_profile = ?');
      params.push(sanitizeImageFilename(profileImg));
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(Number(status));
    }
    if (role_id !== undefined) {
      updates.push('role_id = ?');
      params.push(String(role_id).trim());
    }
    const targetStore = store_id !== undefined ? store_id : company_id;
    if (targetStore !== undefined) {
      updates.push('store_id = ?');
      params.push(targetStore ? String(targetStore).trim() : null);
    }

    if (updates.length > 0) {
      params.push(userId);
      await pool.query(`UPDATE user SET ${updates.join(', ')} WHERE user_id = ?`, params);
    }

    const [updatedRows]: any = await pool.query(
      `SELECT 
        u.user_id, u.phonenumber, u.name, u.lastname, u.user_profile, u.user_profile AS img, u.status, u.role_id, r.rolename, u.store_id, s.store_name, s.store_code, u.createdate, u.updateat 
       FROM user u
       LEFT JOIN role r ON u.role_id = r.role_id
       LEFT JOIN store s ON u.store_id = s.store_id
       WHERE u.user_id = ?`,
      [userId]
    );

    return res.json({
      success: true,
      message: 'User updated successfully',
      data: formatUser(updatedRows[0], req),
    });
  } catch (error: any) {
    console.error('Database query error in PUT /users/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message,
    });
  }
});

// DELETE: Delete user
router.delete('/:id', async (req, res) => {
  /*  #swagger.tags = ['Users']
      #swagger.summary = 'Delete user by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'User UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
  */
  try {
    const userId = req.params.id;
    const [existing]: any = await pool.query(
      'SELECT user_id, phonenumber, name, lastname, user_profile, user_profile AS img FROM user WHERE user_id = ?',
      [userId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await pool.query('DELETE FROM user WHERE user_id = ?', [userId]);

    return res.json({
      success: true,
      message: 'User deleted successfully',
      data: formatUser(existing[0], req),
    });
  } catch (error: any) {
    console.error('Database query error in DELETE /users/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message,
    });
  }
});

export default router;
