/**
 * Path routing helpers for the virtual file system.
 *
 * Ported from `lib/internal/vfs/router.js` in the Node.js PR #61478.
 * Uses `path.join` instead of string concatenation per reviewer feedback
 * (avivkeller, 2026-01-29).
 *
 * Handles cross-platform path separators: on Windows `path.resolve` produces
 * backslash-separated paths, so all comparisons use `path.sep` rather than a
 * hard-coded `/`.
 */
import { isAbsolute, relative, sep } from "node:path";

export { isAbsolute };

/**
 * Returns `true` when `normalizedPath` is at or under `mountPoint`.
 * Both arguments must already have been passed through `path.resolve`.
 */
export function isUnderMountPoint(
  normalizedPath: string,
  mountPoint: string,
): boolean {
  if (normalizedPath === mountPoint) {
    return true;
  }
  // Special case: root mount point – every absolute path lives under it.
  if (mountPoint === "/") {
    return normalizedPath.startsWith("/");
  }
  // Avoid double-separator for mount points that already end with sep
  // (e.g. 'C:\' on Windows).
  const prefix =
    mountPoint[mountPoint.length - 1] === sep ? mountPoint : mountPoint + sep;
  return normalizedPath.startsWith(prefix);
}

/**
 * Returns the provider-internal POSIX path for a path that lives under
 * `mountPoint`.  The result always starts with `/`.
 *
 * Uses `path.relative` so the correct platform separator is handled, then
 * re-joins with `/` to produce a POSIX-style path for the provider.
 */
export function getRelativePath(
  normalizedPath: string,
  mountPoint: string,
): string {
  if (normalizedPath === mountPoint) {
    return "/";
  }
  if (mountPoint === "/") {
    return normalizedPath;
  }
  const rel = relative(mountPoint, normalizedPath);
  return "/" + rel.split(sep).join("/");
}
