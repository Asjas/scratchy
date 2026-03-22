---
applyTo: "cypress/**"
description: "Cypress E2E test generation instructions for the Scratchy.js docs site"
---

# Cypress E2E Testing Guidelines

The Scratchy.js Cypress suite tests the **VitePress documentation site** served
at `http://localhost:4173`. All specs live in `cypress/e2e/` and target
VitePress-rendered pages and components.

## Test Writing Guidelines

### Code Quality Standards

- **Selectors**: Use VitePress component class names (e.g. `.VPNavBar`,
  `.VPSidebar`, `.VPDocAside`) for layout/structural assertions. Use
  `cy.contains()` for user-facing text. Prefer `data-testid` when available.
- **Assertions**: Use Cypress's built-in assertions which automatically retry.
  Chain assertions with `.should()`.
- **Waits**: Rely on Cypress's automatic waiting. Avoid `cy.wait()` with
  arbitrary timeouts; use `cy.intercept()` for network requests.
- **Clarity**: Use descriptive test titles that clearly state the intent.

### Test Structure

- **Imports**: No imports needed — Cypress commands are globally available.
- **Organization**: Group related tests under `describe()` blocks.
- **Hooks**: Use `beforeEach()` for common setup (e.g., visiting a page).
- **Titles**: Follow naming convention: `Feature - Specific action or scenario`.

### File Organization

- **Location**: `cypress/e2e/`
- **Naming**: `docs-<area>.cy.ts` (e.g. `docs-navigation.cy.ts`,
  `docs-sidebar.cy.ts`)
- **Support**: Custom commands in `cypress/support/commands.ts`

### Assertion Best Practices

- **Visibility**: Use `.should("be.visible")` for elements that must be seen.
- **Text Content**: Use `.should("contain.text", "…")` or
  `.should("have.text", "…")`.
- **URL**: Use `cy.url().should("include", "/path")` for navigation checks.
- **Existence**: Use `.should("exist")` for structural elements that may not be
  in the viewport.
- **Retries**: VitePress pages may take a moment to hydrate. When asserting on
  content that is rendered client-side, use `{ timeout: 8000 }` to give the
  page extra time.

```typescript
// ✅ CORRECT — extra timeout for client-side hydrated content
cy.get("h1", { timeout: 8000 }).should("contain.text", "Getting Started");

// ❌ WRONG — default 4 s may expire before hydration completes
cy.get("h1").should("contain.text", "Getting Started");
```

## VitePress-Specific Patterns

### Key VitePress CSS Classes

| Class               | Element                                    |
| ------------------- | ------------------------------------------ |
| `.VPNavBar`         | Top navigation bar                         |
| `.VPNavBarMenu`     | Nav links section inside the bar           |
| `.VPNavBarSearch`   | Search button in the navbar                |
| `.VPNavBarAppearance` | Theme toggle button                      |
| `.VPNavBarSocialLinks` | Social icon links (GitHub, etc.)        |
| `.VPSidebar`        | Left sidebar                               |
| `.VPDocAside`       | Right table-of-contents sidebar            |

### Page Navigation

Always start from a known page in `beforeEach`, then navigate from there:

```typescript
describe("Docs site navigation", () => {
  beforeEach(() => {
    cy.visit("/getting-started");
  });

  it("navigates to the Changelog page", () => {
    cy.get(".VPNavBarMenu").contains("a", "Changelog").click();
    cy.url().should("include", "/changelog");
    cy.get("h1").should("contain.text", "Changelog");
  });
});
```

### Theme Toggle

VitePress stores the theme preference in `localStorage` under the key
`vitepress-theme-appearance`. Seed it in `beforeEach` to start tests from a
known state:

```typescript
beforeEach(() => {
  cy.visit("/getting-started", {
    onBeforeLoad(win) {
      win.localStorage.setItem("vitepress-theme-appearance", "light");
    },
  });
});
```

## Scope of Tests

Scratchy docs specs are intentionally **broad, not fine-grained**. Each spec
verifies page existence, structural elements, navigation, and theme behaviour.
Do **not** add unit-style assertions (e.g., checking exact word counts or
asserting on individual code-block tokens).

| Spec file              | What it verifies                                |
| ---------------------- | ----------------------------------------------- |
| `docs-layout.cy.ts`    | Navbar icons, search, sidebar, table of contents |
| `docs-navigation.cy.ts`| Top-level nav links load the correct pages      |
| `docs-sidebar.cy.ts`   | Sidebar sections exist and link to correct pages |
| `docs-theme.cy.ts`     | Light/dark mode toggle, persistence in localStorage |

## Test Execution

### Mandatory Local Workflow

Build the docs first, then start the preview server before running tests:

```bash
pnpm docs:build
pnpm docs:preview &   # runs in background on http://localhost:4173
pnpm cy:run:docs      # runs all specs headless
```

Or open the interactive runner:

```bash
pnpm docs:build
pnpm docs:preview &
pnpm cy:open
```

Run only a single spec during development:

```bash
pnpm exec cypress run --spec "cypress/e2e/docs-navigation.cy.ts" --browser chrome
```

Do **not** run the full suite for targeted validation — run only the changed
spec.

### CI/CD

Cypress E2E tests run in `.github/workflows/docs-cypress.yml` when
`docs/**`, `CHANGELOG.md`, or `cypress/**` files change. The workflow:

1. Builds the VitePress site (`pnpm docs:build`)
2. Starts the preview server (`pnpm docs:preview`)
3. Waits for `http://localhost:4173` to be ready (`wait-on`)
4. Runs `pnpm cy:run:docs --browser chrome`

### Known Failure Modes (Do Not Repeat)

- **Empty CHANGELOG.md** — `docs/changelog.md` uses `<!--@include: ../CHANGELOG.md-->`. When `CHANGELOG.md` is empty or has no `# Changelog` heading, the `/changelog` VitePress page renders with no `h1`, causing `cy.get("h1").should("contain.text", "Changelog")` to time out. Keep the git-cliff header (`# Changelog\n\nAll notable changes…`) in `CHANGELOG.md` at all times.

## Example Test Structure

```typescript
/**
 * Docs site — navigation and page existence tests.
 */
describe("Docs site navigation", () => {
  beforeEach(() => {
    cy.visit("/getting-started");
  });

  it("loads the Getting Started page", () => {
    cy.url().should("include", "/getting-started");
    cy.get("h1").should("exist");
  });

  it("has a navbar with the site title", () => {
    cy.get(".VPNavBar").should("exist");
    cy.get(".VPNavBar").should("contain.text", "Scratchy.js Framework");
  });

  it("navigates to the Changelog page", () => {
    cy.get(".VPNavBarMenu").contains("a", "Changelog").click();
    cy.url().should("include", "/changelog");
    cy.get("h1").should("contain.text", "Changelog");
  });
});
```

## Quality Checklist

Before finalising tests:

- [ ] Selectors target stable VitePress class names or user-visible text
- [ ] Tests are independent and do not rely on execution order
- [ ] No arbitrary `cy.wait()` calls with millisecond values
- [ ] Tests follow the broad-not-fine-grained scope rule
- [ ] `beforeEach` visits a known starting page
- [ ] Spec is run locally against a built preview before committing
