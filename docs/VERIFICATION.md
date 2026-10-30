# Verification record

## 29 October 2026

The maintenance update brings the saved local development source into the repository with its regression tests and documentation. The original 63 changed/new source files were compared with SHA-256 hashes before the documentation work. Personal environment files and installed dependencies were excluded.

| Check | Result |
| --- | --- |
| Local Node unit/regression tests | 64 passed, 0 failed, 0 skipped |
| ESLint, TypeScript and static/PWA asset checks | Passed |
| Production build | Passed |
| Dependency audit after the Vite/transitive updates | No reported vulnerabilities |
| GitHub CI on Node 22 and Node 24 | Passed |
| GitHub Playwright job on Linux | Passed |
| CodeQL / JavaScript and TypeScript checks | Passed |
| Vercel preview deployment | Passed |

The full remote checks above passed on functional commit `1ae63be89e946751fbea4e0d2b9713c5de0f0794` in [CI run 40802477765](https://github.com/aalpargu/multiplife/actions/runs/40802477765). The later documentation update does not change application behavior. Configured skipped scenarios are not treated as completed tests.

The CI failures encountered while preparing this update led to three fixes: current Vite/transitive packages, wrapping page headings on narrow screens, and rejecting Windows absolute-path syntax in the companion server on every host OS. The first full Windows browser run had Firefox process-launch and WebKit failures; the completed Linux CI run is the evidence for the configured remote browser matrix.

## Separate acceptance checks

- Development browser scenarios and production-preview/offline PWA scenarios are separate commands.
- Live Gemini, Supabase, Web Push and physical-device synchronization need their own acceptance checks.
- A successful companion-server write verifies a local backup, not the Google Drive desktop application's later remote upload.
- The README screenshot is an existing illustration and may show an earlier interface.
