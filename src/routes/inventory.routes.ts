import { Router } from 'express';
const router = Router();

router.get('/', (_req, res) => {
  /*  #swagger.tags = ['Inventory']
      #swagger.summary = 'Retrieve real-time stock levels across warehouse bins'
  */
  return res.json({
    success: true,
    data: [
      {
        id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
        sku: 'SKU-ELEC-001',
        product_name: 'Solar Inverter 5KW Hybrid Plus',
        warehouse_name: 'Central Vientiane Distribution Hub',
        location_code: 'A-02-03-B',
        quantity_on_hand: 45,
        quantity_reserved: 5,
        quantity_available: 40,
        unit: 'PCS',
      },
    ],
  });
});

export default router;