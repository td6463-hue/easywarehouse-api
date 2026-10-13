import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import { syncEquipmentCounters } from './equipment-unit-range.routes.js';

const router = Router();

// Helper to generate readable checkout number (e.g. CK-20261005-0042)
const generateCheckoutNo = async (): Promise<string> => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePrefix = `CK-${yyyy}${mm}${dd}`;

  const [rows]: any = await pool.query(
    'SELECT COUNT(*) as count FROM equipment_checkout WHERE checkout_no LIKE ?',
    [`${datePrefix}%`]
  );
  const nextNum = Number(rows[0]?.count || 0) + 1;
  return `${datePrefix}-${String(nextNum).padStart(4, '0')}`;
};

// GET: Summary KPI statistics for Check-Out & Check-In
router.get('/stats', async (_req, res) => {
  /*  #swagger.tags = ['EquipmentCheckout']
      #swagger.summary = 'Get summary statistics for equipment checkouts'
  */
  try {
    const [rows]: any = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN status = 'Returned' THEN 1 ELSE 0 END) AS returned_count,
        SUM(CASE WHEN status = 'Active' AND expected_return_date IS NOT NULL AND expected_return_date < CURDATE() THEN 1 ELSE 0 END) AS overdue_count,
        SUM(CASE WHEN status = 'Returned' AND DATE(actual_return_date) = CURDATE() THEN 1 ELSE 0 END) AS returned_today
      FROM equipment_checkout
    `);

    return res.json({
      success: true,
      data: {
        total: Number(rows[0]?.total || 0),
        active: Number(rows[0]?.active_count || 0),
        returned: Number(rows[0]?.returned_count || 0),
        overdue: Number(rows[0]?.overdue_count || 0),
        returned_today: Number(rows[0]?.returned_today || 0),
      },
    });
  } catch (error: any) {
    console.error('Database query error in GET /equipment-checkouts/stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch checkout statistics',
      error: error.message,
    });
  }
});

// GET: List all checkouts with filters
router.get('/', async (req, res) => {
  /*  #swagger.tags = ['EquipmentCheckout']
      #swagger.summary = 'List all equipment checkout transactions'
  */
  try {
    const { status, equipment_id, range_id, search } = req.query;

    let query = `
      SELECT
        c.*,
        e.equipment_code,
        e.equipment_name,
        e.pack_id,
        e.img AS equipment_img,
        r.SN,
        (c.status = 'Active' AND c.expected_return_date IS NOT NULL AND c.expected_return_date < CURDATE()) AS is_overdue
      FROM equipment_checkout c
      INNER JOIN equipment e ON c.equipment_id = e.equipment_id
      INNER JOIN equipment_unit_range r ON c.range_id = r.range_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (equipment_id) {
      query += ' AND c.equipment_id = ?';
      params.push(String(equipment_id).trim());
    }

    if (range_id) {
      query += ' AND c.range_id = ?';
      params.push(String(range_id).trim());
    }

    if (status && status !== 'ALL') {
      const s = String(status).trim().toLowerCase();
      if (s === 'overdue') {
        query += ' AND c.status = "Active" AND c.expected_return_date IS NOT NULL AND c.expected_return_date < CURDATE()';
      } else if (s === 'active') {
        query += ' AND c.status = "Active"';
      } else if (s === 'returned') {
        query += ' AND c.status = "Returned"';
      }
    }

    if (search) {
      const q = `%${String(search).trim()}%`;
      query += ` AND (
        c.checkout_no LIKE ? OR
        c.borrower_name LIKE ? OR
        c.borrower_phone LIKE ? OR
        c.borrower_department LIKE ? OR
        r.SN LIKE ? OR
        e.equipment_name LIKE ? OR
        e.equipment_code LIKE ?
      )`;
      params.push(q, q, q, q, q, q, q);
    }

    query += ' ORDER BY c.createdate DESC';

    const [rows]: any = await pool.query(query, params);

    return res.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (error: any) {
    console.error('Database query error in GET /equipment-checkouts:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch equipment checkouts',
      error: error.message,
    });
  }
});

// GET: Single checkout by ID
router.get('/:id', async (req, res) => {
  /*  #swagger.tags = ['EquipmentCheckout']
      #swagger.summary = 'Get single checkout transaction'
  */
  try {
    const id = req.params.id;
    const [rows]: any = await pool.query(
      `SELECT
        c.*,
        e.equipment_code,
        e.equipment_name,
        e.pack_id,
        e.img AS equipment_img,
        r.SN,
        (c.status = 'Active' AND c.expected_return_date IS NOT NULL AND c.expected_return_date < CURDATE()) AS is_overdue
       FROM equipment_checkout c
       INNER JOIN equipment e ON c.equipment_id = e.equipment_id
       INNER JOIN equipment_unit_range r ON c.range_id = r.range_id
       WHERE c.checkout_id = ? OR c.checkout_no = ?`,
      [id, id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Checkout record not found' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    console.error('Database query error in GET /equipment-checkouts/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch checkout details',
      error: error.message,
    });
  }
});

// POST: Create a Check-Out transaction
router.post('/', async (req, res) => {
  /*  #swagger.tags = ['EquipmentCheckout']
      #swagger.summary = 'Create a Check-Out (issue equipment to borrower)'
  */
  try {
    const {
      range_id,
      borrower_name,
      borrower_phone,
      borrower_department,
      user_id,
      expected_return_date,
      purpose,
      checkout_note,
      created_by,
    } = req.body;

    if (!range_id) {
      return res.status(400).json({ success: false, message: 'range_id is required' });
    }

    if (!borrower_name || !String(borrower_name).trim()) {
      return res.status(400).json({ success: false, message: 'borrower_name is required' });
    }

    // Verify unit exists & fetch its equipment_id
    const [unitRows]: any = await pool.query(
      'SELECT range_id, equipment_id, SN, status FROM equipment_unit_range WHERE range_id = ?',
      [range_id]
    );

    if (!unitRows || unitRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Unit not found' });
    }

    const unit = unitRows[0];
    const equipment_id = unit.equipment_id;

    // Check if unit is already in an active checkout
    const [activeCheck]: any = await pool.query(
      'SELECT checkout_id, checkout_no, borrower_name FROM equipment_checkout WHERE range_id = ? AND status = "Active"',
      [range_id]
    );

    if (activeCheck && activeCheck.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Unit (${unit.SN}) is currently checked out by ${activeCheck[0].borrower_name} (${activeCheck[0].checkout_no})`,
      });
    }

    const checkout_id = uuidv4();
    const checkout_no = await generateCheckoutNo();

    await pool.query(
      `INSERT INTO equipment_checkout (
        checkout_id, checkout_no, range_id, equipment_id,
        borrower_name, borrower_phone, borrower_department, user_id,
        expected_return_date, purpose, checkout_note, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)`,
      [
        checkout_id,
        checkout_no,
        range_id,
        equipment_id,
        String(borrower_name).trim(),
        borrower_phone ? String(borrower_phone).trim() : null,
        borrower_department ? String(borrower_department).trim() : null,
        user_id || null,
        expected_return_date || null,
        purpose ? String(purpose).trim() : null,
        checkout_note ? String(checkout_note).trim() : null,
        created_by || null,
      ]
    );

    // Update unit status to 'In Use'
    await pool.query(
      'UPDATE equipment_unit_range SET status = "In Use", updateat = CURRENT_TIMESTAMP WHERE range_id = ?',
      [range_id]
    );

    // Re-sync equipment counters
    await syncEquipmentCounters(equipment_id);

    // Fetch created record
    const [created]: any = await pool.query(
      `SELECT
        c.*,
        e.equipment_code,
        e.equipment_name,
        r.SN
       FROM equipment_checkout c
       INNER JOIN equipment e ON c.equipment_id = e.equipment_id
       INNER JOIN equipment_unit_range r ON c.range_id = r.range_id
       WHERE c.checkout_id = ?`,
      [checkout_id]
    );

    return res.status(201).json({
      success: true,
      message: `Checked out unit ${unit.SN} to ${borrower_name} (${checkout_no})`,
      data: created[0],
    });
  } catch (error: any) {
    console.error('Database query error in POST /equipment-checkouts:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create checkout',
      error: error.message,
    });
  }
});

// POST /:id/return: Check-In / Return the equipment
router.post('/:id/return', async (req, res) => {
  /*  #swagger.tags = ['EquipmentCheckout']
      #swagger.summary = 'Check-In / Return an issued equipment unit'
  */
  try {
    const id = req.params.id;
    const { return_condition = 'Normal', return_note } = req.body;

    const [existing]: any = await pool.query(
      'SELECT * FROM equipment_checkout WHERE checkout_id = ? OR checkout_no = ?',
      [id, id]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Checkout record not found' });
    }

    const checkout = existing[0];
    if (checkout.status === 'Returned') {
      return res.status(400).json({ success: false, message: 'This transaction is already marked as returned' });
    }

    const finalCondition = String(return_condition).trim();

    // Update checkout record
    await pool.query(
      `UPDATE equipment_checkout SET
        status = 'Returned',
        actual_return_date = CURRENT_TIMESTAMP,
        return_condition = ?,
        return_note = ?,
        updateat = CURRENT_TIMESTAMP
       WHERE checkout_id = ?`,
      [
        finalCondition,
        return_note ? String(return_note).trim() : null,
        checkout.checkout_id,
      ]
    );

    // Update unit status based on condition
    let newUnitStatus = 'Available';
    const lowerCond = finalCondition.toLowerCase();
    if (lowerCond === 'damaged' || lowerCond === 'maintenance' || lowerCond === 'broken') {
      newUnitStatus = 'Maintenance';
    } else if (lowerCond === 'lost' || lowerCond === 'out of service' || lowerCond === 'out_of_service') {
      newUnitStatus = 'Out of Service';
    }

    await pool.query(
      'UPDATE equipment_unit_range SET status = ?, updateat = CURRENT_TIMESTAMP WHERE range_id = ?',
      [newUnitStatus, checkout.range_id]
    );

    // Re-sync equipment counters
    await syncEquipmentCounters(checkout.equipment_id);

    const [updated]: any = await pool.query(
      `SELECT
        c.*,
        e.equipment_code,
        e.equipment_name,
        r.SN
       FROM equipment_checkout c
       INNER JOIN equipment e ON c.equipment_id = e.equipment_id
       INNER JOIN equipment_unit_range r ON c.range_id = r.range_id
       WHERE c.checkout_id = ?`,
      [checkout.checkout_id]
    );

    return res.json({
      success: true,
      message: `Unit returned successfully (Condition: ${finalCondition})`,
      data: updated[0],
    });
  } catch (error: any) {
    console.error('Database query error in POST /equipment-checkouts/:id/return:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process return',
      error: error.message,
    });
  }
});

// DELETE: Cancel or remove checkout record
router.delete('/:id', async (req, res) => {
  /*  #swagger.tags = ['EquipmentCheckout']
      #swagger.summary = 'Delete a checkout record'
  */
  try {
    const id = req.params.id;
    const [existing]: any = await pool.query(
      'SELECT * FROM equipment_checkout WHERE checkout_id = ?',
      [id]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Checkout record not found' });
    }

    const checkout = existing[0];

    // If it was Active, revert unit back to Available
    if (checkout.status === 'Active') {
      await pool.query(
        'UPDATE equipment_unit_range SET status = "Available", updateat = CURRENT_TIMESTAMP WHERE range_id = ?',
        [checkout.range_id]
      );
      await syncEquipmentCounters(checkout.equipment_id);
    }

    await pool.query('DELETE FROM equipment_checkout WHERE checkout_id = ?', [id]);

    return res.json({
      success: true,
      message: `Checkout record ${checkout.checkout_no} deleted successfully`,
    });
  } catch (error: any) {
    console.error('Database query error in DELETE /equipment-checkouts/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete checkout record',
      error: error.message,
    });
  }
});

export default router;
