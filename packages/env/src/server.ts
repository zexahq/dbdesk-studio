import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    CORS_ORIGIN: z.string().optional().default("http://localhost:9876"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    STORAGE_PATH: z.string().optional(),
    ALLOWED_DB_TYPES: z.string().optional(),
    DEFAULT_SSL_MODE: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
