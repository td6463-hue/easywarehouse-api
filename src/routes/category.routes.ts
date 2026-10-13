import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';

const router = Router();

// GET: List all categories
router.get('/', async (req, res) => {
  /*  #swagger.tags = ['Categories']
      #swagger.summary = 'List all categories'
      #swagger.parameters['status'] = {
        in: 'query',
        description: 'Filter by status (1=Active, 0=Inactive)',
        type: 'integer',
        required: false
      }
  */
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM category WHERE 1=1';
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
    console.error('Database query error in GET /categories:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch categories from database',
      error: error.message,
    });
  }
});

// GET: Get category by ID (includes linked sub-categories)
router.get('/:id', async (req, res) => {
  /*  #swagger.tags = ['Categories']
      #swagger.summary = 'Get category by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Category UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
  */
  try {
    const categoryId = req.params.id;
    const [rows]: any = await pool.query('SELECT * FROM category WHERE category_id = ?', [categoryId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    // Also fetch associated sub-categories
    const [subCategories]: any = await pool.query(
      'SELECT * FROM sub_category WHERE category_id = ? ORDER BY createdate ASC',
      [categoryId]
    );

    return res.json({
      success: true,
      data: {
        ...rows[0],
        sub_categories: subCategories,
      },
    });
  } catch (error: any) {
    console.error('Database query error in GET /categories/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch category details',
      error: error.message,
    });
  }
});

// POST: Create category (generates UUID format: 090dcb92-f56d-4b73-bd05-d2500cd2a216)
router.post('/', async (req, res) => {
  /*  #swagger.tags = ['Categories']
      #swagger.summary = 'Create a new category'
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Category creation payload',
        required: true,
        schema: {
          category_name: 'Solar & Electronics',
          category_code: 'CAT-ELEC',
          status: 1
        }
      }
  */
  try {
    const { category_name, category_code = null, status = 1 } = req.body;

    if (!category_name) {
      return res.status(400).json({
        success: false,
        message: 'category_name is a required field',
      });
    }

    const category_id = uuidv4();

    const insertSql = `
      INSERT INTO category 
        (category_id, category_name, category_code, status) 
      VALUES (?, ?, ?, ?)
    `;

    await pool.query(insertSql, [
      category_id,
      category_name.trim(),
      category_code ? String(category_code).trim() : null,
      Number(status),
    ]);

    const [createdRows]: any = await pool.query(
      'SELECT * FROM category WHERE category_id = ?',
      [category_id]
    );

    return res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: createdRows[0],
    });
  } catch (error: any) {
    console.error('Database query error in POST /categories:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create category in database',
      error: error.message,
    });
  }
});

// PUT: Update category
router.put('/:id', async (req, res) => {
  /*  #swagger.tags = ['Categories']
      #swagger.summary = 'Update an existing category'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Category UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Category update payload',
        required: true,
        schema: {
          category_name: 'Solar & Electronics Updated',
          category_code: 'CAT-ELEC-V2',
          status: 1
        }
      }
  */
  try {
    const categoryId = req.params.id;

    const [existingRows]: any = await pool.query(
      'SELECT * FROM category WHERE category_id = ?',
      [categoryId]
    );

    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const { category_name, category_code, status } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (category_name !== undefined) {
      updates.push('category_name = ?');
      params.push(category_name.trim());
    }
    if (category_code !== undefined) {
      updates.push('category_code = ?');
      params.push(category_code ? String(category_code).trim() : null);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(Number(status));
    }

    if (updates.length > 0) {
      params.push(categoryId);
      await pool.query(`UPDATE category SET ${updates.join(', ')} WHERE category_id = ?`, params);
    }

    const [updatedRows]: any = await pool.query(
      'SELECT * FROM category WHERE category_id = ?',
      [categoryId]
    );

    return res.json({
      success: true,
      message: 'Category updated successfully',
      data: updatedRows[0],
    });
  } catch (error: any) {
    console.error('Database query error in PUT /categories/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update category',
      error: error.message,
    });
  }
});

// DELETE: Delete category
router.delete('/:id', async (req, res) => {
  /*  #swagger.tags = ['Categories']
      #swagger.summary = 'Delete category by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Category UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
  */
  try {
    const categoryId = req.params.id;

    const [existing]: any = await pool.query(
      'SELECT * FROM category WHERE category_id = ?',
      [categoryId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    // Delete category
    await pool.query('DELETE FROM category WHERE category_id = ?', [categoryId]);

    return res.json({
      success: true,
      message: 'Category deleted successfully',
      data: existing[0],
    });
  } catch (error: any) {
    console.error('Database query error in DELETE /categories/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete category',
      error: error.message,
    });
  }
});

export default router;
