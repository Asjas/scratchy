/**
 * Base user type returned by better-auth sessions.
 * Includes fields from the core `User` model plus fields added
 * by the `admin` plugin (role, banned, banReason, banExpires).
 */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** User role (e.g. `"member"` or `"admin"`). Set by the admin plugin. */
  role?: string;
  /** Whether the user is banned. Set by the admin plugin. */
  banned: boolean | null;
  /** Reason for the ban, if any. Set by the admin plugin. */
  banReason?: string | null;
  /** When the ban expires, if ever. Set by the admin plugin. */
  banExpires?: Date | null;
}
