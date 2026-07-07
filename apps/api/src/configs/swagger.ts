import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Hope Platform API",
      version: "1.0.0",
      description: "API documentation for Hope — the developer platform for building and running AI agents.",
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
          description: "JWT issued by POST /api/v1/auth/login — used by the dashboard UI.",
        },
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Internal secret shared between Node.js and the GenAI service. Not for external use.",
        },
        hopeToken: {
          type: "apiKey",
          in: "header",
          name: "X-Hope-Token",
          description: "Your org API token — the primary auth method for developer/programmatic access to /api/v1/run/*.",
        },
      },
    },
  },
  apis: [
    "./src/features/access/**/*.routes.ts",
    "./src/features/agents/*.routes.ts",
    "./src/features/run/*.routes.ts",
    "./src/features/traces/*.routes.ts",
    "./src/features/analytics/*.routes.ts",
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
