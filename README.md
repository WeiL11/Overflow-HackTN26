# Overlfow-Hack

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
make ai-server      # Start the photo autofill API (see server/README.md)
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

## Donor photo analysis

The donor form supports camera capture or a JPEG, PNG, or WebP upload up to 5 MB. Selecting a photo runs real backend analysis, shows a description, and suggests an editable food name. OCI can also suggest a visible item count. Donors set availability themselves; photos cannot establish safe expiry, allergens, or food safety.

Photos are resized in the browser and saved to private Supabase storage when a donation is posted. The photo and analysis appear on donor and receiver listings. Authenticated receivers can view attached photos; unattached uploads remain private. If analysis fails, the form shows the error and supports retry, removing the photo, or posting with manual details.

For local Gemini analysis, create `supabase/.env.functions` (git-ignored):

```env
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.5-flash
```

Then run `make dev`. It applies pending migrations, seeds the database, and starts the frontend and configured AI services together. Stop the stack with Ctrl+C. No separate function terminal is needed. Without AI credentials, manual donations still work and startup explains what is missing.

The existing OCI service remains supported: follow [server/README.md](server/README.md) to configure `.env.server`. When present, `make dev` starts it too. The browser tries OCI first, with a 45-second timeout, and falls back to Supabase Gemini. Both services perform real model inference; there is no simulated success response.

For hosted Supabase, apply migrations, set backend secrets, and deploy the function:

```sh
npx supabase db push
npx supabase secrets set GEMINI_API_KEY=your-key GEMINI_MODEL=gemini-2.5-flash
npx supabase functions deploy analyze-food --no-verify-jwt
```

The function validates the bearer token using Supabase Auth and restricts callers to donors. Gateway JWT verification is disabled to support asymmetric Supabase tokens; application authentication remains required. Never expose Gemini keys in `VITE_` variables. See [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding).

To verify local database and storage behavior against seeded accounts:

```sh
node scripts/check-food-flow.mjs
# Include one live AI request (requires the local function to be running):
CHECK_AI=1 node scripts/check-food-flow.mjs
```

This check creates and cleans up a temporary listing/photo, checks stored analysis and receiver access, and verifies that receivers cannot read unattached photos.
