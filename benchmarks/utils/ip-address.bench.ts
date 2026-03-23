/**
 * Benchmarks for getClientIPAddress — the IP extraction utility that parses
 * a prioritised list of proxy and CDN headers to find the originating client IP.
 *
 * The suite covers common real-world header combinations to surface the cost
 * of header iteration and RFC 7239 `Forwarded` header parsing.
 */
import { getClientIPAddress } from "../../packages/utils/src/ip-address.js";
import { bench, describe } from "vitest";

// ---------------------------------------------------------------------------
// No IP headers present
// ---------------------------------------------------------------------------

describe("getClientIPAddress – no IP headers", () => {
  const req = {
    headers: { "host": "example.com", "content-type": "text/html" },
  };

  bench("no IP-related headers → null", () => {
    getClientIPAddress(req);
  });
});

// ---------------------------------------------------------------------------
// Single header — common CDN / proxy headers
// ---------------------------------------------------------------------------

describe("getClientIPAddress – single header", () => {
  bench("cf-connecting-ip (Cloudflare)", () => {
    getClientIPAddress({ headers: { "cf-connecting-ip": "203.0.113.1" } });
  });

  bench("x-forwarded-for (simple)", () => {
    getClientIPAddress({ headers: { "x-forwarded-for": "198.51.100.42" } });
  });

  bench("x-real-ip", () => {
    getClientIPAddress({ headers: { "x-real-ip": "192.0.2.100" } });
  });

  bench("true-client-ip (Akamai / Cloudflare Enterprise)", () => {
    getClientIPAddress({ headers: { "true-client-ip": "198.51.100.7" } });
  });
});

// ---------------------------------------------------------------------------
// x-forwarded-for with multiple hops
// ---------------------------------------------------------------------------

describe("getClientIPAddress – x-forwarded-for multi-hop", () => {
  bench("2-hop chain", () => {
    getClientIPAddress({
      headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
    });
  });

  bench("4-hop chain", () => {
    getClientIPAddress({
      headers: {
        "x-forwarded-for": "203.0.113.1, 10.0.0.1, 172.16.0.5, 192.168.1.1",
      },
    });
  });
});

// ---------------------------------------------------------------------------
// RFC 7239 `Forwarded` header
// ---------------------------------------------------------------------------

describe("getClientIPAddress – Forwarded header (RFC 7239)", () => {
  bench("simple for= directive", () => {
    getClientIPAddress({ headers: { forwarded: "for=203.0.113.1" } });
  });

  bench("for= with port", () => {
    getClientIPAddress({
      headers: { forwarded: 'for="203.0.113.1:4711"' },
    });
  });

  bench("IPv6 literal", () => {
    getClientIPAddress({
      headers: { forwarded: 'for="[2001:db8::1]"' },
    });
  });

  bench("multi-hop Forwarded", () => {
    getClientIPAddress({
      headers: {
        forwarded: "for=203.0.113.1;proto=https, for=198.51.100.2;proto=http",
      },
    });
  });
});

// ---------------------------------------------------------------------------
// IPv6 addresses in x-forwarded-for
// ---------------------------------------------------------------------------

describe("getClientIPAddress – IPv6 addresses", () => {
  bench("x-forwarded-for IPv6", () => {
    getClientIPAddress({
      headers: { "x-forwarded-for": "2001:db8::1" },
    });
  });
});
