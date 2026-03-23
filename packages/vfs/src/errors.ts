/**
 * POSIX-style filesystem error helpers for the virtual file system.
 *
 * Each helper creates a standard {@link NodeJS.ErrnoException} with the
 * appropriate `code`, `syscall`, and (where applicable) `path` properties.
 * This mirrors the error shapes produced by the real `node:fs` module so that
 * callers can use the same `err.code === 'ENOENT'` checks they already rely on.
 */

function makeError(
  code: string,
  message: string,
  syscall: string,
  path?: string,
): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error(
    `${syscall}: ${message}${path !== undefined ? `, ${syscall} '${path}'` : ""}`,
  );
  err.code = code;
  err.syscall = syscall;
  if (path !== undefined) {
    err.path = path;
  }
  return err;
}

export function createENOENT(
  syscall: string,
  path: string,
): NodeJS.ErrnoException {
  return makeError("ENOENT", "no such file or directory", syscall, path);
}

export function createENOTDIR(
  syscall: string,
  path: string,
): NodeJS.ErrnoException {
  return makeError("ENOTDIR", "not a directory", syscall, path);
}

export function createENOTEMPTY(
  syscall: string,
  path: string,
): NodeJS.ErrnoException {
  return makeError("ENOTEMPTY", "directory not empty", syscall, path);
}

export function createEISDIR(
  syscall: string,
  path: string,
): NodeJS.ErrnoException {
  return makeError("EISDIR", "illegal operation on a directory", syscall, path);
}

export function createEBADF(syscall: string): NodeJS.ErrnoException {
  return makeError("EBADF", "bad file descriptor", syscall);
}

export function createEEXIST(
  syscall: string,
  path: string,
): NodeJS.ErrnoException {
  return makeError("EEXIST", "file already exists", syscall, path);
}

export function createEROFS(
  syscall: string,
  path: string,
): NodeJS.ErrnoException {
  return makeError("EROFS", "read-only file system", syscall, path);
}

export function createEINVAL(
  syscall: string,
  path: string,
): NodeJS.ErrnoException {
  return makeError("EINVAL", "invalid argument", syscall, path);
}

export function createELOOP(
  syscall: string,
  path: string,
): NodeJS.ErrnoException {
  return makeError("ELOOP", "too many levels of symbolic links", syscall, path);
}

export function createEACCES(
  syscall: string,
  path: string,
): NodeJS.ErrnoException {
  return makeError("EACCES", "permission denied", syscall, path);
}
