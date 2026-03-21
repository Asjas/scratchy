import { getClientIPAddress } from "./ip-address.js";
import { describe, expect, it } from "vitest";

function req(headers: Record<string, string | string[] | undefined>) {
  return { headers };
}

describe("getClientIPAddress", () => {
  it("returns null when no IP headers are present", () => {
    expect(getClientIPAddress(req({}))).toBeNull();
  });

  it("returns the IP from x-client-ip", () => {
    expect(getClientIPAddress(req({ "x-client-ip": "203.0.113.1" }))).toBe(
      "203.0.113.1",
    );
  });

  it("returns the first valid IP from x-forwarded-for with multiple IPs", () => {
    expect(
      getClientIPAddress(
        req({ "x-forwarded-for": "203.0.113.1, 10.0.0.1, 192.168.1.1" }),
      ),
    ).toBe("203.0.113.1");
  });

  it("accepts an IPv6 address", () => {
    expect(getClientIPAddress(req({ "x-client-ip": "2001:db8::1" }))).toBe(
      "2001:db8::1",
    );
  });

  it("skips invalid values and tries the next header", () => {
    const result = getClientIPAddress(
      req({
        "x-client-ip": "not-an-ip",
        "cf-connecting-ip": "198.51.100.42",
      }),
    );
    expect(result).toBe("198.51.100.42");
  });

  it("returns null when all headers contain invalid IPs", () => {
    expect(
      getClientIPAddress(
        req({ "x-client-ip": "invalid", "x-forwarded-for": "also-invalid" }),
      ),
    ).toBeNull();
  });

  it("parses the Forwarded header for=<ip>", () => {
    const result = getClientIPAddress(
      req({ forwarded: "for=203.0.113.5; proto=https" }),
    );
    expect(result).toBe("203.0.113.5");
  });

  it("prefers x-azure-clientip over other headers", () => {
    const result = getClientIPAddress(
      req({
        "x-azure-clientip": "1.2.3.4",
        "x-forwarded-for": "5.6.7.8",
      }),
    );
    expect(result).toBe("1.2.3.4");
  });

  it("handles x-forwarded-for as an array", () => {
    const result = getClientIPAddress(
      req({ "x-forwarded-for": ["203.0.113.10, 10.0.0.1"] }),
    );
    expect(result).toBe("203.0.113.10");
  });

  it("returns fly-client-ip", () => {
    expect(getClientIPAddress(req({ "fly-client-ip": "100.115.200.5" }))).toBe(
      "100.115.200.5",
    );
  });

  it("returns do-connecting-ip", () => {
    expect(getClientIPAddress(req({ "do-connecting-ip": "45.55.33.22" }))).toBe(
      "45.55.33.22",
    );
  });
});
