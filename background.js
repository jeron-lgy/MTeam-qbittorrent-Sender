const QB_RULE_ID = 1001;
const TAB_URLS = ["http://*/*", "https://*/*"];

function normalizeAddress(address) {
  return String(address || "").replace(/\/+$/, "");
}

function originOf(address) {
  return new URL(address).origin;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isMTeamDetailUrl(url) {
  return /^https:\/\/(?:[^/]+\.)?m-team\.(?:io|cc)\/detail\/[0-9]+/.test(String(url || ""));
}

function isLikelyTorrentPayload(payload) {
  return Boolean(payload && (payload.torrentUrl || (payload.siteType === "mteam" && payload.torrentId)));
}

function formBody(data) {
  const body = new URLSearchParams();
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      body.append(key, String(value));
    }
  });
  return body;
}

function isQbEmptySuccess(response, text) {
  const body = String(text || "").trim();
  return response.status === 204 || (response.ok && (body === "" || body === "Ok."));
}

function parseQbAddResponse(response, text) {
  const body = String(text || "").trim();
  if (isQbEmptySuccess(response, body)) {
    return {
      accepted: true,
      pendingCount: 0,
      successCount: 1,
      failureCount: 0,
      raw: body
    };
  }

  if (response.status === 202 && body) {
    try {
      const data = JSON.parse(body);
      const pendingCount = Number(data.pending_count || 0);
      const successCount = Number(data.success_count || 0);
      const failureCount = Number(data.failure_count || 0);
      const accepted = failureCount === 0 && (pendingCount > 0 || successCount > 0);
      return {
        accepted,
        pendingCount,
        successCount,
        failureCount,
        addedTorrentIds: data.added_torrent_ids || [],
        raw: body
      };
    } catch (error) {
      return {
        accepted: false,
        pendingCount: 0,
        successCount: 0,
        failureCount: 0,
        raw: body
      };
    }
  }

  return {
    accepted: false,
    pendingCount: 0,
    successCount: 0,
    failureCount: 0,
    raw: body
  };
}

async function readResponseText(response) {
  try {
    return await response.text();
  } catch (error) {
    return "";
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConfig() {
  return chrome.storage.local.get({
    qbAddress: "",
    qbUsername: "",
    qbPassword: "",
    savePath: "",
    category: "M-Team",
    mode: "upload",
    autoStart: true,
    customSites: []
  });
}

async function saveConfig(config) {
  await chrome.storage.local.set(config);
}

async function getReadyConfig() {
  const config = await getConfig();
  config.qbAddress = normalizeAddress(config.qbAddress);
  if (!config.qbAddress || !config.qbUsername || !config.qbPassword) {
    throw new Error("请先配置 qBittorrent 地址、用户名和密码。");
  }
  return config;
}

async function ensureQbHeaders(qbAddress) {
  const address = normalizeAddress(qbAddress);
  const origin = originOf(address);
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [QB_RULE_ID],
    addRules: [
      {
        id: QB_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            { header: "Origin", operation: "set", value: origin },
            { header: "Referer", operation: "set", value: origin + "/" }
          ]
        },
        condition: {
          regexFilter: "^" + escapeRegex(origin) + "/.*",
          resourceTypes: ["xmlhttprequest"]
        }
      }
    ]
  });
}

async function qbFetch(config, path, options = {}) {
  const address = normalizeAddress(config.qbAddress);
  await ensureQbHeaders(address);
  const url = address + path;
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    referrer: originOf(address) + "/",
    referrerPolicy: "unsafe-url"
  });
  return response;
}

async function loginQb(config) {
  const response = await qbFetch(config, "/api/v2/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    },
    body: formBody({
      username: config.qbUsername,
      password: config.qbPassword
    })
  });
  const text = await readResponseText(response);
  if (!isQbEmptySuccess(response, text)) {
    throw new Error("qBittorrent login failed: HTTP " + response.status + " " + text);
  }

  const cookies = await chrome.cookies.getAll({ url: normalizeAddress(config.qbAddress) + "/" });
  const hasSid = cookies.some((cookie) => /^SID/.test(cookie.name));
  if (!hasSid) {
    console.warn("MTeam qB Sender: qB login succeeded but no SID cookie was visible.");
  }

  return getQbVersion(config);
}

async function getQbVersion(config) {
  const response = await qbFetch(config, "/api/v2/app/version", { method: "GET" });
  const text = await readResponseText(response);
  const version = text.trim();
  if (!response.ok || !version) {
    throw new Error("qBittorrent auth verification failed: HTTP " + response.status + " " + text);
  }
  return version;
}

async function getMTeamTorrentUrl({ torrentId, apiHost, auth }) {
  if (!torrentId) {
    throw new Error("No M-Team torrent id found in current page URL.");
  }
  if (!auth) {
    throw new Error("No M-Team auth token found. Please log in to M-Team and refresh the page.");
  }
  const host = apiHost || "https://api.m-team.cc/api";
  const response = await fetch(host.replace(/\/+$/, "") + "/torrent/genDlToken", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "TS": String(Math.floor(Date.now() / 1000)),
      "Authorization": auth
    },
    body: formBody({ id: torrentId }),
    credentials: "include"
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error("M-Team returned non-JSON response: " + text.slice(0, 160));
  }
  if (data.code !== "0") {
    throw new Error("M-Team failed to create download token: " + (data.message || text));
  }
  return data.data;
}

async function getTorrentUrl(payload) {
  if (payload.torrentUrl) {
    return payload.torrentUrl;
  }
  if (payload.siteType === "mteam" || payload.torrentId) {
    return getMTeamTorrentUrl(payload);
  }
  throw new Error("未找到种子下载链接。");
}

async function downloadTorrentFile(torrentUrl, auth) {
  const headers = {};
  if (auth) {
    headers.Authorization = auth;
  }
  const response = await fetch(torrentUrl, {
    method: "GET",
    headers,
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error("Failed to download torrent file: HTTP " + response.status);
  }
  return response.blob();
}

function readBencodeString(bytes, index) {
  let cursor = index;
  while (cursor < bytes.length && bytes[cursor] >= 48 && bytes[cursor] <= 57) {
    cursor += 1;
  }
  if (bytes[cursor] !== 58 || cursor === index) {
    throw new Error("Invalid torrent file: bad bencode string.");
  }
  const length = Number(new TextDecoder().decode(bytes.slice(index, cursor)));
  const start = cursor + 1;
  const end = start + length;
  if (!Number.isFinite(length) || end > bytes.length) {
    throw new Error("Invalid torrent file: bencode string out of range.");
  }
  return { start, end, next: end };
}

function skipBencode(bytes, index) {
  const token = bytes[index];
  if (token === 105) {
    const end = bytes.indexOf(101, index + 1);
    if (end === -1) throw new Error("Invalid torrent file: unterminated integer.");
    return end + 1;
  }
  if (token === 108) {
    let cursor = index + 1;
    while (bytes[cursor] !== 101) cursor = skipBencode(bytes, cursor);
    return cursor + 1;
  }
  if (token === 100) {
    let cursor = index + 1;
    while (bytes[cursor] !== 101) {
      const key = readBencodeString(bytes, cursor);
      cursor = skipBencode(bytes, key.next);
    }
    return cursor + 1;
  }
  if (token >= 48 && token <= 57) {
    return readBencodeString(bytes, index).next;
  }
  throw new Error("Invalid torrent file: unknown bencode token.");
}

function findInfoDictionary(bytes) {
  if (bytes[0] !== 100) {
    throw new Error("Invalid torrent file: top-level dictionary not found.");
  }

  const decoder = new TextDecoder();
  let cursor = 1;
  while (cursor < bytes.length && bytes[cursor] !== 101) {
    const key = readBencodeString(bytes, cursor);
    const keyText = decoder.decode(bytes.slice(key.start, key.end));
    const valueStart = key.next;
    const valueEnd = skipBencode(bytes, valueStart);
    if (keyText === "info") {
      return bytes.slice(valueStart, valueEnd);
    }
    cursor = valueEnd;
  }
  throw new Error("Invalid torrent file: info dictionary not found.");
}

async function getTorrentHashFromBlob(torrentBlob) {
  const buffer = await torrentBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const infoDictionary = findInfoDictionary(bytes);
  const digest = await crypto.subtle.digest("SHA-1", infoDictionary);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getQbTorrentByHash(config, hash) {
  const response = await qbFetch(config, "/api/v2/torrents/info?hashes=" + encodeURIComponent(hash), {
    method: "GET"
  });
  const text = await readResponseText(response);
  if (!response.ok) {
    throw new Error("qBittorrent verification failed: HTTP " + response.status + " " + text);
  }
  const data = JSON.parse(text || "[]");
  return data && data.length ? data[0] : null;
}

async function waitForQbTorrent(config, hash) {
  for (let i = 0; i < 12; i += 1) {
    const torrent = await getQbTorrentByHash(config, hash);
    if (torrent) return torrent;
    await sleep(800);
  }
  return null;
}

async function addTorrentUrl(config, torrentUrl) {
  const response = await qbFetch(config, "/api/v2/torrents/add", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    },
    body: formBody({
      urls: torrentUrl,
      savepath: config.savePath,
      category: config.category,
      paused: config.autoStart ? "false" : "true",
      stopped: config.autoStart ? "false" : "true"
    })
  });
  const text = await readResponseText(response);
  const result = parseQbAddResponse(response, text);
  if (!result.accepted) {
    throw new Error("qBittorrent add URL failed: HTTP " + response.status + " " + text);
  }
  return result;
}

async function addTorrentFile(config, torrentBlob) {
  const form = new FormData();
  form.append("torrents", torrentBlob, "mteam.torrent");
  if (config.savePath) form.append("savepath", config.savePath);
  if (config.category) form.append("category", config.category);
  form.append("paused", config.autoStart ? "false" : "true");
  form.append("stopped", config.autoStart ? "false" : "true");

  const response = await qbFetch(config, "/api/v2/torrents/add", {
    method: "POST",
    body: form
  });
  const text = await readResponseText(response);
  const result = parseQbAddResponse(response, text);
  if (!result.accepted) {
    throw new Error("qBittorrent upload failed: HTTP " + response.status + " " + text);
  }
  return result;
}

async function sendTorrentWithConfig(payload, config, options = {}) {
  if (!options.skipLogin) {
    await loginQb(config);
  }
  const torrentUrl = await getTorrentUrl(payload);
  if (config.mode === "url") {
    const addResult = await addTorrentUrl(config, torrentUrl);
    return {
      mode: "url",
      verified: false,
      accepted: true,
      pendingCount: addResult.pendingCount,
      successCount: addResult.successCount,
      failureCount: addResult.failureCount
    };
  }

  const blob = await downloadTorrentFile(torrentUrl, payload.auth);
  const hash = await getTorrentHashFromBlob(blob);
  const addResult = await addTorrentFile(config, blob);
  const torrent = await waitForQbTorrent(config, hash);
  return {
    mode: "upload",
    hash,
    accepted: true,
    pendingCount: addResult.pendingCount,
    successCount: addResult.successCount,
    failureCount: addResult.failureCount,
    verified: Boolean(torrent),
    name: torrent ? torrent.name : ""
  };
}

async function sendTorrent(payload) {
  const config = await getReadyConfig();
  return sendTorrentWithConfig(payload, config);
}

async function getMTeamPayloadFromTab(tab, customSites) {
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [customSites || []],
    func: (customSitesArg) => {
      const builtInDomains = [
        "m-team.io",
        "m-team.cc",
        "totheglory.im",
        "hdhome.org",
        "hdsky.me",
        "audiences.me",
        "keepfrds.com",
        "hhanclub.top",
        "tjupt.org",
        "ptlsp.com",
        "springsunday.net",
        "hdarea.club",
        "hddolby.com"
      ];
      const isMTeam = /(^|\.)m-team\.(io|cc)$/.test(location.hostname);
      const mteamMatch = location.href.match(/\/detail\/([0-9]+)/);
      const isBuiltInDomain = builtInDomains.some((domain) => location.hostname === domain || location.hostname.endsWith("." + domain));
      const isCustomDomain = (Array.isArray(customSitesArg) ? customSitesArg : []).some((site) => {
        if (!site || site.enabled === false || !site.domain) return false;
        const domain = String(site.domain).trim().toLowerCase();
        return location.hostname === domain || location.hostname.endsWith("." + domain);
      });

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

      function isDetailsLikePage() {
        return /details\.php/i.test(location.pathname) ||
          /\/t\/[0-9a-z_-]+/i.test(location.pathname) ||
          /\/detail(s)?\/[0-9a-z_-]+/i.test(location.pathname);
      }

      if (isMTeam && mteamMatch) {
        return {
          siteType: "mteam",
          siteName: "M-Team",
          torrentId: mteamMatch[1],
          auth: localStorage.getItem("auth") || "",
          apiHost: localStorage.getItem("apiHost") || "https://api.m-team.cc/api",
          pageUrl: location.href,
          title: document.title
        };
      }

      if (!isDetailsLikePage() && !isBuiltInDomain && !isCustomDomain) {
        return { supported: false };
      }

      const torrentUrl = findDownloadLink();
      return {
        siteType: "generic",
        siteName: location.hostname,
        torrentId: "",
        torrentUrl,
        pageUrl: location.href,
        title: document.title
      };
    }
  });
  return result && result[0] ? result[0].result : null;
}

async function batchSendOpenTabs() {
  const tabs = await chrome.tabs.query({ url: TAB_URLS });
  const detailTabs = tabs
    .filter((tab) => tab.id && /^https?:\/\//.test(String(tab.url || "")))
    .sort((a, b) => (a.windowId - b.windowId) || (a.index - b.index));

  if (!detailTabs.length) {
    throw new Error("没有找到已打开的 PT 种子详情页。");
  }

  const baseConfig = await getConfig();
  const customSites = Array.isArray(baseConfig.customSites) ? baseConfig.customSites : [];
  const payloads = [];
  const seen = new Set();
  const collectErrors = [];

  for (const tab of detailTabs) {
    try {
      const payload = await getMTeamPayloadFromTab(tab, customSites);
      if (!isLikelyTorrentPayload(payload)) {
        continue;
      }
      if (payload.siteType === "mteam" && !payload.auth) {
        collectErrors.push({ ok: false, title: tab.title || tab.url, error: "未找到 M-Team 登录凭证" });
        continue;
      }
      const dedupeKey = payload.siteType + ":" + (payload.torrentId || payload.torrentUrl);
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      payloads.push(payload);
    } catch (error) {
      collectErrors.push({
        ok: false,
        title: tab.title || tab.url,
        error: error.message || String(error)
      });
    }
  }

  if (!payloads.length) {
    throw new Error(collectErrors[0] ? collectErrors[0].error : "没有可发送的 PT 种子详情页。");
  }

  const config = await getReadyConfig();
  await loginQb(config);

  const results = [];
  for (const payload of payloads) {
    try {
      const result = await sendTorrentWithConfig(payload, config, { skipLogin: true });
      results.push({
        ok: true,
        torrentId: payload.torrentId,
        title: payload.title,
        result
      });
    } catch (error) {
      results.push({
        ok: false,
        torrentId: payload.torrentId,
        title: payload.title,
        error: error.message || String(error)
      });
    }
  }

  collectErrors.forEach((item) => results.push(item));
  const okCount = results.filter((item) => item.ok).length;
  const failCount = results.length - okCount;

  return {
    total: results.length,
    openedDetailTabs: detailTabs.length,
    sentCount: payloads.length,
    okCount,
    failCount,
    results
  };
}

async function testConfig(config) {
  const merged = {
    ...(await getConfig()),
    ...config
  };
  merged.qbAddress = normalizeAddress(merged.qbAddress);
  const version = await loginQb(merged);
  return { version };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "getConfig") {
      sendResponse({ ok: true, config: await getConfig() });
      return;
    }
    if (message.type === "saveConfig") {
      await saveConfig(message.config || {});
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "testConfig") {
      sendResponse({ ok: true, result: await testConfig(message.config || {}) });
      return;
    }
    if (message.type === "sendTorrent") {
      sendResponse({ ok: true, result: await sendTorrent(message.payload || {}) });
      return;
    }
    if (message.type === "batchSendOpenTabs") {
      sendResponse({ ok: true, result: await batchSendOpenTabs() });
      return;
    }
    if (message.type === "openOptions") {
      await chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false, error: "Unknown message type: " + message.type });
  })().catch((error) => {
    console.error("MTeam qB Sender error", error);
    sendResponse({ ok: false, error: error.message || String(error) });
  });
  return true;
});

async function injectContentScriptIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: TAB_URLS });
  await Promise.allSettled(
    tabs
      .filter((tab) => tab.id)
      .map((tab) => chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      }))
  );
}

chrome.runtime.onInstalled.addListener(() => {
  injectContentScriptIntoOpenTabs().catch((error) => {
    console.warn("MTeam qB Sender: failed to inject into open tabs", error);
  });
});
