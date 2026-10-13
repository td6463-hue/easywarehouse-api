import { Router, Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import { sanitizeImageFilename, getFileUrl } from '../services/minio.service.js';

const router = Router();

// Helper to format equipment, resolve MinIO image URL, and compute available units
const formatEquipment = (e: any, req?: Request) => {
  const cleanFileName = sanitizeImageFilename(e.img);
  const viewUrl = getFileUrl(cleanFileName, 'warehouse-equipment', req);

  // Dynamically count from unit serial numbers if units exist in equipment_unit_range
  const hasRangeUnits = Number(e.unit_range_total || 0) > 0;
  const inUse = hasRangeUnits ? Number(e.unit_range_in_use || 0) : Number(e.in_use || 0);
  const maintenanceUnit = hasRangeUnits ? Number(e.unit_range_maintenance || 0) : Number(e.maintenance_unit || 0);
  const brokenUnit = hasRangeUnits ? Number(e.unit_range_broken || 0) : Number(e.broken_unit || 0);
  const totalUnit = Number(e.unit || 0);
  const availableUnit = (e.available_unit !== undefined && e.available_unit !== null && !hasRangeUnits)
    ? Number(e.available_unit)
    : Math.max(0, totalUnit - inUse - maintenanceUnit - brokenUnit);

  return {
    ...e,
    in_use: inUse,
    maintenance_unit: maintenanceUnit,
    broken_unit: brokenUnit,
    out_of_service_unit: brokenUnit,
    unit_range_total: Number(e.unit_range_total || 0),
    unit_range_maintenance: Number(e.unit_range_maintenance || 0),
    pack_id: e.pack_id ?? null,
    group_serial_number: e.pack_id ?? null, // alias for backwards compatibility
    file_name: cleanFileName,
    img: viewUrl,
    img_url: viewUrl,
    available_unit: availableUnit,
  };
};

// GET: List all equipments with joined category, sub-category, and branch info
router.get('/', async (req, res) => {
  /*  #swagger.tags = ['Equipment']
      #swagger.summary = 'List all equipments'
      #swagger.parameters['branch_id'] = {
        in: 'query',
        description: 'Filter by branch UUID',
        type: 'string',
        required: false
      }
      #swagger.parameters['store_id'] = {
        in: 'query',
        description: 'Filter by store UUID',
        type: 'string',
        required: false
      }
      #swagger.parameters['category_id'] = {
        in: 'query',
        description: 'Filter by category UUID',
        type: 'string',
        required: false
      }
      #swagger.parameters['sub_category_id'] = {
        in: 'query',
        description: 'Filter by sub-category UUID',
        type: 'string',
        required: false
      }
      #swagger.parameters['pack_id'] = {
        in: 'query',
        description: 'Filter by master pack ID',
        type: 'string',
        required: false
      }
      #swagger.parameters['group_serial_number'] = {
        in: 'query',
        description: 'Alias for pack_id',
        type: 'string',
        required: false
      }
      #swagger.parameters['status'] = {
        in: 'query',
        description: 'Filter by status (1=Available, 2=In Use, 3=Maintenance, 0=Out of Service)',
        type: 'integer',
        required: false
      }
  */
  try {
    const { branch_id, store_id, category_id, sub_category_id, pack_id, group_serial_number, status } = req.query;
    let query = `
      SELECT 
        e.*,
        c.category_name,
        c.category_code,
        sc.sub_category_name,
        sc.sub_category_code,
        b.branch_name,
        b.branch_code,
        b.store_id AS branch_store_id,
        s.store_name,
        COALESCE(u.range_total, 0) AS unit_range_total,
        COALESCE(u.range_in_use, 0) AS unit_range_in_use,
        COALESCE(u.range_maintenance, 0) AS unit_range_maintenance,
        COALESCE(u.range_broken, 0) AS unit_range_broken
      FROM equipment e
      LEFT JOIN (
        SELECT 
          equipment_id,
          COUNT(*) AS range_total,
          SUM(CASE WHEN LOWER(status) IN ('in use', 'in_use', '2') THEN 1 ELSE 0 END) AS range_in_use,
          SUM(CASE WHEN LOWER(status) IN ('maintenance', '3') THEN 1 ELSE 0 END) AS range_maintenance,
          SUM(CASE WHEN LOWER(status) IN ('broken', 'out of service', 'out_of_service', '0') THEN 1 ELSE 0 END) AS range_broken
        FROM equipment_unit_range
        GROUP BY equipment_id
      ) u ON e.equipment_id = u.equipment_id
      LEFT JOIN category c ON e.category_id = c.category_id
      LEFT JOIN sub_category sc ON e.sub_category_id = sc.sub_category_id
      LEFT JOIN branch b ON e.branch_id = b.branch_id
      LEFT JOIN store s ON COALESCE(e.store_id, b.store_id) = s.store_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (branch_id) {
      query += ' AND e.branch_id = ?';
      params.push(String(branch_id).trim());
    }

    if (store_id) {
      query += ' AND (e.store_id = ? OR b.store_id = ?)';
      params.push(String(store_id).trim(), String(store_id).trim());
    }

    if (category_id) {
      query += ' AND e.category_id = ?';
      params.push(String(category_id).trim());
    }

    if (sub_category_id) {
      query += ' AND e.sub_category_id = ?';
      params.push(String(sub_category_id).trim());
    }

    const packFilter = pack_id || group_serial_number;
    if (packFilter) {
      query += ' AND e.pack_id = ?';
      params.push(String(packFilter).trim());
    }

    if (status !== undefined) {
      query += ' AND e.status = ?';
      params.push(Number(status));
    }

    query += ' ORDER BY e.createdate DESC';

    const [rows]: any = await pool.query(query, params);

    return res.json({
      success: true,
      total: rows.length,
      data: rows.map((r: any) => formatEquipment(r, req)),
    });
  } catch (error: any) {
    console.error('Database query error in GET /equipments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch equipments from database',
      error: error.message,
    });
  }
});

// GET: Get equipment by ID
router.get('/:id', async (req, res) => {
  /*  #swagger.tags = ['Equipment']
      #swagger.summary = 'Get equipment by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Equipment UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
  */
  try {
    const equipmentId = req.params.id;
    const query = `
      SELECT 
        e.*,
        c.category_name,
        c.category_code,
        sc.sub_category_name,
        sc.sub_category_code,
        b.branch_name,
        b.branch_code,
        b.store_id AS branch_store_id,
        s.store_name,
        COALESCE(u.range_total, 0) AS unit_range_total,
        COALESCE(u.range_in_use, 0) AS unit_range_in_use,
        COALESCE(u.range_maintenance, 0) AS unit_range_maintenance,
        COALESCE(u.range_broken, 0) AS unit_range_broken
      FROM equipment e
      LEFT JOIN (
        SELECT 
          equipment_id,
          COUNT(*) AS range_total,
          SUM(CASE WHEN LOWER(status) IN ('in use', 'in_use', '2') THEN 1 ELSE 0 END) AS range_in_use,
          SUM(CASE WHEN LOWER(status) IN ('maintenance', '3') THEN 1 ELSE 0 END) AS range_maintenance,
          SUM(CASE WHEN LOWER(status) IN ('broken', 'out of service', 'out_of_service', '0') THEN 1 ELSE 0 END) AS range_broken
        FROM equipment_unit_range
        GROUP BY equipment_id
      ) u ON e.equipment_id = u.equipment_id
      LEFT JOIN category c ON e.category_id = c.category_id
      LEFT JOIN sub_category sc ON e.sub_category_id = sc.sub_category_id
      LEFT JOIN branch b ON e.branch_id = b.branch_id
      LEFT JOIN store s ON COALESCE(e.store_id, b.store_id) = s.store_id
      WHERE e.equipment_id = ?
    `;
    const [rows]: any = await pool.query(query, [equipmentId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Equipment not found' });
    }

    // Also fetch associated unit serial numbers
    const [ranges]: any = await pool.query(
      'SELECT * FROM equipment_unit_range WHERE equipment_id = ? ORDER BY createdate ASC, SN ASC',
      [equipmentId]
    );

    return res.json({
      success: true,
      data: {
        ...formatEquipment(rows[0], req),
        unit_ranges: ranges || [],
      },
    });
  } catch (error: any) {
    console.error('Database query error in GET /equipments/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch equipment details',
      error: error.message,
    });
  }
});

// POST: Create equipment
router.post('/', async (req, res) => {
  /*  #swagger.tags = ['Equipment']
      #swagger.summary = 'Create a new equipment item'
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Equipment creation payload',
        required: true,
        schema: {
          equipment_code: 'EQ-SCN-001',
          equipment_name: 'Zebra TC21 Barcode Scanner',
          category_id: '090dcb92-f56d-4b73-bd05-d2500cd2a216',
          sub_category_id: '090dcb92-f56d-4b73-bd05-d2500cd2a217',
          pack_id: 'PACK-LOT-2026-08',
          branch_id: 'cd50f93b-5417-481f-8715-944fc8941fb3',
          unit: 10,
          in_use: 2,
          broken_unit: 0,
          cost: 4500000,
          status: 1,
          description: 'Master pack #8 handheld scanners',
          img: 'https://parking-st.freelixs.com/warehouse-equipment/scanner-001.jpg'
        }
      }
  */
  try {
    const {
      equipment_code,
      equipment_name,
      category_id = null,
      sub_category_id = null,
      pack_id = null,
      group_serial_number = null,
      branch_id = null,
      store_id = null,
      unit = 1,
      available_unit = null,
      in_use = 0,
      maintenance_unit = 0,
      broken_unit = 0,
      out_of_service_unit = null,
      cost = 0,
      status = 1,
      description = null,
      img = null,
    } = req.body;

    if (!equipment_code || !equipment_name) {
      return res.status(400).json({
        success: false,
        message: 'equipment_code and equipment_name are required fields',
      });
    }

    const [existing]: any = await pool.query(
      'SELECT equipment_id FROM equipment WHERE equipment_code = ?',
      [equipment_code.trim()]
    );

    if (existing && existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Equipment with code "${equipment_code}" already exists`,
      });
    }

    const equipment_id = uuidv4();

    const resolvedBroken = out_of_service_unit !== null && out_of_service_unit !== undefined
      ? Number(out_of_service_unit)
      : Number(broken_unit) || 0;
    const resolvedInUse = Number(in_use) || 0;
    const resolvedMaintenance = Number(maintenance_unit) || 0;
    const resolvedUnit = Number(unit) || 1;
    const resolvedAvailable = available_unit !== null && available_unit !== undefined
      ? Number(available_unit)
      : Math.max(0, resolvedUnit - resolvedInUse - resolvedMaintenance - resolvedBroken);

    const insertSql = `
      INSERT INTO equipment 
        (equipment_id, equipment_code, equipment_name, category_id, sub_category_id, pack_id, branch_id, store_id, unit, available_unit, in_use, maintenance_unit, broken_unit, cost, status, description, img) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const cleanImg = sanitizeImageFilename(img);
    const resolvedPackId = pack_id !== null && pack_id !== undefined ? pack_id : group_serial_number;

    await pool.query(insertSql, [
      equipment_id,
      equipment_code.trim(),
      equipment_name.trim(),
      category_id ? String(category_id).trim() : null,
      sub_category_id ? String(sub_category_id).trim() : null,
      resolvedPackId ? String(resolvedPackId).trim() : null,
      branch_id ? String(branch_id).trim() : null,
      store_id ? String(store_id).trim() : null,
      resolvedUnit,
      resolvedAvailable,
      resolvedInUse,
      resolvedMaintenance,
      resolvedBroken,
      Number(cost) || 0,
      Number(status),
      description ? String(description).trim() : null,
      cleanImg,
    ]);

    const [createdRows]: any = await pool.query(
      `SELECT 
        e.*,
        c.category_name,
        c.category_code,
        sc.sub_category_name,
        sc.sub_category_code,
        b.branch_name,
        b.branch_code,
        b.store_id AS branch_store_id,
        s.store_name
       FROM equipment e
       LEFT JOIN category c ON e.category_id = c.category_id
       LEFT JOIN sub_category sc ON e.sub_category_id = sc.sub_category_id
       LEFT JOIN branch b ON e.branch_id = b.branch_id
       LEFT JOIN store s ON COALESCE(e.store_id, b.store_id) = s.store_id
       WHERE e.equipment_id = ?`,
      [equipment_id]
    );

    return res.status(201).json({
      success: true,
      message: 'Equipment created successfully',
      data: formatEquipment(createdRows[0], req),
    });
  } catch (error: any) {
    console.error('Database query error in POST /equipments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create equipment in database',
      error: error.message,
    });
  }
});

// PUT: Update equipment
router.put('/:id', async (req, res) => {
  /*  #swagger.tags = ['Equipment']
      #swagger.summary = 'Update an existing equipment item'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Equipment UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Equipment update payload',
        required: true,
        schema: {
          equipment_code: 'EQ-SCN-001',
          equipment_name: 'Zebra TC21 Barcode Scanner Updated',
          category_id: '090dcb92-f56d-4b73-bd05-d2500cd2a216',
          sub_category_id: '090dcb92-f56d-4b73-bd05-d2500cd2a217',
          pack_id: 'PACK-LOT-2026-08',
          branch_id: 'cd50f93b-5417-481f-8715-944fc8941fb3',
          unit: 10,
          in_use: 3,
          broken_unit: 1,
          cost: 4500000,
          status: 2,
          description: 'Assigned 3 units to picking zone',
          img: 'https://parking-st.freelixs.com/warehouse-equipment/scanner-001.jpg'
        }
      }
  */
  try {
    const equipmentId = req.params.id;

    const [existingRows]: any = await pool.query(
      'SELECT * FROM equipment WHERE equipment_id = ?',
      [equipmentId]
    );

    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Equipment not found' });
    }

    const {
      equipment_code,
      equipment_name,
      category_id,
      sub_category_id,
      pack_id,
      group_serial_number,
      branch_id,
      store_id,
      unit,
      available_unit,
      in_use,
      maintenance_unit,
      broken_unit,
      out_of_service_unit,
      cost,
      status,
      description,
      img,
    } = req.body;

    if (equipment_code) {
      const [dupe]: any = await pool.query(
        'SELECT equipment_id FROM equipment WHERE equipment_code = ? AND equipment_id != ?',
        [equipment_code.trim(), equipmentId]
      );
      if (dupe && dupe.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Equipment code "${equipment_code}" is already in use by another item`,
        });
      }
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (equipment_code !== undefined) {
      updates.push('equipment_code = ?');
      params.push(equipment_code.trim());
    }
    if (equipment_name !== undefined) {
      updates.push('equipment_name = ?');
      params.push(equipment_name.trim());
    }
    if (category_id !== undefined) {
      updates.push('category_id = ?');
      params.push(category_id ? String(category_id).trim() : null);
    }
    if (sub_category_id !== undefined) {
      updates.push('sub_category_id = ?');
      params.push(sub_category_id ? String(sub_category_id).trim() : null);
    }
    const resolvedPackId = pack_id !== undefined ? pack_id : group_serial_number;
    if (resolvedPackId !== undefined) {
      updates.push('pack_id = ?');
      params.push(resolvedPackId ? String(resolvedPackId).trim() : null);
    }
    if (branch_id !== undefined) {
      updates.push('branch_id = ?');
      params.push(branch_id ? String(branch_id).trim() : null);
    }
    if (store_id !== undefined) {
      updates.push('store_id = ?');
      params.push(store_id ? String(store_id).trim() : null);
    }
    if (unit !== undefined) {
      updates.push('unit = ?');
      params.push(Number(unit));
    }
    if (available_unit !== undefined) {
      updates.push('available_unit = ?');
      params.push(Number(available_unit));
    }
    if (in_use !== undefined) {
      updates.push('in_use = ?');
      params.push(Number(in_use));
    }
    if (maintenance_unit !== undefined) {
      updates.push('maintenance_unit = ?');
      params.push(Number(maintenance_unit));
    }
    const resolvedPutBroken = out_of_service_unit !== undefined ? out_of_service_unit : broken_unit;
    if (resolvedPutBroken !== undefined) {
      updates.push('broken_unit = ?');
      params.push(Number(resolvedPutBroken));
    }
    if (cost !== undefined) {
      updates.push('cost = ?');
      params.push(Number(cost));
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(Number(status));
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description ? String(description).trim() : null);
    }
    if (img !== undefined) {
      updates.push('img = ?');
      params.push(sanitizeImageFilename(img));
    }

    if (updates.length > 0) {
      params.push(equipmentId);
      await pool.query(`UPDATE equipment SET ${updates.join(', ')} WHERE equipment_id = ?`, params);
    }

    const [updatedRows]: any = await pool.query(
      `SELECT 
        e.*,
        c.category_name,
        c.category_code,
        sc.sub_category_name,
        sc.sub_category_code,
        b.branch_name,
        b.branch_code,
        b.store_id AS branch_store_id,
        s.store_name
       FROM equipment e
       LEFT JOIN category c ON e.category_id = c.category_id
       LEFT JOIN sub_category sc ON e.sub_category_id = sc.sub_category_id
       LEFT JOIN branch b ON e.branch_id = b.branch_id
       LEFT JOIN store s ON COALESCE(e.store_id, b.store_id) = s.store_id
       WHERE e.equipment_id = ?`,
      [equipmentId]
    );

    return res.json({
      success: true,
      message: 'Equipment updated successfully',
      data: formatEquipment(updatedRows[0], req),
    });
  } catch (error: any) {
    console.error('Database query error in PUT /equipments/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update equipment',
      error: error.message,
    });
  }
});

// DELETE: Delete equipment
router.delete('/:id', async (req, res) => {
  /*  #swagger.tags = ['Equipment']
      #swagger.summary = 'Delete equipment by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Equipment UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
  */
  try {
    const equipmentId = req.params.id;
    const [existing]: any = await pool.query('SELECT * FROM equipment WHERE equipment_id = ?', [equipmentId]);

    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Equipment not found' });
    }

    await pool.query('DELETE FROM equipment WHERE equipment_id = ?', [equipmentId]);

    return res.json({
      success: true,
      message: 'Equipment deleted successfully',
      data: formatEquipment(existing[0], req),
    });
  } catch (error: any) {
    console.error('Database query error in DELETE /equipments/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete equipment',
      error: error.message,
    });
  }
});

export default router;
