---
name: qwik-framework
description:
  "Guides development of Qwik components, routing, and rendering patterns within
  the Scratchy framework. Use when creating Qwik components, setting up
  file-based routing, working with Qwik's reactivity system (signals, stores),
  implementing SSR/SSG, or optimizing component loading. Trigger terms: Qwik,
  component$, useSignal, useStore, useTask$, useVisibleTask$, $() dollar sign,
  resumability, Qwik City, QRL, lazy loading."
metadata:
  tags: qwik, components, rendering, ssr, ssg, routing, frontend
applyTo: "**/*.tsx,**/*.ts"
---

# Qwik in Scratchy

## When to Use

Qwik is the **primary rendering framework** in Scratchy. Use it for:

- All page components and layouts
- Interactive UI components
- File-based routing
- Server-side rendering (SSR) and static site generation (SSG)
- Any component that doesn't require a React-only library

## Core Concepts

### Resumability vs Hydration

Qwik uses **resumability** instead of hydration. The server serializes the
application state into HTML, and the client resumes execution without
re-executing component code. This means:

- Components don't re-run on the client unless needed
- Event handlers are lazy-loaded on interaction
- Zero JavaScript is shipped until user interaction occurs

### The Dollar Sign ($) Convention

Functions suffixed with `$` are lazy-loadable boundaries. Qwik's optimizer
splits code at these boundaries:

```tsx
import { $, component$ } from "@builder.io/qwik";

// component$ — lazy-loadable component boundary
export const MyComponent = component$(() => {
  // $() — lazy-loadable callback
  const handleClick = $(() => {
    console.log("clicked");
  });

  return <button onClick$={handleClick}>Click me</button>;
});
```

## Component Patterns

### Basic Component

```tsx
import { component$ } from "@builder.io/qwik";

interface GreetingProps {
  name: string;
}

export const Greeting = component$<GreetingProps>(({ name }) => {
  return <h1>Hello, {name}!</h1>;
});
```

### Reactive State with useSignal

Use `useSignal` for primitive reactive values:

```tsx
import { component$, useSignal } from "@builder.io/qwik";

export const Counter = component$(() => {
  const count = useSignal(0);

  return (
    <div>
      <p>Count: {count.value}</p>
      <button onClick$={() => count.value++}>Increment</button>
    </div>
  );
});
```

### Complex State with useStore

Use `useStore` for object/array reactive state:

```tsx
import { component$, useStore } from "@builder.io/qwik";

interface FormState {
  name: string;
  email: string;
  errors: string[];
}

export const ContactForm = component$(() => {
  const form = useStore<FormState>({
    name: "",
    email: "",
    errors: [],
  });

  return (
    <form
      preventdefault:submit
      onSubmit$={() => {
        form.errors = [];
        if (!form.name) form.errors.push("Name is required");
        if (!form.email) form.errors.push("Email is required");
      }}
    >
      <input
        type="text"
        value={form.name}
        onInput$={(_, el) => (form.name = el.value)}
      />
      <input
        type="email"
        value={form.email}
        onInput$={(_, el) => (form.email = el.value)}
      />
      {form.errors.map((error) => (
        <p
          key={error}
          class="error"
        >
          {error}
        </p>
      ))}
      <button type="submit">Submit</button>
    </form>
  );
});
```

### Side Effects with useTask$

`useTask$` runs on both server and client. Use `track()` for reactive
dependencies:

```tsx
import { component$, useSignal, useTask$ } from "@builder.io/qwik";

export const UserProfile = component$(() => {
  const userId = useSignal("123");
  const userData = useSignal<{ name: string } | null>(null);

  useTask$(async ({ track }) => {
    const id = track(() => userId.value);
    const response = await fetch(`/api/users/${id}`);
    userData.value = await response.json();
  });

  return (
    <div>
      {userData.value ? <p>{userData.value.name}</p> : <p>Loading...</p>}
    </div>
  );
});
```

### Client-Only Code with useVisibleTask$

`useVisibleTask$` runs **only on the client** when the component becomes
visible:

```tsx
import { component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";

export const Analytics = component$(() => {
  const isVisible = useSignal(false);

  useVisibleTask$(() => {
    // This only runs in the browser
    isVisible.value = true;
    // Initialize analytics, DOM manipulation, etc.
  });

  return <div>{isVisible.value ? "Tracked" : "Not yet tracked"}</div>;
});
```

**Use `useVisibleTask$` sparingly** — it forces eager execution and negates
Qwik's lazy-loading benefits. Prefer `useTask$` with `isServer`/`isBrowser`
checks when possible.

### Computed Values with useComputed$

```tsx
import { component$, useComputed$, useSignal } from "@builder.io/qwik";

export const PriceDisplay = component$(() => {
  const price = useSignal(100);
  const quantity = useSignal(2);

  const total = useComputed$(() => {
    return price.value * quantity.value;
  });

  return <p>Total: ${total.value}</p>;
});
```

### Resource Loading with useResource$

```tsx
import {
  Resource,
  component$,
  useResource$,
  useSignal,
} from "@builder.io/qwik";

export const UserList = component$(() => {
  const page = useSignal(1);

  const usersResource = useResource$(async ({ track }) => {
    const p = track(() => page.value);
    const res = await fetch(`/api/users?page=${p}`);
    return res.json();
  });

  return (
    <Resource
      value={usersResource}
      onPending={() => <p>Loading...</p>}
      onRejected={(error) => <p>Error: {error.message}</p>}
      onResolved={(users) => (
        <ul>
          {users.map((user: { id: string; name: string }) => (
            <li key={user.id}>{user.name}</li>
          ))}
        </ul>
      )}
    />
  );
});
```

## Routing

Scratchy uses Qwik's file-based routing:

```
src/client/routes/
├── layout.tsx             # Root layout (wraps all pages)
├── index.tsx              # Home page (/)
├── about/
│   └── index.tsx          # About page (/about)
├── blog/
│   ├── index.tsx          # Blog list (/blog)
│   └── [slug]/
│       └── index.tsx      # Blog post (/blog/:slug)
└── api/
    └── health/
        └── index.ts       # API endpoint (/api/health)
```

### Layout Component

```tsx
import { Slot, component$ } from "@builder.io/qwik";

export default component$(() => {
  return (
    <div class="app-layout">
      <header>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
        </nav>
      </header>
      <main>
        <Slot />
      </main>
      <footer>© 2026 Scratchy</footer>
    </div>
  );
});
```

### Dynamic Route Parameters

```tsx
import { component$ } from "@builder.io/qwik";
import { useLocation } from "@builder.io/qwik-city";

export default component$(() => {
  const loc = useLocation();
  const slug = loc.params.slug;

  return <h1>Blog Post: {slug}</h1>;
});
```

### Data Loading with routeLoader$

```tsx
import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";

export const useProductData = routeLoader$(async ({ params, status }) => {
  const product = await fetchProduct(params.id);
  if (!product) {
    status(404);
    return null;
  }
  return product;
});

export default component$(() => {
  const product = useProductData();

  if (!product.value) {
    return <p>Product not found</p>;
  }

  return (
    <div>
      <h1>{product.value.name}</h1>
      <p>{product.value.description}</p>
    </div>
  );
});
```

### Form Actions with routeAction$

```tsx
import { component$ } from "@builder.io/qwik";
import { Form, routeAction$, z, zod$ } from "@builder.io/qwik-city";

export const useCreatePost = routeAction$(
  async (data, { fail }) => {
    const result = await createPost(data);
    if (!result.success) {
      return fail(400, { message: "Failed to create post" });
    }
    return { id: result.id };
  },
  zod$({
    title: z.string().min(1),
    content: z.string().min(10),
  }),
);

export default component$(() => {
  const action = useCreatePost();

  return (
    <Form action={action}>
      <input name="title" />
      <textarea name="content" />
      <button type="submit">Create Post</button>
      {action.value?.failed && <p>{action.value.message}</p>}
    </Form>
  );
});
```

## Slots and Composition

### Named Slots

```tsx
import { Slot, component$ } from "@builder.io/qwik";

export const Card = component$(() => {
  return (
    <div class="card">
      <div class="card-header">
        <Slot name="header" />
      </div>
      <div class="card-body">
        <Slot />
      </div>
      <div class="card-footer">
        <Slot name="footer" />
      </div>
    </div>
  );
});
```

```tsx
<Card>
  <div q:slot="header">Title</div>
  <p>Card content goes here</p>
  <div q:slot="footer">
    <button>Action</button>
  </div>
</Card>
```

## Styling with Tailwind CSS

Qwik components use Tailwind CSS classes directly:

```tsx
import { component$ } from "@builder.io/qwik";

export const Alert = component$(
  ({ message, type }: { message: string; type: "info" | "error" }) => {
    const styles = {
      info: "bg-blue-50 text-blue-800 border-blue-200",
      error: "bg-red-50 text-red-800 border-red-200",
    };

    return (
      <div class={`rounded-lg border p-4 ${styles[type]}`}>
        <p>{message}</p>
      </div>
    );
  },
);
```

## Anti-Patterns

### ❌ Don't use useVisibleTask$ for data fetching

```tsx
// BAD — Forces client-side execution
useVisibleTask$(async () => {
  const data = await fetch("/api/data");
  // ...
});

// GOOD — Runs on server during SSR
useTask$(async () => {
  const data = await fetch("/api/data");
  // ...
});

// BEST — Use routeLoader$ for route data
export const useData = routeLoader$(async () => {
  return fetch("/api/data").then((r) => r.json());
});
```

### ❌ Don't close over large objects in $() boundaries

```tsx
// BAD — The entire `bigData` array is serialized
const bigData = [/* thousands of items */];
const handleClick = $(() => {
  console.log(bigData.length);
});

// GOOD — Only capture what you need
const dataLength = bigData.length;
const handleClick = $(() => {
  console.log(dataLength);
});
```

### ❌ Don't mutate signal values directly for objects

```tsx
// BAD — Qwik won't detect the mutation
const state = useStore({ items: [1, 2, 3] });
state.items.push(4); // Mutation not tracked

// GOOD — Reassign to trigger reactivity
state.items = [...state.items, 4];
```

## Reference Links

- [Qwik Documentation](https://qwik.dev/docs/)
- [Qwik City (Routing)](https://qwik.dev/docs/qwikcity/)
- [Qwik React Integration](https://qwik.dev/docs/integrations/react/)
- [Qwik Signals](https://qwik.dev/docs/components/state/)
- [Qwik Lazy Loading](https://qwik.dev/docs/concepts/progressive/)
- [Qwik SSR](https://qwik.dev/docs/guides/ssr/)
