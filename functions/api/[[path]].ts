interface Env {
  BACKEND_URL?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const backend = context.env.BACKEND_URL;
  if (!backend) {
    return new Response(
      JSON.stringify({
        error: {
          code: "backend_not_configured",
          message:
            "Backend API URL is not configured. Set BACKEND_URL in Cloudflare Pages environment variables pointing to your hosted Express server.",
        },
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const url = new URL(context.request.url);
  const backendUrl = new URL(backend.endsWith("/") ? backend : `${backend}/`);
  // Ensure the pathname preserves the /api path
  const targetPath = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
  const targetUrl = new URL(targetPath + url.search, backendUrl);

  const reqHeaders = new Headers(context.request.headers);
  reqHeaders.set("X-Forwarded-Host", url.host);
  reqHeaders.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

  return fetch(targetUrl.toString(), {
    method: context.request.method,
    headers: reqHeaders,
    body: context.request.method !== "GET" && context.request.method !== "HEAD" ? context.request.body : undefined,
    redirect: "follow",
  });
};
