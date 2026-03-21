import { createAuth } from "./server.js";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";

const makeDatabase = () => memoryAdapter({});

describe("createAuth", () => {
  it("should create a better-auth instance", () => {
    const auth = createAuth({
      baseURL: "http://localhost:3000",
      secret: "test-secret-key-that-is-long-enough",
      database: makeDatabase(),
    });

    expect(auth).toBeDefined();
    expect(auth.api).toBeDefined();
    expect(auth.handler).toBeDefined();
  });

  it("should include the admin plugin by default", () => {
    const auth = createAuth({
      baseURL: "http://localhost:3000",
      secret: "test-secret-key-that-is-long-enough",
      database: makeDatabase(),
    });

    // Admin plugin registers additional API endpoints
    expect(auth.api).toHaveProperty("banUser");
    expect(auth.api).toHaveProperty("listUsers");
  });

  it("should accept additional plugins", () => {
    const auth = createAuth({
      baseURL: "http://localhost:3000",
      secret: "test-secret-key-that-is-long-enough",
      database: makeDatabase(),
      plugins: [],
    });

    expect(auth).toBeDefined();
  });

  it("should default emailAndPassword to enabled", () => {
    const auth = createAuth({
      baseURL: "http://localhost:3000",
      secret: "test-secret-key-that-is-long-enough",
      database: makeDatabase(),
    });

    // signIn.email should be available when emailAndPassword is enabled
    expect(auth.api).toHaveProperty("signInEmail");
  });

  it("should pass through optional config", () => {
    const auth = createAuth({
      baseURL: "http://localhost:3000",
      secret: "test-secret-key-that-is-long-enough",
      appName: "Test App",
      trustedOrigins: ["http://localhost:4173"],
      database: makeDatabase(),
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
      },
    });

    expect(auth).toBeDefined();
  });
});
