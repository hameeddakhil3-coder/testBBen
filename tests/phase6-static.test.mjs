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
  assert.ok(script.includes("customer-profile"), "fallback should cover the customer profile route");
});

test("all inner pages include shared back navigation", async () => {
  const pages = [
    "../favorites.html",
    "../store.html",
    "../seller.html",
    "../merchant-profile.html",
    "../customer-profile.html",
    "../platform.html",
    "../platform/index.html",
  ];
  for (const page of pages) {
    assert.match(await read(page), /navigation-back\.js/, `missing shared back navigation in ${page}`);
  }
});


test("service worker keeps offline navigation fallback and bypasses non-GET, cross-origin, auth, and API requests", async () => {
  const worker = await read("../sw.js");
  assert.match(worker, /if\s*\(request\.method\s*!==\s*"GET"\)\s*return/);
  assert.match(worker, /if\s*\(url\.origin\s*!==\s*self\.location\.origin\)\s*return/);
  assert.match(worker, /url\.pathname\.startsWith\("\/auth\/"\)\s*\|\|\s*url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /if\s*\(request\.mode\s*===\s*"navigate"\)/);
  assert.match(worker, /caches\.match\(request\)/);
  assert.match(worker, /caches\.match\("\/offline\.html"\)/);
  assert.match(worker, /status:\s*503/);
});


test("notification links only allow the expected order routes", async () => {
  const market = await read("../market.js");
  const seller = await read("../seller.js");
  assert.match(market, /function safeNotificationTarget\(value\).*market\\\.html\\\?order_id=/);
  assert.match(seller, /seller\\\.html\\\?view=orders&order_id=/);
});


test("service worker does not cache private app pages or query-specific navigation URLs", async () => {
  const worker = await read("../sw.js");
  assert.match(worker, /const VERSION = "bben-pwa-v2"/);
  for (const path of ["/seller.html", "/merchant-profile.html", "/customer-profile.html", "/platform.html"]) assert.ok(worker.includes(`"${path}"`));
  assert.match(worker, /function isPrivateNavigation\(pathname\)/);
  assert.match(worker, /!url\.search && !isPrivateNavigation\(url\.pathname\)/);
});


test("checkout and customer cancellation delegate sensitive mutations to guarded database RPCs", async () => {
  const market = await read("../market.js");
  const checkoutStart = market.indexOf("async function submitCheckout");
  const checkoutEnd = market.indexOf("async function initMarket", checkoutStart);
  assert.ok(checkoutStart >= 0 && checkoutEnd > checkoutStart, "checkout handler should be present");
  const checkout = market.slice(checkoutStart, checkoutEnd);
  assert.match(checkout, /db\.rpc\("checkout_cart"/);
  assert.doesNotMatch(checkout, /\.from\("orders"\)\s*\.insert/);
  const cancelStart = market.indexOf("async function cancelCustomerOrder");
  const cancelEnd = market.indexOf("async function openOrderHistory", cancelStart);
  assert.ok(cancelStart >= 0 && cancelEnd > cancelStart, "customer cancellation handler should be present");
  assert.match(market.slice(cancelStart, cancelEnd), /db\.rpc\("cancel_customer_order"/);
});

test("customer order history and merchant order lists include client-side ownership/store scoping", async () => {
  const market = await read("../market.js");
  const seller = await read("../seller.js");
  const customerStart = market.indexOf("async function loadOrderHistory");
  const customerEnd = market.indexOf("async function cancelCustomerOrder", customerStart);
  assert.ok(customerStart >= 0 && customerEnd > customerStart);
  assert.match(market.slice(customerStart, customerEnd), /\.eq\("customer_id",\s*currentUser\.id\)/);
  const merchantStart = seller.indexOf("async function loadMerchantOrders");
  const merchantEnd = seller.indexOf("async function updateMerchantOrderStatus", merchantStart);
  assert.ok(merchantStart >= 0 && merchantEnd > merchantStart);
  assert.match(seller.slice(merchantStart, merchantEnd), /\.eq\("order_items\.store_id",\s*currentStore\.id\)/);
});

test("campaign targets reject external and script URLs before navigation", async () => {
  const market = await read("../market.js");
  const platform = await read("../platform.js");
  assert.match(market, /function safeCampaignTarget\(value\)[\s\S]*?\^\(\?:https\?:\)\?\\\/\\\//);
  assert.match(market, /function safeCampaignTarget\(value\)[\s\S]*?javascript:/);
  assert.match(platform, /function safeCampaignTargetAdmin\(value\)[\s\S]*?target\.includes\(":"\)/);
});
