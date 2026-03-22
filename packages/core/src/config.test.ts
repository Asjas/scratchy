import { configSchema, loadConfig } from "./config.js";
import { describe, expect, it } from "vitest";

describe("configSchema", () => {
  it("should provide defaults for development", () => {
    const config = loadConfig({});

    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe("0.0.0.0");
    expect(config.NODE_ENV).toBe("development");
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.TRUST_PROXY).toBe(true);
    expect(config.BODY_LIMIT).toBe(10_485_760);
  });

  it("should parse valid environment variables", () => {
    const config = loadConfig({
      PORT: "8080",
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      LOG_LEVEL: "error",
      TRUST_PROXY: "false",
      BODY_LIMIT: "5242880",
    });

    expect(config.PORT).toBe(8080);
    expect(config.HOST).toBe("127.0.0.1");
    expect(config.NODE_ENV).toBe("production");
    expect(config.LOG_LEVEL).toBe("error");
    expect(config.TRUST_PROXY).toBe(false);
    expect(config.BODY_LIMIT).toBe(5_242_880);
  });

  it("should reject invalid PORT", () => {
    expect(() => loadConfig({ PORT: "not-a-number" })).toThrow();
  });

  it("should reject invalid NODE_ENV", () => {
    expect(() => configSchema.parse({ NODE_ENV: "staging" })).toThrow();
  });

  it("should reject invalid LOG_LEVEL", () => {
    expect(() => configSchema.parse({ LOG_LEVEL: "verbose" })).toThrow();
  });

  it("should default ALLOWED_ORIGINS to an empty array", () => {
    const config = loadConfig({});
    expect(config.ALLOWED_ORIGINS).toEqual([]);
  });

  it("should parse a single ALLOWED_ORIGINS value", () => {
    const config = loadConfig({
      ALLOWED_ORIGINS: "https://app.example.com",
    });
    expect(config.ALLOWED_ORIGINS).toEqual(["https://app.example.com"]);
  });

  it("should parse comma-separated ALLOWED_ORIGINS", () => {
    const config = loadConfig({
      ALLOWED_ORIGINS: "https://app.example.com,https://admin.example.com",
    });
    expect(config.ALLOWED_ORIGINS).toEqual([
      "https://app.example.com",
      "https://admin.example.com",
    ]);
  });

  it("should trim whitespace from ALLOWED_ORIGINS entries", () => {
    const config = loadConfig({
      ALLOWED_ORIGINS:
        "  https://app.example.com , https://admin.example.com  ",
    });
    expect(config.ALLOWED_ORIGINS).toEqual([
      "https://app.example.com",
      "https://admin.example.com",
    ]);
  });

  it("should ignore empty entries in ALLOWED_ORIGINS", () => {
    const config = loadConfig({
      ALLOWED_ORIGINS: "https://app.example.com,,",
    });
    expect(config.ALLOWED_ORIGINS).toEqual(["https://app.example.com"]);
  });
});
