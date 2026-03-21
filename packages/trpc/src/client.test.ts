import { createClient } from "./client.js";
import { describe, expect, it } from "vitest";

describe("createClient", () => {
  it("should return a tRPC client instance", () => {
    const client = createClient({ url: "/trpc" });
    expect(client).toBeDefined();
  });

  it("should accept a full URL", () => {
    const client = createClient({ url: "http://localhost:3000/trpc" });
    expect(client).toBeDefined();
  });

  it("should accept custom headers as an object", () => {
    const client = createClient({
      url: "/trpc",
      headers: { Authorization: "Bearer token" },
    });
    expect(client).toBeDefined();
  });

  it("should accept custom headers as a function", () => {
    const client = createClient({
      url: "/trpc",
      headers: () => ({ Authorization: "Bearer token" }),
    });
    expect(client).toBeDefined();
  });
});
