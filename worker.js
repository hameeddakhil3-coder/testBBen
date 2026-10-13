export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Normalize only the directory URL; serve /platform.html as its own static asset.
    if (url.pathname === "/platform" || url.pathname === "/platform/") {
      url.pathname = "/platform/index.html";
      return env.ASSETS.fetch(new Request(url, request));
    }

    // Preserve the original path for all other static assets, including /platform.html.
    return env.ASSETS.fetch(request);
  },
};
