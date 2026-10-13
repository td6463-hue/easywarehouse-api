import swaggerAutogen from 'swagger-autogen';
import { config } from '../config.js';

const doc = {
  info: {
    title: 'Easy Warehouse API',
    version: '1.0.0',
    description: 'REST API documentation for Easy Warehouse Management System',
  },
  servers: [
    {
      url: '/api/v1',
      description: 'Current host (/api/v1)',
    },
    {
      url: `http://localhost:${config.port}/api/v1`,
      description: 'Localhost server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

const outputFile = './src/swagger_output.json';
const endpointsFiles = ['./src/routes/index.ts'];

swaggerAutogen({ openapi: '3.0.0' })(outputFile, endpointsFiles, doc).then(() => {
  console.log('✅ Swagger documentation generated successfully for easy-warehouse-api!');
});