(() => {
  "use strict";
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  const isEntry = /(^|\/)index\.html?$/.test(path) && !path.includes("/platform/");
  const isMainMarket = /(^|\/)market\.html$/.test(path) && !params.has("store_id") && !params.has("view") && !params.has("id");
  if (isEntry || isMainMarket) return;

  const fallback = () => {
    if (/(^|\/)(store|favorites)\.html$/.test(path) || /(^|\/)customer-profile\.html$/.test(path)) return "/market.html";
    if (/(^|\/)merchant-profile\.html$/.test(path)) return "/seller.html";
    if (path.includes("/platform") || path.endsWith("/platform.html") || path.endsWith("/admin.html")) return "/index.html";
    if (/(^|\/)seller\.html$/.test(path)) return "/market.html";
    return "/market.html";
  };

  const style = document.createElement("style");
  style.textContent = ".bben-back-button{position:fixed;left:18px;bottom:22px;z-index:1000;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:10px 16px;border:1px solid #a7f3d0;border-radius:999px;background:#047857;color:#fff;box-shadow:0 5px 18px rgba(6,78,59,.18);font:600 13px/1.2 'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;cursor:pointer}.bben-back-button:hover{background:#065f46}.bben-back-button:focus-visible{outline:3px solid #6ee7b7;outline-offset:3px}@media(max-width:700px){.bben-back-button{left:12px;bottom:82px;min-height:42px;padding:9px 13px}}@media(prefers-reduced-motion:reduce){.bben-back-button{transition:none}}";
  document.head.append(style);

  const button = document.createElement("button");
  button.className = "bben-back-button";
  button.type = "button";
  const english = document.documentElement.lang === "en";
  button.setAttribute("aria-label", english ? "Go back" : "الرجوع إلى الصفحة السابقة");
  button.innerHTML = '<span aria-hidden="true">↩</span><span>' + (english ? "Back" : "رجوع") + "</span>";
  button.addEventListener("click", () => {
    let previous = null;
    try { if (document.referrer) previous = new URL(document.referrer); } catch {}
    if (previous && previous.origin === location.origin && previous.href !== location.href && history.length > 1) {
      history.back();
      return;
    }
    location.assign(fallback());
  });
  document.body.append(button);
})();