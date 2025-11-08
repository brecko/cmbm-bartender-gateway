#!/bin/bash

# Bartender Gateway Integration Test
# Tests the full flow from user message → MCP context → Ollama → MCP storage

echo "======================================"
echo "Bartender Gateway Integration Test"
echo "======================================"
echo ""

# Configuration
GATEWAY_URL="http://localhost:8000"
FAMILY_ID="test-family-001"
USER_ID="test-user-001"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to run a test
run_test() {
    local test_name="$1"
    local endpoint="$2"
    local method="${3:-GET}"
    local data="$4"
    
    echo -n "Testing: $test_name ... "
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$GATEWAY_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" "$GATEWAY_URL$endpoint")
    fi
    
    # Extract HTTP status code (last line)
    status_code=$(echo "$response" | tail -n1)
    # Extract response body (all but last line)
    body=$(echo "$response" | head -n-1)
    
    if [ "$status_code" -ge 200 ] && [ "$status_code" -lt 300 ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $status_code)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        
        # Pretty print JSON response if jq is available
        if command -v jq &> /dev/null; then
            echo "$body" | jq '.' 2>/dev/null || echo "$body"
        else
            echo "$body"
        fi
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $status_code)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo "Response: $body"
    fi
    
    echo ""
}

# Test 1: Health Check
echo "=== Test 1: Health Check ==="
run_test "Gateway Health Check" "/health"

# Test 2: Ollama Health Check
echo "=== Test 2: Ollama Health Check ==="
run_test "Ollama Service Health" "/api/ollama/health"

# Test 3: LLM Info
echo "=== Test 3: LLM Information ==="
run_test "LLM Model Info" "/api/llm/info"

# Test 4: Simple Chat Message
echo "=== Test 4: Simple Chat Message ==="
run_test "Basic Chat Response" "/api/chat/message" "POST" '{
  "familyId": "'"$FAMILY_ID"'",
  "userId": "'"$USER_ID"'",
  "message": "Hello! What kind of bartender are you?"
}'

# Test 5: Inventory Query
echo "=== Test 5: Inventory Query ==="
run_test "Inventory Check Query" "/api/chat/message" "POST" '{
  "familyId": "'"$FAMILY_ID"'",
  "userId": "'"$USER_ID"'",
  "message": "Do I have any vodka in stock?"
}'

# Test 6: Recipe Query
echo "=== Test 6: Recipe Query ==="
run_test "Recipe Recommendation" "/api/chat/message" "POST" '{
  "familyId": "'"$FAMILY_ID"'",
  "userId": "'"$USER_ID"'",
  "message": "What cocktails can I make with vodka and lime juice?"
}'

# Test 7: Conversation Continuity (with sessionId)
echo "=== Test 7: Conversation Continuity ==="
SESSION_ID="session_test_$(date +%s)"
run_test "First message in session" "/api/chat/message" "POST" '{
  "familyId": "'"$FAMILY_ID"'",
  "userId": "'"$USER_ID"'",
  "sessionId": "'"$SESSION_ID"'",
  "message": "I love margaritas"
}'

run_test "Follow-up message in session" "/api/chat/message" "POST" '{
  "familyId": "'"$FAMILY_ID"'",
  "userId": "'"$USER_ID"'",
  "sessionId": "'"$SESSION_ID"'",
  "message": "Can you suggest a variation?"
}'

# Test 8: Get Chat Sessions
echo "=== Test 8: Get Chat Sessions ==="
run_test "Retrieve Sessions" "/api/chat/sessions?familyId=$FAMILY_ID"

# Summary
echo "======================================"
echo "Test Summary"
echo "======================================"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
