---
name: tailwindcss-styling
description: "Guides TailwindCSS styling patterns and configuration within the Scratchy framework. Use when styling Qwik or React components, configuring Tailwind, creating reusable style patterns, or implementing responsive and dark mode designs. Trigger terms: Tailwind, CSS, styling, utility classes, responsive, dark mode, theme, design system."
metadata:
  tags: tailwindcss, css, styling, design, responsive, dark-mode
applyTo: "**/*.css,**/*.tsx"
---

# Tailwind CSS in Scratchy

## When to Use

Use Tailwind CSS as the primary styling approach in Scratchy:

- All component styling uses Tailwind utility classes
- Custom CSS is minimized — use Tailwind's configuration for theming
- Responsive design via Tailwind breakpoint prefixes
- Dark mode via the `dark:` variant

## Setup

### Installation with Vite

```typescript
// vite.config.ts
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    // ... other plugins
    tailwindcss(),
  ],
});
```

### CSS Entry Point

```css
/* src/global.css */
@import "tailwindcss";
```

### Tailwind Configuration

```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          900: "#0c4a6e",
        },
        accent: {
          500: "#8b5cf6",
          600: "#7c3aed",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

## Component Styling Patterns

### Basic Component

```tsx
import { component$ } from "@builder.io/qwik";

export const Button = component$(({
  variant = "primary",
  size = "md",
  children,
}: {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  children: any;
}) => {
  const baseStyles = "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2";

  const variants = {
    primary: "bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500",
    ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-500",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <button class={`${baseStyles} ${variants[variant]} ${sizes[size]}`}>
      {children}
    </button>
  );
});
```

### Responsive Design

```tsx
<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {items.map((item) => (
    <div key={item.id} class="rounded-lg border border-gray-200 p-4">
      <h3 class="text-lg font-semibold sm:text-xl">{item.title}</h3>
      <p class="mt-2 text-sm text-gray-600 lg:text-base">{item.description}</p>
    </div>
  ))}
</div>
```

### Dark Mode

```tsx
<div class="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
  <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Title</h1>
  <p class="text-gray-600 dark:text-gray-400">Description</p>
  <button class="bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-400">
    Action
  </button>
</div>
```

### Common Layout Patterns

#### Page Container

```tsx
<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
  {/* Content */}
</div>
```

#### Card

```tsx
<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
  <div class="px-6 py-4">
    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Card Title</h3>
    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Card description</p>
  </div>
</div>
```

#### Stack Layout

```tsx
{/* Vertical stack with gap */}
<div class="flex flex-col gap-4">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

{/* Horizontal stack with gap */}
<div class="flex items-center gap-3">
  <span>Label</span>
  <span>Value</span>
</div>
```

### Form Styling

```tsx
<form class="space-y-6">
  <div>
    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
      Email
    </label>
    <input
      type="email"
      class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm
             focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500
             dark:border-gray-600 dark:bg-gray-800 dark:text-white"
    />
  </div>
  <button
    type="submit"
    class="w-full rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700
           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
  >
    Submit
  </button>
</form>
```

## Animation Patterns

```tsx
{/* Fade in */}
<div class="animate-in fade-in duration-300">Content</div>

{/* Hover scale */}
<div class="transition-transform hover:scale-105">Hover me</div>

{/* Skeleton loading */}
<div class="animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700 h-4 w-3/4" />
```

## Best Practices

1. **Use Tailwind utilities directly** — avoid `@apply` in CSS files
2. **Extract components, not classes** — create reusable components instead of
   custom CSS classes
3. **Use semantic color names** — `primary-600` instead of `blue-600` for
   theming flexibility
4. **Mobile-first** — write base styles for mobile, use `sm:`, `md:`, `lg:`
   for larger screens
5. **Consistent spacing** — stick to the spacing scale (4, 6, 8, etc.)
6. **Accessibility** — always include `focus:` styles and sufficient color
   contrast

## Anti-Patterns

### ❌ Don't use @apply extensively

```css
/* BAD */
.btn-primary {
  @apply inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-white;
}

/* GOOD — Create a component instead */
```

### ❌ Don't use arbitrary values when a scale value exists

```tsx
{/* BAD */}
<div class="p-[17px] mt-[23px]">

{/* GOOD */}
<div class="p-4 mt-6">
```

## Reference Links

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Tailwind CSS with Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Tailwind CSS Dark Mode](https://tailwindcss.com/docs/dark-mode)
- [Tailwind CSS Responsive Design](https://tailwindcss.com/docs/responsive-design)
- [Tailwind CSS Configuration](https://tailwindcss.com/docs/configuration)
