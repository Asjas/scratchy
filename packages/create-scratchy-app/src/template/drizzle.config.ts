import { createDrizzleConfig } from "@scratchyjs/drizzle";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL environment variable is required for migrations",
  );
}

export default createDrizzleConfig({
  schema: ["./src/db/my-schema.ts", "./src/db/schema"],
  out: "./drizzle",
  connectionString: DATABASE_URL,
});
