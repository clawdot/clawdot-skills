# Takeout Personal Agent — Design Spec

**Date:** 2026-03-27
**Goal:** Create a personal-agent version of the takeout skill that uses a direct user token instead of the superagent admin-secret → phone → token authentication chain.

## Strategy

1. Rename `clawdot-takeout/` → `clawdot-takeout-superagent/` (preserving the superagent version unchanged)
2. Copy `clawdot-takeout-superagent/` → `clawdot-takeout/` (the new personal version)
3. Strip multi-user authentication from the personal copy

## What changes in the personal version

### Files to delete

| File | Reason |
|------|--------|
| `src/auth-bridge.ts` | No dynamic token resolution needed |
| `src/phone-resolver.ts` | No phone → token chain |
| `test/auth-bridge.test.ts` | Corresponding test |

### Files to modify

#### `src/config.ts`
- Remove fields: `adminSecret`, `profilesDataDir`
- Add field: `userToken: string`
- Update `parseConfig` and `takeoutConfigSchema` accordingly

#### `openclaw.plugin.json`
- `configSchema.required`: `["apiKey", "userToken"]`
- Remove `adminSecret` / `profilesDataDir` from properties and uiHints
- Add `userToken` property and uiHint

#### `src/gateway-client.ts`
- Remove `adminSecret` from constructor options
- Delete `trustedBind` method
- Remove `admin` option and `X-Admin-Secret` header from `request()`

#### `src/handlers/shared.ts`
- `HandlerDeps`: remove `authBridge` and `userId`, add `userToken: string`

#### All 6 handler files (`search.ts`, `menu.ts`, `address.ts`, `preview.ts`, `order.ts`)
- Replace `await deps.authBridge.requireToken(deps.userId)` → `deps.userToken`
- In `address.ts`: cache keys `addr:${deps.userId}` → `addr:default`

#### `src/index.ts`
- Remove AuthBridge / resolvePhone imports and instantiation
- Pass `userToken: config.userToken` into tool deps instead of authBridge
- Remove `ctx.requesterSenderId` usage

#### `src/tool.ts`
- `TakeoutToolDeps`: remove `authBridge` and `ctx`, add `userToken: string`
- Pass `userToken` into `HandlerDeps`

#### `package.json`
- Remove `test/auth-bridge.test.ts` from test script
- Update package name if desired (keep as `clawdot-takeout`)

#### Test files
- `test/helpers.ts`, `test/tool.test.ts`, `test/handlers/*.test.ts`: replace authBridge mocks with direct `userToken` string
- `test/gateway-client.test.ts`: remove `trustedBind` tests
- `test/config.test.ts`: update assertions for new config shape

### Files unchanged

- `SKILL.md` — LLM interaction guide, auth-agnostic
- `src/trimmer.ts` — pure data transformation
- `src/cache.ts` — generic TTL cache
- `src/types.ts` — type definitions (minor: can remove `AuthError` if unused)
- All handler business logic (search, menu drill-down, preview, order, address management)

## Key design decision

- **No `userId` concept** in the personal version. Cache keys use static prefixes (e.g., `addr:default` or just `addr`). Only one user exists.
