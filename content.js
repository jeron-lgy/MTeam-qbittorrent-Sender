(function () {
  "use strict";

  const HOST_ID = "mteam-qb-sender-host";
  if (window.__mteamQbSenderLoaded) return;
  window.__mteamQbSenderLoaded = true;

  const oldHost = document.getElementById(HOST_ID);
  if (oldHost) oldHost.remove();

  let statusEl = null;
  let sendButton = null;
  let batchButton = null;
  let configButton = null;
  let lastUrl = "";
  let customSites = [];
  let builtInSiteIds = null;

  const BUILT_IN_SITES = [
    { id: "mteam", name: "M-Team", domains: ["m-team.io", "m-team.cc"] },
    { id: "totheglory", name: "ToTheGlory", domains: ["totheglory.im"] },
    { id: "hdhome", name: "HDHome", domains: ["hdhome.org"] },
    { id: "hdsky", name: "HDSky", domains: ["hdsky.me"] },
    { id: "audiences", name: "Audiences", domains: ["audiences.me"] },
    { id: "keepfriends", name: "KeepFriends", domains: ["keepfrds.com"] },
    { id: "hhanclub", name: "HhanClub", domains: ["hhanclub.top"] },
    { id: "tjupt", name: "TJUPT", domains: ["tjupt.org"] },
    { id: "ptlsp", name: "PTLSP", domains: ["ptlsp.com"] },
    { id: "springsunday", name: "SpringSunday", domains: ["springsunday.net"] },
    { id: "hdarea", name: "HDArea", domains: ["hdarea.club"] },
    { id: "hddolby", name: "HDDolby", domains: ["hddolby.com"] }
  ];

  function defaultBuiltInSiteIds() {
    const result = {};
    BUILT_IN_SITES.forEach((site) => {
      result[site.id] = true;
    });
    return result;
  }

  function normalizeBuiltInSiteIds(value) {
    const defaults = defaultBuiltInSiteIds();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return defaults;
    }
    return { ...defaults, ...value };
  }

  function getEnabledBuiltInDomains() {
    const enabled = normalizeBuiltInSiteIds(builtInSiteIds);
    return BUILT_IN_SITES
      .filter((site) => enabled[site.id] !== false)
      .flatMap((site) => site.domains);
  }

  function domainMatches(domain) {
    const value = String(domain || "").trim().toLowerCase();
    return value && (location.hostname === value || location.hostname.endsWith("." + value));
  }

  function isBuiltInDomain() {
    return getEnabledBuiltInDomains().some(domainMatches);
  }

  function isCustomDomain() {
    return customSites.some((site) => site && site.enabled !== false && domainMatches(site.domain));
  }

  function isMTeam() {
    return /(^|\.)m-team\.(io|cc)$/.test(location.hostname);
  }

  function isDetailsLikePage() {
    return /details\.php/i.test(location.pathname) ||
      /\/t\/[0-9a-z_-]+/i.test(location.pathname) ||
      /\/detail(s)?\/[0-9a-z_-]+/i.test(location.pathname);
  }

  function shouldShowWidget() {
    if (!isBuiltInDomain() && !isCustomDomain()) {
      return false;
    }
    if (isMTeam()) {
      return Boolean(getTorrentId());
    }
    return isDetailsLikePage() || Boolean(findDownloadLink());
  }

  function getTorrentId() {
    const match = location.href.match(/\/detail\/([0-9]+)/);
    return match ? match[1] : "";
  }

  function absoluteUrl(value) {
    try {
      return new URL(value, location.href).href;
    } catch (error) {
      return "";
    }
  }

  function findDownloadLink() {
    const links = Array.from(document.querySelectorAll("a[href]"));
    const candidates = links
      .map((link) => ({
        href: absoluteUrl(link.getAttribute("href")),
        text: (link.textContent || "").trim(),
        title: link.getAttribute("title") || ""
      }))
      .filter((item) => item.href);

    const patterns = [
      /download\.php\?/i,
      /download\.php$/i,
      /\/download\/[0-9a-z_-]+/i,
      /\/dl\/[0-9a-z_-]+/i,
      /\.torrent(?:$|\?)/i
    ];
    const byHref = candidates.find((item) => patterns.some((pattern) => pattern.test(item.href)));
    if (byHref) return byHref.href;

    const byText = candidates.find((item) => /下载|download|torrent|种子/i.test(item.text + " " + item.title));
    return byText ? byText.href : "";
  }

  function getApiHost() {
    return localStorage.getItem("apiHost") || "https://api.m-team.cc/api";
  }

  function getAuthToken() {
    return localStorage.getItem("auth") || "";
  }

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.dataset.kind = kind || "idle";
  }

  function setBusy(isBusy) {
    if (sendButton) sendButton.disabled = isBusy;
    if (batchButton) batchButton.disabled = isBusy;
    if (configButton) configButton.disabled = isBusy;
  }

  function loadSiteConfig() {
    return chrome.storage.local.get({ builtInSiteIds: null, customSites: [] }).then((config) => {
      builtInSiteIds = normalizeBuiltInSiteIds(config.builtInSiteIds);
      customSites = Array.isArray(config.customSites) ? config.customSites : [];
    });
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error(response && response.error ? response.error : "未知扩展错误"));
          return;
        }
        resolve(response);
      });
    });
  }

  function updateReadyState() {
    const torrentId = getTorrentId();
    const torrentUrl = findDownloadLink();
    if (isMTeam() && torrentId) {
      setStatus("已识别 M-Team 种子 #" + torrentId, "idle");
    } else if (torrentUrl) {
      setStatus("已识别 PT 下载链接，可发送本页。", "idle");
    } else if (isCustomDomain()) {
      setStatus("已匹配自定义 PT 站，请在种子详情页使用。", "idle");
    } else if (isBuiltInDomain()) {
      setStatus("已匹配 PT 页面，正在等待下载链接。", "idle");
    } else {
      setStatus("当前站点未启用。可在设置里添加小众 PT 站域名。", "idle");
    }
  }

  function summarizeSingleResult(result) {
    if (result.verified) {
      return "发送成功，已在 qB 中确认：" + (result.name || result.hash || "种子");
    }
    if (result.accepted && result.pendingCount > 0) {
      return "qB 已接收，后台处理中：" + result.pendingCount + " 个任务。";
    }
    if (result.accepted) {
      return "qB 已接收，发送模式：" + (result.mode || "未知");
    }
    return "已提交到 qB，发送模式：" + (result.mode || "未知");
  }

  async function sendCurrentTorrent() {
    const torrentId = getTorrentId();
    const torrentUrl = findDownloadLink();
    const payload = {
      siteType: "generic",
      siteName: location.hostname,
      torrentUrl,
      pageUrl: location.href,
      title: document.title
    };

    if (isMTeam() && torrentId) {
      const auth = getAuthToken();
      if (!auth) {
        setStatus("未找到 M-Team 登录凭证，请登录后刷新页面。", "error");
        return;
      }
      payload.siteType = "mteam";
      payload.siteName = "M-Team";
      payload.torrentId = torrentId;
      payload.auth = auth;
      payload.apiHost = getApiHost();
      delete payload.torrentUrl;
    } else if (!torrentUrl) {
      setStatus("未在当前页面找到种子下载链接。", "error");
      return;
    }

    setBusy(true);
    setStatus("正在发送当前种子到 qBittorrent...", "busy");
    try {
      const response = await sendMessage({
        type: "sendTorrent",
        payload
      });
      setStatus(summarizeSingleResult(response.result || {}), "ok");
    } catch (error) {
      setStatus(error.message || String(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function batchSendOpenTabs() {
    setBusy(true);
    setStatus("正在批量发送已打开的 PT 详情页...", "busy");
    try {
      const response = await sendMessage({ type: "batchSendOpenTabs" });
      const result = response.result || {};
      const failed = (result.results || []).find((item) => !item.ok);
      if (result.failCount > 0) {
        setStatus(
          "批量完成：成功 " + result.okCount + " / " + result.total + "，失败 " + result.failCount +
            "。首个错误：" + (failed ? failed.error : "未知错误"),
          "error"
        );
      } else {
        setStatus("批量发送完成：成功 " + result.okCount + " / " + result.total + "。", "ok");
      }
    } catch (error) {
      setStatus(error.message || String(error), "error");
    } finally {
      setBusy(false);
    }
  }

  function openOptions() {
    sendMessage({ type: "openOptions" }).catch((error) => {
      setStatus(error.message || String(error), "error");
    });
  }

  function ensureWidget() {
    if (!shouldShowWidget()) {
      const host = document.getElementById(HOST_ID);
      if (host) host.remove();
      return;
    }

    const existingHost = document.getElementById(HOST_ID);
    if (existingHost && statusEl) {
      updateReadyState();
      return;
    }

    if (existingHost) existingHost.remove();

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = [
      "position:fixed",
      "right:18px",
      "bottom:70px",
      "z-index:2147483647",
      "display:block"
    ].join(";");

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = [
      "<style>",
      ":host{all:initial}",
      ".panel{width:286px;padding:8px;border:1px solid rgba(232,184,198,.82);border-radius:8px;background:rgba(255,250,252,.96);color:#4a3440;box-shadow:0 10px 28px rgba(97,52,73,.16);backdrop-filter:blur(12px);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}",
      ".top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}",
      ".title{font-size:12px;font-weight:650;color:#7b4c61;letter-spacing:0}",
      ".dot{width:7px;height:7px;border-radius:50%;background:#d97898;box-shadow:0 0 0 4px rgba(217,120,152,.14)}",
      ".actions{display:grid;grid-template-columns:1fr 1fr 34px;gap:6px}",
      "button{appearance:none;border:1px solid transparent;border-radius:8px;padding:7px 8px;font-size:12px;line-height:16px;cursor:pointer;letter-spacing:0;font-weight:650;transition:transform .12s ease,box-shadow .12s ease,background .12s ease}",
      "button:hover{transform:translateY(-1px)}",
      "button:disabled{opacity:.58;cursor:wait;transform:none}",
      ".send{background:#d97898;color:#fff;box-shadow:0 5px 12px rgba(217,120,152,.22)}",
      ".batch{background:#8e78aa;color:#fff;box-shadow:0 5px 12px rgba(142,120,170,.2)}",
      ".config{background:#fff;color:#7b4c61;border-color:#efd2dc;padding-left:0;padding-right:0}",
      ".status{margin-top:7px;padding:6px 7px;border-radius:7px;background:#fff;color:#7a6a72;font-size:12px;line-height:1.45;word-break:break-word;border:1px solid rgba(239,210,220,.72)}",
      ".status[data-kind='ok']{color:#3f7a5b;background:#f4fbf6;border-color:#cfe9d7}",
      ".status[data-kind='error']{color:#a33d51;background:#fff5f6;border-color:#efc5cf}",
      ".status[data-kind='busy']{color:#6b528c;background:#f8f5ff;border-color:#dfd4f2}",
      "</style>",
      "<div class='panel'>",
      "  <div class='top'>",
      "    <div class='title'>PT qB 发送</div>",
      "    <div class='dot'></div>",
      "  </div>",
      "  <div class='actions'>",
      "    <button class='send' type='button'>发送本页</button>",
      "    <button class='batch' type='button'>批量发送</button>",
      "    <button class='config' type='button'>设</button>",
      "  </div>",
      "  <div class='status' data-kind='idle'>正在加载...</div>",
      "</div>"
    ].join("");

    sendButton = shadow.querySelector(".send");
    batchButton = shadow.querySelector(".batch");
    configButton = shadow.querySelector(".config");
    statusEl = shadow.querySelector(".status");
    sendButton.addEventListener("click", sendCurrentTorrent);
    batchButton.addEventListener("click", batchSendOpenTabs);
    configButton.addEventListener("click", openOptions);

    (document.body || document.documentElement).appendChild(host);
    updateReadyState();
  }

  function watchUrlChanges() {
    const check = () => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      ensureWidget();
      updateReadyState();
    };

    const wrap = (method) => {
      const original = history[method];
      history[method] = function () {
        const result = original.apply(this, arguments);
        setTimeout(check, 0);
        return result;
      };
    };

    wrap("pushState");
    wrap("replaceState");
    window.addEventListener("popstate", check);
    window.addEventListener("hashchange", check);
    setInterval(check, 1000);
  }

  function start() {
    loadSiteConfig().finally(() => {
      ensureWidget();
      watchUrlChanges();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
