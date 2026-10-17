# FoodBridge

Food donation and redistribution app built with React, TypeScript, Vite, and Supabase.

## Prerequisites

- Node.js
- npm
- Docker
- Make

## Getting started

Clone the repository and enter the project directory:

```bash
git clone <repository-url>
cd share-a-meal-web
```

Install dependencies, start local Supabase, seed the database, and generate the local environment and account files:

```bash
make setup
```

Start the full development stack:

```bash
make dev
```

The app is available at `http://127.0.0.1:8080/`. Run `make backend-status` to view the local Supabase URLs.

Development account credentials are stored in `dev.md`. Seed data is sourced from `supabase/seed-data.json`.

## Development flow

```bash
make setup          # First-time installation and database setup
make dev            # Start the backend, seed data, and run the frontend
make check          # Run lint, tests, and the production build
make backend-stop   # Stop local Supabase
```

Run `make help` to list every available command:

```bash
make help
```

Use `make seed` to reseed the local database or `make db-reset` to reset and reseed it. Run `make dev-accounts` to regenerate `dev.md` from `supabase/seed-data.json`.

## Environment

`make seed` generates `.env.local` for local Supabase. Use `example.env` as the variable template when configuring another environment.

## Branding

Update `APP_NAME` and `BRAND_COLOR` in `src/config/brand.ts` to rebrand the application.
