const fields = {
  qbAddress: document.getElementById("qbAddress"),
  qbUsername: document.getElementById("qbUsername"),
  qbPassword: document.getElementById("qbPassword"),
  savePath: document.getElementById("savePath"),
  category: document.getElementById("category"),
  mode: document.getElementById("mode"),
  autoStart: document.getElementById("autoStart")
};

const statusEl = document.getElementById("status");

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind || "";
}

function readForm() {
  return {
    qbAddress: fields.qbAddress.value.trim().replace(/\/+$/, ""),
    qbUsername: fields.qbUsername.value,
    qbPassword: fields.qbPassword.value,
    savePath: fields.savePath.value,
    category: fields.category.value,
    mode: fields.mode.value,
    autoStart: fields.autoStart.checked
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
