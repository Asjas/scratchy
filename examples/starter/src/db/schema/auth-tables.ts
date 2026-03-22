import { appSchema } from "../my-schema.js";
import { timestamps } from "./columns.helpers.js";
import { user } from "./user.js";
import { index, text, timestamp } from "drizzle-orm/pg-core";

// ── session ───────────────────────────────────────────────────────────────────

/** Row type returned by SELECT queries on the session table. */
export type Session = typeof session.$inferSelect;
/** Row type accepted by INSERT statements on the session table. */
export type NewSession = typeof session.$inferInsert;

/**
 * Sessions table. Managed entirely by Better Auth — do not mutate directly.
 * Each row represents an active user session, identified by a signed token
 * stored in a cookie.
 */
export const session = appSchema.table(
  "session",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (table) => [
    index("session_user_id_idx").on(table.userId),
    index("session_token_idx").on(table.token),
  ],
);

// ── account ───────────────────────────────────────────────────────────────────

/** Row type returned by SELECT queries on the account table. */
export type Account = typeof account.$inferSelect;
/** Row type accepted by INSERT statements on the account table. */
export type NewAccount = typeof account.$inferInsert;

/**
 * Accounts table. Links users to authentication providers (e.g., email/password,
 * GitHub, Google). Managed by Better Auth — do not mutate directly.
 */
export const account = appSchema.table(
  "account",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    expiresAt: timestamp({ withTimezone: true }),
    password: text(),
    ...timestamps,
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    index("account_provider_idx").on(table.providerId, table.accountId),
  ],
);

// ── verification ──────────────────────────────────────────────────────────────

/** Row type returned by SELECT queries on the verification table. */
export type Verification = typeof verification.$inferSelect;
/** Row type accepted by INSERT statements on the verification table. */
export type NewVerification = typeof verification.$inferInsert;

/**
 * Verification table. Stores time-limited tokens for email verification,
 * password reset, and similar flows. Managed by Better Auth.
 */
export const verification = appSchema.table(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);
