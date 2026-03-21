import { createAuthClient } from "./client.js";
import { describe, expect, it } from "vitest";

describe("createAuthClient", () => {
  it("returns a client with auth methods", () => {
    const client = createAuthClient({
      baseURL: "http://localhost:3000",
    });

    expect(client).toBeDefined();
    expect(client.signIn).toBeDefined();
    expect(client.signUp).toBeDefined();
    expect(client.signOut).toBeDefined();
    expect(client.getSession).toBeDefined();
  });

  it("accepts empty options", () => {
    const client = createAuthClient();

    expect(client).toBeDefined();
    expect(client.signIn).toBeDefined();
  });

  it("accepts baseURL option", () => {
    const client = createAuthClient({
      baseURL: "https://api.example.com",
    });

    expect(client).toBeDefined();
  });
});
