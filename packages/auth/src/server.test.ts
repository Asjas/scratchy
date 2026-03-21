import { createAuth } from "./server.js";
import { describe, expect, it } from "vitest";

describe("createAuth", () => {
  it("returns a better-auth instance with handler and api", () => {
    const auth = createAuth({
      basePath: "/api/auth",
      secret: "test-secret-at-least-32-characters-long",
    });

    expect(auth).toBeDefined();
    expect(auth.handler).toBeTypeOf("function");
    expect(auth.api).toBeDefined();
    expect(auth.options).toBeDefined();
  });

  it("passes options through to betterAuth", () => {
    const auth = createAuth({
      basePath: "/custom/auth",
      secret: "test-secret-at-least-32-characters-long",
      emailAndPassword: { enabled: true },
    });

    expect(auth.options.basePath).toBe("/custom/auth");
    expect(auth.options.emailAndPassword).toEqual({ enabled: true });
  });

  it("uses default basePath when not specified", () => {
    const auth = createAuth({
      secret: "test-secret-at-least-32-characters-long",
    });

    expect(auth.options.basePath).toBeUndefined();
  });
});
