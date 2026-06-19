(() => {
  "use strict";

  const APP_ID = "bili-unfollow-helper-root";
  const STORAGE_KEY = "biliUnfollowHelperSettings";
  const PAGE_API_CHANNEL = "buh-page-api-v1";
  const SETTINGS_VERSION = 15;
  const DYNAMIC_FEED_FEATURES = [
    "itemOpusStyle",
    "listOnlyfans",
    "opusBigCover",
    "onlyfansVote",
    "forwardListHidden",
    "decorationCard",
    "commentsNewVersion",
    "onlyfansAssetsV2",
    "ugcDelete",
    "onlyfansQaCard",
    "avatarAutoTheme",
    "sunflowerStyle",
    "cardsEnhance",
    "eva3CardOpus",
    "eva3CardVideo",
    "eva3CardComment",
    "eva3CardUser",
  ].join(",");
  const DEFAULT_SETTINGS = {
    settingsVersion: SETTINGS_VERSION,
    targetName: "账号已注销",
    maxActions: 24,
    apiPageSize: 50,
    apiMaxPages: 30,
    apiPageDelayMinMs: 1200,
    apiPageDelayMaxMs: 3000,
    apiDelayMinMs: 1000,
    apiDelayMaxMs: 1000,
    apiBatchSize: 0,
    apiBatchPauseMinMs: 0,
    apiBatchPauseMaxMs: 0,
    inactiveMonths: 6,
    inactiveCheckLimit: 5000,
    inactiveMaxActions: 24,
    inactiveDelayMinMs: 1000,
    inactiveDelayMaxMs: 1000,
    includeNeverPosted: true,
    includeBannedAccount: false,
    videoCheckDelayMs: 1200,
    scanRounds: 60,
    scrollDelayMs: 1200,
    actionDelayMs: 2200,
    afterClickDelayMs: 800,
    panelLeft: null,
    panelTop: null,
    panelMoved: false,
  };

  if (window.__biliUnfollowHelperLoaded) return;
  window.__biliUnfollowHelperLoaded = true;

  const state = {
    settings: loadSettings(),
    candidates: new Map(),
    isScanning: false,
    isUnfollowing: false,
    stopRequested: false,
    progress: "",
    logs: [],
    collapsed: false,
    settingsOpen: false,
    nameSettingsOpen: false,
    inactiveSettingsOpen: false,
    settingsDraft: null,
    candidateMode: "",
    toast: null,
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let pageBridgeReadyPromise = null;
  let pageBridgeRequestId = 0;
  let toastTimer = 0;

  const normalizeText = (value) =>
    String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const splitVisibleLines = (value) =>
    String(value || "")
      .split(/\r?\n/)
      .map(normalizeText)
      .filter(Boolean);

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const settings = { ...DEFAULT_SETTINGS, ...saved };
      if (saved.settingsVersion !== SETTINGS_VERSION) {
        const oldMaxActions = Number(saved.maxActions);
        const mergedDelayMs = clampNumber(
          saved.apiDelayMaxMs || saved.apiDelayMinMs,
          DEFAULT_SETTINGS.apiDelayMinMs,
          1000,
          120000
        );
        settings.settingsVersion = SETTINGS_VERSION;
        if (!Number.isFinite(oldMaxActions) || oldMaxActions === 20) {
          settings.maxActions = DEFAULT_SETTINGS.maxActions;
        }
        settings.apiDelayMinMs = mergedDelayMs;
        settings.apiDelayMaxMs = mergedDelayMs;
        settings.apiBatchSize = DEFAULT_SETTINGS.apiBatchSize;
        settings.apiBatchPauseMinMs = DEFAULT_SETTINGS.apiBatchPauseMinMs;
        settings.apiBatchPauseMaxMs = DEFAULT_SETTINGS.apiBatchPauseMaxMs;
        if (Number(saved.videoCheckDelayMs) <= 500) {
          settings.videoCheckDelayMs = DEFAULT_SETTINGS.videoCheckDelayMs;
        }
        if (!Number.isFinite(Number(saved.inactiveCheckLimit))) {
          settings.inactiveCheckLimit = DEFAULT_SETTINGS.inactiveCheckLimit;
        }
        if (Number(saved.inactiveCheckLimit) === 200) {
          settings.inactiveCheckLimit = DEFAULT_SETTINGS.inactiveCheckLimit;
        }
        if (!Number.isFinite(Number(saved.inactiveMaxActions))) {
          settings.inactiveMaxActions = DEFAULT_SETTINGS.inactiveMaxActions;
        }
        if (!Number.isFinite(Number(saved.inactiveDelayMinMs))) {
          settings.inactiveDelayMinMs = settings.apiDelayMinMs;
          settings.inactiveDelayMaxMs = settings.apiDelayMaxMs;
        }
        settings.includeNeverPosted = DEFAULT_SETTINGS.includeNeverPosted;
        settings.includeBannedAccount = Boolean(saved.includeBannedAccount);
        if (!saved.panelMoved) {
          settings.panelLeft = DEFAULT_SETTINGS.panelLeft;
          settings.panelTop = DEFAULT_SETTINGS.panelTop;
          settings.panelMoved = false;
        }
      }
      return settings;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    const settings = { ...state.settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function currentSettingsDraft() {
    if (!state.settingsDraft) {
      state.settingsDraft = {
        targetName: state.settings.targetName,
        maxActions: state.settings.maxActions,
        inactiveMonths: state.settings.inactiveMonths,
        inactiveCheckLimit: state.settings.inactiveCheckLimit,
        inactiveMaxActions: state.settings.inactiveMaxActions,
        includeBannedAccount: state.settings.includeBannedAccount,
        nameDelaySeconds: Math.round(apiDelayRange("name").max / 1000),
        inactiveDelaySeconds: Math.round(apiDelayRange("inactive").max / 1000),
      };
    }
    return state.settingsDraft;
  }

  function saveSettingsDraft() {
    try {
      const draft = currentSettingsDraft();
      const nameIntervalSeconds = clampNumber(
        draft.nameDelaySeconds,
        DEFAULT_SETTINGS.apiDelayMinMs / 1000,
        1,
        120
      );
      const inactiveIntervalSeconds = clampNumber(
        draft.inactiveDelaySeconds,
        DEFAULT_SETTINGS.inactiveDelayMinMs / 1000,
        1,
        120
      );

      state.settings.targetName =
        normalizeText(draft.targetName) || DEFAULT_SETTINGS.targetName;
      state.settings.maxActions = clampNumber(
        draft.maxActions,
        DEFAULT_SETTINGS.maxActions,
        1,
        200
      );
      state.settings.inactiveMonths = clampNumber(
        draft.inactiveMonths,
        DEFAULT_SETTINGS.inactiveMonths,
        1,
        36
      );
      state.settings.inactiveCheckLimit = clampNumber(
        draft.inactiveCheckLimit,
        DEFAULT_SETTINGS.inactiveCheckLimit,
        20,
        5000
      );
      state.settings.inactiveMaxActions = clampNumber(
        draft.inactiveMaxActions,
        DEFAULT_SETTINGS.inactiveMaxActions,
        1,
        200
      );
      state.settings.includeBannedAccount = Boolean(draft.includeBannedAccount);
      state.settings.apiDelayMinMs = nameIntervalSeconds * 1000;
      state.settings.apiDelayMaxMs = nameIntervalSeconds * 1000;
      state.settings.inactiveDelayMinMs = inactiveIntervalSeconds * 1000;
      state.settings.inactiveDelayMaxMs = inactiveIntervalSeconds * 1000;
      state.settingsDraft = null;
      saveSettings();
      state.nameSettingsOpen = false;
      state.inactiveSettingsOpen = false;
      state.candidates.clear();
      showToast("保存设置成功", "success");
      renderApp();
      addLog("保存设置成功。", "info");
    } catch (error) {
      showToast("保存设置失败", "warn");
      addLog(`保存设置失败：${error?.message || "未知错误"}`, "warn");
    }
  }

  function showToast(message, type = "success") {
    window.clearTimeout(toastTimer);
    state.toast = {
      message,
      type,
    };

    const root = document.getElementById(APP_ID);
    renderToast(root);

    toastTimer = window.setTimeout(() => {
      state.toast = null;
      renderToast(document.getElementById(APP_ID));
    }, 2000);
  }

  function renderToast(root = document.getElementById(APP_ID)) {
    if (!root) return;
    root.querySelector(".buh-toast")?.remove();
    if (!state.toast) return;

    const toast = document.createElement("div");
    toast.className = `buh-toast is-${state.toast.type}`;
    toast.textContent = state.toast.message;
    root.append(toast);
  }

  function clampPanelPosition(left, top, root = document.getElementById(APP_ID)) {
    const rect = root?.getBoundingClientRect();
    const width = rect?.width || 340;
    const height = rect?.height || 120;
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    return {
      left: Math.min(maxLeft, Math.max(margin, Math.round(Number(left) || margin))),
      top: Math.min(maxTop, Math.max(margin, Math.round(Number(top) || margin))),
    };
  }

  function keepPanelInViewport(root = document.getElementById(APP_ID)) {
    if (!root) return;
    if (!state.settings.panelMoved) {
      root.style.maxHeight = "";
      return;
    }

    root.style.maxHeight = "calc(100vh - 16px)";
    const position = clampPanelPosition(
      state.settings.panelLeft,
      state.settings.panelTop,
      root
    );
    state.settings.panelLeft = position.left;
    state.settings.panelTop = position.top;
    root.style.left = `${position.left}px`;
    root.style.top = `${position.top}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
    root.style.maxHeight = `${Math.max(160, window.innerHeight - position.top - 8)}px`;
  }

  function applyPanelPosition(root) {
    if (
      state.settings.panelMoved &&
      Number.isFinite(Number(state.settings.panelLeft)) &&
      Number.isFinite(Number(state.settings.panelTop))
    ) {
      const position = clampPanelPosition(
        state.settings.panelLeft,
        state.settings.panelTop,
        root
      );
      root.style.left = `${position.left}px`;
      root.style.top = `${position.top}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
      root.style.maxHeight = "calc(100vh - 16px)";
    } else {
      root.style.left = "";
      root.style.top = "";
      root.style.right = "";
      root.style.bottom = "";
      root.style.maxHeight = "";
    }
  }

  function makePanelDraggable(root, header) {
    let dragState = null;

    header.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest("button, input, a, textarea, select")) return;

      const rect = root.getBoundingClientRect();
      dragState = {
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
      };
      root.classList.add("is-dragging");
      header.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    header.addEventListener("pointermove", (event) => {
      if (!dragState) return;
      const position = clampPanelPosition(
        dragState.startLeft + event.clientX - dragState.startX,
        dragState.startTop + event.clientY - dragState.startY,
        root
      );
      root.style.left = `${position.left}px`;
      root.style.top = `${position.top}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
      event.preventDefault();
    });

    function finishDrag(event) {
      if (!dragState) return;
      const rect = root.getBoundingClientRect();
      const position = clampPanelPosition(rect.left, rect.top, root);
      state.settings.panelLeft = position.left;
      state.settings.panelTop = position.top;
      state.settings.panelMoved = true;
      saveSettings();
      root.classList.remove("is-dragging");
      header.releasePointerCapture?.(event.pointerId);
      dragState = null;
    }

    header.addEventListener("pointerup", finishDrag);
    header.addEventListener("pointercancel", finishDrag);
  }

  function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function isFollowPage() {
    return (
      location.hostname === "space.bilibili.com" &&
      (/\/fans\/follow(?:\/|$)/.test(location.pathname) ||
        /\/relation\/follow(?:\/|$)/.test(location.pathname))
    );
  }

  function isVisible(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isDisabled(element) {
    return (
      element.disabled ||
      element.getAttribute("aria-disabled") === "true" ||
      element.classList.contains("disabled")
    );
  }

  function elementText(element) {
    return normalizeText(element?.innerText || element?.textContent || "");
  }

  function exactTextMatches(element, texts) {
    const text = elementText(element);
    return texts.includes(text);
  }

  function extractMidFromHref(href) {
    const match = String(href || "").match(/space\.bilibili\.com\/(\d+)/);
    return match ? match[1] : "";
  }

  function maskId(value) {
    const text = String(value || "");
    if (!text) return "";
    if (text.length <= 4) return "*".repeat(text.length);
    return `${text.slice(0, 2)}***${text.slice(-2)}`;
  }

  function getCurrentSpaceMid() {
    const match = location.pathname.match(/^\/(\d+)(?:\/|$)/);
    return match ? match[1] : "";
  }

  function getCookieValue(name) {
    const encodedName = `${encodeURIComponent(name)}=`;
    const parts = document.cookie.split("; ");
    for (const part of parts) {
      if (part.startsWith(encodedName)) {
        return decodeURIComponent(part.slice(encodedName.length));
      }
    }
    return "";
  }

  function randomInt(min, max) {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return Math.floor(low + Math.random() * (high - low + 1));
  }

  async function sleepInterruptibly(ms) {
    const deadline = Date.now() + ms;
    while (!state.stopRequested && Date.now() < deadline) {
      await sleep(Math.min(1000, Math.max(0, deadline - Date.now())));
    }
  }

  function apiDelayRange(mode = "name") {
    const minKey = mode === "inactive" ? "inactiveDelayMinMs" : "apiDelayMinMs";
    const maxKey = mode === "inactive" ? "inactiveDelayMaxMs" : "apiDelayMaxMs";
    const defaultMinKey = mode === "inactive" ? "inactiveDelayMinMs" : "apiDelayMinMs";
    const defaultMaxKey = mode === "inactive" ? "inactiveDelayMaxMs" : "apiDelayMaxMs";
    const min = clampNumber(
      state.settings[minKey],
      DEFAULT_SETTINGS[defaultMinKey],
      1000,
      60000
    );
    const max = clampNumber(
      state.settings[maxKey],
      DEFAULT_SETTINGS[defaultMaxKey],
      min,
      120000
    );
    return { min, max };
  }

  function delayText(mode = "name") {
    const delay = apiDelayRange(mode);
    return delay.min === delay.max
      ? `${Math.round(delay.min / 1000)} 秒`
      : `${Math.round(delay.min / 1000)}-${Math.round(delay.max / 1000)} 秒`;
  }

  function summarizeNameSettings() {
    return `账号名称包含“${state.settings.targetName}”，上限 ${state.settings.maxActions}，间隔 ${delayText("name")}`;
  }

  function summarizeInactiveSettings() {
    const bannedText = state.settings.includeBannedAccount ? "含封禁" : "不含封禁";
    return `未投稿/未发动态 ${state.settings.inactiveMonths} 个月，检查 ${state.settings.inactiveCheckLimit} 个，${bannedText}，上限 ${state.settings.inactiveMaxActions}，间隔 ${delayText("inactive")}`;
  }

  function candidateModeFromSource(source) {
    return source === "inactive-up" ? "inactive" : "name";
  }

  function currentCandidateMode() {
    if (state.candidateMode) return state.candidateMode;
    const first = Array.from(state.candidates.values())[0];
    return first ? candidateModeFromSource(first.source) : "name";
  }

  function isStopApiCode(code) {
    return [-101, -102, -111, -352, -412, -509].includes(Number(code));
  }

  function apiErrorMessage(payload, fallback) {
    if (!payload) return fallback;
    const code = Number(payload.code);
    const message = normalizeText(payload.message || payload.msg || "");
    if (Number.isFinite(code)) {
      return message ? `接口返回 ${code}：${message}` : `接口返回 ${code}`;
    }
    return message || fallback;
  }

  function httpStatusFromError(error) {
    const match = String(error?.message || error || "").match(/HTTP\s+(\d+)/i);
    return match ? Number(match[1]) : 0;
  }

  function isApiBlockStatus(status) {
    return [403, 412, 418, 429, 509].includes(Number(status));
  }

  function apiBlockMessage(status, label = "") {
    const stage = label ? `（阶段：${normalizeText(label).slice(0, 40)}）` : "";
    if (Number(status) === 412) {
      return `HTTP 412：B 站暂时拦截了接口请求${stage}，已停止本次操作。请等几分钟后再试，或改用页面扫描。`;
    }
    return `HTTP ${status}：接口请求被限制${stage}，已停止本次操作。请稍后再试。`;
  }

  function ensurePageBridge() {
    if (pageBridgeReadyPromise) return pageBridgeReadyPromise;

    pageBridgeReadyPromise = new Promise((resolve, reject) => {
      if (!window.chrome?.runtime?.getURL) {
        reject(new Error("扩展运行环境不可用"));
        return;
      }

      const script = document.createElement("script");
      const timeout = window.setTimeout(() => {
        cleanup();
        resolve();
      }, 1500);

      function cleanup() {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
      }

      function onMessage(event) {
        if (event.source !== window) return;
        const message = event.data;
        if (
          message?.channel === PAGE_API_CHANNEL &&
          message.direction === "from-page" &&
          message.type === "ready"
        ) {
          cleanup();
          resolve();
        }
      }

      window.addEventListener("message", onMessage);
      script.src = chrome.runtime.getURL("page-bridge.js");
      script.async = false;
      script.onload = () => script.remove();
      script.onerror = () => {
        cleanup();
        script.remove();
        reject(new Error("页面请求桥接脚本加载失败"));
      };
      (document.head || document.documentElement).appendChild(script);
    });

    return pageBridgeReadyPromise;
  }

  async function pageApiFetch(message) {
    await ensurePageBridge();

    const id = `buh-${Date.now()}-${pageBridgeRequestId += 1}`;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("页面上下文请求超时"));
      }, 30000);

      function cleanup() {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
      }

      function onMessage(event) {
        if (event.source !== window) return;
        const response = event.data;
        if (
          response?.channel !== PAGE_API_CHANNEL ||
          response.direction !== "from-page" ||
          response.id !== id
        ) {
          return;
        }

        cleanup();
        if (response.ok) {
          resolve(response.payload);
        } else {
          reject(new Error(response.error || "页面上下文请求失败"));
        }
      }

      window.addEventListener("message", onMessage);
      window.postMessage(
        {
          channel: PAGE_API_CHANNEL,
          direction: "to-page",
          id,
          type: "apiFetch",
          payload: message,
        },
        window.location.origin
      );
    });
  }

  async function apiFetch(path, options = {}) {
    if (!window.chrome?.runtime?.sendMessage) {
      throw new Error("扩展后台不可用，请重新加载扩展后再试");
    }

    const url = new URL(path, "https://api.bilibili.com");
    for (const [key, value] of Object.entries(options.params || {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const message = {
      type: "buhApiFetch",
      method: options.method || "GET",
      url: url.href,
      referrer: options.referrer || location.href,
      headers: options.headers || {},
      autoCsrf: Boolean(options.autoCsrf),
      timeoutMs: options.timeoutMs || 15000,
    };
    const requestLabel = normalizeText(options.label || "");

    if (options.form) {
      message.body = new URLSearchParams(options.form).toString();
      message.headers = {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        ...message.headers,
      };
    }

    try {
      return await pageApiFetch(message);
    } catch (pageError) {
      const pageStatus = httpStatusFromError(pageError);
      if (isApiBlockStatus(pageStatus)) {
        throw new Error(apiBlockMessage(pageStatus, requestLabel));
      }
      if (message.method.toUpperCase() !== "GET") {
        throw pageError;
      }
      const response = await chrome.runtime.sendMessage(message);
      if (!response?.ok) {
        const backgroundStatus = httpStatusFromError(response?.error);
        if (isApiBlockStatus(backgroundStatus)) {
          throw new Error(apiBlockMessage(backgroundStatus, requestLabel));
        }
        throw new Error(
          `${pageError?.message || "页面上下文请求失败"}；后台请求也失败：${
            response?.error || "接口请求失败"
          }`
        );
      }
      return response.payload;
    }
  }

  function assertApiOk(payload, fallback) {
    if (Number(payload?.code) === 0) return;
    throw new Error(apiErrorMessage(payload, fallback));
  }

  function formatDate(timestampSeconds) {
    if (!timestampSeconds) return "";
    const date = new Date(Number(timestampSeconds) * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function normalizeTimestampSeconds(value) {
    if (value === undefined || value === null || value === "") return 0;
    if (typeof value === "string" && /[-/:年月日]/.test(value)) {
      const parsed = Date.parse(value.replace(/年|月/g, "-").replace(/日/g, ""));
      return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
    }

    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return number > 100000000000 ? Math.floor(number / 1000) : Math.floor(number);
  }

  function inactiveCutoffSeconds() {
    const date = new Date();
    date.setMonth(date.getMonth() - state.settings.inactiveMonths);
    return Math.floor(date.getTime() / 1000);
  }

  function videoCreatedSeconds(video) {
    const candidates = [
      video?.created,
      video?.created_at,
      video?.createdAt,
      video?.created_time,
      video?.pubdate,
      video?.ctime,
      video?.publish_time,
      video?.publishTime,
      video?.pub_time,
      video?.pubTime,
      video?.pubdate_at,
      video?.arc?.pubdate,
      video?.arc?.ctime,
      video?.arc?.created,
      video?.archive?.pubdate,
      video?.archive?.created,
    ];

    for (const value of candidates) {
      const seconds = normalizeTimestampSeconds(value);
      if (Number.isFinite(seconds) && seconds > 0) return seconds;
    }
    return 0;
  }

  function dynamicCreatedSeconds(dynamic) {
    const candidates = [
      dynamic?.modules?.module_author?.pub_ts,
      dynamic?.modules?.module_author?.pub_time,
      dynamic?.basic?.pub_ts,
      dynamic?.pub_ts,
      dynamic?.timestamp,
      dynamic?.created,
      dynamic?.ctime,
    ];

    for (const value of candidates) {
      const seconds = normalizeTimestampSeconds(value);
      if (Number.isFinite(seconds) && seconds > 0) return seconds;
    }
    return 0;
  }

  function dynamicTitle(dynamic) {
    const moduleDynamic = dynamic?.modules?.module_dynamic || {};
    const major = moduleDynamic.major || {};
    const candidates = [
      moduleDynamic.desc?.text,
      major.opus?.title,
      major.opus?.summary?.text,
      major.archive?.title,
      major.article?.title,
      major.live_rcmd?.title,
      major.draw?.title,
      dynamic?.modules?.module_author?.pub_action,
      dynamic?.type,
    ];

    for (const value of candidates) {
      const title = normalizeText(value);
      if (title) return title.slice(0, 60);
    }
    return "";
  }

  function isBannedAccountPayload(payload) {
    const code = Number(payload?.code);
    const message = normalizeText(payload?.message || payload?.msg || "");
    return (
      [-404, -403, -400, -352].includes(code) ||
      /封禁|封鎖|被封|账号异常|账号不存在|用户不存在|空间隐私|访问权限|非法用户/.test(message)
    );
  }

  function wbiSign(params, mixinKey) {
    if (!window.__biliWbi?.sign) {
      throw new Error("WBI 签名工具未加载，请重新加载扩展");
    }
    return window.__biliWbi.sign(params, mixinKey);
  }

  function wbiMixinKey(wbiImage) {
    if (!window.__biliWbi?.mixinKeyFromWbiImage) {
      throw new Error("WBI 签名工具未加载，请重新加载扩展");
    }
    return window.__biliWbi.mixinKeyFromWbiImage(wbiImage);
  }

  function getProfileLinks(root = document) {
    const unameLinks = Array.from(
      root.querySelectorAll('a.relation-card-info__uname[href*="space.bilibili.com/"]')
    ).filter(isVisible);
    if (unameLinks.length > 0) return unameLinks;

    return Array.from(root.querySelectorAll('a[href*="space.bilibili.com/"]')).filter(
      isVisible
    );
  }

  function hasTargetNameNear(link, card) {
    const targetName = normalizeText(state.settings.targetName);
    if (!targetName) return false;
    const unameLink =
      link.matches?.("a.relation-card-info__uname")
        ? link
        : card?.querySelector?.('a.relation-card-info__uname[href*="space.bilibili.com/"]');

    const values = unameLink
      ? [
          unameLink.getAttribute("title"),
          unameLink.innerText,
          unameLink.textContent,
        ]
      : [
          link.getAttribute("title"),
          link.getAttribute("aria-label"),
          link.innerText,
          link.textContent,
        ];

    const lines = values.flatMap(splitVisibleLines);
    return lines.some((line) => line.includes(targetName));
  }

  function extractCandidateName(link, card) {
    const targetName = normalizeText(state.settings.targetName);
    const unameLink =
      link.matches?.("a.relation-card-info__uname")
        ? link
        : card?.querySelector?.('a.relation-card-info__uname[href*="space.bilibili.com/"]');
    const linkLines = [
      unameLink?.getAttribute("title"),
      unameLink?.innerText,
      unameLink?.textContent,
      link.getAttribute("title"),
      link.getAttribute("aria-label"),
      link.innerText,
      link.textContent,
    ].flatMap(splitVisibleLines);
    const cardLines = unameLink ? [] : [card?.getAttribute("title")].flatMap(splitVisibleLines);
    const lines = [...linkLines, ...cardLines].filter((line) => {
      if (!line || line.length > 40) return false;
      return !["已关注", "互相关注", "取消关注", "关注", "发消息"].includes(line);
    });
    return (
      lines.find((line) => targetName && line.includes(targetName)) ||
      lines.find(Boolean) ||
      targetName ||
      "(未命名)"
    );
  }

  function hasActionControl(element) {
    return Boolean(findActionControl(element, { silent: true }));
  }

  function findReasonableCard(link) {
    const preferredSelectors = [
      "li",
      ".list-item",
      ".follow-item",
      ".relation-card",
      ".relation-item",
      ".user-list-item",
      ".fans-action",
      ".content",
      ".item",
    ];

    for (const selector of preferredSelectors) {
      const card = link.closest(selector);
      if (card && card !== document.body && hasTargetNameNear(link, card)) {
        return card;
      }
    }

    let current = link.parentElement;
    for (let depth = 0; current && depth < 8; depth += 1) {
      if (current === document.body) break;
      if (hasTargetNameNear(link, current) && hasActionControl(current)) {
        return current;
      }
      current = current.parentElement;
    }

    return link.closest("li, div") || link;
  }

  function getProfileKey(link, card) {
    const mid = extractMidFromHref(link.href);
    if (mid) return `mid:${mid}`;

    const rect = card.getBoundingClientRect();
    const text = elementText(card).slice(0, 100);
    return `dom:${Math.round(rect.top + window.scrollY)}:${text}`;
  }

  function buildCandidate(link, card) {
    const key = getProfileKey(link, card);
    const existing = state.candidates.get(key);
    const mid = extractMidFromHref(link.href);

    return {
      key,
      mid,
      href: link.href,
      uname: normalizeText(existing?.uname || extractCandidateName(link, card)),
      name: normalizeText(extractCandidateName(link, card)),
      face: existing?.face || "",
      card,
      source: existing ? existing.source : "page",
      selected: existing ? existing.selected : true,
      status: existing ? existing.status : "pending",
      note: existing ? existing.note : "",
      lastSeenAt: Date.now(),
    };
  }

  function buildApiCandidate(account) {
    const mid = String(account?.mid || "");
    const key = `mid:${mid}`;
    const existing = state.candidates.get(key);

    return {
      key,
      mid,
      href: mid ? `https://space.bilibili.com/${mid}` : "",
      uname: normalizeText(account?.uname || state.settings.targetName),
      name: normalizeText(account?.uname || state.settings.targetName),
      face: normalizeText(account?.face || ""),
      card: existing?.card || null,
      source: "api",
      selected: existing ? existing.selected : true,
      status: existing ? existing.status : "pending",
      note: existing ? existing.note : "",
      lastSeenAt: Date.now(),
    };
  }

  function buildInactiveCandidate(account, latestInfo) {
    const mid = String(account?.mid || "");
    const key = `mid:${mid}`;
    const existing = state.candidates.get(key);
    const latestDate = latestInfo.latestPubdate
      ? formatDate(latestInfo.latestPubdate)
      : latestInfo.reason === "banned"
        ? "账号异常"
        : "从未投稿";
    const latestDynamicDate = latestInfo.latestDynamicPubdate
      ? formatDate(latestInfo.latestDynamicPubdate)
      : latestInfo.reason === "banned"
        ? "账号异常"
        : "从未发动态";
    const reason =
      latestInfo.reason === "banned"
        ? "已封禁或账号异常"
        : `${state.settings.inactiveMonths} 个月未投稿/未发动态`;

    return {
      key,
      mid,
      href: "",
      uname: normalizeText(account?.uname || account?.name || "(未命名)"),
      name: normalizeText(account?.uname || account?.name || "(未命名)"),
      face: normalizeText(account?.face || ""),
      card: existing?.card || null,
      source: "inactive-up",
      selected: existing ? existing.selected : true,
      status: existing ? existing.status : "pending",
      note: existing ? existing.note : reason,
      latestDate,
      latestTitle: normalizeText(latestInfo.latestTitle || ""),
      latestDynamicDate,
      latestDynamicTitle: normalizeText(latestInfo.latestDynamicTitle || ""),
      totalVideos: Number(latestInfo.totalVideos || 0),
      details: [
        `最近投稿：${latestDate}`,
        `最近动态：${latestDynamicDate}`,
        `视频数：${Number(latestInfo.totalVideos || 0)}`,
        reason,
      ],
      lastSeenAt: Date.now(),
    };
  }

  function scanVisibleCandidates() {
    if (!isFollowPage()) {
      addLog("请先打开 B 站关注列表页：/relation/follow", "warn");
      return 0;
    }

    let added = 0;
    const seenCards = new Set();

    for (const link of getProfileLinks()) {
      const card = findReasonableCard(link);
      if (!card || seenCards.has(card)) continue;
      if (!hasTargetNameNear(link, card)) continue;

      seenCards.add(card);
      const candidate = buildCandidate(link, card);
      const existed = state.candidates.has(candidate.key);
      state.candidates.set(candidate.key, candidate);
      if (!existed) added += 1;
    }

    renderCandidateList();
    renderStatus();
    return added;
  }

  async function scanByApi() {
    if (state.isScanning || state.isUnfollowing) return;
    if (!isFollowPage()) {
      addLog("请先打开 B 站关注列表页：/relation/follow", "warn");
      return;
    }

    const vmid = getCurrentSpaceMid();
    if (!vmid) {
      addLog("无法从当前地址识别关注列表所属账号。", "warn");
      return;
    }

    resetCandidatesForScan("name");
    state.isScanning = true;
    state.stopRequested = false;
    renderControls();

    const targetName = normalizeText(state.settings.targetName);
    const pageSize = clampNumber(
      state.settings.apiPageSize,
      DEFAULT_SETTINGS.apiPageSize,
      20,
      50
    );
    const maxPages = clampNumber(
      state.settings.apiMaxPages,
      DEFAULT_SETTINGS.apiMaxPages,
      1,
      200
    );

    let addedTotal = 0;
    let scannedTotal = 0;
    addLog("开始接口扫描，按分页慢速读取关注列表。", "info");

    try {
      for (let pn = 1; pn <= maxPages; pn += 1) {
        if (state.stopRequested) break;

        const payload = await apiFetch("/x/relation/followings", {
          label: `接口扫描关注列表第 ${pn} 页`,
          params: {
            vmid,
            pn,
            ps: pageSize,
            order: "desc",
            order_type: "attention",
          },
        });

        assertApiOk(payload, "读取关注列表失败");
        const data = payload.data || {};
        const list = Array.isArray(data.list) ? data.list : [];
        scannedTotal += list.length;

        let addedThisPage = 0;
        for (const account of list) {
          if (!normalizeText(account?.uname).includes(targetName)) continue;
          const candidate = buildApiCandidate(account);
          if (!candidate.mid) continue;
          const existed = state.candidates.has(candidate.key);
          state.candidates.set(candidate.key, candidate);
          if (!existed) {
            addedThisPage += 1;
            addedTotal += 1;
          }
        }

        renderCandidateList();
        renderStatus();
        addLog(`接口扫描第 ${pn} 页：新增 ${addedThisPage} 个。`, "info");

        const total = Number(data.total || 0);
        if (list.length < pageSize || (total > 0 && pn * pageSize >= total)) break;

        const waitMs = randomInt(
          DEFAULT_SETTINGS.apiPageDelayMinMs,
          DEFAULT_SETTINGS.apiPageDelayMaxMs
        );
        await sleepInterruptibly(waitMs);
      }

      addLog(`接口扫描结束：扫过 ${scannedTotal} 个，新增 ${addedTotal} 个。`, "info");
    } catch (error) {
      addLog(error?.message || "接口扫描失败。", "warn");
    } finally {
      state.isScanning = false;
      renderControls();
      renderStatus();
    }
  }

  async function getNavForWbi() {
    const payload = await apiFetch("/x/web-interface/nav", {
      label: "活跃度检查登录态",
    });
    assertApiOk(payload, "读取网页登录态失败");
    if (!payload.data?.isLogin) {
      throw new Error("未识别到网页登录态，请确认已登录 B 站");
    }

    const mixinKey = wbiMixinKey(payload.data?.wbi_img);
    if (!mixinKey) {
      throw new Error("未能读取 WBI 签名密钥");
    }

    return {
      mid: String(payload.data?.mid || ""),
      mixinKey,
    };
  }

  async function fetchFollowingAccounts(vmid, limit = 0) {
    const pageSize = clampNumber(
      state.settings.apiPageSize,
      DEFAULT_SETTINGS.apiPageSize,
      20,
      50
    );
    const requestedLimit = clampNumber(limit, 0, 0, 5000);
    const maxPages = requestedLimit > 0
      ? Math.ceil(requestedLimit / pageSize)
      : clampNumber(
          state.settings.apiMaxPages,
          DEFAULT_SETTINGS.apiMaxPages,
          1,
          200
        );
    const seen = new Set();
    const accounts = [];

    for (let pn = 1; pn <= maxPages; pn += 1) {
      if (state.stopRequested) break;
      state.progress = `读取关注列表第 ${pn} 页`;
      renderStatus();

      const payload = await apiFetch("/x/relation/followings", {
        label: `活跃度检查关注列表第 ${pn} 页`,
        params: {
          vmid,
          pn,
          ps: pageSize,
          order: "desc",
          order_type: "attention",
        },
      });

      assertApiOk(payload, "读取关注列表失败");
      const data = payload.data || {};
      const list = Array.isArray(data.list) ? data.list : [];

      for (const item of list) {
        const mid = String(item?.mid || "");
        if (!mid || seen.has(mid)) continue;
        seen.add(mid);
        accounts.push({
          mid,
          uname: normalizeText(item?.uname) || "(未命名)",
          name: normalizeText(item?.uname) || "(未命名)",
          face: normalizeText(item?.face || ""),
        });
        if (requestedLimit > 0 && accounts.length >= requestedLimit) break;
      }

      addLog(`关注列表第 ${pn} 页：读取 ${list.length} 个。`, "info");

      const total = Number(data.total || 0);
      if (requestedLimit > 0 && accounts.length >= requestedLimit) break;
      if (list.length < pageSize || (total > 0 && pn * pageSize >= total)) break;
      await sleepInterruptibly(
        randomInt(DEFAULT_SETTINGS.apiPageDelayMinMs, DEFAULT_SETTINGS.apiPageDelayMaxMs)
      );
    }

    return accounts;
  }

  async function fetchLatestVideo(account, mixinKey, label = "投稿检查") {
    const query = wbiSign(
      {
        mid: account.mid,
        pn: 1,
        ps: 5,
        tid: 0,
        order: "pubdate",
        platform: "web",
        web_location: 1550101,
      },
      mixinKey
    );

    const payload = await apiFetch(`/x/space/wbi/arc/search?${query}`, {
      label,
    });
    if (Number(payload?.code) !== 0) {
      if (isBannedAccountPayload(payload)) {
        return {
          status: "banned",
          latestPubdate: 0,
          latestTitle: "",
          totalVideos: 0,
          message: payload?.message || payload?.msg || "账号封禁或异常",
        };
      }
      return {
        status: "unknown",
        code: payload?.code,
        message: payload?.message || payload?.msg || "",
      };
    }

    const data = payload.data || {};
    const videos = Array.isArray(data.list?.vlist)
      ? data.list.vlist
      : Array.isArray(data.list)
        ? data.list
        : Array.isArray(data.archives)
          ? data.archives
          : [];
    const count = Number(data.page?.count || data.list?.page?.count || videos.length || 0);

    if (videos.length === 0 && !count) {
      return {
        status: "never-posted",
        latestPubdate: 0,
        latestTitle: "",
        totalVideos: 0,
      };
    }

    let latest = null;
    let latestPubdate = 0;
    for (const video of videos) {
      const pubdate = videoCreatedSeconds(video);
      if (pubdate > latestPubdate) {
        latest = video;
        latestPubdate = pubdate;
      }
    }

    if (!latestPubdate) {
      return {
        status: "unknown",
        code: "missing-pubdate",
        message: "投稿时间字段缺失",
      };
    }

    return {
      status: "ok",
      latestPubdate,
      latestTitle: normalizeText(latest.title || "").slice(0, 60),
      totalVideos: count,
    };
  }

  async function fetchLatestDynamic(account, mixinKey, label = "动态检查") {
    const query = wbiSign(
      {
        offset: "",
        host_mid: account.mid,
        timezone_offset: new Date().getTimezoneOffset(),
        platform: "web",
        features: DYNAMIC_FEED_FEATURES,
        web_location: "333.1387",
      },
      mixinKey
    );

    const payload = await apiFetch(`/x/polymer/web-dynamic/v1/feed/space?${query}`, {
      label,
      referrer: `https://space.bilibili.com/${account.mid}/dynamic`,
      timeoutMs: 20000,
    });
    if (Number(payload?.code) !== 0) {
      if (isBannedAccountPayload(payload)) {
        return {
          status: "banned",
          latestDynamicPubdate: 0,
          latestDynamicTitle: "",
          message: payload?.message || payload?.msg || "账号封禁或异常",
        };
      }
      return {
        status: "unknown",
        code: payload?.code,
        message: payload?.message || payload?.msg || "",
      };
    }

    const items = Array.isArray(payload.data?.items)
      ? payload.data.items.filter((item) => item?.visible !== false)
      : [];
    if (items.length === 0) {
      return {
        status: "never-dynamic",
        latestDynamicPubdate: 0,
        latestDynamicTitle: "",
      };
    }

    let latest = null;
    let latestDynamicPubdate = 0;
    for (const item of items) {
      const pubdate = dynamicCreatedSeconds(item);
      if (pubdate > latestDynamicPubdate) {
        latest = item;
        latestDynamicPubdate = pubdate;
      }
    }

    if (!latestDynamicPubdate) {
      return {
        status: "unknown",
        code: "missing-dynamic-pubdate",
        message: "动态时间字段缺失",
      };
    }

    return {
      status: "ok",
      latestDynamicPubdate,
      latestDynamicTitle: dynamicTitle(latest),
    };
  }

  function isVideoInactive(latest, cutoff) {
    if (latest.status === "ok") return latest.latestPubdate < cutoff;
    if (latest.status === "never-posted") return state.settings.includeNeverPosted;
    return false;
  }

  function isDynamicInactive(latest, cutoff) {
    if (latest.status === "ok") return latest.latestDynamicPubdate < cutoff;
    return latest.status === "never-dynamic";
  }

  async function scanInactiveUps() {
    if (state.isScanning || state.isUnfollowing) return;
    if (!isFollowPage()) {
      addLog("请先打开 B 站关注列表页：/relation/follow", "warn");
      return;
    }

    const vmid = getCurrentSpaceMid();
    if (!vmid) {
      addLog("无法从当前地址识别关注列表所属账号。", "warn");
      return;
    }

    state.isScanning = true;
    state.stopRequested = false;
    state.progress = "";
    resetCandidatesForScan("inactive");
    renderControls();

    const cutoff = inactiveCutoffSeconds();
    let matched = 0;
    let unknown = 0;
    let activeRecent = 0;
    let inactiveByDate = 0;
    let dynamicChecked = 0;
    let includedNeverDynamic = 0;
    let includedNeverPosted = 0;
    let skippedNeverPosted = 0;
    let includedBanned = 0;

    try {
      const nav = await getNavForWbi();
      addLog(`开始按 UP 主活跃度扫描：${state.settings.inactiveMonths} 个月未投稿且未发动态，包含从未投稿账号。`, "info");
      if (nav.mid && vmid && nav.mid !== vmid) {
        addLog("当前页面账号与登录账号不一致，已改用登录账号关注列表。", "warn");
      }
      const checkLimit = clampNumber(
        state.settings.inactiveCheckLimit,
        DEFAULT_SETTINGS.inactiveCheckLimit,
        20,
        5000
      );
      const allAccounts = await fetchFollowingAccounts(nav.mid || vmid, checkLimit);
      const accounts = allAccounts.slice(0, checkLimit);
      addLog(
        `本次检查前 ${accounts.length}/${allAccounts.length} 个关注账号，可在设置里调整检查上限。`,
        "info"
      );

      for (let index = 0; index < accounts.length; index += 1) {
        if (state.stopRequested) break;

        const account = accounts[index];
        state.progress = `检查活跃度 ${index + 1}/${accounts.length}`;
        renderStatus();

        const latest = await fetchLatestVideo(
          account,
          nav.mixinKey,
          `投稿检查第 ${index + 1}/${accounts.length}`
        );

        if (latest.status === "banned") {
          if (state.settings.includeBannedAccount) {
            const candidate = buildInactiveCandidate(account, {
              ...latest,
              reason: "banned",
            });
            const existed = state.candidates.has(candidate.key);
            state.candidates.set(candidate.key, candidate);
            if (!existed) {
              matched += 1;
              includedBanned += 1;
            }
          } else {
            unknown += 1;
          }
        } else if (latest.status === "unknown") {
          unknown += 1;
        } else if (latest.status === "never-posted" && !state.settings.includeNeverPosted) {
          skippedNeverPosted += 1;
        } else if (!isVideoInactive(latest, cutoff)) {
          activeRecent += 1;
        } else {
          const dynamic = await fetchLatestDynamic(
            account,
            nav.mixinKey,
            `动态检查第 ${index + 1}/${accounts.length}`
          );
          dynamicChecked += 1;

          if (dynamic.status === "banned") {
            if (state.settings.includeBannedAccount) {
              const candidate = buildInactiveCandidate(account, {
                ...latest,
                ...dynamic,
                reason: "banned",
              });
              const existed = state.candidates.has(candidate.key);
              state.candidates.set(candidate.key, candidate);
              if (!existed) {
                matched += 1;
                includedBanned += 1;
              }
            } else {
              unknown += 1;
            }
          } else if (dynamic.status === "unknown") {
            unknown += 1;
          } else if (isDynamicInactive(dynamic, cutoff)) {
            inactiveByDate += 1;
            if (latest.status === "never-posted") includedNeverPosted += 1;
            if (dynamic.status === "never-dynamic") includedNeverDynamic += 1;

            const candidate = buildInactiveCandidate(account, {
              ...latest,
              ...dynamic,
              reason: "inactive",
            });
            const existed = state.candidates.has(candidate.key);
            state.candidates.set(candidate.key, candidate);
            if (!existed) matched += 1;
          } else {
            activeRecent += 1;
          }
        }

        if ((index + 1) % 10 === 0 || index === accounts.length - 1) {
          renderCandidateList();
          addLog(
            `活跃度检查 ${index + 1}/${accounts.length}：候选 ${state.candidates.size} 个，双条件未活跃 ${inactiveByDate} 个，近期活跃 ${activeRecent} 个，已查动态 ${dynamicChecked} 个。`,
            "info"
          );
        }

        if (index < accounts.length - 1) {
          await sleepInterruptibly(state.settings.videoCheckDelayMs);
        }
      }

      renderCandidateList();
      addLog(
        `活跃度扫描结束：新增 ${matched} 个，同时超过期限未投稿/未发动态 ${inactiveByDate} 个，近期活跃 ${activeRecent} 个，从未投稿纳入 ${includedNeverPosted} 个，从未发动态纳入 ${includedNeverDynamic} 个，封禁纳入 ${includedBanned} 个，跳过从未投稿 ${skippedNeverPosted} 个，未知 ${unknown} 个。`,
        "info"
      );
    } catch (error) {
      addLog(error?.message || "活跃度扫描失败。", "warn");
    } finally {
      state.isScanning = false;
      state.progress = "";
      renderControls();
      renderStatus();
    }
  }

  async function apiSelfCheck() {
    if (state.isScanning || state.isUnfollowing) return;

    state.isScanning = true;
    state.stopRequested = false;
    state.progress = "接口自检中";
    renderControls();
    renderStatus();

    try {
      const nav = await pageApiFetch({
        method: "GET",
        url: "https://api.bilibili.com/x/web-interface/nav",
        headers: {},
      });
      assertApiOk(nav, "登录态接口失败");
      if (!nav.data?.isLogin) {
        addLog("接口自检失败：未识别到网页登录态。", "warn");
        return;
      }

      const mid = String(nav.data?.mid || "");
      addLog(`页面上下文接口正常：${maskId(mid) || "已登录"}`, "info");

      const url = new URL("https://api.bilibili.com/x/relation/followings");
      url.searchParams.set("vmid", mid);
      url.searchParams.set("pn", "1");
      url.searchParams.set("ps", "1");
      url.searchParams.set("order", "desc");
      url.searchParams.set("order_type", "attention");
      const followings = await pageApiFetch({
        method: "GET",
        url: url.href,
        headers: {},
      });
      assertApiOk(followings, "关注列表接口失败");
      addLog("关注列表接口正常。", "info");
    } catch (error) {
      addLog(error?.message || "接口自检失败。", "warn");
    } finally {
      state.isScanning = false;
      state.progress = "";
      renderControls();
      renderStatus();
    }
  }

  function findActionControl(root, options = {}) {
    const candidates = Array.from(
      root.querySelectorAll('button, [role="button"], a, span, div')
    )
      .filter(isVisible)
      .filter((element) => !isDisabled(element))
      .filter((element) => {
        const text = elementText(element);
        if (!text || text.length > 12) return false;
        return ["已关注", "互相关注", "取消关注"].some((word) =>
          text.includes(word)
        );
      })
      .filter((element) => !element.closest('a[href*="space.bilibili.com/"]'));

    const exact = candidates.find((element) =>
      exactTextMatches(element, ["取消关注", "已关注", "互相关注"])
    );

    const result = exact || candidates[0] || null;
    if (!result && !options.silent) {
      addLog("没有找到取关控件，页面结构可能已变化。", "warn");
    }
    return result;
  }

  function distanceBetweenElements(a, b) {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const ax = ra.left + ra.width / 2;
    const ay = ra.top + ra.height / 2;
    const bx = rb.left + rb.width / 2;
    const by = rb.top + rb.height / 2;
    return Math.hypot(ax - bx, ay - by);
  }

  function findVisibleTextNear(texts, originElement, excludeElement) {
    const candidates = Array.from(
      document.body.querySelectorAll('button, [role="button"], a, span, div, li')
    )
      .filter(isVisible)
      .filter((element) => !isDisabled(element))
      .filter((element) => element !== excludeElement)
      .filter((element) => !element.closest('a[href*="space.bilibili.com/"]'))
      .filter((element) => {
        const text = elementText(element);
        return text.length <= 16 && texts.includes(text);
      })
      .map((element) => ({
        element,
        distance: distanceBetweenElements(element, originElement),
      }))
      .sort((a, b) => a.distance - b.distance);

    return candidates[0]?.element || null;
  }

  function findConfirmButton() {
    const buttons = Array.from(
      document.body.querySelectorAll('button, [role="button"], span, div')
    )
      .filter(isVisible)
      .filter((element) => !isDisabled(element))
      .filter((element) => exactTextMatches(element, ["确定", "确认"]));

    return buttons[buttons.length - 1] || null;
  }

  function clickElement(element) {
    element.dispatchEvent(
      new MouseEvent("mouseover", {
        bubbles: true,
        cancelable: true,
        view: window,
      })
    );
    element.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
      })
    );
    element.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
      })
    );
    element.click();
  }

  function getSelectedCandidates() {
    return Array.from(state.candidates.values()).filter(
      (candidate) =>
        candidate.selected &&
        candidate.status !== "done" &&
        candidate.status !== "running"
    );
  }

  function findCandidateAgain(candidate) {
    if (candidate.card?.isConnected && hasTargetNameNear(candidate.card, candidate.card)) {
      return candidate.card;
    }

    scanVisibleCandidates();
    const current = state.candidates.get(candidate.key);
    if (current?.card?.isConnected) return current.card;
    return null;
  }

  async function unfollowCandidate(candidate) {
    const card = findCandidateAgain(candidate);
    if (!card) {
      candidate.status = "failed";
      candidate.note = "未在当前已加载列表中找到";
      renderCandidateList();
      return false;
    }

    candidate.card = card;
    candidate.status = "running";
    candidate.note = "处理中";
    renderCandidateList();

    card.scrollIntoView({ block: "center", inline: "nearest" });
    await sleep(350);

    const actionControl = findActionControl(card);
    if (!actionControl) {
      candidate.status = "failed";
      candidate.note = "找不到取关按钮";
      renderCandidateList();
      return false;
    }

    const actionText = elementText(actionControl);
    clickElement(actionControl);
    await sleep(state.settings.afterClickDelayMs);

    if (actionText !== "取消关注") {
      const cancelFollow = findVisibleTextNear(
        ["取消关注"],
        actionControl,
        actionControl
      );
      if (cancelFollow) {
        clickElement(cancelFollow);
        await sleep(state.settings.afterClickDelayMs);
      }
    }

    const confirmButton = findConfirmButton();
    if (confirmButton) {
      clickElement(confirmButton);
      await sleep(state.settings.actionDelayMs);
    } else {
      await sleep(state.settings.actionDelayMs);
    }

    candidate.status = "done";
    candidate.note = "已点击取关";
    renderCandidateList();
    return true;
  }

  async function unfollowCandidateByApi(candidate, csrf) {
    if (!candidate.mid) {
      candidate.status = "failed";
      candidate.note = "缺少必要账号 ID";
      renderCandidateList();
      return { done: false, shouldStop: false };
    }

    candidate.status = "running";
    candidate.note = "接口处理中";
    renderCandidateList();

    try {
      const payload = await apiFetch("/x/relation/modify", {
        label: "接口取关",
        method: "POST",
        autoCsrf: true,
        form: {
          fid: candidate.mid,
          act: "2",
          re_src: "11",
          csrf: csrf || "__AUTO__",
          csrf_token: csrf || "__AUTO__",
        },
      });

      if (Number(payload?.code) === 0) {
        candidate.status = "done";
        candidate.note = "接口已取关";
        renderCandidateList();
        return { done: true, shouldStop: false };
      }

      if (Number(payload?.code) === -352) {
        addLog(
          "接口取关返回 -352：需要安全验证。请在 B 站页面上手动点击一次取关，并按提示输入手机号完成验证后，再回到插件继续。",
          "security"
        );
      }

      const message = apiErrorMessage(payload, "接口取关失败");
      candidate.status = "failed";
      candidate.note = message;
      renderCandidateList();
      return {
        done: false,
        shouldStop: isStopApiCode(payload?.code),
        message,
      };
    } catch (error) {
      const message = error?.message || "接口取关失败";
      candidate.status = "failed";
      candidate.note = message;
      renderCandidateList();
      return { done: false, shouldStop: false, message };
    }
  }

  async function scanWithScroll() {
    if (state.isScanning || state.isUnfollowing) return;

    resetCandidatesForScan("name");
    state.isScanning = true;
    state.stopRequested = false;
    addLog("开始滚动扫描。", "info");
    renderControls();

    let unchangedRounds = 0;
    let lastScrollY = window.scrollY;

    for (let round = 1; round <= state.settings.scanRounds; round += 1) {
      if (state.stopRequested) break;

      const added = scanVisibleCandidates();
      addLog(`扫描 ${round}/${state.settings.scanRounds}：新增 ${added} 个。`, "info");

      window.scrollBy({
        top: Math.max(500, Math.round(window.innerHeight * 0.85)),
        behavior: "smooth",
      });
      await sleep(state.settings.scrollDelayMs);

      const moved = Math.abs(window.scrollY - lastScrollY) >= 5;
      unchangedRounds = moved ? 0 : unchangedRounds + 1;
      lastScrollY = window.scrollY;

      if (
        unchangedRounds >= 3 ||
        window.innerHeight + window.scrollY >= document.body.scrollHeight - 8
      ) {
        scanVisibleCandidates();
        break;
      }
    }

    state.isScanning = false;
    renderControls();
    renderStatus();
    addLog("扫描结束。", "info");
  }

  async function unfollowSelectedByUi() {
    if (state.isScanning || state.isUnfollowing) return;

    const selected = getSelectedCandidates();
    const mode = currentCandidateMode();
    const maxActions = clampNumber(
      mode === "inactive" ? state.settings.inactiveMaxActions : state.settings.maxActions,
      mode === "inactive" ? DEFAULT_SETTINGS.inactiveMaxActions : DEFAULT_SETTINGS.maxActions,
      1,
      200
    );
    const targets = selected.slice(0, maxActions);

    if (targets.length === 0) {
      addLog("没有已勾选且待处理的账号。", "warn");
      return;
    }

    const ok = window.confirm(
      `将按当前页面 UI 取关 ${targets.length} 个账号。请确认列表无误后继续。`
    );
    if (!ok) {
      addLog("已取消取关。", "info");
      return;
    }

    state.isUnfollowing = true;
    state.stopRequested = false;
    renderControls();

    let success = 0;
    for (const candidate of targets) {
      if (state.stopRequested) break;
      addLog(
        `取关中：${candidate.name} ${maskId(candidate.mid) || ""}`.trim(),
        "info"
      );
      const done = await unfollowCandidate(candidate);
      if (done) success += 1;
      await sleep(state.settings.actionDelayMs);
    }

    state.isUnfollowing = false;
    renderControls();
    renderStatus();
    addLog(`取关结束：成功点击 ${success}/${targets.length} 个。`, "info");
  }

  async function unfollowSelectedByApi() {
    if (state.isScanning || state.isUnfollowing) return;

    const csrf = getCookieValue("bili_jct");
    if (!csrf) {
      addLog("内容脚本未读到 CSRF，将尝试由页面上下文自动补充。", "warn");
    }

    const selected = getSelectedCandidates().filter((candidate) => candidate.mid);
    const mode = currentCandidateMode();
    const maxActions = clampNumber(
      mode === "inactive" ? state.settings.inactiveMaxActions : state.settings.maxActions,
      mode === "inactive" ? DEFAULT_SETTINGS.inactiveMaxActions : DEFAULT_SETTINGS.maxActions,
      1,
      200
    );
    const targets = selected.slice(0, maxActions);

    if (targets.length === 0) {
      addLog("没有已勾选且可接口处理的账号。", "warn");
      return;
    }

    const delay = apiDelayRange(mode);
    const delayText =
      delay.min === delay.max
        ? `每次间隔约 ${Math.round(delay.min / 1000)} 秒`
        : `每次间隔约 ${Math.round(delay.min / 1000)}-${Math.round(
            delay.max / 1000
          )} 秒`;
    const ok = window.confirm(
      `将通过接口取关 ${targets.length} 个账号。请求串行执行，${delayText}。确认继续？`
    );
    if (!ok) {
      addLog("已取消接口取关。", "info");
      return;
    }

    state.isUnfollowing = true;
    state.stopRequested = false;
    renderControls();

    const batchSize = clampNumber(
      state.settings.apiBatchSize,
      DEFAULT_SETTINGS.apiBatchSize,
      0,
      20
    );
    let success = 0;
    let attempted = 0;

    for (const candidate of targets) {
      if (state.stopRequested) break;

      addLog(
        `接口取关中：${candidate.name} ${maskId(candidate.mid) || ""}`.trim(),
        "info"
      );
      const result = await unfollowCandidateByApi(candidate, csrf);
      attempted += 1;
      if (result.done) success += 1;

      if (result.shouldStop) {
        addLog("接口返回登录、校验、频率或风控类错误，已自动停止。", "warn");
        state.stopRequested = true;
        break;
      }

      if (state.stopRequested || attempted >= targets.length) break;

      if (batchSize > 0 && attempted % batchSize === 0) {
        const pauseMs = randomInt(
          DEFAULT_SETTINGS.apiBatchPauseMinMs,
          DEFAULT_SETTINGS.apiBatchPauseMaxMs
        );
        if (pauseMs > 0) {
          addLog(`批次暂停约 ${Math.round(pauseMs / 1000)} 秒。`, "info");
          await sleepInterruptibly(pauseMs);
        }
      } else {
        const waitMs = randomInt(delay.min, delay.max);
        addLog(`等待约 ${Math.round(waitMs / 1000)} 秒后继续。`, "info");
        await sleepInterruptibly(waitMs);
      }
    }

    state.isUnfollowing = false;
    renderControls();
    renderStatus();
    addLog(`接口取关结束：成功 ${success}/${attempted} 个。`, "info");
  }

  function stopCurrentTask() {
    state.stopRequested = true;
    addLog("已请求停止，当前动作结束后会停下。", "warn");
  }

  function addLog(message, type = "info") {
    const item = {
      message,
      type,
      time: new Date().toLocaleTimeString(),
    };
    state.logs.unshift(item);
    state.logs = state.logs.slice(0, 8);
    renderLogs();
  }

  function resetCandidatesForScan(mode = "") {
    state.candidates.clear();
    state.candidateMode = mode;
    renderCandidateList();
    renderStatus();
  }

  function createButton(label, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `buh-button ${className || ""}`.trim();
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function createInput(label, value, options = {}) {
    const wrapper = document.createElement("label");
    wrapper.className = "buh-field";

    const text = document.createElement("span");
    text.textContent = label;

    const input = document.createElement("input");
    input.value = value;
    input.type = options.type || "text";
    input.min = options.min || "";
    input.max = options.max || "";
    input.step = options.step || "";
    input.addEventListener("input", () => {
      options.onChange?.(input.value);
    });

    wrapper.append(text, input);
    return wrapper;
  }

  function createCheckbox(label, checked, onChange) {
    const wrapper = document.createElement("label");
    wrapper.className = "buh-check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(checked);
    input.addEventListener("change", () => {
      onChange?.(input.checked);
    });

    const text = document.createElement("span");
    text.textContent = label;

    wrapper.append(input, text);
    return wrapper;
  }

  function createFeatureCard({
    title,
    summary,
    settingsOpen,
    onToggle,
    settingsNodes,
    actions,
    actionsRole,
  }) {
    const card = document.createElement("section");
    card.className = "buh-feature";

    const head = document.createElement("div");
    head.className = "buh-feature-head";

    const titleWrap = document.createElement("div");
    titleWrap.className = "buh-feature-title-wrap";

    const heading = document.createElement("div");
    heading.className = "buh-feature-title";
    heading.textContent = title;

    const summaryNode = document.createElement("div");
    summaryNode.className = "buh-feature-summary";
    summaryNode.textContent = summary;

    titleWrap.append(heading, summaryNode);

    const toggle = createButton(settingsOpen ? "收起" : "设置", "ghost compact", onToggle);
    head.append(titleWrap, toggle);
    card.append(head);

    if (settingsOpen) {
      const settings = document.createElement("div");
      settings.className = "buh-settings";
      settings.append(...settingsNodes);
      const saveButton = createButton("保存设置", "primary", saveSettingsDraft);
      saveButton.classList.add("buh-settings-save");
      settings.append(saveButton);
      card.append(settings);
    }

    const actionRow = document.createElement("div");
    actionRow.className = "buh-feature-actions";
    if (actionsRole) actionRow.dataset.role = actionsRole;
    actionRow.append(...actions);
    card.append(actionRow);

    return card;
  }

  function ensureRoot() {
    let root = document.getElementById(APP_ID);
    if (root) return root;

    root = document.createElement("aside");
    root.id = APP_ID;
    root.className = "buh-root";
    document.documentElement.appendChild(root);
    renderApp();
    addLog("插件已加载。", "info");
    return root;
  }

  function renderApp() {
    const root = ensureRoot();
    root.textContent = "";
    root.classList.toggle("is-collapsed", state.collapsed);
    applyPanelPosition(root);

    const header = document.createElement("div");
    header.className = "buh-header";
    makePanelDraggable(root, header);

    const title = document.createElement("div");
    title.className = "buh-title";
    title.textContent = "关注清理助手";

    const collapse = createButton(state.collapsed ? "展开" : "收起", "ghost", () => {
      state.collapsed = !state.collapsed;
      renderApp();
    });

    header.append(title, collapse);
    root.append(header);

    if (state.collapsed) return;

    const pageHint = document.createElement("div");
    pageHint.className = isFollowPage() ? "buh-hint" : "buh-hint buh-warn";
    pageHint.textContent = isFollowPage()
      ? "当前页可扫描关注列表。"
      : "请打开 /relation/follow 关注列表页后使用。";

    const draft = currentSettingsDraft();
    const features = document.createElement("div");
    features.className = "buh-features";

    const nameCard = createFeatureCard({
      title: "按账号名称取关",
      summary: summarizeNameSettings(),
      settingsOpen: state.nameSettingsOpen,
      onToggle: () => {
        state.nameSettingsOpen = !state.nameSettingsOpen;
        renderApp();
      },
      settingsNodes: [
        createInput("取关账号名称", draft.targetName, {
          onChange: (value) => {
            draft.targetName = value;
          },
        }),
        createInput("单次取关上限", draft.maxActions, {
          type: "number",
          min: "1",
          max: "200",
          onChange: (value) => {
            draft.maxActions = value;
          },
        }),
        createInput("取关间隔秒数", draft.nameDelaySeconds, {
          type: "number",
          min: "1",
          max: "120",
          onChange: (value) => {
            draft.nameDelaySeconds = value;
          },
        }),
      ],
      actions: [],
      actionsRole: "name-actions",
    });

    const inactiveCard = createFeatureCard({
      title: "按up主活跃度取关",
      summary: summarizeInactiveSettings(),
      settingsOpen: state.inactiveSettingsOpen,
      onToggle: () => {
        state.inactiveSettingsOpen = !state.inactiveSettingsOpen;
        renderApp();
      },
      settingsNodes: [
        createInput("未投稿/未发动态月数", draft.inactiveMonths, {
          type: "number",
          min: "1",
          max: "36",
          onChange: (value) => {
            draft.inactiveMonths = value;
          },
        }),
        createInput("检查账号上限", draft.inactiveCheckLimit, {
          type: "number",
          min: "20",
          max: "5000",
          onChange: (value) => {
            draft.inactiveCheckLimit = value;
          },
        }),
        createInput("单次取关上限", draft.inactiveMaxActions, {
          type: "number",
          min: "1",
          max: "200",
          onChange: (value) => {
            draft.inactiveMaxActions = value;
          },
        }),
        createInput("取关间隔秒数", draft.inactiveDelaySeconds, {
          type: "number",
          min: "1",
          max: "120",
          onChange: (value) => {
            draft.inactiveDelaySeconds = value;
          },
        }),
        createCheckbox("包含封禁账号", draft.includeBannedAccount, (checked) => {
          draft.includeBannedAccount = checked;
        }),
      ],
      actions: [],
      actionsRole: "inactive-actions",
    });

    features.append(nameCard, inactiveCard);

    const controls = document.createElement("div");
    controls.className = "buh-controls";
    controls.dataset.role = "controls";

    const status = document.createElement("div");
    status.className = "buh-status";
    status.dataset.role = "status";

    const list = document.createElement("div");
    list.className = "buh-list";
    list.dataset.role = "list";

    const logs = document.createElement("div");
    logs.className = "buh-logs";
    logs.dataset.role = "logs";

    root.append(pageHint, features, controls, status, list, logs);
    renderControls();
    renderStatus();
    renderCandidateList();
    renderLogs();
    renderToast(root);
    requestAnimationFrame(() => keepPanelInViewport(root));
  }

  function renderControls() {
    const root = document.getElementById(APP_ID);
    const controls = root?.querySelector('[data-role="controls"]');
    if (!controls) return;

    controls.textContent = "";

    const busy = state.isScanning || state.isUnfollowing;
    const selfCheck = createButton("接口自检", "ghost", apiSelfCheck);
    const scanInactive = createButton("活跃度扫描", "", scanInactiveUps);
    const scanApi = createButton("接口扫描", "", scanByApi);
    const scanCurrent = createButton("页面扫描", "ghost", () => {
      resetCandidatesForScan("name");
      const added = scanVisibleCandidates();
      addLog(`当前可见区域新增 ${added} 个。`, "info");
    });
    const scanAll = createButton("滚动扫描", "ghost", scanWithScroll);
    const selectAll = createButton("全选", "ghost", () => {
      for (const candidate of state.candidates.values()) {
        if (candidate.status !== "done") candidate.selected = true;
      }
      renderCandidateList();
      renderStatus();
    });
    const selectNone = createButton("全不选", "ghost", () => {
      for (const candidate of state.candidates.values()) {
        candidate.selected = false;
      }
      renderCandidateList();
      renderStatus();
    });
    const unfollowApi = createButton("接口取关", "danger", unfollowSelectedByApi);
    const unfollowUi = createButton("页面取关", "ghost danger-text", unfollowSelectedByUi);
    const stop = createButton("停止", "ghost danger-text", stopCurrentTask);
    const clear = createButton("清空", "ghost", () => {
      resetCandidatesForScan("");
      addLog("列表已清空。", "info");
    });

    for (const button of [
      scanCurrent,
      selfCheck,
      scanApi,
      scanInactive,
      scanAll,
      selectAll,
      selectNone,
      unfollowApi,
      unfollowUi,
      clear,
      stop,
    ]) {
      button.disabled = busy && button !== stop;
    }
    stop.disabled = !busy;

    const nameActions = root.querySelector('[data-role="name-actions"]');
    const inactiveActions = root.querySelector('[data-role="inactive-actions"]');
    if (nameActions) {
      nameActions.textContent = "";
      nameActions.append(scanApi, scanCurrent, scanAll);
    }
    if (inactiveActions) {
      inactiveActions.textContent = "";
      inactiveActions.append(scanInactive);
    }

    controls.append(selfCheck, selectAll, selectNone, unfollowApi, unfollowUi, clear, stop);
  }

  function renderStatus() {
    const root = document.getElementById(APP_ID);
    const status = root?.querySelector('[data-role="status"]');
    if (!status) return;

    const all = Array.from(state.candidates.values());
    const selected = all.filter((candidate) => candidate.selected).length;
    const done = all.filter((candidate) => candidate.status === "done").length;
    const failed = all.filter((candidate) => candidate.status === "failed").length;

    const base = `已列出 ${all.length} 个，已选 ${selected} 个，完成 ${done} 个，失败 ${failed} 个`;
    status.textContent = state.progress ? `${base}，${state.progress}` : base;
  }

  function renderCandidateList() {
    const root = document.getElementById(APP_ID);
    const list = root?.querySelector('[data-role="list"]');
    if (!list) return;

    const all = Array.from(state.candidates.values()).sort((a, b) => {
      if (a.status === b.status) return a.key.localeCompare(b.key);
      if (a.status === "pending") return -1;
      if (b.status === "pending") return 1;
      return a.status.localeCompare(b.status);
    });

    list.textContent = "";

    if (all.length === 0) {
      const empty = document.createElement("div");
      empty.className = "buh-empty";
      empty.textContent = "还没有匹配账号。";
      list.append(empty);
      renderStatus();
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const candidate of all) {
      const row = document.createElement("label");
      row.className = `buh-row is-${candidate.status}`;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = candidate.selected;
      checkbox.disabled = candidate.status === "done" || candidate.status === "running";
      checkbox.addEventListener("change", () => {
        candidate.selected = checkbox.checked;
        renderStatus();
      });

      const avatar = document.createElement(candidate.face ? "img" : "span");
      avatar.className = candidate.face ? "buh-avatar" : "buh-avatar buh-avatar-empty";
      if (candidate.face) {
        avatar.src = candidate.face;
        avatar.alt = "";
        avatar.referrerPolicy = "no-referrer";
        avatar.loading = "lazy";
      }

      const main = document.createElement("div");
      main.className = "buh-row-main";

      const nameLine = document.createElement("div");
      nameLine.className = "buh-row-name";
      const displayName = normalizeText(candidate.uname) || "(未命名)";
      nameLine.textContent = displayName;
      nameLine.title = displayName;

      const meta = document.createElement("span");
      meta.className = "buh-row-meta";
      const sourceText =
        candidate.source === "inactive-up"
          ? "活跃度"
          : candidate.source === "api"
            ? "接口"
            : "页面";
      meta.textContent = candidate.mid
        ? `${sourceText} · UID ${maskId(candidate.mid)}`
        : `${sourceText} · UID 未识别`;

      main.append(nameLine, meta);

      if (candidate.details?.length) {
        const detail = document.createElement("div");
        detail.className = "buh-row-detail";
        detail.textContent = candidate.details.join(" · ");
        const detailTitle = [
          candidate.latestTitle ? `最近投稿：${candidate.latestTitle}` : "",
          candidate.latestDynamicTitle ? `最近动态：${candidate.latestDynamicTitle}` : "",
        ].filter(Boolean);
        if (detailTitle.length) detail.title = detailTitle.join("\n");
        main.append(detail);
      }

      const badge = document.createElement("span");
      badge.className = "buh-badge";
      badge.textContent = statusLabel(candidate);
      if (candidate.note) badge.title = candidate.note;

      row.append(checkbox, avatar, main, badge);
      fragment.append(row);
    }

    list.append(fragment);
    renderStatus();
    requestAnimationFrame(() => keepPanelInViewport(root));
  }

  function statusLabel(candidate) {
    switch (candidate.status) {
      case "running":
        return "处理中";
      case "done":
        return "已点击";
      case "failed":
        return "失败";
      default:
        return "待处理";
    }
  }

  function renderLogs() {
    const root = document.getElementById(APP_ID);
    const logs = root?.querySelector('[data-role="logs"]');
    if (!logs) return;

    logs.textContent = "";
    for (const item of state.logs) {
      const row = document.createElement("div");
      row.className = `buh-log is-${item.type}`;
      row.textContent = `${item.time} ${item.message}`;
      logs.append(row);
    }
  }

  ensureRoot();

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    state.candidates.clear();
    renderApp();
    addLog("页面地址变化，已重置列表。", "info");
  }, 1000);

  window.addEventListener("resize", () => {
    const root = document.getElementById(APP_ID);
    if (!root) return;
    if (!state.settings.panelMoved) return;
    const rect = root.getBoundingClientRect();
    const position = clampPanelPosition(rect.left, rect.top, root);
    state.settings.panelLeft = position.left;
    state.settings.panelTop = position.top;
    saveSettings();
    applyPanelPosition(root);
  });
})();
