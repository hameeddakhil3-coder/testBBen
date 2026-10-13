export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Normalize the admin directory URL to its explicit entry file.
    if (url.pathname === "/platform" || url.pathname === "/platform/") {
      url.pathname = "/platform/index.html";
    }

    // Let Cloudflare's static asset binding serve the requested file.
    return env.ASSETS.fetch(new Request(url, request));
  },
};
