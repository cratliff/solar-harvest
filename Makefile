.PHONY: up down restart logs build clean shell-server shell-mongo import-irs

# Start all services (builds if needed)
up:
	docker compose up --build

# Start detached
up-detached:
	docker compose up --build -d

# Stop and remove containers
down:
	docker compose down

# Restart a specific service: make restart svc=server
restart:
	docker compose restart $(svc)

# Rebuild without cache: make build svc=server
build:
	docker compose build --no-cache $(svc)

# Follow logs for all services, or one: make logs svc=client
logs:
	docker compose logs -f $(svc)

# Open a shell in the server container
shell-server:
	docker compose exec server sh

# Open mongosh in the mongo container
shell-mongo:
	docker compose exec mongo mongosh solar_harvest

# Run a full IRS EO BMF import (downloads ~1.9M records)
import-irs:
	docker compose exec server node scripts/import_irs_data.js

# Force re-import even if data is current
import-irs-force:
	docker compose exec server node scripts/import_irs_data.js --force

# Trigger one geocode + solar batch cycle via the API
solar-batch:
	curl -s -X POST http://localhost:3000/api/solar/batch | python3 -m json.tool

# Check import history
import-status:
	curl -s http://localhost:3000/api/imports/latest | python3 -m json.tool

# Remove all containers, volumes, and built images (destructive — wipes DB)
clean:
	docker compose down -v --rmi local
