.PHONY: help install setup frontend backend backend-stop backend-status db-reset seed dev-accounts check dev

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install npm dependencies
	npm install

setup: install backend seed ## Install dependencies, start the backend, and seed data

frontend: ## Start the frontend development server
	npm run dev -- --host 127.0.0.1

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

check: ## Run lint, tests, and the production build
	npm run lint && npm test && npm run build

dev: backend seed frontend ## Start the backend, seed data, and run the frontend
