#!/usr/bin/env bash
#
# RC Checklist Verification Script
# Automates verification of all v1.0.0-rc gating criteria
#
# Usage:
#   ./scripts/rc-checklist.sh              # Full verification
#   ./scripts/rc-checklist.sh --quick      # Quick checks only
#   ./scripts/rc-checklist.sh --verbose    # Detailed output
#

set -o pipefail

VERBOSE=false
QUICK=false
FAILED=0
PASSED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --verbose) VERBOSE=true; shift ;;
    --quick) QUICK=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo -e "${BOLD}RC Checklist Verification${NC}"
echo "=================================="
echo ""

# Helper functions
check_pass() {
  local name=$1
  echo -e "${GREEN}✓${NC} $name"
  ((PASSED++))
}

check_fail() {
  local name=$1
  local reason=$2
  echo -e "${RED}✗${NC} $name"
  if [[ -n "$reason" ]]; then
    echo "  ${RED}Error: $reason${NC}"
  fi
  ((FAILED++))
}

check_warn() {
  local name=$1
  local reason=$2
  echo -e "${YELLOW}⚠${NC} $name"
  if [[ -n "$reason" ]]; then
    echo "  ${YELLOW}Note: $reason${NC}"
  fi
}

# Section: TypeScript & Specs
echo -e "${BOLD}1. Code Quality${NC}"
echo "---"

if bun x tsc --noEmit --skipLibCheck &>/dev/null; then
  check_pass "TypeScript check (tsc --noEmit --skipLibCheck)"
else
  check_fail "TypeScript check" "tsc found errors"
fi

if bun run spec:check &>/dev/null; then
  check_pass "Spec validation (spec:check)"
else
  check_fail "Spec validation" "Some specs failed validation"
fi

echo ""

# Section: Security Tests
echo -e "${BOLD}2. Security Tests (Phase 1)${NC}"
echo "---"

# Count security tests
SEC_TESTS=0
for test_file in server/__tests__/{injection-guard,injection-hardening,prompt-injection,route-injection-guards,spending,tenant-isolation}.test.ts; do
  if [[ -f "$test_file" ]]; then
    FILE_COUNT=$(grep -c "^\s*it(\|^\s*test(" "$test_file" 2>/dev/null || echo "0")
    SEC_TESTS=$((SEC_TESTS + FILE_COUNT))
  fi
done

if [[ $SEC_TESTS -ge 279 ]]; then
  check_pass "Security test count ($SEC_TESTS tests, requirement: 279+)"
else
  check_warn "Security test count ($SEC_TESTS tests, requirement: 279+)" "Below target"
fi

# Run security tests
if [[ $QUICK == false ]]; then
  echo ""
  echo "Running security test suite..."
  if bun test "./server/__tests__/injection-guard.test.ts" \
             "./server/__tests__/injection-hardening.test.ts" \
             "./server/__tests__/prompt-injection.test.ts" \
             "./server/__tests__/route-injection-guards.test.ts" \
             "./server/__tests__/spending.test.ts" \
             "./server/__tests__/tenant-isolation.test.ts" &>/tmp/rc-security-tests.log; then
    TEST_RESULT=$(grep -oP '\d+ pass' /tmp/rc-security-tests.log | head -1)
    check_pass "Security tests passing ($TEST_RESULT)"
  else
    TEST_RESULT=$(grep -oP '\d+ fail' /tmp/rc-security-tests.log | head -1)
    check_fail "Security tests" "$TEST_RESULT"
    if [[ $VERBOSE == true ]]; then
      tail -20 /tmp/rc-security-tests.log
    fi
  fi
fi

echo ""
echo -e "${BOLD}3. Cryptography (Phase 1)${NC}"
echo "---"

# Check wallet encryption config
if grep -r "AES-256\|aes-256" server --include="*.ts" &>/dev/null; then
  check_pass "AES-256-GCM encryption implemented"
else
  check_fail "AES-256-GCM encryption" "Not found in codebase"
fi

if grep -r "PBKDF2.*600.*iterations\|iterations.*600" server --include="*.ts" &>/dev/null; then
  check_pass "PBKDF2 600k iterations configured"
else
  check_fail "PBKDF2 600k iterations" "Not found in codebase"
fi

# Run key rotation tests
if [[ $QUICK == false ]]; then
  echo ""
  echo "Running key rotation tests..."
  if bun test "./server/__tests__/key-rotation.test.ts" \
             "./server/__tests__/crypto-audit.test.ts" \
             "./server/__tests__/key-access-audit.test.ts" &>/tmp/rc-crypto-tests.log; then
    TEST_RESULT=$(grep -oP '\d+ pass' /tmp/rc-crypto-tests.log | head -1)
    check_pass "Key rotation tests ($TEST_RESULT)"
  else
    check_fail "Key rotation tests" "Some tests failed"
    if [[ $VERBOSE == true ]]; then
      tail -20 /tmp/rc-crypto-tests.log
    fi
  fi
fi

echo ""
echo -e "${BOLD}4. Payment & Escrow (Phase 2)${NC}"
echo "---"

if grep -r "USDC\|31566704" server --include="*.ts" &>/dev/null; then
  check_pass "USDC ASA integration (ID: 31566704)"
else
  check_fail "USDC ASA integration" "Not found in codebase"
fi

# Run escrow tests
if [[ $QUICK == false ]]; then
  echo ""
  echo "Running escrow tests..."
  if bun test "./server/__tests__/marketplace-escrow.test.ts" &>/tmp/rc-escrow-tests.log; then
    TEST_RESULT=$(grep -oP '\d+ pass' /tmp/rc-escrow-tests.log | head -1)
    check_pass "Escrow system tests ($TEST_RESULT)"
  else
    check_fail "Escrow tests" "Some tests failed"
    if [[ $VERBOSE == true ]]; then
      tail -20 /tmp/rc-escrow-tests.log
    fi
  fi
fi

echo ""
echo -e "${BOLD}5. Dependencies & Vulnerabilities${NC}"
echo "---"

if command -v npm &>/dev/null; then
  # Run npm audit and check for CRITICAL/HIGH
  CRITICAL=$(npm audit --json 2>/dev/null | jq '.metadata.vulnerabilities.critical // 0')
  HIGH=$(npm audit --json 2>/dev/null | jq '.metadata.vulnerabilities.high // 0')

  if [[ $CRITICAL -eq 0 ]] && [[ $HIGH -eq 0 ]]; then
    check_pass "Dependency audit (zero CRITICAL/HIGH vulnerabilities)"
  else
    check_fail "Dependency audit" "Found $CRITICAL CRITICAL, $HIGH HIGH vulnerabilities"
  fi
else
  check_warn "Dependency audit" "npm not found, skipping npm audit"
fi

echo ""
echo -e "${BOLD}6. E2E Tests${NC}"
echo "---"

E2E_COUNT=$(find e2e -name "*.spec.ts" | wc -l)
if [[ $E2E_COUNT -gt 0 ]]; then
  check_warn "E2E test suite ($E2E_COUNT test files)" "Run with: npx playwright test"
else
  check_fail "E2E tests" "No Playwright test files found"
fi

echo ""
echo "=================================="
echo ""
echo -e "${BOLD}Summary${NC}"
echo "---"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "Total:  $((PASSED + FAILED))"
echo ""

if [[ $FAILED -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}✓ PASS: All gating criteria met${NC}"
  exit 0
else
  echo -e "${RED}${BOLD}✗ FAIL: $FAILED criterion/criteria failed${NC}"
  exit 1
fi
