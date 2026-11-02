import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "path";
import { AppModule } from "./app.module.js";

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const allowedOrigins = (process.env.FRONTEND_URLS ?? "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

  app.enableCors({
    origin: (requestOrigin, callback) => {
      // Requests without an Origin header include health checks and direct API calls.
      if (!requestOrigin || allowedOrigins.includes(normalizeOrigin(requestOrigin))) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS"), false);
    },
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Authorization"],
  });
  app.useStaticAssets(join(process.cwd(), "uploads"));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  await app.init();
  return app;
}
