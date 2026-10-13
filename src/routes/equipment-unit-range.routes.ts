import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';

const router = Router();

// Helper to normalize status values to: Available | In Use | Maintenance | Out of Service
export const normalizeStatus = (input: any): string => {
  if (input === undefined || input === null || input === '') {
    return 'Available';
  }
  const s = String(input).trim();
  const lower = s.toLowerCase();
  if (lower === '1' || lower === 'available') return 'Available';
  if (lower === '2' || lower === 'in use' || lower === 'in_use') return 'In Use';
  if (lower === '3' || lower === 'maintenance' || lower === 'broken') return 'Maintenance';
  if (lower === '0' || lower === 'out of service' || lower === 'out_of_service' || lower === 'out-of-service') return 'Out of Service';
  return s;
};

// Helper to sync parent equipment broken_unit and in_use counters
export const syncEquipmentCounters = async (equipmentId: string) => {
  try {
    const [counts]: any = await pool.query(
      `SELECT 
        SUM(CASE WHEN LOWER(status) IN ('maintenance', 'out of service', 'broken', '3', '0') THEN 1 ELSE 0 END) AS broken_count,
        SUM(CASE WHEN LOWER(status) IN ('in use', 'in_use', '2') THEN 1 ELSE 0 END) AS in_use_count
       FROM equipment_unit_range 
       WHERE equipment_id = ?`,
      [equipmentId]
    );

    const brokenUnit = Number(counts[0]?.broken_count || 0);
    const inUse = Number(counts[0]?.in_use_count || 0);

    await pool.query(
      'UPDATE equipment SET broken_unit = ?, in_use = ? WHERE equipment_id = ?',
      [brokenUnit, inUse, equipmentId]
    );

    return { brokenUnit, inUse };
  } catch (err) {
    console.error('Failed to sync equipment counters:', err);
    return null;
  }
};

// Helper to format serial number with padding if needed
const formatSn = (prefix: string, num: number, padLength: number = 0): string => {
  const numStr = padLength > 0 ? String(num).padStart(padLength, '0') : String(num);
  return `${prefix || ''}${numStr}`;
};

// GET: List all equipment unit serial numbers (optional filter by equipment_id, pack_id, status, search)
router.get('/', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitRange']
      #swagger.summary = 'List all unit serial numbers'
      #swagger.parameters['equipment_id'] = {
        in: 'query',
        description: 'Filter by equipment UUID',
        type: 'string',
        required: false
      }
      #swagger.parameters['pack_id'] = {
        in: 'query',
        description: 'Filter by pack ID',
        type: 'string',
        required: false
      }
      #swagger.parameters['status'] = {
        in: 'query',
        description: 'Filter by status (Available, In Use, Maintenance, Out of Service)',
        type: 'string',
        required: false
      }
      #swagger.parameters['search'] = {
        in: 'query',
        description: 'Search serial number (SN)',
        type: 'string',
        required: false
      }
  */
  try {
    const { equipment_id, pack_id, status, search } = req.query;
    let query = `
      SELECT 
        r.*,
        e.equipment_code,
        e.equipment_name,
        e.pack_id
      FROM equipment_unit_range r
      LEFT JOIN equipment e ON r.equipment_id = e.equipment_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (equipment_id) {
      query += ' AND r.equipment_id = ?';
      params.push(String(equipment_id).trim());
    }

    if (pack_id) {
      query += ' AND e.pack_id = ?';
      params.push(String(pack_id).trim());
    }

    if (status) {
      const normalized = normalizeStatus(status);
      query += ' AND r.status = ?';
      params.push(normalized);
    }

    if (search) {
      query += ' AND r.SN LIKE ?';
      params.push(`%${String(search).trim()}%`);
    }

    query += ' ORDER BY r.createdate ASC, r.SN ASC';

    const [rows]: any = await pool.query(query, params);

    return res.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (error: any) {
    console.error('Database query error in GET /equipment-unit-ranges:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch equipment unit serial numbers',
      error: error.message,
    });
  }
});

// GET: Get all serial numbers for a specific equipment
router.get('/equipment/:equipment_id', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitRange']
      #swagger.summary = 'Get all unit serial numbers for a specific equipment UUID'
      #swagger.parameters['equipment_id'] = {
        in: 'path',
        description: 'Equipment UUID',
        required: true,
        type: 'string'
      }
  */
  try {
    const { equipment_id } = req.params;
    const [rows]: any = await pool.query(
      `SELECT 
        r.*,
        e.equipment_code,
        e.equipment_name,
        e.pack_id
       FROM equipment_unit_range r
       LEFT JOIN equipment e ON r.equipment_id = e.equipment_id
       WHERE r.equipment_id = ?
       ORDER BY r.createdate ASC, r.SN ASC`,
      [equipment_id]
    );

    return res.json({
      success: true,
      equipment_id,
      total_units: rows.length,
      data: rows,
    });
  } catch (error: any) {
    console.error('Database query error in GET /equipment-unit-ranges/equipment/:equipment_id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch serial numbers for equipment',
      error: error.message,
    });
  }
});

// GET: Get single unit by range_id
router.get('/:id', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitRange']
      #swagger.summary = 'Get single unit record by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Range UUID',
        required: true,
        type: 'string'
      }
  */
  try {
    const rangeId = req.params.id;
    const [rows]: any = await pool.query(
      `SELECT 
        r.*,
        e.equipment_code,
        e.equipment_name,
        e.pack_id
       FROM equipment_unit_range r
       LEFT JOIN equipment e ON r.equipment_id = e.equipment_id
       WHERE r.range_id = ?`,
      [rangeId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Unit record not found' });
    }

    return res.json({
      success: true,
      data: rows[0],
    });
  } catch (error: any) {
    console.error('Database query error in GET /equipment-unit-ranges/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch unit record',
      error: error.message,
    });
  }
});

// POST: Create unit serial numbers (supports looping from start_num to end_num e.g. Chair01 to Chair10)
router.post('/', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitRange']
      #swagger.summary = 'Loop insert serial numbers (e.g. start 1 to 10 creates Chair01 to Chair10 with status)'
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Unit range payload',
        required: true,
        schema: {
          equipment_id: '090dcb92-f56d-4b73-bd05-d2500cd2a216',
          prefix: 'Chair',
          start_num: 1,
          end_num: 10,
          start_sn: '01',
          pack_id: 'PACK-01',
          status: 'Available'
        }
      }
  */
  try {
    const {
      equipment_id,
      prefix = '',
      start_num,
      end_num,
      start_sn,
      pack_id,
      status = 'Available',
      SN,
    } = req.body;

    if (!equipment_id) {
      return res.status(400).json({ success: false, message: 'equipment_id is required' });
    }

    // Verify equipment exists & fetch default pack_id if not provided
    const [eqRows]: any = await pool.query(
      'SELECT equipment_id, pack_id FROM equipment WHERE equipment_id = ?',
      [equipment_id]
    );

    if (!eqRows || eqRows.length === 0) {
      return res.status(404).json({ success: false, message: `Equipment with ID "${equipment_id}" does not exist` });
    }

    const finalPackId = pack_id !== undefined && pack_id !== null ? String(pack_id).trim() : (eqRows[0].pack_id || null);
    const cleanPrefix = prefix !== null && prefix !== undefined ? String(prefix).trim() : '';
    const finalStatus = normalizeStatus(status);

    // CASE 1: Loop from start_num to end_num (e.g. 1 to 10 => Chair01 to Chair10)
    if (start_num !== undefined && end_num !== undefined) {
      const numStart = Number(start_num);
      const numEnd = Number(end_num);

      if (isNaN(numStart) || isNaN(numEnd)) {
        return res.status(400).json({ success: false, message: 'start_num and end_num must be valid numbers' });
      }

      // Calculate zero padding length
      let padLength = 0;
      if (start_sn) {
        const numPart = String(start_sn).replace(cleanPrefix, '');
        if (/^\d+$/.test(numPart) && numPart.startsWith('0')) {
          padLength = numPart.length;
        }
      }

      // If user preview or end number requires 2+ digits padding (e.g. 01 -> 10)
      if (padLength === 0 && numEnd >= 10 && numStart < 10) {
        padLength = String(numEnd).length;
      }

      const minNum = Math.min(numStart, numEnd);
      const maxNum = Math.max(numStart, numEnd);
      const createdRows: any[] = [];

      for (let i = minNum; i <= maxNum; i++) {
        const generatedSn = formatSn(cleanPrefix, i, padLength);
        const range_id = uuidv4();

        await pool.query(
          `INSERT INTO equipment_unit_range 
            (range_id, equipment_id, SN, status)
           VALUES (?, ?, ?, ?)`,
          [range_id, String(equipment_id).trim(), generatedSn, finalStatus]
        );

        createdRows.push({
          range_id,
          equipment_id,
          prefix: cleanPrefix,
          pack_id: eqRows[0].pack_id || null,
          SN: generatedSn,
          status: finalStatus,
        });
      }

      // Re-sync parent equipment in_use and broken_unit counters
      await syncEquipmentCounters(equipment_id);

      return res.status(201).json({
        success: true,
        message: `Successfully inserted ${createdRows.length} unit records (${createdRows[0].SN} to ${createdRows[createdRows.length - 1].SN})`,
        total_units: createdRows.length,
        status: finalStatus,
        data: createdRows,
      });
    }

    // CASE 2: Single SN insertion
    if (SN) {
      const singleSn = String(SN).trim();
      const range_id = uuidv4();

      await pool.query(
        `INSERT INTO equipment_unit_range 
          (range_id, equipment_id, SN, status)
         VALUES (?, ?, ?, ?)`,
        [range_id, String(equipment_id).trim(), singleSn, finalStatus]
      );

      await syncEquipmentCounters(equipment_id);

      const [created]: any = await pool.query('SELECT * FROM equipment_unit_range WHERE range_id = ?', [range_id]);

      return res.status(201).json({
        success: true,
        message: `Successfully inserted unit ${singleSn}`,
        data: created[0],
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Either (start_num and end_num) or a single SN must be provided',
    });
  } catch (error: any) {
    console.error('Database query error in POST /equipment-unit-ranges:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create unit records',
      error: error.message,
    });
  }
});

// POST: Bulk insert multiple ranges (e.g. 1-10 and 21-110 in one request)
router.post('/bulk', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitRange']
      #swagger.summary = 'Bulk create multiple ranges of serial numbers'
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Bulk range payload',
        required: true,
        schema: {
          equipment_id: '090dcb92-f56d-4b73-bd05-d2500cd2a216',
          pack_id: 'PACK-01',
          status: 'Available',
          ranges: [
            { start_num: 1, end_num: 10, prefix: 'Chair', start_sn: '01' },
            { start_num: 21, end_num: 110, prefix: 'Chair', start_sn: '21' }
          ]
        }
      }
  */
  try {
    const { equipment_id, pack_id, status = 'Available', ranges } = req.body;

    if (!equipment_id) {
      return res.status(400).json({ success: false, message: 'equipment_id is required' });
    }

    if (!Array.isArray(ranges) || ranges.length === 0) {
      return res.status(400).json({ success: false, message: 'ranges must be a non-empty array' });
    }

    const [eqRows]: any = await pool.query(
      'SELECT equipment_id, pack_id FROM equipment WHERE equipment_id = ?',
      [equipment_id]
    );

    if (!eqRows || eqRows.length === 0) {
      return res.status(404).json({ success: false, message: `Equipment with ID "${equipment_id}" does not exist` });
    }

    const finalPackId = pack_id !== undefined && pack_id !== null ? String(pack_id).trim() : (eqRows[0].pack_id || null);
    const finalStatus = normalizeStatus(status);
    const createdRows: any[] = [];

    for (const r of ranges) {
      const cleanPrefix = r.prefix !== null && r.prefix !== undefined ? String(r.prefix).trim() : '';
      const rowStatus = r.status ? normalizeStatus(r.status) : finalStatus;
      const numStart = Number(r.start_num);
      const numEnd = Number(r.end_num);

      if (isNaN(numStart) || isNaN(numEnd)) continue;

      let padLength = 0;
      if (r.start_sn) {
        const numPart = String(r.start_sn).replace(cleanPrefix, '');
        if (/^\d+$/.test(numPart) && numPart.startsWith('0')) {
          padLength = numPart.length;
        }
      }

      if (padLength === 0 && numEnd >= 10 && numStart < 10) {
        padLength = String(numEnd).length;
      }

      const minNum = Math.min(numStart, numEnd);
      const maxNum = Math.max(numStart, numEnd);

      for (let i = minNum; i <= maxNum; i++) {
        const generatedSn = formatSn(cleanPrefix, i, padLength);
        const range_id = uuidv4();

        await pool.query(
          `INSERT INTO equipment_unit_range 
            (range_id, equipment_id, SN, status)
           VALUES (?, ?, ?, ?)`,
          [range_id, String(equipment_id).trim(), generatedSn, rowStatus]
        );

        createdRows.push({
          range_id,
          equipment_id,
          prefix: cleanPrefix,
          pack_id: eqRows[0].pack_id || null,
          SN: generatedSn,
          status: rowStatus,
        });
      }
    }

    await syncEquipmentCounters(equipment_id);

    return res.status(201).json({
      success: true,
      message: `Successfully bulk inserted ${createdRows.length} unit records`,
      total_units: createdRows.length,
      data: createdRows,
    });
  } catch (error: any) {
    console.error('Database query error in POST /equipment-unit-ranges/bulk:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to bulk insert unit records',
      error: error.message,
    });
  }
});

// POST: Batch update status for multiple unit serial numbers (e.g. mark Chair05 and Chair55 as Maintenance)
router.post('/bulk-status', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitRange']
      #swagger.summary = 'Batch update status for multiple unit records'
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Bulk status update payload',
        required: true,
        schema: {
          range_ids: ['uuid-1', 'uuid-2'],
          status: 'Maintenance'
        }
      }
  */
  try {
    const { range_ids, status } = req.body;

    if (!Array.isArray(range_ids) || range_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'range_ids must be a non-empty array' });
    }

    if (!status) {
      return res.status(400).json({ success: false, message: 'status is required' });
    }

    const finalStatus = normalizeStatus(status);
    const placeholders = range_ids.map(() => '?').join(',');

    // Fetch affected equipment IDs
    const [eqs]: any = await pool.query(
      `SELECT DISTINCT equipment_id FROM equipment_unit_range WHERE range_id IN (${placeholders})`,
      range_ids
    );

    await pool.query(
      `UPDATE equipment_unit_range SET status = ?, updateat = CURRENT_TIMESTAMP WHERE range_id IN (${placeholders})`,
      [finalStatus, ...range_ids]
    );

    // Re-sync equipment counters for all affected equipments
    for (const row of eqs) {
      await syncEquipmentCounters(row.equipment_id);
    }

    return res.json({
      success: true,
      message: `Updated status to "${finalStatus}" for ${range_ids.length} units`,
      updated_count: range_ids.length,
      status: finalStatus,
    });
  } catch (error: any) {
    console.error('Database query error in POST /equipment-unit-ranges/bulk-status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update unit statuses',
      error: error.message,
    });
  }
});

// PUT: Update an individual unit record (SN, status, prefix, pack_id)
router.put('/:id', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitRange']
      #swagger.summary = 'Update an individual unit record (SN or status: Available, In Use, Maintenance, Out of Service)'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Range UUID',
        required: true,
        type: 'string'
      }
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Update payload',
        required: true,
        schema: {
          status: 'Maintenance',
          SN: 'Chair05'
        }
      }
  */
  try {
    const rangeId = req.params.id;
    const [existing]: any = await pool.query('SELECT * FROM equipment_unit_range WHERE range_id = ?', [rangeId]);

    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Unit record not found' });
    }

    const { SN, status } = req.body;
    const updates: string[] = ['updateat = CURRENT_TIMESTAMP'];
    const params: any[] = [];

    if (SN !== undefined) {
      updates.push('SN = ?');
      params.push(String(SN).trim());
    }

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(normalizeStatus(status));
    }

    params.push(rangeId);
    await pool.query(`UPDATE equipment_unit_range SET ${updates.join(', ')} WHERE range_id = ?`, params);

    const equipmentId = existing[0].equipment_id;
    await syncEquipmentCounters(equipmentId);

    const [updated]: any = await pool.query('SELECT * FROM equipment_unit_range WHERE range_id = ?', [rangeId]);

    return res.json({
      success: true,
      message: 'Unit record updated successfully',
      data: updated[0],
    });
  } catch (error: any) {
    console.error('Database query error in PUT /equipment-unit-ranges/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update unit record',
      error: error.message,
    });
  }
});

// DELETE: Delete a single unit record
router.delete('/:id', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitRange']
      #swagger.summary = 'Delete a unit record by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Range UUID',
        required: true,
        type: 'string'
      }
  */
  try {
    const rangeId = req.params.id;
    const [existing]: any = await pool.query('SELECT * FROM equipment_unit_range WHERE range_id = ?', [rangeId]);

    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Unit record not found' });
    }

    const equipmentId = existing[0].equipment_id;
    await pool.query('DELETE FROM equipment_unit_range WHERE range_id = ?', [rangeId]);

    await syncEquipmentCounters(equipmentId);

    return res.json({
      success: true,
      message: 'Unit record deleted successfully',
      data: existing[0],
    });
  } catch (error: any) {
    console.error('Database query error in DELETE /equipment-unit-ranges/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete unit record',
      error: error.message,
    });
  }
});

// DELETE: Delete all serial numbers for a given equipment
router.delete('/equipment/:equipment_id', async (req, res) => {
  /*  #swagger.tags = ['EquipmentUnitRange']
      #swagger.summary = 'Delete all unit records for a specific equipment UUID'
      #swagger.parameters['equipment_id'] = {
        in: 'path',
        description: 'Equipment UUID',
        required: true,
        type: 'string'
      }
  */
  try {
    const { equipment_id } = req.params;
    const [result]: any = await pool.query('DELETE FROM equipment_unit_range WHERE equipment_id = ?', [equipment_id]);

    await syncEquipmentCounters(equipment_id);

    return res.json({
      success: true,
      message: `Deleted all unit records for equipment ${equipment_id}`,
      deleted_count: result.affectedRows,
    });
  } catch (error: any) {
    console.error('Database query error in DELETE /equipment-unit-ranges/equipment/:equipment_id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete unit records for equipment',
      error: error.message,
    });
  }
});

export default router;
