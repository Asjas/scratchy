# @scratchyjs/cli

Code-generation CLI for the Scratchy framework. Scaffold Drizzle models, tRPC
routers, Fastify routes, Qwik pages and components, plugins, migrations, seeds,
and tests — all from the command line.

## Installation

```bash
pnpm add -D @scratchyjs/cli
```

Add a script to your `package.json`:

```json
{
  "scripts": {
    "scratchy": "scratchy"
  }
}
```

## Usage

```bash
pnpm scratchy <command> [options]
```

### Scaffolding commands

| Command                                                        | Description                                      |
| -------------------------------------------------------------- | ------------------------------------------------ |
| `make:model <Name> [--columns "col:type,..."] [--with-router]` | Drizzle schema, queries, and mutations           |
| `make:router <name>`                                           | tRPC router with `queries.ts` and `mutations.ts` |
| `make:route <path>`                                            | Fastify REST route under `routes/`               |
| `make:component <Name>`                                        | Qwik component                                   |
| `make:page <path>`                                             | Qwik City page route                             |
| `make:plugin <name>`                                           | Fastify plugin                                   |
| `make:scaffold <Name> [--columns "col:type,..."]`              | Full-stack scaffold (model + router + route)     |
| `make:migration <name>`                                        | Empty Drizzle migration file                     |
| `make:seed <name>`                                             | Database seed file                               |
| `make:test <name>`                                             | Vitest test file                                 |

### Database commands

| Command    | Description                                           |
| ---------- | ----------------------------------------------------- |
| `db:seed`  | Run the seed file                                     |
| `db:fresh` | Drop and recreate the database then re-run migrations |

### Utility commands

| Command       | Description                        |
| ------------- | ---------------------------------- |
| `routes:list` | List all registered Fastify routes |
| `cache:clear` | Clear the Scratchy template cache  |

### Examples

```bash
# Generate a Post model with columns
pnpm scratchy make:model Post --columns "title:text,published:boolean"

# Generate a model and its tRPC router in one go
pnpm scratchy make:model Post --columns "title:text" --with-router

# Generate a tRPC router only
pnpm scratchy make:router posts

# Generate a REST route
pnpm scratchy make:route external/api/v1/products

# Generate a Qwik page
pnpm scratchy make:page blog/[slug]

# Full-stack scaffold (schema + router + route)
pnpm scratchy make:scaffold Post --columns "title:text,body:text"
```

## API (programmatic use)

All commands are also exported as functions for use in scripts:

```typescript
import { makeModelCommand, makeRouterCommand } from "@scratchyjs/cli";
```

Each export is a `citty` command definition that can be composed into your own
CLI.

## Documentation

[https://scratchyjs.com/cli](https://scratchyjs.com/cli)
