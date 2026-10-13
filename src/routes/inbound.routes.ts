import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (_req, res) => {
  /*  #swagger.tags = ['Inbound']
      #swagger.summary = 'List all goods receipts (GRN)'
  */
  return res.json({
    success: true,
    data: [
      {
        id: 'e3f4a5b6-c7d8-4901-b234-567890123ef0',
        receipt_number: 'GRN-2026-0089',
        po_number: 'PO-2026-104',
        supplier_name: 'Vientiane Solar Energy Co., Ltd',
        warehouse_name: 'Central Vientiane Distribution Hub',
        status: 'STORED',
        items_count: 5,
        total_qty: 120,
        received_date: '2026-10-02',
      },
    ],
  });
});

router.post('/', (req, res) => {
  /*  #swagger.tags = ['Inbound']
      #swagger.summary = 'Create Inbound Goods Receipt Note'
  */
  return res.status(201).json({
    success: true,
    message: 'GRN created successfully',
    data: { id: uuidv4(), ...req.body },
  });
});

export default router;