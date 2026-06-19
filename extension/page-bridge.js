(() => {
  "use strict";

  const CHANNEL = "buh-page-api-v1";
  const API_HOST = "https://api.bilibili.com";

  if (window.__biliUnfollowHelperPageBridgeLoaded) return;
  window.__biliUnfollowHelperPageBridgeLoaded = true;

  function getCookieValue(name) {
    const encodedName = `${encodeURIComponent(name)}=`;
    for (const part of document.cookie.split("; ")) {
      if (part.startsWith(encodedName)) {
        return decodeURIComponent(part.slice(encodedName.length));
      }
    }
    return "";
  }

  function withAutoCsrf(body) {
    const csrf = getCookieValue("bili_jct");
    if (!csrf || !body) return body;

    const params = new URLSearchParams(body);
    if (!params.get("csrf") || params.get("csrf") === "__AUTO__") {
      params.set("csrf", csrf);
    }
    if (!params.get("csrf_token") || params.get("csrf_token") === "__AUTO__") {
      params.set("csrf_token", csrf);
    }
    return params.toString();
  }

  async function apiFetch(payload) {
    const url = new URL(payload.url, API_HOST);
    if (url.origin !== API_HOST) {
      throw new Error("Only api.bilibili.com is allowed");
    }

    const controller = new AbortController();
    const timeoutMs = Number(payload.timeoutMs || 15000);
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url.href, {
      method: payload.method || "GET",
      headers: payload.headers || {},
      body: payload.autoCsrf ? withAutoCsrf(payload.body) : payload.body || undefined,
      credentials: "include",
      referrerPolicy: "strict-origin-when-cross-origin",
      signal: controller.signal,
    }).finally(() => window.clearTimeout(timeout));

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return data;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.channel !== CHANNEL || message.direction !== "to-page") {
      return;
    }

    if (message.type === "ping") {
      window.postMessage(
        {
          channel: CHANNEL,
          direction: "from-page",
          id: message.id,
          type: "pong",
          ok: true,
        },
        window.location.origin
      );
      return;
    }

    if (message.type !== "apiFetch") return;

    apiFetch(message.payload || {})
      .then((payload) => {
        window.postMessage(
          {
            channel: CHANNEL,
            direction: "from-page",
            id: message.id,
            type: "apiFetchResult",
            ok: true,
            payload,
          },
          window.location.origin
        );
      })
      .catch((error) => {
        window.postMessage(
          {
            channel: CHANNEL,
            direction: "from-page",
            id: message.id,
            type: "apiFetchResult",
            ok: false,
            error: error?.message || String(error),
          },
          window.location.origin
        );
      });
  });

  window.postMessage(
    {
      channel: CHANNEL,
      direction: "from-page",
      type: "ready",
      ok: true,
    },
    window.location.origin
  );
})();
