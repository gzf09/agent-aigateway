#!/bin/bash
set -uo pipefail

PROJECT_DIR="/data/project/aigateway-agent"
COMPOSE_FILE="deploy/docker/docker-compose.prod.yml"

cd "$PROJECT_DIR"

PASS=0
FAIL=0
SKIP=0

check() {
  local name="$1"
  local result="$2"
  if [ "$result" -eq 0 ]; then
    echo "  [PASS] $name"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] $name"
    FAIL=$((FAIL+1))
  fi
}

echo "========================================="
echo "  AIGateway-Agent Verification"
echo "========================================="

# --- Basic connectivity ---
echo ""
echo "--- Basic Connectivity ---"

# 1. Redis ping
docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping 2>/dev/null | grep -q PONG
check "Redis ping" $?

# 2. Higress Console API
curl -sf -o /dev/null http://localhost:81 2>/dev/null
check "Higress Console (localhost:81)" $?

# 3. Agent health
docker compose -f "$COMPOSE_FILE" exec -T agent wget -qO- http://localhost:4000/health 2>/dev/null | grep -qi 'ok\|healthy\|alive'
AGENT_HEALTH=$?
if [ $AGENT_HEALTH -ne 0 ]; then
  # Try a simple connectivity check
  docker compose -f "$COMPOSE_FILE" exec -T agent wget -qO- http://localhost:4000/ 2>/dev/null
  AGENT_HEALTH=$?
fi
check "Agent health" $AGENT_HEALTH

# 4. BFF health
docker compose -f "$COMPOSE_FILE" exec -T bff wget -qO- http://localhost:3000/api/session/health 2>/dev/null | grep -qi 'ok\|healthy\|alive'
BFF_HEALTH=$?
if [ $BFF_HEALTH -ne 0 ]; then
  docker compose -f "$COMPOSE_FILE" exec -T bff wget -qO- http://localhost:3000/ 2>/dev/null
  BFF_HEALTH=$?
fi
check "BFF health" $BFF_HEALTH

# 5. Web page
curl -sf -o /dev/null http://localhost:80 2>/dev/null
check "Web page (localhost:80)" $?

# 6. API proxy chain
curl -sf http://localhost:80/api/session/health 2>/dev/null | grep -qi 'ok\|healthy\|alive'
check "API proxy chain (/api/session/health)" $?

# --- External access ---
echo ""
echo "--- External Access ---"

curl -sf -o /dev/null --connect-timeout 5 http://14.116.240.84:51061 2>/dev/null
check "External Web (14.116.240.84:51061)" $?

curl -sf -o /dev/null --connect-timeout 5 http://14.116.240.84:51062 2>/dev/null
check "External Higress Console (14.116.240.84:51062)" $?

curl -sf --connect-timeout 5 http://14.116.240.84:51061/api/session/health 2>/dev/null | grep -qi 'ok\|healthy\|alive'
check "External API proxy (14.116.240.84:51061/api/session/health)" $?

# --- Summary ---
echo ""
echo "========================================="
echo "  Results: $PASS passed, $FAIL failed"
echo "========================================="

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "  Showing container status for debugging:"
  docker compose -f "$COMPOSE_FILE" ps
  echo ""
  echo "  Showing recent logs:"
  docker compose -f "$COMPOSE_FILE" logs --tail=20
fi

exit $FAIL
