import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { setupSwagger } from './utils/swagger.js';
import apiRouter from './routes/index.js';

const app = express();

app.use(helmet({
  contentSecurityPolicy: false, // Allows Swagger UI assets
}));
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger UI mount at /api-docs
setupSwagger(app);

// Mount API routes at /api/v1
// Serve uploaded static files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/v1', apiRouter);

// Root redirect to /api-docs
app.get('/', (_req, res) => {
  res.redirect('/api-docs');
});

// 404 Handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'API Route Not Found' });
});

import { testDbConnection } from './db.js';

app.listen(config.port, async () => {
  console.log(`🚀 Easy Warehouse API server running on http://localhost:${config.port}`);
  console.log(`📄 Swagger Documentation available on http://localhost:${config.port}/api-docs`);
  await testDbConnection();
});

// Connected to MySQL DB
export default app;