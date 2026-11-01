import { resolve } from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), "../../.env") });

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/ai_sales";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET || "local-better-auth-secret-min-32-chars-long!";
process.env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || "http://localhost:4000";
process.env.S3_BUCKET = process.env.S3_BUCKET || "ai-sales-assets";
process.env.AWS_REGION = process.env.AWS_REGION || "eu-west-3";
process.env.META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
delete process.env.AI_GATEWAY_API_KEY;
delete process.env.RESEND_API_KEY;
