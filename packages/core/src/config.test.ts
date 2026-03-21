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
});
