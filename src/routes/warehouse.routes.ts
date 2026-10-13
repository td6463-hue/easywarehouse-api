import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (_req, res) => {
  /*  #swagger.tags = ['Warehouses']
      #swagger.summary = 'List all warehouses'
  */
  return res.json({
    success: true,
    data: [
      {
        id: 'a8b7c6d5-e4f3-4211-8901-123456789abc',
        code: 'WH-CENTRAL',
        name: 'Central Vientiane Distribution Hub',
        address: 'Km 9 Thadeua Road, Hatsxayfong District, Vientiane Capital',
        contact_person: 'Somchai Phasouk',
        phone: '+856 20 5511 2233',
        total_capacity_sqm: 12000,
        is_active: true,
        zones_count: 6,
      },
      {
        id: 'b9c8d7e6-f5a4-4322-9012-234567890bcd',
        code: 'WH-COLD-01',
        name: 'Vientiane Cold Chain Logistics Warehouse',
        address: 'Dongdok Logistics Zone, Xaythany District, Vientiane',
        contact_person: 'Keomany Sengdala',
        phone: '+856 20 9988 7766',
        total_capacity_sqm: 4500,
        is_active: true,
        zones_count: 3,
      },
    ],
  });
});

router.post('/', (req, res) => {
  /*  #swagger.tags = ['Warehouses']
      #swagger.summary = 'Create a new warehouse facility'
  */
  return res.status(201).json({
    success: true,
    message: 'Warehouse created successfully',
    data: { id: uuidv4(), ...req.body },
  });
});

export default router;