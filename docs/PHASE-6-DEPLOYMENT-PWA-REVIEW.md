# BBen — Phase 6 Static Deployment/PWA Review
Date: 2026-10-24
Branch: `test/phase-3-isolated-validation`
Scope: Read-only source review of the Cloudflare deployment workflow, manifest, service worker, and install registration.
No production changes or deployment performed.

## Findings

### 1. Cloudflare deploy workflow
The workflow is configured to deploy only on pushes to `main` or manual dispatch. The test branch does not automatically deploy through the push trigger, which is a useful safety gate. The build creates `public/icons/bben-192.png` and `public/icons/bben-512.png` from source at deployment time; these PNG files are generated artifacts rather than committed source files.

Before approving a deploy, check the entire workflow for:
- Required files copied into `public/`.
- PNG dimensions and content type, not only PNG signature.
- Worker build output and Wrangler configuration target.
- Cloudflare secrets used only through GitHub Actions secrets; never print them in logs.
- No unexpected deployment from a test branch.

### 2. Manifest
The manifest references the generated PNG paths and defines 192x192 and 512x512 sizes, with the 512 icon marked maskable. The manifest itself is syntactically valid JSON by inspection. Live HTTP responses and actual dimensions have not been verified in a browser, so PWA installability is not yet confirmed.

### 3. Service worker
The service worker:
- Pre-caches `/offline.html`, `/manifest.webmanifest`, and `/icons/bben.svg` during install.
- Uses network-first navigation with cached-page/offline fallback.
- Uses cache-first static resources with background refresh.
- Skips cross-origin requests and non-GET requests.

Acceptance checks still needed:
- Confirm cache install succeeds if any shell URL is missing.
- Confirm stale caches are removed after version change.
- Confirm dynamic authenticated pages do not leak cached private content between accounts. Consider whether authenticated navigations should be excluded from page caching or whether responses should be restricted based on cache-control.
- Confirm cache-first static requests handle network rejection cleanly when no cached response exists.
- Verify actual offline behavior on mobile Chrome and desktop browsers.

### 4. Install button
The install button is created only when `beforeinstallprompt` fires. This event is not guaranteed on every browser or after every visit; the absence of the button alone does not prove the PWA is broken. Test Chrome install criteria, manifest/icon responses, service-worker control, and the browser's own install menu. The handler currently removes the button after resolving `userChoice`, including a dismissed prompt; verify whether the desired UX is to let the user retry later.

## Required acceptance run
1. Deploy only to an approved preview/staging target.
2. Request manifest and both PNG icons and check HTTP status, content type, pixel dimensions, and browser console.
3. Install on Android Chrome when eligible; confirm app name/icon/start URL.
4. Test offline navigation after visiting pages online.
5. Sign in as different test accounts and verify no private page is shown from cache after account switch.
6. Confirm the production deployment workflow did not run.

## Gate
This report is a static source review, not a runtime test. No code has been modified to address these observations. Runtime checks require an approved preview and must not be performed by creating production orders or changing production records.
