/**
 * @file swagger.ts
 * @description Configuration for Swagger UI and OpenAPI documentation.
 */

import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LifeLink API',
      version: '1.0.0',
      description: 'API documentation for the LifeLink Blood Donation Platform',
      contact: {
        name: 'LifeLink Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}/api/${env.API_VERSION}`,
        description: 'Local Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token',
        },
      },
    },
    // Apply bearerAuth globally to all routes by default
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  // Paths to files containing OpenAPI annotations
  apis: ['./docs/*.yml'],
};

export const swaggerSpec = swaggerJsdoc(options);
