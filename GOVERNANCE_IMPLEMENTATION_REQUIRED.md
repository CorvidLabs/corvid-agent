# Layer 0 Governance: Type Safety Fix in manager.ts

This PR requires human implementation due to Layer 0 (Constitutional) governance restrictions on `server/process/manager.ts`.

## Changes Required

### 1. Import Both Types (Line 2)

**Current:**
```typescript
import type { Session } from '../../shared/types';
```

**Change to:**
```typescript
import type { Session, SessionSource } from '../../shared/types';
import type { ObservationSource } from '../../shared/types';
```

Or more concisely:
```typescript
import type { Session, SessionSource, ObservationSource } from '../../shared/types';
```

### 2. Add Type-Safe Mapping Constant (After imports, ~line 50)

Add this constant after the imports section:

```typescript
const SESSION_TO_OBS_SOURCE: Partial<Record<SessionSource, ObservationSource>> = {
  discord: 'discord',
  telegram: 'telegram',
  algochat: 'algochat',
};
```

### 3. Replace `as any` Cast (Line 1261)

**Current:**
```typescript
sourcePreference: (session.source as any) || undefined,
```

**Change to:**
```typescript
sourcePreference: SESSION_TO_OBS_SOURCE[session.source],
```

## Rationale

- `SessionSource` = `'web' | 'algochat' | 'agent' | 'telegram' | 'discord' | 'slack'`
- `ObservationSource` = `'session' | 'feedback' | 'daily-review' | 'health' | 'pr-outcome' | 'manual' | 'discord' | 'telegram' | 'algochat'`
- Only 3 values overlap: `'discord'`, `'telegram'`, `'algochat'`
- The `Partial<Record<...>>` lookup returns `undefined` for unmapped values (`'web'`, `'agent'`, `'slack'`), preserving existing runtime behavior

## Verification

After implementing these changes, run:

```bash
bun x tsc --noEmit --skipLibCheck  # Type check
bun test                            # Tests
bun run spec:check                  # Spec validation
```

All three must pass.

---

**Note:** This file (`GOVERNANCE_IMPLEMENTATION_REQUIRED.md`) is documentation only and should be deleted after the implementation is complete.
