import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (_req, res) => {
  /*  #swagger.tags = ['Products']
      #swagger.summary = 'Get all products and SKU items'
  */
  return res.json({
    success: true,
    data: [
      {
        id: 'c1d2e3f4-a5b6-4789-9012-345678901cde',
        sku: 'SKU-ELEC-001',
        barcode: '8851234560012',
        name: 'Solar Inverter 5KW Hybrid Plus',
        category_name: 'Solar & Electronics',
        unit: 'PCS',
        cost_price: 6500000,
        selling_price: 8900000,
        min_stock_level: 10,
        max_stock_level: 100,
        current_stock: 45,
        is_active: true,
      },
      {
        id: 'd2e3f4a5-b6c7-4890-a123-456789012def',
        sku: 'SKU-BEV-002',
        barcode: '8851234560029',
        name: 'Natural Mineral Spring Water 500ml (24x)',
        category_name: 'Beverage & FMCG',
        unit: 'BOX',
        cost_price: 65000,
        selling_price: 90000,
        min_stock_level: 50,
        max_stock_level: 500,
        current_stock: 12,
        is_active: true,
      },
    ],
  });
});

router.post('/', (req, res) => {
  /*  #swagger.tags = ['Products']
      #swagger.summary = 'Register new SKU item'
  */
  return res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: { id: uuidv4(), ...req.body },
  });
});

export default router;