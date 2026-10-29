# Verification record

## 29 October 2026 source snapshot

The current uncommitted source from the original development folder was copied into an independent preparation branch. The copy operation compared SHA-256 hashes for all 63 changed/new source files before documentation changes. Personal environment files and installed dependencies were not part of that copy.

`npm run check` passed against that source on Windows:

| Check | Result |
| --- | --- |
| Node unit and regression tests | 64 passed, 0 failed, 0 skipped |
| ESLint | Passed |
| TypeScript | Passed |
| Static assets / PWA document checks | Passed |
| Production build | Passed |

An initial restricted execution failed on temporary-file rename and loopback HTTP permissions. Repeating the same command in the normal local environment passed; application behavior was not changed to suppress those tests.

## Checks tracked separately

The first full Playwright development run on this Windows machine finished with **144 passed, 47 failed and 4 skipped** across 195 cases. All 39 Firefox cases failed at browser launch (`spawn UNKNOWN`). Eight WebKit cases failed: six timed out or could not find the expected UI, and two reported a local-backup access-control error. These results need investigation; the browser matrix has not passed.

GitHub's Linux run at `a5b085b` reached **186 passed, 4 failed and 5 skipped**. Its four failures identified the same narrow-screen heading overflow on the Habits page. The dependency audit also identified vulnerable Vite and source-map-js versions.

The follow-up updates Vite to 8.3.5 and compatible transitive dependencies; `npm audit fix` reports zero vulnerabilities. Mobile page headings can wrap instead of forcing their action button outside the viewport. On the updated source, `npm run check` passes, and the existing narrow-screen scenario passes in desktop and mobile Chromium. The full remote matrix must be checked on the new commit before merging.

- Playwright browser scenarios are separate from `npm run check`.
- Production-preview PWA checks are separate from development-server scenarios.
- Live Gemini/Supabase/Web Push behavior, physical-device sync and actual Google Drive remote upload are separate acceptance checks.
- Existing hosted screenshots are not evidence that this source snapshot has been deployed.

Update this record with actual browser and CI results before making a release-readiness claim.
