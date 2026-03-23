/**
 * Benchmarks for the SharedBuffer helpers used to pass structured render
 * payloads between the main thread and Worker Threads via SharedArrayBuffer.
 *
 * The suite measures allocation, JSON serialisation/deserialisation, and the
 * full write→read round-trip for small, medium, and large payloads.
 */
import {
  createSharedBuffer,
  readFromBuffer,
  writeToBuffer,
} from "../../packages/renderer/src/shared-buffer.js";
import { bench, describe } from "vitest";

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

describe("SharedBuffer – allocation", () => {
  bench("createSharedBuffer(4 KB)", () => {
    createSharedBuffer(4 * 1024);
  });

  bench("createSharedBuffer(64 KB)", () => {
    createSharedBuffer(64 * 1024);
  });
});

// ---------------------------------------------------------------------------
// Small payload (~100 B JSON)
// ---------------------------------------------------------------------------

describe("SharedBuffer – small payload round-trip", () => {
  const payload = { route: "/about", user: { id: "01HX5T", name: "Alice" } };

  bench("write small JSON", () => {
    const shared = createSharedBuffer(4 * 1024);
    writeToBuffer(shared, payload);
  });

  bench("write + read small JSON", () => {
    const shared = createSharedBuffer(4 * 1024);
    writeToBuffer(shared, payload);
    readFromBuffer(shared);
  });
});

// ---------------------------------------------------------------------------
// Medium payload (~2 KB JSON)
// ---------------------------------------------------------------------------

describe("SharedBuffer – medium payload round-trip", () => {
  const mediumPayload = {
    route: "/dashboard",
    user: { id: "01HX5T", name: "Alice", role: "admin" },
    posts: Array.from({ length: 20 }, (_, i) => ({
      id: `post-${i}`,
      title: `Post number ${i}`,
      content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    })),
  };

  bench("write medium JSON (~2 KB)", () => {
    const shared = createSharedBuffer(16 * 1024);
    writeToBuffer(shared, mediumPayload);
  });

  bench("write + read medium JSON (~2 KB)", () => {
    const shared = createSharedBuffer(16 * 1024);
    writeToBuffer(shared, mediumPayload);
    readFromBuffer(shared);
  });
});

// ---------------------------------------------------------------------------
// Large payload (~10 KB JSON — simulates a page with many data items)
// ---------------------------------------------------------------------------

describe("SharedBuffer – large payload round-trip", () => {
  const largePayload = {
    route: "/products",
    products: Array.from({ length: 100 }, (_, i) => ({
      id: `prod-${i}`,
      name: `Product ${i}`,
      description:
        "A high-quality product with many features and a long description.",
      price: (i + 1) * 9.99,
      tags: ["electronics", "sale", `category-${i % 5}`],
    })),
  };

  bench("write large JSON (~10 KB)", () => {
    const shared = createSharedBuffer(64 * 1024);
    writeToBuffer(shared, largePayload);
  });

  bench("write + read large JSON (~10 KB)", () => {
    const shared = createSharedBuffer(64 * 1024);
    writeToBuffer(shared, largePayload);
    readFromBuffer(shared);
  });
});
