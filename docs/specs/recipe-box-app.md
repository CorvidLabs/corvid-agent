# Recipe Box — Product & Technical Specification

## Overview

Recipe Box solves the universal frustration of finding a recipe online and having to scroll past 2,000 words of blog narrative, life stories, and SEO filler just to reach the ingredient list. Users paste a URL, Recipe Box extracts the structured recipe data, and saves it in a clean, searchable personal collection.

The product targets anyone who cooks — a market of hundreds of millions of people. It monetizes through a freemium subscription model and grocery affiliate integrations.

---

## Core Features (MVP)

### 1. URL Paste to Recipe Extraction

The primary interaction. User pastes a recipe URL into the app, and Recipe Box extracts structured data:

- **Title**
- **Ingredients** (with quantities, units, and grouping — e.g., "For the sauce")
- **Steps** (ordered instructions)
- **Prep time / Cook time / Total time**
- **Servings** (yield)
- **Image** (hero photo from the recipe page)
- **Source URL** (always preserved for attribution)

Extraction happens server-side. The user sees a preview of the extracted recipe and can edit any field before saving.

### 2. Manual Recipe Entry

Full recipe editor for entering recipes from scratch — handwritten cards, cookbooks, or memory. Same structured fields as extracted recipes. Support for:

- Adding/removing/reordering ingredient groups
- Adding/removing/reordering steps
- Optional image upload
- Prep/cook time and serving count

### 3. Save and Organize Recipes

- **Tags:** User-defined tags (e.g., "weeknight", "gluten-free", "holiday"). Multiple tags per recipe.
- **Collections:** Named folders for grouping recipes (e.g., "Thanksgiving 2026", "Meal Prep Rotation"). A recipe can belong to multiple collections.
- **Notes:** Free-text personal notes on any recipe (substitutions, tips, "kids liked this").

### 4. Search Saved Recipes

- Search by recipe title (fuzzy matching)
- Search by ingredient name ("what recipes use tahini?")
- Filter by tag
- Filter by collection
- Sort by date added, title, cook time

### 5. Ingredient Scaling

User changes the serving count and all ingredient quantities recalculate proportionally. Scaling logic handles:

- Whole numbers, fractions, and decimals
- Rational rounding (don't show "0.6667 cups" — show "2/3 cup")
- Range quantities ("2-3 cloves" scales to "4-6 cloves" at 2x)
- "To taste" and non-numeric quantities remain unchanged

### 6. Shopping List Generation

- Generate a shopping list from a single recipe or multiple selected recipes
- Ingredients are consolidated and deduplicated across recipes (e.g., two recipes each needing 1 cup flour become 2 cups flour)
- Unit normalization during consolidation (e.g., 4 tbsp + 1/4 cup = 1/2 cup)
- Items can be checked off, removed, or manually added
- Shopping lists persist and can be renamed

### 7. User Accounts

- Email/password registration and login
- Google OAuth
- Apple OAuth (required for iOS App Store)
- Password reset via email
- Account deletion (GDPR/CCPA compliance)

---

## Pro Features (Post-MVP)

### Meal Planning

Weekly calendar view. Drag and drop recipes into breakfast/lunch/dinner/snack slots for each day. Auto-generate a consolidated shopping list from the full week's meal plan.

### Nutritional Information

Auto-calculated from ingredients using a nutrition database (USDA FoodData Central API or similar). Display per-serving: calories, protein, carbs, fat, fiber, sodium. Shown on recipe detail view; aggregated on meal plan daily view.

### Smart Shopping Lists

Shopping list items grouped by store aisle/category (produce, dairy, pantry, meat, frozen). Grouping is based on ingredient classification, not user input. Supports reordering by store layout preference.

### Export and Print

Clean, print-optimized recipe layout — no ads, no clutter. Export options: PDF, plain text, share link (public read-only URL for a single recipe).

### Family / Shared Collections

Multiple user profiles under one Family plan. Shared collections visible to all family members. Any member can add recipes to shared collections. Shopping lists can be shared in real time.

### Recipe Import from Photos

User uploads a photo of a recipe (cookbook page, handwritten card). OCR extracts text, LLM parses it into structured recipe format. User reviews and edits before saving.

### "What Can I Make?"

User inputs ingredients they have on hand (or maintains a persistent pantry list). App returns saved recipes that can be made with those ingredients, ranked by match percentage. Highlights missing ingredients.

---

## Technical Architecture

### Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend (web) | React + TypeScript | Ecosystem maturity, testing tooling |
| Frontend (mobile) | React Native | Code sharing with web, single team |
| Backend | Node.js with Bun runtime | Fast startup, native TypeScript, good test runner |
| Database | PostgreSQL | Relational integrity for recipes/users/collections, strong full-text search |
| Recipe extraction | Custom service (see below) | Core differentiator, must be controlled in-house |
| Search | PostgreSQL `tsvector` full-text search | Sufficient for MVP scale; upgrade path to Meilisearch or Typesense |
| Auth | Passport.js (local + Google + Apple strategies) | Battle-tested, flexible |
| File storage | S3-compatible (Cloudflare R2 or AWS S3) | Recipe images, user uploads |
| Infrastructure | Docker Compose (local dev), Fly.io or Railway (production) | Simple deployment, good free tiers for early stage |
| CI/CD | GitHub Actions | PR checks, E2E test suite, automated deployments |

### API Design

RESTful JSON API. All endpoints under `/api/v1/`.

Key resource endpoints:

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/oauth/google
POST   /api/v1/auth/oauth/apple
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
DELETE /api/v1/auth/account

POST   /api/v1/recipes/extract     — URL in, structured recipe preview out
GET    /api/v1/recipes              — list/search user's recipes
POST   /api/v1/recipes              — save new recipe
GET    /api/v1/recipes/:id
PUT    /api/v1/recipes/:id
DELETE /api/v1/recipes/:id
POST   /api/v1/recipes/:id/scale   — { servings: N } → scaled ingredients

GET    /api/v1/collections
POST   /api/v1/collections
PUT    /api/v1/collections/:id
DELETE /api/v1/collections/:id
POST   /api/v1/collections/:id/recipes
DELETE /api/v1/collections/:id/recipes/:recipeId

GET    /api/v1/tags
POST   /api/v1/tags
DELETE /api/v1/tags/:id

GET    /api/v1/shopping-lists
POST   /api/v1/shopping-lists
GET    /api/v1/shopping-lists/:id
PUT    /api/v1/shopping-lists/:id
DELETE /api/v1/shopping-lists/:id
PATCH  /api/v1/shopping-lists/:id/items/:itemId  — toggle checked, update qty

POST   /api/v1/meal-plans           — (Pro)
GET    /api/v1/meal-plans?week=YYYY-WW
PUT    /api/v1/meal-plans/:id
DELETE /api/v1/meal-plans/:id
```

### Frontend Architecture

- **State management:** Zustand (lightweight, testable)
- **Data fetching:** TanStack Query (caching, optimistic updates, offline support)
- **Routing:** React Router v7
- **Styling:** Tailwind CSS
- **Component library:** Radix UI primitives + custom design system
- **Forms:** React Hook Form + Zod validation

---

## Data Model

### Entity Relationship

```
users 1──* recipes
users 1──* collections
users 1──* shopping_lists
users 1──* meal_plans
recipes 1──* ingredients
recipes 1──* steps
recipes *──* tags (via recipe_tags)
recipes *──* collections (via collection_recipes)
shopping_lists 1──* shopping_list_items
meal_plans *──1 recipes
```

### Table Definitions

```sql
-- Users
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    password_hash   TEXT,                           -- null for OAuth-only users
    tier            TEXT NOT NULL DEFAULT 'free',    -- 'free', 'pro', 'family'
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recipes
CREATE TABLE recipes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    source_url      TEXT,                           -- null for manual entries
    image_url       TEXT,
    prep_time_min   INTEGER,                        -- minutes
    cook_time_min   INTEGER,
    total_time_min  INTEGER,
    servings        INTEGER,
    servings_label  TEXT,                            -- e.g., "cookies", "servings", "loaves"
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_recipes_user_id ON recipes(user_id);
CREATE INDEX idx_recipes_search ON recipes USING gin(
    to_tsvector('english', title || ' ' || COALESCE(description, ''))
);

-- Ingredients
CREATE TABLE ingredients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    quantity        NUMERIC,                        -- null for "to taste" etc.
    quantity_max    NUMERIC,                        -- for ranges like "2-3"
    unit            TEXT,                            -- null for unitless ("3 eggs")
    group_name      TEXT,                            -- e.g., "For the sauce"
    sort_order      INTEGER NOT NULL DEFAULT 0,
    raw_text        TEXT NOT NULL                    -- original extracted text, always preserved
);
CREATE INDEX idx_ingredients_recipe_id ON ingredients(recipe_id);
CREATE INDEX idx_ingredients_name ON ingredients USING gin(
    to_tsvector('english', name)
);

-- Steps
CREATE TABLE steps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    text            TEXT NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_steps_recipe_id ON steps(recipe_id);

-- Tags
CREATE TABLE tags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    UNIQUE(user_id, name)
);

-- Recipe Tags (junction)
CREATE TABLE recipe_tags (
    recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    tag_id          UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, tag_id)
);

-- Collections
CREATE TABLE collections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    is_shared       BOOLEAN NOT NULL DEFAULT false,  -- Family plan feature
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Collection Recipes (junction)
CREATE TABLE collection_recipes (
    collection_id   UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, recipe_id)
);

-- Shopping Lists
CREATE TABLE shopping_lists (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shopping List Items
CREATE TABLE shopping_list_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id         UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    ingredient_name TEXT NOT NULL,
    quantity        NUMERIC,
    unit            TEXT,
    checked         BOOLEAN NOT NULL DEFAULT false,
    recipe_id       UUID REFERENCES recipes(id) ON DELETE SET NULL,  -- source recipe
    aisle_category  TEXT,                            -- Pro: "produce", "dairy", etc.
    sort_order      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_shopping_list_items_list_id ON shopping_list_items(list_id);

-- Meal Plans (Pro)
CREATE TABLE meal_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date            DATE NOT NULL,
    meal_type       TEXT NOT NULL,                   -- 'breakfast', 'lunch', 'dinner', 'snack'
    recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    servings        INTEGER,                         -- override recipe default servings
    UNIQUE(user_id, date, meal_type, recipe_id)
);
CREATE INDEX idx_meal_plans_user_date ON meal_plans(user_id, date);
```

---

## Recipe Extraction Strategy

### Pipeline

```
URL → Fetch → Parse Structured Data → Fallback Extraction → Normalize → Preview → User Edit → Save
```

### Step 1: Fetch Page HTML

- Server-side HTTP GET with a standard browser User-Agent
- Follow redirects (up to 5 hops)
- Timeout after 10 seconds
- Reject non-HTML content types
- Sanitize HTML (DOMPurify or equivalent) before parsing

### Step 2: Parse JSON-LD (Primary Strategy)

Most food blogs embed `<script type="application/ld+json">` with `@type: "Recipe"` following [Schema.org/Recipe](https://schema.org/Recipe). This covers an estimated 80%+ of recipe sites (WordPress recipe plugins like WP Recipe Maker, Tasty, Yoast all generate this).

Extract:
- `name` → title
- `recipeIngredient[]` → ingredients (parse each string into quantity/unit/name)
- `recipeInstructions[]` → steps (handle both `HowToStep` objects and plain text arrays)
- `prepTime` / `cookTime` / `totalTime` → parse ISO 8601 duration (e.g., `PT30M`)
- `recipeYield` → servings
- `image` → image URL (handle both string and `ImageObject`)
- `description` → recipe description

### Step 3: Parse Microdata / RDFa (Fallback)

Some sites use `itemtype="https://schema.org/Recipe"` with `itemprop` attributes in HTML elements instead of JSON-LD. Parse these using a microdata parser. Same field mapping as Step 2.

### Step 4: Unstructured Extraction (Last Resort)

When no structured data is found:

1. Use a Readability-style algorithm (Mozilla Readability or similar) to extract the main content area, stripping navigation, sidebars, ads, and comments.
2. Send the extracted content to an LLM (GPT-4o-mini or similar — cost-effective for parsing) with a structured prompt:
   - Input: the extracted text content
   - Output: JSON matching the recipe schema (title, ingredients with qty/unit/name, steps, times, servings)
3. Validate the LLM output against the expected schema before accepting it.

This path is more expensive per extraction (LLM API call) and is rate-limited for free-tier users.

### Step 5: Ingredient Parsing

Each raw ingredient string (e.g., "1 1/2 cups all-purpose flour, sifted") is parsed into:

- `quantity`: 1.5
- `unit`: "cups"
- `name`: "all-purpose flour"
- `raw_text`: "1 1/2 cups all-purpose flour, sifted"

Parsing rules:
- Recognize Unicode fractions (1/2 = 0.5, etc.)
- Handle mixed numbers ("1 1/2")
- Recognize common units and abbreviations (tbsp, tsp, oz, lb, g, kg, ml, L, cup, etc.)
- Handle ranges ("2-3 cloves garlic")
- Handle parenthetical clarifications ("1 (15-oz) can black beans")
- Preserve `raw_text` so the user always sees exactly what was on the source page

### Step 6: User Review

After extraction, the user sees a preview of the parsed recipe with all fields editable. They confirm or correct before saving. This feedback loop is critical — no extraction is perfect, and the user is the final authority.

---

## E2E Test Strategy

### Principles

1. **Every feature has at least one E2E test** — no feature ships without a corresponding test.
2. **No live external dependencies in tests** — all HTTP calls to external sites are replaced with fixture files.
3. **Tests are deterministic** — no flakiness from network, timing, or random data.
4. **Tests run fast enough to gate every PR** — target under 5 minutes for the full suite.

### Tools

| Purpose | Tool |
|---------|------|
| Web E2E | Playwright |
| API integration tests | Bun test runner + supertest |
| Unit tests | Bun test runner |
| Coverage | c8 / istanbul |
| CI | GitHub Actions |

### Test Categories

#### Authentication Tests

```
- Sign up with email/password → verify account created, redirected to dashboard
- Sign up with duplicate email → verify error message shown
- Log in with valid credentials → verify session created
- Log in with wrong password → verify error, no session
- Google OAuth flow → verify redirect, callback, session creation
- Apple OAuth flow → verify redirect, callback, session creation
- Forgot password → verify email sent (mock SMTP)
- Reset password with valid token → verify password changed
- Reset password with expired token → verify error
- Delete account → verify user and all data removed
- Access protected route while logged out → verify redirect to login
```

#### Recipe Extraction Tests

```
- Paste URL with JSON-LD Recipe → verify all fields extracted correctly
- Paste URL with microdata Recipe → verify extraction
- Paste URL with no structured data → verify LLM fallback triggered, fields extracted
- Paste URL that returns 404 → verify user-friendly error
- Paste URL that times out → verify timeout error
- Paste non-recipe URL → verify "no recipe found" message
- Paste URL with incomplete recipe data → verify partial extraction, missing fields editable
- Edit extracted fields before saving → verify edits preserved
- Extracted recipe with ingredient groups → verify groups preserved
- Extracted recipe with multiple images → verify primary image selected
```

Each extraction test uses a fixture HTML file committed to the repository — a saved copy of a real recipe page. The HTTP fetch is intercepted in tests and served the fixture file.

**Fixture inventory (minimum):**

| Fixture | Source type | Tests |
|---------|------------|-------|
| `json-ld-standard.html` | JSON-LD with `HowToStep` instructions | Happy path extraction |
| `json-ld-string-instructions.html` | JSON-LD with plain string instructions | Instruction format handling |
| `json-ld-multiple-recipes.html` | Page with 2+ JSON-LD Recipe blocks | Multi-recipe selection |
| `microdata-recipe.html` | Microdata/itemprop markup | Fallback parser |
| `rdfa-recipe.html` | RDFa markup | Fallback parser |
| `no-structured-data.html` | Blog with recipe in prose only | LLM extraction path |
| `missing-fields.html` | JSON-LD with no `prepTime` or `image` | Partial data handling |
| `non-recipe-page.html` | News article, no recipe | Error handling |
| `malformed-json-ld.html` | Broken JSON in script tag | Error resilience |
| `unicode-fractions.html` | Ingredients with Unicode fraction chars | Parsing edge cases |

#### Manual Recipe Entry Tests

```
- Create recipe with all fields filled → verify saved correctly
- Create recipe with only required fields (title, one ingredient, one step) → verify saved
- Add multiple ingredient groups → verify groups and sort order
- Reorder steps via drag-and-drop → verify new order persisted
- Upload recipe image → verify image stored and displayed
- Edit existing recipe → verify changes saved
- Delete recipe → verify removed from all collections and search
```

#### Search and Organization Tests

```
- Search by recipe title → verify matching results returned
- Search by ingredient → verify recipes containing that ingredient returned
- Search with no results → verify empty state shown
- Filter by tag → verify only tagged recipes shown
- Filter by collection → verify only collection recipes shown
- Create collection → verify appears in sidebar
- Add recipe to collection → verify recipe appears in collection view
- Remove recipe from collection → verify removed (recipe itself not deleted)
- Create tag → verify available for tagging
- Tag recipe → verify tag association
- Remove tag from recipe → verify removed
- Delete tag → verify removed from all recipes
```

#### Ingredient Scaling Tests

```
- Scale 4 servings to 8 → verify all quantities doubled
- Scale 4 servings to 2 → verify all quantities halved
- Scale 4 servings to 6 → verify correct 1.5x multiplier
- Scale recipe with fractions (1/2 cup) → verify correct display (3/4 cup at 1.5x)
- Scale recipe with ranges (2-3 cloves) → verify range scaled (4-6 at 2x)
- Scale "to taste" ingredient → verify unchanged
- Scale ingredient with no quantity → verify unchanged
- Scale to 1 serving → verify correct division
- Reset to original servings → verify original quantities restored
```

#### Shopping List Tests

```
- Generate shopping list from single recipe → verify all ingredients appear
- Generate from multiple recipes → verify combined list
- Deduplication: two recipes with "1 cup flour" each → verify "2 cups flour"
- Unit normalization: "4 tbsp butter" + "1/4 cup butter" → verify "1/2 cup butter"
- Check off item → verify checked state persisted
- Uncheck item → verify unchecked
- Manually add item to shopping list → verify added
- Remove item from shopping list → verify removed
- Rename shopping list → verify name updated
- Delete shopping list → verify removed
```

#### Shopping List Math — Unit Conversion Matrix

These are pure unit tests but critical to get right:

```
- tsp → tbsp (3 tsp = 1 tbsp)
- tbsp → cup (16 tbsp = 1 cup)
- cup → cup (additive)
- oz → lb (16 oz = 1 lb)
- g → kg (1000 g = 1 kg)
- ml → L (1000 ml = 1 L)
- Incompatible units: "2 cups flour" + "100g flour" → kept separate (no volume-to-weight guessing)
- Same ingredient, different units, not convertible → listed separately with note
```

#### Tier/Access Control Tests

```
- Free user at 50 recipe limit → verify save blocked with upgrade prompt
- Free user accessing Pro feature → verify paywall shown
- Pro user accessing all features → verify no restrictions
- Downgrade from Pro → verify recipes retained, Pro features locked
```

#### API Integration Tests

Every API endpoint gets direct integration tests (no browser, just HTTP calls):

```
- All CRUD operations for: recipes, collections, tags, shopping lists
- Auth token validation on protected routes
- Rate limiting on extraction endpoint
- Pagination on list endpoints
- Input validation (missing required fields, invalid types, XSS payloads)
- Authorization (user A cannot access user B's recipes)
```

### Test Infrastructure

- **Database:** Each test suite spins up an isolated PostgreSQL database (or uses transactions that roll back). No shared mutable state between test files.
- **Seeding:** A `seed.ts` module creates deterministic test data: 2 test users, 20 recipes with known titles/ingredients/tags, 3 collections, 1 shopping list.
- **Mocking:** External HTTP calls intercepted via `msw` (Mock Service Worker) for both browser and API tests. LLM calls mocked with deterministic fixture responses.
- **CI configuration:** GitHub Actions workflow runs on every PR:
  1. Lint + type check
  2. Unit tests
  3. API integration tests
  4. Playwright E2E tests (headless Chromium)
  5. Coverage report uploaded as PR comment
- **Coverage targets:** 95%+ line coverage, 100% of user-facing features covered by at least one E2E test.
- **Flakiness policy:** Any test that fails intermittently is quarantined and fixed within 24 hours, not skipped.

---

## Monetization

### Tier Structure

| Feature | Free | Pro ($4/mo) | Family ($8/mo) |
|---------|------|-------------|-----------------|
| Saved recipes | 50 | Unlimited | Unlimited |
| URL extraction | 10/day | Unlimited | Unlimited |
| Manual entry | Unlimited | Unlimited | Unlimited |
| Tags & collections | Yes | Yes | Yes |
| Search | Yes | Yes | Yes |
| Ingredient scaling | Yes | Yes | Yes |
| Shopping lists | 1 active | Unlimited | Unlimited |
| Meal planning | No | Yes | Yes |
| Nutritional info | No | Yes | Yes |
| Smart shopping lists | No | Yes | Yes |
| Export/print | No | Yes | Yes |
| Shared collections | No | No | Yes |
| Family profiles | No | No | Up to 6 |

### Payment Integration

- Stripe for web subscriptions
- Apple IAP for iOS
- Google Play Billing for Android
- Webhook handlers to sync subscription state across platforms

### Affiliate Revenue

Shopping list items link to grocery delivery services:

- "Order on Instacart" button on shopping list view
- "Order on Amazon Fresh" as alternative
- Affiliate links use standard referral programs (Instacart Tastemakers, Amazon Associates)
- Revenue model: 5-10% commission on grocery orders placed through links
- Implementation: match shopping list items to grocery store catalog via API, generate affiliate URLs
- Disclosure: clear "affiliate link" labeling per FTC guidelines

### Future Revenue Streams

- **API access:** Third-party developers can use the recipe extraction engine ($0.01/extraction).
- **Blogger analytics:** Recipe publishers see how many users saved their recipe, driving traffic back to their site (opt-in partnership program).
- **Sponsored suggestions:** "Try this brand of olive oil" contextual suggestions in ingredient lists (clearly labeled as sponsored, Pro users can disable).

---

## Milestones

### Phase 1: Foundation (Weeks 1-2)

- [ ] Project scaffolding: monorepo with `apps/web`, `apps/api`, `packages/shared`
- [ ] Docker Compose setup: PostgreSQL, API server, web dev server
- [ ] Database schema migration tooling (Drizzle ORM or Prisma)
- [ ] Run all migrations, verify schema
- [ ] Auth system: registration, login, password reset, Google OAuth
- [ ] Basic API CRUD: recipes, ingredients, steps
- [ ] API integration test harness with test database
- [ ] CI pipeline: lint, type check, unit tests, integration tests

### Phase 2: Extraction Engine (Weeks 3-4)

- [ ] HTML fetcher with timeout, redirect, and error handling
- [ ] JSON-LD parser for Schema.org Recipe
- [ ] Microdata/RDFa parser
- [ ] Ingredient string parser (quantity, unit, name extraction)
- [ ] LLM fallback for unstructured pages
- [ ] Fixture HTML files for all extraction test cases
- [ ] Full extraction test suite passing
- [ ] `/api/v1/recipes/extract` endpoint live

### Phase 3: Web UI (Weeks 5-6)

- [ ] App shell: navigation, layout, responsive design
- [ ] Auth pages: signup, login, forgot password
- [ ] Dashboard / recipe list view
- [ ] Recipe detail view
- [ ] URL extraction flow (paste → preview → edit → save)
- [ ] Manual recipe entry form
- [ ] Collection management UI
- [ ] Tag management UI
- [ ] Search interface
- [ ] Playwright E2E tests for all UI flows

### Phase 4: Scaling & Shopping (Weeks 7-8)

- [ ] Ingredient scaling logic with rational number display
- [ ] Scaling UI (serving count adjuster on recipe view)
- [ ] Shopping list generation from recipe(s)
- [ ] Ingredient deduplication and unit conversion engine
- [ ] Shopping list management UI (check off, add, remove)
- [ ] Shopping list E2E tests including math edge cases
- [ ] Unit conversion test matrix passing

### Phase 5: Polish & Deploy (Weeks 9-10)

- [ ] Error handling audit: every error path shows a user-friendly message
- [ ] Loading states and skeleton screens
- [ ] Empty states for all views
- [ ] Image optimization pipeline (resize, compress, WebP)
- [ ] Performance audit: lighthouse score > 90
- [ ] Accessibility audit: WCAG 2.1 AA compliance
- [ ] Full E2E test suite passing with 95%+ coverage
- [ ] Production deployment (Fly.io / Railway)
- [ ] Domain setup, SSL, monitoring (Sentry), logging
- [ ] Soft launch to beta users

### Phase 6: Pro & Monetization (Weeks 11-12)

- [ ] Stripe integration: subscription management, webhooks
- [ ] Free tier enforcement (recipe count limit, extraction rate limit)
- [ ] Upgrade/downgrade flows
- [ ] Meal planning calendar UI and API
- [ ] Affiliate link integration on shopping lists
- [ ] Pro feature gate tests
- [ ] Public launch

---

## Open Questions

1. **Offline support:** Should the web app work offline (service worker + local cache)? Adds complexity but high value for cooking (phone in kitchen, spotty wifi).
2. **Recipe sharing:** Should users be able to share a recipe via public link before Family tier? Could drive organic growth.
3. **Import from other apps:** Paprika, AnyList, and similar apps support export. Should we build importers for common formats?
4. **Ingredient database:** Building or licensing a normalized ingredient database (for nutrition, unit conversion, aisle grouping) is a significant effort. Evaluate third-party options (Edamam, Spoonacular) vs. building in-house.
5. **Legal:** Recipe text is generally not copyrightable, but images are. Clarify image usage policy — hotlink vs. download and re-host vs. user uploads only.
