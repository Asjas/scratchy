# @scratchyjs/utils

General-purpose server utilities for the Scratchy framework. Includes safe
redirect validation, concurrent promise helpers, typed HTTP response factories,
interval generator, IP address / locale / Sec-Fetch header utilities, and more.

## Installation

```bash
pnpm add @scratchyjs/utils
```

## API

### `safeRedirect(to, defaultRedirect?): string`

Validates a redirect path so it stays within the same origin. URL-decodes the
input before checking to block percent-encoded bypass attempts (`%2e%2e`,
`%2F%2F`). Falls back to `defaultRedirect` (`"/"` by default) when the path is
unsafe.

```typescript
import { safeRedirect } from "@scratchyjs/utils";

reply.redirect(safeRedirect(request.query.redirectTo));
// "/dashboard"  → "/dashboard"  ✅
// "//evil.com"  → "/"           🛡️
// "../etc"      → "/"           🛡️
```

### `promiseHash(hash): Promise<AwaitedPromiseHash>`

`Promise.all` for objects — resolves all values concurrently while preserving
the key names.

```typescript
import { promiseHash } from "@scratchyjs/utils";

const { user, posts } = await promiseHash({
  user: fetchUser(id),
  posts: fetchPosts(id),
});
```

### `timeout(promise, ms, message?): Promise<T>`

Races `promise` against a timer. Throws `TimeoutError` if the timer fires first.

```typescript
import { TimeoutError, timeout } from "@scratchyjs/utils";

try {
  const data = await timeout(fetchData(), 5000);
} catch (err) {
  if (err instanceof TimeoutError) {
    /* handle timeout */
  }
}
```

### `interval(ms, options?): AsyncGenerator`

Async generator that yields on a fixed interval until an `AbortSignal` fires.
Useful for SSE routes.

```typescript
import { interval } from "@scratchyjs/utils";

const controller = new AbortController();
for await (const _ of interval(1000, { signal: controller.signal })) {
  reply.raw.write(`data: ${Date.now()}\n\n`);
}
```

### `redirectBack(request, fallback?): string`

Returns the `Referer` header value, or `fallback` (`"/"`) when absent.

### `getClientIPAddress(request): string | null`

Extracts the real client IP from a Fastify request, respecting `X-Forwarded-For`
and similar headers.

### `getClientLocales(request): Locales`

Parses the `Accept-Language` header into an ordered array of locale strings.

### `isPrefetch(request): boolean`

Returns `true` when the request carries a `Purpose: prefetch` or
`Sec-Purpose: prefetch` header.

### Response helpers

Typed `Response` factories with the correct `Content-Type` header:

| Function                   | Content-Type                            |
| -------------------------- | --------------------------------------- |
| `notModified()`            | _(304, no body)_                        |
| `javascript(body, init?)`  | `application/javascript; charset=utf-8` |
| `stylesheet(body, init?)`  | `text/css; charset=utf-8`               |
| `html(body, init?)`        | `text/html; charset=utf-8`              |
| `xml(body, init?)`         | `application/xml; charset=utf-8`        |
| `txt(body, init?)`         | `text/plain; charset=utf-8`             |
| `pdf(body, init?)`         | `application/pdf`                       |
| `image(body, type, init?)` | `image/<type>`                          |

### Sec-Fetch helpers

```typescript
import {
  fetchDest,
  fetchMode,
  fetchSite,
  isUserInitiated,
} from "@scratchyjs/utils";

const dest = fetchDest(request); // "document" | "script" | …
const mode = fetchMode(request); // "navigate" | "cors" | …
const site = fetchSite(request); // "same-origin" | "cross-site" | …
const user = isUserInitiated(request); // boolean
```

## Documentation

[https://scratchyjs.com/middleware](https://scratchyjs.com/middleware)
