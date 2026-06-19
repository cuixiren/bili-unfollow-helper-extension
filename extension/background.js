const API_HOST = "https://api.bilibili.com";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "buhApiFetch") return false;

  handleApiFetch(message)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || String(error),
      });
    });

  return true;
});

async function handleApiFetch(message) {
  const url = new URL(message.url, API_HOST);
  if (url.origin !== API_HOST) {
    throw new Error("Only api.bilibili.com is allowed");
  }

  const response = await fetch(url.href, {
    method: message.method || "GET",
    headers: message.headers || {},
    body: message.body || undefined,
    credentials: "include",
    referrer: message.referrer || "https://space.bilibili.com/",
    referrerPolicy: "strict-origin-when-cross-origin",
  });

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
