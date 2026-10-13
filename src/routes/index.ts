import { Router } from 'express';
import authRouter from './auth.routes.js';
import roleRouter from './role.routes.js';
import userRouter from './user.routes.js';
import equipmentRouter from './equipment.routes.js';
import uploadRouter from './upload.routes.js';
import categoryRouter from './category.routes.js';
import subCategoryRouter from './sub-category.routes.js';
import storeRouter from './store.routes.js';
import branchRouter from './branch.routes.js';
import warehouseRouter from './warehouse.routes.js';
import productRouter from './product.routes.js';
import inventoryRouter from './inventory.routes.js';
import inboundRouter from './inbound.routes.js';
import outboundRouter from './outbound.routes.js';
import equipmentUnitRangeRouter from './equipment-unit-range.routes.js';
import equipmentUnitDetailRouter from './equipment-unit-detail.routes.js';
import equipmentCheckoutRouter from './equipment-checkout.routes.js';

const router = Router();

router.get('/', (_req, res) => {
  /*  #swagger.tags = ['Root']
      #swagger.summary = 'API Service Status'
  */
  res.status(200).json({
    success: true,
    message: 'Easy Warehouse API v1 is running',
    documentation: '/api-docs',
  });
});

router.use('/auth', authRouter);
router.use('/roles', roleRouter);
router.use('/users', userRouter);
router.use('/equipments', equipmentRouter);
router.use('/equipment-unit-ranges', equipmentUnitRangeRouter);
router.use('/equipment-ranges', equipmentUnitRangeRouter);
router.use('/equipment-unit-details', equipmentUnitDetailRouter);
router.use('/equipment-units', equipmentUnitDetailRouter);
router.use('/equipment-checkouts', equipmentCheckoutRouter);
router.use('/checkouts', equipmentCheckoutRouter);
router.use('/categories', categoryRouter);
router.use('/sub-categories', subCategoryRouter);
router.use('/subcategories', subCategoryRouter);
router.use('/stores', storeRouter);
router.use('/branches', branchRouter);
router.use('/upload', uploadRouter);
router.use('/warehouses', warehouseRouter);
router.use('/products', productRouter);
router.use('/inventory', inventoryRouter);
router.use('/inbound', inboundRouter);
router.use('/outbound', outboundRouter);

export default router;
