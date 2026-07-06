import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Agent Service API",
      version: "1.0.0",
      description: "API documentation for Agent Service",
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5000}`,
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Org API key (for programmatic access to agent routes)",
        },
      },
    },
  },
  // Include both access feature routes and the new agents feature routes
  apis: [
    "./src/features/access/**/*.routes.ts",
    "./src/features/agents/*.routes.ts",
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
