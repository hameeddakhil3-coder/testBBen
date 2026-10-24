import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("PWA manifest is valid and declares installable PNG icons", async () => {
  const manifest = JSON.parse(await read("../manifest.webmanifest"));
  assert.ok(manifest.name);
  assert.ok(manifest.start_url);
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.type === "image/png"));
  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\/icons\/.+\.png$/);
    assert.ok(icon.purpose);
  }
});

test("PWA assets are linked from the buyer entry page and service worker registration", async () => {
  const html = await read("../index.html");
  const registration = await read("../pwa-register.js");
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /pwa-register\.js/);
  assert.match(registration, /sw\.js/);
});

test("seller commission RPC migration restricts access to authenticated users", async () => {
  const sql = await read("../supabase/migrations/20261023123000_expose_platform_commission_rate_to_sellers.sql");
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.get_platform_commission_rate\s*\(\)/i);
  assert.match(sql, /security\s+definer/i);
  assert.match(sql, /set\s+search_path\s*=\s*public/i);
  assert.match(sql, /revoke\s+all\s+on\s+function[\s\S]*from\s+public\s*,\s*anon/i);
  assert.match(sql, /grant\s+execute\s+on\s+function[\s\S]*to\s+authenticated/i);
});

test("Cloudflare deployment is not triggered by pushes to the test branch", async () => {
  const workflow = await read("../.github/workflows/deploy-cloudflare.yml");
  assert.match(workflow, /branches:\s*\n\s+-\s+main/);
  assert.doesNotMatch(workflow, /branches:\s*\n(?:\s+-[^\n]*\n)*\s+-\s+test\/phase-3-isolated-validation/);
});

test("static checks workflow runs on the isolated test branch and never deploys", async () => {
  const workflow = await read("../.github/workflows/bben-static-checks.yml");
  assert.match(workflow, /test\/phase-3-isolated-validation/);
  assert.match(workflow, /node --check/);
  assert.match(workflow, /does not deploy or modify any database/i);
});

test("shared back navigation is included on inner pages and has safe fallbacks", async () => {
  const script = await read("../navigation-back.js");
  const market = await read("../market.html");
  const seller = await read("../seller.html");
  const customerProfile = await read("../customer-profile.html");
  assert.match(market, /navigation-back\.js/);
  assert.match(seller, /navigation-back\.js/);
  assert.match(customerProfile, /navigation-back\.js/);
  assert.match(script, /history\.back\(\)/);
  assert.match(script, /location\.assign\(fallback\(\)\)/);
  assert.match(script, /previous\.origin === location\.origin/);
  assert.match(script, /customer-profile\.html/);
});
