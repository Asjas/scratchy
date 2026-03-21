import { createAuthClient } from "./client.js";
import { describe, expect, it } from "vitest";

describe("createAuthClient", () => {
  it("should create a better-auth client instance", () => {
    const client = createAuthClient({
      baseURL: "http://localhost:3000",
    });

    expect(client).toBeDefined();
    expect(client.signIn).toBeDefined();
    expect(client.signOut).toBeDefined();
    expect(client.getSession).toBeDefined();
  });

  it("should include admin client methods", () => {
    const client = createAuthClient({
      baseURL: "http://localhost:3000",
    });

    // adminClient plugin adds admin methods like banUser, listUsers, etc.
    expect(client.admin).toBeDefined();
    expect(client.admin.banUser).toBeDefined();
    expect(client.admin.listUsers).toBeDefined();
  });

  it("should use /api/auth as the default base path", () => {
    const client = createAuthClient({
      baseURL: "http://localhost:3000",
    });

    expect(client).toBeDefined();
  });

  it("should accept a custom base path", () => {
    const client = createAuthClient({
      baseURL: "http://localhost:3000",
      basePath: "/auth",
    });

    expect(client).toBeDefined();
  });

  it("should accept additional plugins", () => {
    const client = createAuthClient({
      baseURL: "http://localhost:3000",
      plugins: [],
    });

    expect(client).toBeDefined();
  });

  it("should accept fetch options", () => {
    const client = createAuthClient({
      baseURL: "http://localhost:3000",
      fetchOptions: {
        credentials: "include",
      },
    });

    expect(client).toBeDefined();
  });
});
