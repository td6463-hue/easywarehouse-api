import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';

const router = Router();

// Helper to re-sync equipment counts (broken_unit and in_use)
export const syncEquipmentUnitCounts = async (equipmentId: string) => {
  try {
    const [counts]: any = await pool.query(
      `SELECT 
        SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) AS broken_count,
        SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) AS in_use_count,
        COUNT(*) AS total_count
       FROM equipment_unit_detail 
       WHERE equipment_id = ?`,
      [equipmentId]
    );

    const brokenUnit = Number(counts[0]?.broken_count || 0);
    const inUse = Number(counts[0]?.in_use_count || 0);

    await pool.query(
      'UPDATE equipment SET broken_unit = ?, in_use = ? WHERE equipment_id = ?',
      [brokenUnit, inUse, equipmentId]
    );

    return { brokenUnit, inUse, totalCount: Number(counts[0]?.total_count || 0) };
  } catch (err) {
    console.error(`Failed to sync equipment counts for ${equipmentId}:`, err);
    return null;
  }
};

// Helper to format SN with zero-padding if original start_sn had leading zero
const formatSerialNumber = (prefix: string, num: number, padLength: number = 0): string => {
  const numStr = padLength > 0 ? String(num).padStart(padLength, '0') : String(num);
  return `${prefix || ''}${numStr}`;
};

// GET: List all unit details (with filter by equipment_id, range_id, status, or search query)
router.get('/', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitDetail']
      #swagger.summary = 'List all individual equipment units'
      #swagger.parameters['equipment_id'] = {
        in: 'query',
        description: 'Filter by equipment UUID',
        type: 'string',
        required: false
      }
      #swagger.parameters['range_id'] = {
        in: 'query',
        description: 'Filter by range UUID',
        type: 'string',
        required: false
      }
      #swagger.parameters['status'] = {
        in: 'query',
        description: 'Filter by status (1=Available, 2=In Use, 3=Broken, 4=Maintenance, 0=Lost)',
        type: 'integer',
        required: false
      }
      #swagger.parameters['search'] = {
        in: 'query',
        description: 'Search by serial number or note',
        type: 'string',
        required: false
      }
  */
  try {
    const { equipment_id, range_id, status, search } = req.query;
    let query = `
      SELECT 
        u.*,
        e.equipment_code,
        e.equipment_name,
        e.pack_id,
        r.start_sn AS range_start_sn,
        r.end_sn AS range_end_sn
      FROM equipment_unit_detail u
      LEFT JOIN equipment e ON u.equipment_id = e.equipment_id
      LEFT JOIN equipment_unit_range r ON u.range_id = r.range_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (equipment_id) {
      query += ' AND u.equipment_id = ?';
      params.push(String(equipment_id).trim());
    }

    if (range_id) {
      query += ' AND u.range_id = ?';
      params.push(String(range_id).trim());
    }

    if (status !== undefined && status !== '') {
      query += ' AND u.status = ?';
      params.push(Number(status));
    }

    if (search) {
      query += ' AND (u.serial_number LIKE ? OR u.condition_note LIKE ?)';
      const term = `%${String(search).trim()}%`;
      params.push(term, term);
    }

    query += ' ORDER BY u.unit_no ASC, u.serial_number ASC';

    const [rows]: any = await pool.query(query, params);

    return res.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (error: any) {
    console.error('Database query error in GET /equipment-unit-details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch unit details',
      error: error.message,
    });
  }
});

// GET: Get single unit detail by ID
router.get('/:id', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitDetail']
      #swagger.summary = 'Get single unit detail by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Unit detail UUID',
        required: true,
        type: 'string'
      }
  */
  try {
    const unitDetailId = req.params.id;
    const query = `
      SELECT 
        u.*,
        e.equipment_code,
        e.equipment_name,
        e.pack_id,
        r.start_sn AS range_start_sn,
        r.end_sn AS range_end_sn
      FROM equipment_unit_detail u
      LEFT JOIN equipment e ON u.equipment_id = e.equipment_id
      LEFT JOIN equipment_unit_range r ON u.range_id = r.range_id
      WHERE u.unit_detail_id = ?
    `;
    const [rows]: any = await pool.query(query, [unitDetailId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Unit detail not found' });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (error: any) {
    console.error('Database query error in GET /equipment-unit-details/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch unit detail',
      error: error.message,
    });
  }
});

// POST: Split a range into individual 1-by-1 unit records
router.post('/split-range/:range_id', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitDetail']
      #swagger.summary = 'Split a range into individual 1-by-1 unit records'
      #swagger.parameters['range_id'] = {
        in: 'path',
        description: 'Range UUID to explode into individual unit records',
        required: true,
        type: 'string'
      }
  */
  try {
    const { range_id } = req.params;

    const [rangeRows]: any = await pool.query(
      'SELECT * FROM equipment_unit_range WHERE range_id = ?',
      [range_id]
    );

    if (!rangeRows || rangeRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Equipment unit range not found' });
    }

    const range = rangeRows[0];
    const prefix = range.prefix || '';
    const startNum = Number(range.start_num);
    const endNum = Number(range.end_num);
    const equipmentId = range.equipment_id;

    // Detect padding length from start_sn if present (e.g. Chair01 => pad to 2 digits)
    let padLength = 0;
    if (range.start_sn) {
      const rawNumberPart = range.start_sn.replace(prefix, '');
      if (/^\d+$/.test(rawNumberPart) && rawNumberPart.startsWith('0')) {
        padLength = rawNumberPart.length;
      }
    }

    const minNum = Math.min(startNum, endNum);
    const maxNum = Math.max(startNum, endNum);
    const createdUnits: any[] = [];

    for (let i = minNum; i <= maxNum; i++) {
      const serialNumber = formatSerialNumber(prefix, i, padLength);
      const unitDetailId = uuidv4();

      // INSERT with ON DUPLICATE KEY UPDATE so we don't overwrite if existing unit has notes or status!
      await pool.query(
        `INSERT INTO equipment_unit_detail 
          (unit_detail_id, equipment_id, range_id, serial_number, unit_no, status)
         VALUES (?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE range_id = VALUES(range_id)`,
        [unitDetailId, equipmentId, range_id, serialNumber, i]
      );

      createdUnits.push({
        serial_number: serialNumber,
        unit_no: i,
      });
    }

    // Synchronize parent equipment broken/in-use counts
    await syncEquipmentUnitCounts(equipmentId);

    return res.status(201).json({
      success: true,
      message: `Successfully split range into ${createdUnits.length} individual unit record(s)`,
      total_units: createdUnits.length,
      sample_first: createdUnits[0],
      sample_last: createdUnits[createdUnits.length - 1],
    });
  } catch (error: any) {
    console.error('Database query error in POST /split-range/:range_id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to split range into unit details',
      error: error.message,
    });
  }
});

// POST: Split all ranges for an equipment into individual unit records
router.post('/split-all/:equipment_id', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitDetail']
      #swagger.summary = 'Split all ranges of an equipment item into individual unit records'
      #swagger.parameters['equipment_id'] = {
        in: 'path',
        description: 'Equipment UUID',
        required: true,
        type: 'string'
      }
  */
  try {
    const { equipment_id } = req.params;

    const [ranges]: any = await pool.query(
      'SELECT * FROM equipment_unit_range WHERE equipment_id = ? ORDER BY start_num ASC',
      [equipment_id]
    );

    if (!ranges || ranges.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No unit ranges found for this equipment. Create unit ranges first.',
      });
    }

    let grandTotalUnits = 0;

    for (const range of ranges) {
      const prefix = range.prefix || '';
      const startNum = Number(range.start_num);
      const endNum = Number(range.end_num);

      let padLength = 0;
      if (range.start_sn) {
        const rawNumberPart = range.start_sn.replace(prefix, '');
        if (/^\d+$/.test(rawNumberPart) && rawNumberPart.startsWith('0')) {
          padLength = rawNumberPart.length;
        }
      }

      const minNum = Math.min(startNum, endNum);
      const maxNum = Math.max(startNum, endNum);

      for (let i = minNum; i <= maxNum; i++) {
        const serialNumber = formatSerialNumber(prefix, i, padLength);
        const unitDetailId = uuidv4();

        await pool.query(
          `INSERT INTO equipment_unit_detail 
            (unit_detail_id, equipment_id, range_id, serial_number, unit_no, status)
           VALUES (?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE range_id = VALUES(range_id)`,
          [unitDetailId, equipment_id, range.range_id, serialNumber, i]
        );
        grandTotalUnits++;
      }
    }

    // Synchronize parent equipment broken/in-use counts
    await syncEquipmentUnitCounts(equipment_id);

    return res.status(201).json({
      success: true,
      message: `Successfully split ${ranges.length} range(s) into ${grandTotalUnits} unit record(s)`,
      total_ranges: ranges.length,
      total_units_processed: grandTotalUnits,
    });
  } catch (error: any) {
    console.error('Database query error in POST /split-all/:equipment_id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to split all ranges into units',
      error: error.message,
    });
  }
});

// PUT: Update an individual unit detail (note broken, in use, condition note)
router.put('/:id', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitDetail']
      #swagger.summary = 'Update unit status and condition note (e.g. mark chair05 broken)'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Unit detail UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Update payload (e.g. mark broken)',
        required: true,
        schema: {
          status: 3,
          condition_note: 'Chair05 is broken - backrest damaged'
        }
      }
  */
  try {
    const unitDetailId = req.params.id;

    const [existing]: any = await pool.query(
      'SELECT * FROM equipment_unit_detail WHERE unit_detail_id = ?',
      [unitDetailId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Unit detail not found' });
    }

    const { status, condition_note, serial_number } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(Number(status));
    }

    if (condition_note !== undefined) {
      updates.push('condition_note = ?');
      params.push(condition_note ? String(condition_note).trim() : null);
    }

    if (serial_number !== undefined) {
      updates.push('serial_number = ?');
      params.push(String(serial_number).trim());
    }

    if (updates.length > 0) {
      params.push(unitDetailId);
      await pool.query(
        `UPDATE equipment_unit_detail SET ${updates.join(', ')} WHERE unit_detail_id = ?`,
        params
      );
    }

    const equipmentId = existing[0].equipment_id;
    // Auto sync parent equipment broken_unit and in_use counters!
    const syncResult = await syncEquipmentUnitCounts(equipmentId);

    const [updated]: any = await pool.query(
      'SELECT * FROM equipment_unit_detail WHERE unit_detail_id = ?',
      [unitDetailId]
    );

    return res.json({
      success: true,
      message: 'Unit detail updated successfully',
      data: updated[0],
      equipment_sync: syncResult,
    });
  } catch (error: any) {
    console.error('Database query error in PUT /equipment-unit-details/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update unit detail',
      error: error.message,
    });
  }
});

// POST: Batch update status & note for multiple units (e.g. mark Chair05 and Chair55 broken at once)
router.post('/bulk-status', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitDetail']
      #swagger.summary = 'Batch update status & condition note for multiple units'
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Bulk update payload',
        required: true,
        schema: {
          unit_detail_ids: ['uuid-1', 'uuid-2'],
          status: 3,
          condition_note: 'Broken - needs repair'
        }
      }
  */
  try {
    const { unit_detail_ids, status, condition_note } = req.body;

    if (!Array.isArray(unit_detail_ids) || unit_detail_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'unit_detail_ids must be a non-empty array of UUIDs',
      });
    }

    if (status === undefined) {
      return res.status(400).json({ success: false, message: 'status is required' });
    }

    const note = condition_note !== undefined ? (condition_note ? String(condition_note).trim() : null) : undefined;

    // Get list of equipment_ids involved to sync later
    const placeholders = unit_detail_ids.map(() => '?').join(',');
    const [rows]: any = await pool.query(
      `SELECT DISTINCT equipment_id FROM equipment_unit_detail WHERE unit_detail_id IN (${placeholders})`,
      unit_detail_ids
    );

    if (note !== undefined) {
      await pool.query(
        `UPDATE equipment_unit_detail SET status = ?, condition_note = ? WHERE unit_detail_id IN (${placeholders})`,
        [Number(status), note, ...unit_detail_ids]
      );
    } else {
      await pool.query(
        `UPDATE equipment_unit_detail SET status = ? WHERE unit_detail_id IN (${placeholders})`,
        [Number(status), ...unit_detail_ids]
      );
    }

    // Re-sync all affected equipment parents
    for (const r of rows) {
      await syncEquipmentUnitCounts(r.equipment_id);
    }

    return res.json({
      success: true,
      message: `Successfully updated status for ${unit_detail_ids.length} unit(s)`,
      updated_count: unit_detail_ids.length,
    });
  } catch (error: any) {
    console.error('Database query error in POST /equipment-unit-details/bulk-status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to batch update unit details',
      error: error.message,
    });
  }
});

// DELETE: Delete single unit detail
router.delete('/:id', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitDetail']
      #swagger.summary = 'Delete a unit detail by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Unit detail UUID',
        required: true,
        type: 'string'
      }
  */
  try {
    const unitDetailId = req.params.id;
    const [existing]: any = await pool.query(
      'SELECT * FROM equipment_unit_detail WHERE unit_detail_id = ?',
      [unitDetailId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Unit detail not found' });
    }

    const equipmentId = existing[0].equipment_id;
    await pool.query('DELETE FROM equipment_unit_detail WHERE unit_detail_id = ?', [unitDetailId]);

    // Resync equipment count
    await syncEquipmentUnitCounts(equipmentId);

    return res.json({
      success: true,
      message: 'Unit detail deleted successfully',
      data: existing[0],
    });
  } catch (error: any) {
    console.error('Database query error in DELETE /equipment-unit-details/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete unit detail',
      error: error.message,
    });
  }
});

export default router;
