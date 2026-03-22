---
name: react-qwik-interop
description:
  "Guides development of React components within the Scratchy framework's Qwik
  rendering layer. Use when creating React components that will be wrapped with
  qwikify$(), building shared component libraries, or integrating React
  ecosystem libraries (e.g., chart libraries, rich text editors) into Qwik
  pages. Trigger terms: React component, qwikify, React in Qwik, useSignal, JSX,
  React interop, React wrapper."
metadata:
  tags: react, qwik, components, interop, jsx, frontend
applyTo: "**/*.tsx"
---

# React in Scratchy (Qwik React Interop)

## When to Use

Use React components in Scratchy when:

- Integrating third-party React libraries that have no Qwik equivalent
- Porting existing React components into a Scratchy application
- Building components that need React-specific hooks or lifecycle methods
- Using React UI libraries (e.g., chart libraries, rich text editors)

**Prefer native Qwik components** whenever possible for better performance and
resumability. Only use React components through `qwikify$()` when necessary.

## Core Pattern — qwikify$()

Wrap React components with `qwikify$()` to use them inside Qwik:

```tsx
/** @jsxImportSource react */
import { qwikify$ } from "@builder.io/qwik-react";

// A standard React component
function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}!</h1>;
}

// Wrap it for use in Qwik
export const QGreeting = qwikify$(Greeting);
```

Use in a Qwik component:

```tsx
import { QGreeting } from "./greeting";
import { component$ } from "@builder.io/qwik";

export default component$(() => {
  return (
    <div>
      <QGreeting name="World" />
    </div>
  );
});
```

## Key Rules

### 1. File-Level JSX Pragma

React component files **must** include the JSX pragma at the top:

```tsx
/** @jsxImportSource react */
```

This tells the bundler to use React's JSX runtime instead of Qwik's.

### 2. Hydration Strategies

Control when React components hydrate using client directives:

```tsx
// Hydrate on idle (default — lazy hydration)
<QChart client:idle />

// Hydrate immediately on load
<QEditor client:load />

// Hydrate when visible in viewport
<QHeavyWidget client:visible />

// Hydrate on user interaction (hover, focus, click)
<QTooltip client:hover />

// Never hydrate (SSR only — static content)
<QStaticBanner client:only />
```

**Guidelines:**

- Use `client:visible` for below-the-fold content
- Use `client:idle` for non-critical interactive components
- Use `client:load` only when immediate interactivity is required
- Use `client:hover` for tooltips, dropdowns, and menus

### 3. Event Handling Between Qwik and React

Pass Qwik signals to React components via props:

```tsx
/** @jsxImportSource react */
import { qwikify$ } from "@builder.io/qwik-react";

interface CounterProps {
  count: number;
  onIncrement: () => void;
}

function Counter({ count, onIncrement }: CounterProps) {
  return <button onClick={onIncrement}>Count: {count}</button>;
}

export const QCounter = qwikify$(Counter, { eagerness: "hover" });
```

```tsx
import { QCounter } from "./counter";
import { $, component$, useSignal } from "@builder.io/qwik";

export default component$(() => {
  const count = useSignal(0);
  const increment = $(() => {
    count.value++;
  });

  return (
    <QCounter
      count={count.value}
      onIncrement={increment}
    />
  );
});
```

### 4. React Hooks in Qwikified Components

React hooks work normally inside qwikified components:

```tsx
/** @jsxImportSource react */
import { qwikify$ } from "@builder.io/qwik-react";
import { useEffect, useState } from "react";

function Timer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return <span>{seconds}s elapsed</span>;
}

export const QTimer = qwikify$(Timer);
```

### 5. React Context Providers

Wrap React context providers at the island level, not the page level:

```tsx
/** @jsxImportSource react */
import { qwikify$ } from "@builder.io/qwik-react";
import { ThemeProvider } from "some-react-lib";

function ThemedWidget({ children }: { children: React.ReactNode }) {
  return <ThemeProvider theme="dark">{children}</ThemeProvider>;
}

export const QThemedWidget = qwikify$(ThemedWidget);
```

## Anti-Patterns

### ❌ Don't use React for simple components

```tsx
// BAD — This should be a Qwik component
/** @jsxImportSource react */
function SimpleButton({ label }: { label: string }) {
  return <button>{label}</button>;
}
export const QSimpleButton = qwikify$(SimpleButton);
```

```tsx
// GOOD — Native Qwik component
import { component$ } from "@builder.io/qwik";

export const SimpleButton = component$(({ label }: { label: string }) => {
  return <button>{label}</button>;
});
```

### ❌ Don't mix JSX runtimes in one file

A file must use either React JSX or Qwik JSX, never both. Split into separate
files.

### ❌ Don't pass Qwik signals directly as React props

```tsx
// BAD — React can't read Qwik signals
<QCounter count={count} />

// GOOD — Read the signal value
<QCounter count={count.value} />
```

## Component File Organization

```
src/client/components/
├── qwik/                  # Pure Qwik components
│   ├── header.tsx
│   └── footer.tsx
├── react/                 # React components (with qwikify$ wrappers)
│   ├── chart.tsx          # React component + qwikify$ export
│   └── editor.tsx
└── shared/                # Shared types and utilities
    └── types.ts
```

## Reference Links

- [Qwik React Integration](https://qwik.dev/docs/integrations/react/)
- [React Documentation](https://react.dev/)
- [qwikify$ API](https://qwik.dev/docs/integrations/react/#qwikify)
- [Hydration Strategies](https://qwik.dev/docs/integrations/react/#client)
