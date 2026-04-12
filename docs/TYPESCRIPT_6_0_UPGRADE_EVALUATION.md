# TypeScript 6.0 Upgrade Evaluation

**Evaluation Date:** March 27, 2026
**Current TypeScript:** 5.9.3 (devDependency)
**Target TypeScript:** 6.0.2 (major version bump)
**Branch:** agent/rook/evaluate-typescript-6-0-upgrade-current-mn8qf3vz-9af22a

## Summary
TypeScript 6.0 is a major version bump from 5.9.3. This evaluation assesses breaking changes and outlines the upgrade path for the corvid-agent project.

## TypeScript 6.0 Key Changes

### Breaking Changes
1. **Node.js minimum version:** TypeScript 6.0 requires Node.js 18.17+
2. **Type narrowing:** Stricter type guards and type narrowing behavior
3. **JSX handling:** Changes to how JSX is processed and typed
4. **Module resolution:** Improvements to ES module resolution with potential compatibility impacts
5. **Decorators:** Finalized support, may require code adjustments if using experimental decorators

### Compatibility Notes
- TypeScript 6.0 should be backward compatible with most well-typed 5.9.3 code
- Projects with strict type checking will likely pass without issues
- Projects relying on loose types or any casts may encounter new errors

## Bundled Dependency Updates

| Package | Current | Target | Notes |
|---------|---------|--------|-------|
| typescript | 5.9.3 | 6.0.2 | Major version - see breaking changes above |
| web-tree-sitter | 0.25.10 | ^0.26.7 | Minor bumps, need to verify API compatibility |
| @anthropic-ai/claude-agent-sdk | (current) | 0.2.85 | Patch/minor bump |
| @modelcontextprotocol/sdk | (current) | 1.28.0 | Patch/minor bump |
| @opentelemetry/* | (current) | Latest patch | Patch bumps |
| @biomejs/biome | (current) | 2.4.9 | Patch/minor bump |

## web-tree-sitter Upgrade (0.25.10 → ^0.26.7)

### Release Notes Analysis Required
Before upgrading web-tree-sitter, the following should be verified:
- [ ] Check v0.26.0 release notes for breaking API changes
- [ ] Verify all tree-sitter parser integrations still work
- [ ] Confirm no changes to initialization or query API
- [ ] Check if any parser grammars need updating

### Known web-tree-sitter Usage
The project uses web-tree-sitter for code analysis and parsing. The codebase should be scanned for:
- Direct parser initialization calls
- Query methods and API usage
- Error handling patterns that might be affected

## Verification Steps

### Before Upgrade
```bash
bun x tsc --noEmit --skipLibCheck
bun test
```

### After Upgrade (package.json changes)
```bash
bun install
bun x tsc --noEmit --skipLibCheck  # Check for type errors
bun test                            # Verify all tests pass
bun run lint                        # Check for linting issues
```

## Recommended Upgrade Path

### Phase 1: TypeScript Only
1. Update typescript from 5.9.3 to 6.0.2
2. Run type checker and fix any new type errors
3. Commit and verify

### Phase 2: Other Dependencies
1. Update routine patch/minor bumps in sequence
2. Verify each step with tests
3. Commit together

### Phase 3: web-tree-sitter
1. Review release notes carefully (0.25.10 → 0.26.7)
2. Update to ^0.26.7 with careful testing
3. Verify all parsing functionality
4. Commit last

## Action Required

**⚠️ GOVERNANCE NOTE:** package.json is a Layer 1 (Structural) file requiring supermajority council vote + human approval.

### Changes Needed in package.json
```json
{
  "devDependencies": {
    "typescript": "6.0.2"
  },
  "dependencies": {
    "web-tree-sitter": "^0.26.7",
    "@anthropic-ai/claude-agent-sdk": "0.2.85",
    "@modelcontextprotocol/sdk": "1.28.0",
    "@biomejs/biome": "2.4.9"
  }
}
```

Additionally, update @opentelemetry/* packages to latest patch versions.

## Next Steps
1. Submit this evaluation to the council for review
2. Upon approval, council will coordinate package.json modifications
3. Run comprehensive type checking and testing
4. Merge with appropriate governance approvals

## Notes
- This evaluation does not modify package.json due to governance restrictions
- TypeScript 6.0 generally represents a stable upgrade path
- The bundled updates should be applied together to maintain dependency consistency
- All changes should be validated with the full test suite before production deployment
