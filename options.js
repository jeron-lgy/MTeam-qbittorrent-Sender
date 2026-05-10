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

const fields = {
  qbAddress: document.getElementById("qbAddress"),
  qbUsername: document.getElementById("qbUsername"),
  qbPassword: document.getElementById("qbPassword"),
  savePath: document.getElementById("savePath"),
  category: document.getElementById("category"),
  mode: document.getElementById("mode"),
  autoStart: document.getElementById("autoStart"),
  builtInSites: document.getElementById("builtInSites"),
  customSitesText: document.getElementById("customSitesText")
};

const statusEl = document.getElementById("status");

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

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind || "";
}

function renderBuiltInSites(config) {
  const enabled = normalizeBuiltInSiteIds(config && config.builtInSiteIds);
  fields.builtInSites.innerHTML = "";

  BUILT_IN_SITES.forEach((site) => {
    const label = document.createElement("label");
    label.className = "site-option";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.siteId = site.id;
    input.checked = enabled[site.id] !== false;

    const text = document.createElement("span");
    text.className = "site-text";

    const name = document.createElement("span");
    name.className = "site-name";
    name.textContent = site.name;

    const domains = document.createElement("span");
    domains.className = "site-domains";
    domains.textContent = site.domains.join(", ");

    text.append(name, domains);
    label.append(input, text);
    fields.builtInSites.append(label);
  });
}

function readBuiltInSiteIds() {
  const result = {};
  fields.builtInSites.querySelectorAll("input[type='checkbox']").forEach((input) => {
    result[input.dataset.siteId] = input.checked;
  });
  return normalizeBuiltInSiteIds(result);
}

function readForm() {
  const customSites = fields.customSitesText.value
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean)
    .map((domain) => ({ domain, enabled: true }));

  return {
    qbAddress: fields.qbAddress.value.trim().replace(/\/+$/, ""),
    qbUsername: fields.qbUsername.value,
    qbPassword: fields.qbPassword.value,
    savePath: fields.savePath.value,
    category: fields.category.value,
    mode: fields.mode.value,
    autoStart: fields.autoStart.checked,
    builtInSiteIds: readBuiltInSiteIds(),
    customSites
  };
}

function fillForm(config) {
  fields.qbAddress.value = config.qbAddress || "";
  fields.qbUsername.value = config.qbUsername || "";
  fields.qbPassword.value = config.qbPassword || "";
  fields.savePath.value = config.savePath || "";
  fields.category.value = config.category || "M-Team";
  fields.mode.value = config.mode || "upload";
  fields.autoStart.checked = config.autoStart !== false;
  renderBuiltInSites(config);
  fields.customSitesText.value = Array.isArray(config.customSites)
    ? config.customSites
      .filter((site) => site && site.enabled !== false && site.domain)
      .map((site) => site.domain)
      .join("\n")
    : "";
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
        reject(new Error(response && response.error ? response.error : "Unknown extension error"));
        return;
      }
      resolve(response);
    });
  });
}

async function load() {
  const response = await sendMessage({ type: "getConfig" });
  fillForm(response.config);
}

async function save() {
  await sendMessage({ type: "saveConfig", config: readForm() });
  setStatus("已保存", "ok");
}

async function test() {
  setStatus("正在测试连接...", "");
  try {
    const response = await sendMessage({ type: "testConfig", config: readForm() });
    setStatus("连接成功，qBittorrent " + response.result.version, "ok");
  } catch (error) {
    setStatus(error.message || String(error), "error");
  }
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("test").addEventListener("click", test);

load().catch((error) => setStatus(error.message || String(error), "error"));
