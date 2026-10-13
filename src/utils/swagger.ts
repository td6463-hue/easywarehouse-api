import { Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const setupSwagger = (app: Application): void => {
  try {
    const swaggerFilePath = path.join(__dirname, '../swagger_output.json');
    if (!fs.existsSync(swaggerFilePath)) {
      console.warn('swagger_output.json does not exist yet. Run "npm run swagger" to generate.');
      return;
    }

    const swaggerDocument = JSON.parse(fs.readFileSync(swaggerFilePath, 'utf8'));

    app.use(
      '/api-docs',
      swaggerUi.serve as any,
      swaggerUi.setup(swaggerDocument, {
        swaggerOptions: {
          persistAuthorization: true,
          displayRequestDuration: true,
          filter: true,
        },
      }) as any
    );
    console.log(`📄 Swagger API Documentation: http://localhost:${config.port}/api-docs`);
  } catch (error) {
    console.error('Failed to load swagger documentation:', error);
  }
};