import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';

const router = Router();

// GET: List all sub-categories (optional filter by category_id or status)
router.get('/', async (req, res) => {
  /*  #swagger.tags = ['SubCategories']
      #swagger.summary = 'List all sub-categories'
      #swagger.parameters['category_id'] = {
        in: 'query',
        description: 'Filter by Category UUID',
        type: 'string',
        required: false
      }
      #swagger.parameters['status'] = {
        in: 'query',
        description: 'Filter by status (1=Active, 0=Inactive)',
        type: 'integer',
        required: false
      }
  */
  try {
    const { category_id, status } = req.query;
    let query = `
      SELECT 
        s.*, 
        c.category_name,
        c.category_code
      FROM sub_category s
      LEFT JOIN category c ON s.category_id = c.category_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (category_id) {
      query += ' AND s.category_id = ?';
      params.push(String(category_id));
    }

    if (status !== undefined) {
      query += ' AND s.status = ?';
      params.push(Number(status));
    }

    query += ' ORDER BY s.createdate DESC';

    const [rows]: any = await pool.query(query, params);

    return res.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (error: any) {
    console.error('Database query error in GET /sub-categories:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch sub-categories from database',
      error: error.message,
    });
  }
});

// GET: Get sub-category by ID
router.get('/:id', async (req, res) => {
  /*  #swagger.tags = ['SubCategories']
      #swagger.summary = 'Get sub-category by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Sub-Category UUID',
        required: true,
        type: 'string'
      }
  */
  try {
    const subCategoryId = req.params.id;
    const query = `
      SELECT 
        s.*, 
        c.category_name,
        c.category_code
      FROM sub_category s
      LEFT JOIN category c ON s.category_id = c.category_id
      WHERE s.sub_category_id = ?
    `;
    const [rows]: any = await pool.query(query, [subCategoryId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Sub-category not found' });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (error: any) {
    console.error('Database query error in GET /sub-categories/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch sub-category details',
      error: error.message,
    });
  }
});

// POST: Create sub-category
router.post('/', async (req, res) => {
  /*  #swagger.tags = ['SubCategories']
      #swagger.summary = 'Create a new sub-category'
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Sub-category payload',
        required: true,
        schema: {
          category_id: 'b3be749c-e197-4e3e-94c4-5ec73938297c',
          sub_category_name: 'Solar Inverters & Batteries',
          sub_category_code: 'SUB-INV-01',
          status: 1
        }
      }
  */
  try {
    const { category_id, sub_category_name, sub_category_code = null, status = 1 } = req.body;

    if (!category_id || !sub_category_name) {
      return res.status(400).json({
        success: false,
        message: 'category_id and sub_category_name are required fields',
      });
    }

    // Verify parent category exists
    const [catRows]: any = await pool.query('SELECT category_id FROM category WHERE category_id = ?', [category_id]);
    if (!catRows || catRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Parent category does not exist',
      });
    }

    const sub_category_id = uuidv4();

    const insertSql = `
      INSERT INTO sub_category 
        (sub_category_id, category_id, sub_category_name, sub_category_code, status) 
      VALUES (?, ?, ?, ?, ?)
    `;

    await pool.query(insertSql, [
      sub_category_id,
      category_id,
      sub_category_name.trim(),
      sub_category_code ? String(sub_category_code).trim() : null,
      Number(status),
    ]);

    const [createdRows]: any = await pool.query(
      'SELECT s.*, c.category_name FROM sub_category s LEFT JOIN category c ON s.category_id = c.category_id WHERE s.sub_category_id = ?',
      [sub_category_id]
    );

    return res.status(201).json({
      success: true,
      message: 'Sub-category created successfully',
      data: createdRows[0],
    });
  } catch (error: any) {
    console.error('Database query error in POST /sub-categories:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create sub-category',
      error: error.message,
    });
  }
});

// PUT: Update sub-category
router.put('/:id', async (req, res) => {
  /*  #swagger.tags = ['SubCategories']
      #swagger.summary = 'Update an existing sub-category'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Sub-Category UUID',
        required: true,
        type: 'string'
      }
  */
  try {
    const subCategoryId = req.params.id;

    const [existingRows]: any = await pool.query(
      'SELECT * FROM sub_category WHERE sub_category_id = ?',
      [subCategoryId]
    );

    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Sub-category not found' });
    }

    const { category_id, sub_category_name, sub_category_code, status } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (category_id !== undefined) {
      updates.push('category_id = ?');
      params.push(category_id);
    }
    if (sub_category_name !== undefined) {
      updates.push('sub_category_name = ?');
      params.push(sub_category_name.trim());
    }
    if (sub_category_code !== undefined) {
      updates.push('sub_category_code = ?');
      params.push(sub_category_code ? String(sub_category_code).trim() : null);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(Number(status));
    }

    if (updates.length > 0) {
      params.push(subCategoryId);
      await pool.query(`UPDATE sub_category SET ${updates.join(', ')} WHERE sub_category_id = ?`, params);
    }

    const [updatedRows]: any = await pool.query(
      'SELECT s.*, c.category_name FROM sub_category s LEFT JOIN category c ON s.category_id = c.category_id WHERE s.sub_category_id = ?',
      [subCategoryId]
    );

    return res.json({
      success: true,
      message: 'Sub-category updated successfully',
      data: updatedRows[0],
    });
  } catch (error: any) {
    console.error('Database query error in PUT /sub-categories/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update sub-category',
      error: error.message,
    });
  }
});

// DELETE: Delete sub-category
router.delete('/:id', async (req, res) => {
  /*  #swagger.tags = ['SubCategories']
      #swagger.summary = 'Delete sub-category by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Sub-Category UUID',
        required: true,
        type: 'string'
      }
  */
  try {
    const subCategoryId = req.params.id;

    const [existing]: any = await pool.query(
      'SELECT * FROM sub_category WHERE sub_category_id = ?',
      [subCategoryId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Sub-category not found' });
    }

    await pool.query('DELETE FROM sub_category WHERE sub_category_id = ?', [subCategoryId]);

    return res.json({
      success: true,
      message: 'Sub-category deleted successfully',
      data: existing[0],
    });
  } catch (error: any) {
    console.error('Database query error in DELETE /sub-categories/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete sub-category',
      error: error.message,
    });
  }
});

export default router;
