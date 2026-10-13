import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (_req, res) => {
  /*  #swagger.tags = ['Outbound']
      #swagger.summary = 'List customer dispatch orders'
  */
  return res.json({
    success: true,
    data: [
      {
        id: 'f4a5b6c7-d8e9-4012-c345-678901234fa1',
        order_number: 'DO-2026-0412',
        customer_name: 'Phonexay Department Store',
        warehouse_name: 'Central Vientiane Distribution Hub',
        status: 'SHIPPED',
        items_count: 8,
        total_qty: 95,
        dispatch_date: '2026-10-03',
      },
    ],
  });
});

router.post('/', (req, res) => {
  /*  #swagger.tags = ['Outbound']
      #swagger.summary = 'Create Outbound Delivery Order'
  */
  return res.status(201).json({
    success: true,
    message: 'Order created successfully',
    data: { id: uuidv4(), ...req.body },
  });
});

export default router;