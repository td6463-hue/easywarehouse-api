import { Router } from 'express';
const router = Router();

router.post('/login', (req, res) => {
  /*  #swagger.tags = ['Auth']
      #swagger.summary = 'User Login'
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Login credentials',
        schema: {
          phone_number: 'admin',
          password: 'password123'
        }
      }
  */
  const { phone_number, password } = req.body;
  if (!phone_number || !password) {
    return res.status(400).json({ success: false, message: 'Invalid credentials' });
  }

  return res.json({
    success: true,
    data: {
      user: {
        id: '090dcb92-f56d-4b73-bd05-d2500cd2a216',
        name: 'Warehouse Administrator',
        phone_number,
        email: 'admin@easy-warehouse.la',
        role: 'SUPER_ADMIN',
        warehouse_id: 'a8b7c6d5-e4f3-4211-8901-123456789abc',
        warehouse_name: 'Central Vientiane Distribution Hub',
        permissions: ['all'],
      },
      token: 'jwt-mock-token-easy-warehouse',
      refreshToken: 'jwt-mock-refresh-token',
    },
  });
});

router.post('/refresh', (req, res) => {
  /*  #swagger.tags = ['Auth']
      #swagger.summary = 'Refresh Access Token'
  */
  return res.json({
    success: true,
    data: {
      token: 'jwt-new-mock-token-easy-warehouse',
    },
  });
});

router.get('/me', (_req, res) => {
  /*  #swagger.tags = ['Auth']
      #swagger.summary = 'Get current authenticated user profile'
      #swagger.security = [{ "bearerAuth": [] }]
  */
  return res.json({
    success: true,
    data: {
      id: '090dcb92-f56d-4b73-bd05-d2500cd2a216',
      name: 'Warehouse Administrator',
      phone_number: '+856 20 5511 2233',
      email: 'admin@easy-warehouse.la',
      role: 'SUPER_ADMIN',
      warehouse_id: 'a8b7c6d5-e4f3-4211-8901-123456789abc',
      warehouse_name: 'Central Vientiane Distribution Hub',
      permissions: ['all'],
    },
  });
});

export default router;