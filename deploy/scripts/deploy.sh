#!/bin/bash
set -euo pipefail

PROJECT_DIR="/data/project/aigateway-agent"
COMPOSE_FILE="deploy/docker/docker-compose.prod.yml"

echo "========================================="
echo "  AIGateway-Agent Deploy"
echo "========================================="

cd "$PROJECT_DIR"

echo ""
echo "[1] Stopping existing services (if any)..."
docker compose -f "$COMPOSE_FILE" --env-file .env down 2>/dev/null || true

echo ""
echo "[2] Building and starting services..."
docker compose -f "$COMPOSE_FILE" --env-file .env up --build -d

echo ""
echo "[3] Waiting for services to start..."
echo "  Watching container status..."

# Wait up to 3 minutes for all services to be running
for i in $(seq 1 36); do
  sleep 5
  RUNNING=$(docker compose -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -c '"running"' || echo "0")
  TOTAL=$(docker compose -f "$COMPOSE_FILE" ps --format json 2>/dev/null | wc -l | tr -d ' ')
  echo "  [$((i*5))s] Running: $RUNNING / $TOTAL"

  if [ "$RUNNING" -eq "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
    echo "  All services are running!"
    break
  fi

  if [ "$i" -eq 36 ]; then
    echo "  WARNING: Timeout waiting for services. Checking status..."
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    echo "  Showing logs for unhealthy services..."
    docker compose -f "$COMPOSE_FILE" logs --tail=50
  fi
done

echo ""
echo "[4] Service status:"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "========================================="
echo "  Deploy complete!"
echo "========================================="
