# Architecture and engineering decisions

## Local records and optional services

Multiplife is a React application whose everyday records live in IndexedDB. UI components use domain helpers and hooks under `src/lib` and `src/hooks`; optional services are integrated around that state rather than required for the basic timer/task workflow.

| Area | Source | Responsibility |
| --- | --- | --- |
| Application composition | `src/App.tsx` | Connects state, navigation and feature components. |
| Focus/session domain | `src/lib/focusTiming.ts`, `src/lib/todos.ts` | Recorded time and task/session relationships. |
| Durable local state | `src/lib/stateStore.ts`, `src/lib/durableBackup.ts`, `src/lib/backupStore.ts` | Saved state and recovery paths. |
| Cloud synchronization | `src/hooks/useCloudSync.ts`, `supabase/` | Optional authentication, revision conflicts and account-scoped storage. |
| Browser folder backup | `src/lib/externalBackup.ts` | Permission-based external file writes. |
| Local companion | `serve.cjs`, `src/lib/localServerBackup.ts` | Local HTTP delivery and desktop backup integration. |
| PWA lifecycle | `scripts/service-worker.mjs` | Versioned assets, offline navigation and notification handling. |

## Decisions and tradeoffs

### Store locally before synchronizing

An account is optional. Local persistence supports the daily workflow without requiring a provider round trip. Snapshots, validated imports, exports and external backups complement IndexedDB rather than assuming browser storage is permanent.

### Detect conflicting cloud writes

The first account connection asks which copy to keep. Later writes include a revision so a stale client can detect a conflict instead of silently replacing newer cloud data. Development tests simulate races; live two-device behavior is a separate acceptance check.

### Separate recorded time from planned work

A timer session, a task and a daily summary represent different things. Domain helpers preserve task identity and account for session splits across day boundaries. Reports use saved records rather than equating a planned block with completed productive work.

### Keep the AI provider behind an authenticated function

Gemini interprets a selected screen-time image through a server-side function. The browser does not receive a provider secret. The feature is an API integration; its presence does not establish a measured extraction accuracy.

### Treat external backup as a separate durability boundary

The local companion writes backup files and verifies the saved content. Google Drive for desktop handles remote transfer. Browser folder access uses user permission and has a different support matrix. Local write success and cloud upload success must be described separately.

### Keep application and PWA releases aligned

The service-worker implementation fingerprints release content and limits cache cleanup to Multiplife caches. Notification navigation remains within the application origin. Regression tests cover these boundaries without treating a successful build as proof of all browser update paths.

## Verification map

`tests/` covers domain calculations, task carryover, backups, local HTTP boundaries, reminder endpoints and service-worker behavior. `e2e/` covers interface workflows in Playwright. GitHub Actions runs checks on pull requests; results should be associated with the source revision being reviewed.

## Name-change compatibility

The product is now **Multiplife** and uses the slogan **Multiply Your Life**. Browser databases, saved preferences, backup format identifiers and existing directory permissions retain their original internal identifiers so an upgrade can still open existing records and backups. New downloads and backup files use `multiplife-` names. The local companion accepts `MULTIPLIFE_*` configuration variables and also accepts existing `MOMENTUM_*` variables; it reuses an existing local secret directory or Drive backup folder. The service worker removes obsolete caches under both names while preserving the active release and unrelated applications. The existing hosted URL remains supported so browser records stay available on their original origin.
