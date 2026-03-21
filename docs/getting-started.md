# Getting Started with Scratchy

## Prerequisites

### Required Software

| Software       | Version               | Installation                                                                   |
| -------------- | --------------------- | ------------------------------------------------------------------------------ |
| **Node.js**    | >= 22.x               | [nodejs.org](https://nodejs.org/) or use `nvm`                                 |
| **pnpm**       | >= 10.x               | `npm install -g pnpm@latest`                                                   |
| **PostgreSQL** | >= 16                 | [postgresql.org](https://www.postgresql.org/download/)                         |
| **Redis**      | >= 7 (or DragonflyDB) | [redis.io](https://redis.io/) or [dragonflydb.io](https://www.dragonflydb.io/) |
| **Git**        | >= 2.x                | [git-scm.com](https://git-scm.com/)                                            |

### Optional but Recommended

| Software           | Purpose                                | Link                                                    |
| ------------------ | -------------------------------------- | ------------------------------------------------------- |
| **Docker**         | Local PostgreSQL and Redis via Compose | [docker.com](https://www.docker.com/)                   |
| **VS Code**        | Recommended editor                     | [code.visualstudio.com](https://code.visualstudio.com/) |
| **GitHub Copilot** | AI coding assistant                    | Uses the `.github/instructions/` files                  |

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Asjas/scratchy.git
cd scratchy
```

### 2. Install Dependencies

```bash
pnpm install --frozen-lockfile
```

### 3. Set Up Environment

```bash
cp .env.example .env
```

Edit `.env` with your local configuration:

```bash
# Database
DATABASE_URL=postgresql://localhost:5432/scratchy
DATABASE_SCHEMA=app

# Redis
REDIS_URL=redis://localhost:6379

# Server
PORT=5000
HOST=0.0.0.0
NODE_ENV=development
```

### 4. Start Infrastructure (Docker)

If using Docker for local development:

```bash
docker compose up -d
```

This starts:

- PostgreSQL on port 5432
- Redis (DragonflyDB) on port 6379

### 5. Run Database Migrations

```bash
pnpm drizzle-kit migrate --config src/drizzle.config.ts
```

### 6. Start Development

```bash
pnpm dev
```

This starts:

- **Fastify server** on `http://localhost:5000`
- **Vite dev server** on `http://localhost:4173` (with API proxying)
- **Worker pool** for SSR/SSG

## Project Setup from Scratch

When starting a new Scratchy project from an empty directory:

### 1. Initialize the Project

```bash
mkdir my-app && cd my-app
pnpm init
```

### 2. Install Core Dependencies

```bash
# Server
pnpm add fastify @fastify/autoload @fastify/cors @fastify/helmet @fastify/rate-limit @fastify/sensible
pnpm add @trpc/server superjson zod
pnpm add drizzle-orm pg
pnpm add piscina fastify-piscina
pnpm add close-with-grace pino ulid

# Client
pnpm add @builder.io/qwik @builder.io/qwik-city
pnpm add @builder.io/qwik-react

# Dev Dependencies
pnpm add -D typescript drizzle-kit
pnpm add -D vite @builder.io/qwik/optimizer @tailwindcss/vite
pnpm add -D fastify-type-provider-zod fastify-print-routes
```

### 3. Configure TypeScript

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noUncheckedIndexedAccess": true,
    "paths": {
      "~/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "drizzle"]
}
```

### 4. Set Up Project Structure

```bash
mkdir -p src/{db/schema,routers,routes,plugins/{app,external},hooks,renderer,client/{components,routes,styles},lib,types}
```

See [project-structure.md](./project-structure.md) for the full directory
layout.

## Common Development Commands

```bash
# Development
pnpm dev                        # Start all services
pnpm dev:server                 # Start server only
pnpm dev:client                 # Start client only

# Validation (run before every commit)
pnpm format && pnpm lint && pnpm typecheck && pnpm build

# Testing
pnpm test                       # Run all tests
pnpm test:server                # Server tests only
pnpm test:client                # Client tests only

# Database
pnpm drizzle-kit generate       # Generate migration from schema changes
pnpm drizzle-kit migrate        # Apply migrations
pnpm drizzle-kit studio         # Open Drizzle Studio (visual DB explorer)

# Build
pnpm build                      # Production build
pnpm preview                    # Preview production build locally

# CLI Scaffolding (future)
pnpm scratchy make:model User
pnpm scratchy make:router users
pnpm scratchy make:route /api/v1/products
pnpm scratchy make:component header
```

## Editor Setup

### VS Code Extensions

Recommended extensions for working with Scratchy:

- **Qwik** — Qwik language support and snippets
- **Tailwind CSS IntelliSense** — Autocomplete for Tailwind classes
- **ESLint** — JavaScript/TypeScript linting
- **Prettier** — Code formatting
- **PostgreSQL** — Database management
- **Thunder Client** — API testing (alternative to Postman)

### VS Code Settings

```jsonc
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
  },
  "typescript.preferences.importModuleSpecifier": "non-relative",
  "tailwindCSS.experimental.classRegex": [
    ["class\\s*=\\s*\"([^\"]*)\"", "([^\"]*)"],
  ],
}
```

## Troubleshooting

### Common Issues

**Port already in use:**

```bash
# Find and kill the process using the port
lsof -i :5000
kill -9 <PID>
```

**Database connection refused:**

- Ensure PostgreSQL is running: `pg_isready`
- Check your `DATABASE_URL` in `.env`
- If using Docker: `docker compose ps` to verify containers are up

**Node.js version mismatch:**

```bash
# Check your version
node --version

# Use nvm to switch
nvm use 22
```

**pnpm not found:**

```bash
npm install -g pnpm@latest
```

**Type errors after pulling changes:**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
```

## Next Steps

- Read the [Architecture Guide](./architecture.md) to understand the system
  design
- Read the [Project Structure Guide](./project-structure.md) for directory
  conventions
- Read the [API Design Guide](./api-design.md) to understand tRPC and REST
  patterns
- Read the [Data Layer Guide](./data-layer.md) to understand database patterns
- Check the [References](./references.md) for links to all external
  documentation
