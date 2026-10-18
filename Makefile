.PHONY: help install setup frontend open ai-server backend backend-stop backend-status db-reset seed dev-accounts typecheck test build check production-build production-run dev migrate

IMAGE ?= overflow-web
PORT ?= 8080

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install npm dependencies
	npm install

typecheck: ## Run the TypeScript compiler
	npm run typecheck

test: ## Run the test suite
	npm test

build: ## Build the production frontend
	npm run build

setup: install backend migrate seed ## Install dependencies, start the backend, apply migrations, and seed data

frontend: ## Start the frontend development server
	npm run dev -- --host 127.0.0.1

open: ## Open the local UI in the default browser
	open http://127.0.0.1:8080/

ai-server: ## Start the photo autofill API (needs ~/.oci/config and .env.server)
	npm run ai-server

backend: ## Start the local Supabase backend
	npx supabase start

backend-stop: ## Stop the local Supabase backend
	npx supabase stop

backend-status: ## Show local Supabase service status
	npx supabase status

db-reset: ## Reset and reseed the local database
	npx supabase db reset
	node scripts/seed.mjs

seed: ## Seed local users, listings, and requests
	node scripts/seed.mjs

dev-accounts: ## Generate the local development account guide
	node scripts/generate-dev-accounts.mjs

check: ## Run typecheck, lint, tests, and the production build
	npm run check

production-build: ## Build the production Docker image (requires VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY)
	@test -n "$(VITE_SUPABASE_URL)" || (echo "VITE_SUPABASE_URL is required" && exit 1)
	@test -n "$(VITE_SUPABASE_PUBLISHABLE_KEY)" || (echo "VITE_SUPABASE_PUBLISHABLE_KEY is required" && exit 1)
	docker build --build-arg VITE_SUPABASE_URL="$(VITE_SUPABASE_URL)" --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="$(VITE_SUPABASE_PUBLISHABLE_KEY)" -t "$(IMAGE)" .

production-run: ## Run the production Docker image
	docker run --rm -p "$(PORT):8080" "$(IMAGE)"

migrate: ## Apply pending local database migrations
	npx supabase migration up

dev: backend migrate seed ## Start the database, configured AI services, and frontend
	node scripts/dev.mjs
