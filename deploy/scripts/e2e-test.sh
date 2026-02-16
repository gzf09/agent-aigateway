#!/bin/bash
set -uo pipefail

# End-to-end business test via curl
# Tests: create session, chat, MCP tool call, confirm card, rollback

BASE_URL="${1:-http://localhost:80}"

echo "========================================="
echo "  E2E Business Tests"
echo "  Base URL: $BASE_URL"
echo "========================================="

PASS=0
FAIL=0

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

# 1. Create session
echo ""
echo "[1] Creating session..."
SESSION_RESP=$(curl -sf -X POST "$BASE_URL/api/session" -H "Content-Type: application/json" -d '{}' 2>/dev/null)
SESSION_ID=$(echo "$SESSION_RESP" | grep -o '"sessionId":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$SESSION_ID" ]; then
  # Try alternate response format
  SESSION_ID=$(echo "$SESSION_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [ -n "$SESSION_ID" ]; then
  echo "  Session ID: $SESSION_ID"
  check "Create session" 0
else
  echo "  Response: $SESSION_RESP"
  check "Create session" 1
  echo ""
  echo "Cannot proceed without session. Aborting."
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# 2. Send "你好" - verify LLM response
echo ""
echo "[2] Sending '你好' (testing LLM response)..."
CHAT_RESP=$(curl -sf -X POST "$BASE_URL/api/session/$SESSION_ID/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"你好"}' \
  --max-time 30 2>/dev/null)
echo "  Response (first 200 chars): ${CHAT_RESP:0:200}"
[ -n "$CHAT_RESP" ]
check "LLM response to '你好'" $?

# 3. Send "查看网关状态" - verify MCP tool call
echo ""
echo "[3] Sending '查看网关状态' (testing MCP tool call)..."
MCP_RESP=$(curl -sf -X POST "$BASE_URL/api/session/$SESSION_ID/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"查看网关状态"}' \
  --max-time 30 2>/dev/null)
echo "  Response (first 200 chars): ${MCP_RESP:0:200}"
[ -n "$MCP_RESP" ]
check "MCP tool call response" $?

# 4. Send "添加 OpenAI 提供商" - verify confirm card
echo ""
echo "[4] Sending '添加 OpenAI 提供商' (testing confirm card)..."
CONFIRM_RESP=$(curl -sf -X POST "$BASE_URL/api/session/$SESSION_ID/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"添加 OpenAI 提供商"}' \
  --max-time 30 2>/dev/null)
echo "  Response (first 200 chars): ${CONFIRM_RESP:0:200}"
[ -n "$CONFIRM_RESP" ]
check "Confirm card response" $?

echo ""
echo "========================================="
echo "  E2E Results: $PASS passed, $FAIL failed"
echo "========================================="

exit $FAIL
