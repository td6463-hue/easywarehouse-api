import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';

const router = Router();

// GET: List all roles from database
router.get('/', async (_req, res) => {
  /*  #swagger.tags = ['Roles']
      #swagger.summary = 'List all roles from database'
  */
  try {
    const [rows]: any = await pool.query('SELECT * FROM role ORDER BY rolename ASC');
    return res.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (error: any) {
    console.error('Database query error in GET /roles:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch roles from database',
      error: error.message,
    });
  }
});

// GET: Get role by ID
router.get('/:id', async (req, res) => {
  /*  #swagger.tags = ['Roles']
      #swagger.summary = 'Get role by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Role UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
  */
  try {
    const roleId = req.params.id;
    const [rows]: any = await pool.query('SELECT * FROM role WHERE role_id = ?', [roleId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    console.error('Database query error in GET /roles/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch role details',
      error: error.message,
    });
  }
});

// POST: Create role (generates UUID format: 090dcb92-f56d-4b73-bd05-d2500cd2a216)
router.post('/', async (req, res) => {
  /*  #swagger.tags = ['Roles']
      #swagger.summary = 'Create a new role with UUID'
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Role creation payload',
        required: true,
        schema: {
          rolename: 'OPERATOR',
          status: 1
        }
      }
  */
  try {
    const { rolename, status = 1 } = req.body;

    if (!rolename) {
      return res.status(400).json({ success: false, message: 'rolename is required' });
    }

    const [existing]: any = await pool.query('SELECT role_id FROM role WHERE rolename = ?', [rolename.trim()]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ success: false, message: `Role with name "${rolename}" already exists` });
    }

    const role_id = uuidv4();

    await pool.query(
      'INSERT INTO role (role_id, rolename, status) VALUES (?, ?, ?)',
      [role_id, rolename.trim(), Number(status)]
    );

    const [createdRows]: any = await pool.query('SELECT * FROM role WHERE role_id = ?', [role_id]);

    return res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: createdRows[0],
    });
  } catch (error: any) {
    console.error('Database query error in POST /roles:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create role in database',
      error: error.message,
    });
  }
});

// PUT: Update role
router.put('/:id', async (req, res) => {
  /*  #swagger.tags = ['Roles']
      #swagger.summary = 'Update an existing role'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Role UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Role update payload',
        required: true,
        schema: {
          rolename: 'OPERATOR_UPDATED',
          status: 1
        }
      }
  */
  try {
    const roleId = req.params.id;
    const [existingRows]: any = await pool.query('SELECT * FROM role WHERE role_id = ?', [roleId]);

    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }

    const { rolename, status } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (rolename !== undefined) {
      updates.push('rolename = ?');
      params.push(rolename.trim());
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(Number(status));
    }

    if (updates.length > 0) {
      params.push(roleId);
      await pool.query(`UPDATE role SET ${updates.join(', ')} WHERE role_id = ?`, params);
    }

    const [updatedRows]: any = await pool.query('SELECT * FROM role WHERE role_id = ?', [roleId]);

    return res.json({
      success: true,
      message: 'Role updated successfully',
      data: updatedRows[0],
    });
  } catch (error: any) {
    console.error('Database query error in PUT /roles/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update role',
      error: error.message,
    });
  }
});

// DELETE: Delete role
router.delete('/:id', async (req, res) => {
  /*  #swagger.tags = ['Roles']
      #swagger.summary = 'Delete role by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Role UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
  */
  try {
    const roleId = req.params.id;
    const [existing]: any = await pool.query('SELECT * FROM role WHERE role_id = ?', [roleId]);

    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }

    await pool.query('DELETE FROM role WHERE role_id = ?', [roleId]);

    return res.json({
      success: true,
      message: 'Role deleted successfully',
      data: existing[0],
    });
  } catch (error: any) {
    console.error('Database query error in DELETE /roles/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete role',
      error: error.message,
    });
  }
});

export default router;
