import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';

const router = Router();

// GET: List all stores
router.get('/', async (req, res) => {
  /*  #swagger.tags = ['Stores']
      #swagger.summary = 'List all stores'
      #swagger.parameters['status'] = {
        in: 'query',
        description: 'Filter by status (1=Active, 0=Inactive)',
        type: 'integer',
        required: false
      }
  */
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM store WHERE 1=1';
    const params: any[] = [];

    if (status !== undefined) {
      query += ' AND status = ?';
      params.push(Number(status));
    }

    query += ' ORDER BY createdate DESC';

    const [rows]: any = await pool.query(query, params);

    return res.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (error: any) {
    console.error('Database query error in GET /stores:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch stores from database',
      error: error.message,
    });
  }
});

// GET: Get store by ID (includes its branches)
router.get('/:id', async (req, res) => {
  /*  #swagger.tags = ['Stores']
      #swagger.summary = 'Get store by ID with linked branches'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Store UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
  */
  try {
    const storeId = req.params.id;
    const [rows]: any = await pool.query('SELECT * FROM store WHERE store_id = ?', [storeId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    // Also fetch branches belonging to this store
    const [branches]: any = await pool.query(
      'SELECT * FROM branch WHERE store_id = ? ORDER BY createdate ASC',
      [storeId]
    );

    return res.json({
      success: true,
      data: {
        ...rows[0],
        branches,
      },
    });
  } catch (error: any) {
    console.error('Database query error in GET /stores/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch store details',
      error: error.message,
    });
  }
});

// POST: Create store (generates UUID: 090dcb92-f56d-4b73-bd05-d2500cd2a216)
router.post('/', async (req, res) => {
  /*  #swagger.tags = ['Stores']
      #swagger.summary = 'Create a new store'
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Store creation payload',
        required: true,
        schema: {
          store_code: 'STR-HQ-01',
          store_name: 'Easy Warehouse Retail Group',
          phone: '+856 20 5511 2233',
          email: 'contact@easy-warehouse.la',
          address: 'Lane Xang Avenue, Chanthabouly District, Vientiane',
          status: 1
        }
      }
  */
  try {
    const {
      store_code,
      store_name,
      phone = null,
      email = null,
      address = null,
      status = 1,
    } = req.body;

    if (!store_code || !store_name) {
      return res.status(400).json({
        success: false,
        message: 'store_code and store_name are required fields',
      });
    }

    const store_id = uuidv4();

    const insertSql = `
      INSERT INTO store 
        (store_id, store_code, store_name, phone, email, address, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await pool.query(insertSql, [
      store_id,
      store_code.trim(),
      store_name.trim(),
      phone ? String(phone).trim() : null,
      email ? String(email).trim() : null,
      address ? String(address).trim() : null,
      Number(status),
    ]);

    const [createdRows]: any = await pool.query(
      'SELECT * FROM store WHERE store_id = ?',
      [store_id]
    );

    return res.status(201).json({
      success: true,
      message: 'Store created successfully',
      data: createdRows[0],
    });
  } catch (error: any) {
    console.error('Database query error in POST /stores:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create store in database',
      error: error.message,
    });
  }
});

// PUT: Update store
router.put('/:id', async (req, res) => {
  /*  #swagger.tags = ['Stores']
      #swagger.summary = 'Update an existing store'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Store UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Store update payload',
        required: true,
        schema: {
          store_code: 'STR-HQ-01',
          store_name: 'Easy Warehouse Retail Group Updated',
          phone: '+856 20 5511 2233',
          email: 'info@easy-warehouse.la',
          address: 'Lane Xang Avenue, Chanthabouly District, Vientiane',
          status: 1
        }
      }
  */
  try {
    const storeId = req.params.id;

    const [existingRows]: any = await pool.query(
      'SELECT * FROM store WHERE store_id = ?',
      [storeId]
    );

    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    const { store_code, store_name, phone, email, address, status } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (store_code !== undefined) {
      updates.push('store_code = ?');
      params.push(store_code.trim());
    }
    if (store_name !== undefined) {
      updates.push('store_name = ?');
      params.push(store_name.trim());
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone ? String(phone).trim() : null);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email ? String(email).trim() : null);
    }
    if (address !== undefined) {
      updates.push('address = ?');
      params.push(address ? String(address).trim() : null);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(Number(status));
    }

    if (updates.length > 0) {
      params.push(storeId);
      await pool.query(`UPDATE store SET ${updates.join(', ')} WHERE store_id = ?`, params);
    }

    const [updatedRows]: any = await pool.query(
      'SELECT * FROM store WHERE store_id = ?',
      [storeId]
    );

    return res.json({
      success: true,
      message: 'Store updated successfully',
      data: updatedRows[0],
    });
  } catch (error: any) {
    console.error('Database query error in PUT /stores/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update store',
      error: error.message,
    });
  }
});

// DELETE: Delete store
router.delete('/:id', async (req, res) => {
  /*  #swagger.tags = ['Stores']
      #swagger.summary = 'Delete store by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Store UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
  */
  try {
    const storeId = req.params.id;

    const [existing]: any = await pool.query(
      'SELECT * FROM store WHERE store_id = ?',
      [storeId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    await pool.query('DELETE FROM store WHERE store_id = ?', [storeId]);

    return res.json({
      success: true,
      message: 'Store deleted successfully',
      data: existing[0],
    });
  } catch (error: any) {
    console.error('Database query error in DELETE /stores/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete store',
      error: error.message,
    });
  }
});

export default router;
