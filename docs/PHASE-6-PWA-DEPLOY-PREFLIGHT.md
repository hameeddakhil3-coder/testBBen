# BBen — Phase 6 PWA and Deployment Preflight
Date: 2026-10-24
Branch: `test/phase-3-isolated-validation`
Scope: Source review only. No deployment, browser session, or production write was performed.

## Verified from source

### Deployment safety
- Cloudflare deploy workflow is triggered by pushes to `main` or manual workflow dispatch.
- The workflow copies source files into `public/`, generates PNG icons during CI, and bundles the admin dashboard and customer profile into Worker responses.
- Therefore, commits to this test branch alone do not trigger the configured automatic production deployment. Do not manually dispatch the workflow until the intended environment and secrets are verified.

### PWA manifest and icon build
- `manifest.webmanifest` declares `/icons/bben-192.png` and `/icons/bben-512.png`.
- The deploy workflow generates these PNGs during the build, validates their PNG signature, and checks that the files are non-empty.
- The SVG icons are copied from the repository.
- Source review confirms the build steps exist, but cannot establish that the current live deployment serves valid PNG responses or that browser installability succeeds.

### Service worker
- `sw.js` uses a network-first strategy for navigation and falls back to cached pages or `offline.html`.
- Static resources are cache-first with a background network refresh.
- Authentication/API paths beginning `/auth/` and `/api/` are excluded, but the app's actual Supabase calls are generally cross-origin and are already bypassed by the origin check.
- Browser acceptance testing should verify sign-in/out, fresh deploy cache invalidation, offline fallback, and that no personalized data is inadvertently cached in navigations.

## Preflight checks before a release
1. Run the deployment workflow on the intended test environment first; do not point test runs at the production Worker.
2. Confirm build output contains both PNG icons with dimensions exactly 192×192 and 512×512, and verify each has a successful HTTP response and correct content type.
3. Parse the deployed manifest and check icon URLs, scope, and start URL.
4. On mobile Chrome, test fresh install, launch, update after service-worker version change, offline fallback, and login/logout.
5. Verify the admin and customer bundled pages contain the latest matching CSS/JS after the workflow inlines them.
6. Check all critical routes return expected status codes: home, store, customer profile, merchant profile, market, admin, manifest, service worker, and offline page.

## Result
Build-time checks exist for required files and PNG signatures. Live PWA behavior remains unverified. No production deployment or data change was made.
