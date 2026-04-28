const WPP_HELPER_BASE_URL = "http://localhost:21466";

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = null;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && (data.message || data.error)) ||
      `Helper local respondeu com status ${response.status}.`;
    throw new Error(message);
  }

  return data;
}

function normalizeBaseUrl(value) {
  const normalized = String(value || "").trim().replace(/\/+$/, "");

  if (typeof window !== "undefined" && normalized.includes("host.docker.internal")) {
    return normalized.replace("host.docker.internal", "localhost");
  }

  return normalized;
}

function normalizeSessionName(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function assertConfig(baseUrl, sessionName) {
  if (!normalizeBaseUrl(baseUrl)) {
    throw new Error("Defina a Base do WPPConnect nas configuracoes do bot.");
  }

  if (!normalizeSessionName(sessionName)) {
    throw new Error("Defina o nome da sessao do WPPConnect nas configuracoes do bot.");
  }
}

async function requestHelper(path, payload = {}) {
  return requestJson(`${WPP_HELPER_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });
}

async function getHelperHealth() {
  return requestJson(`${WPP_HELPER_BASE_URL}/health`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });
}

async function checkSessionConnection({ baseUrl, sessionName }) {
  assertConfig(baseUrl, sessionName);

  return requestHelper("/wpp/check-connection-session", {
    baseUrl: normalizeBaseUrl(baseUrl),
    sessionName: normalizeSessionName(sessionName)
  });
}

async function startSession({ baseUrl, sessionName, waitQrCode = true }) {
  assertConfig(baseUrl, sessionName);

  return requestHelper("/wpp/start-session", {
    baseUrl: normalizeBaseUrl(baseUrl),
    sessionName: normalizeSessionName(sessionName),
    waitQrCode
  });
}

async function getQrCodeSession({ baseUrl, sessionName }) {
  assertConfig(baseUrl, sessionName);

  return requestHelper("/wpp/qrcode-session", {
    baseUrl: normalizeBaseUrl(baseUrl),
    sessionName: normalizeSessionName(sessionName)
  });
}

function extractConnectionStatus(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      connected: false,
      statusText: "Desconhecido",
      raw: payload
    };
  }

  const candidates = [
    payload.status,
    payload.state,
    payload.session,
    payload.response,
    payload.message
  ];
  const flatText = candidates
    .flatMap((item) => {
      if (typeof item === "string") return [item];
      if (item && typeof item === "object") {
        return Object.values(item).filter((value) => typeof value === "string");
      }
      return [];
    })
    .join(" ");

  const connected = /connected|islogged|inchat|open|authenticated/i.test(flatText);
  const statusText =
    flatText.match(/connected|connecting|disconnected|close|qr|authenticated|open/i)?.[0] ||
    "Desconhecido";

  return {
    connected,
    statusText,
    raw: payload
  };
}

function extractQrCode(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  return String(payload.qrcode || payload.base64 || "").trim();
}

export {
  checkSessionConnection,
  extractConnectionStatus,
  extractQrCode,
  getHelperHealth,
  getQrCodeSession,
  startSession
};
