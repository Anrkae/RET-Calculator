function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function buildHeaders(token = "", extraHeaders = {}) {
  const headers = {
    Accept: "application/json",
    ...extraHeaders
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

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
      `WPPConnect respondeu com status ${response.status}.`;
    throw new Error(message);
  }

  return data;
}

function assertConfig(baseUrl, sessionName, token) {
  if (!normalizeBaseUrl(baseUrl)) {
    throw new Error("Defina a Base do WPPConnect nas configuracoes do bot.");
  }

  if (!String(sessionName || "").trim()) {
    throw new Error("Defina o nome da sessao do WPPConnect nas configuracoes do bot.");
  }

  if (!String(token || "").trim()) {
    throw new Error("Defina o bearer token do WPPConnect nas configuracoes do bot.");
  }
}

async function checkSessionConnection({ baseUrl, sessionName, token }) {
  assertConfig(baseUrl, sessionName, token);

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return requestJson(`${normalizedBaseUrl}/api/${encodeURIComponent(sessionName)}/check-connection-session`, {
    method: "GET",
    headers: buildHeaders(token)
  });
}

async function startSession({ baseUrl, sessionName, token, waitQrCode = true }) {
  assertConfig(baseUrl, sessionName, token);

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return requestJson(`${normalizedBaseUrl}/api/${encodeURIComponent(sessionName)}/start-session`, {
    method: "POST",
    headers: buildHeaders(token, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      waitQrCode
    })
  });
}

async function getQrCodeSession({ baseUrl, sessionName, token }) {
  assertConfig(baseUrl, sessionName, token);

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return requestJson(`${normalizedBaseUrl}/api/${encodeURIComponent(sessionName)}/qrcode-session`, {
    method: "GET",
    headers: buildHeaders(token)
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
      if (item && typeof item === "object") return Object.values(item).filter((value) => typeof value === "string");
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
  if (!payload) return "";

  const queue = [payload];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    if (typeof current === "string") {
      if (current.startsWith("data:image")) return current;
      if (/^[A-Za-z0-9+/=\r\n]+$/.test(current) && current.length > 500) {
        return `data:image/png;base64,${current.replace(/\s+/g, "")}`;
      }
      continue;
    }
    if (typeof current !== "object") continue;
    seen.add(current);

    for (const value of Object.values(current)) {
      queue.push(value);
    }
  }

  return "";
}

export {
  checkSessionConnection,
  extractConnectionStatus,
  extractQrCode,
  getQrCodeSession,
  startSession
};
