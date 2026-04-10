function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeSessionName(value) {
  return String(value || "").trim();
}

function normalizeToken(value) {
  return String(value || "").trim();
}

function buildSessionIdentifier(sessionName, token) {
  const normalizedSessionName = normalizeSessionName(sessionName);
  const normalizedToken = normalizeToken(token);

  if (!normalizedSessionName) {
    throw new Error("Defina o nome da sessao do WPPConnect nas configuracoes do bot.");
  }

  if (!normalizedToken) {
    throw new Error("Defina o token do WPPConnect nas configuracoes do bot.");
  }

  if (normalizedToken.startsWith(`${normalizedSessionName}:`)) {
    return encodeURIComponent(normalizedToken);
  }

  return encodeURIComponent(normalizedSessionName);
}

function buildHeaders(token = "", extraHeaders = {}) {
  const normalizedToken = normalizeToken(token);
  const headers = {
    Accept: "application/json",
    ...extraHeaders
  };

  if (normalizedToken && !normalizedToken.includes(":")) {
    headers.Authorization = `Bearer ${normalizedToken}`;
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

  buildSessionIdentifier(sessionName, token);
}

function buildEndpoint(baseUrl, sessionName, token, route) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const sessionIdentifier = buildSessionIdentifier(sessionName, token);
  return `${normalizedBaseUrl}/api/${sessionIdentifier}/${route}`;
}

async function checkSessionConnection({ baseUrl, sessionName, token }) {
  assertConfig(baseUrl, sessionName, token);

  return requestJson(buildEndpoint(baseUrl, sessionName, token, "check-connection-session"), {
    method: "GET",
    headers: buildHeaders(token)
  });
}

async function startSession({ baseUrl, sessionName, token, waitQrCode = true }) {
  assertConfig(baseUrl, sessionName, token);

  return requestJson(buildEndpoint(baseUrl, sessionName, token, "start-session"), {
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

  return requestJson(buildEndpoint(baseUrl, sessionName, token, "qrcode-session"), {
    method: "GET",
    headers: buildHeaders(token)
  });
}

async function closeSession({ baseUrl, sessionName, token }) {
  assertConfig(baseUrl, sessionName, token);

  return requestJson(buildEndpoint(baseUrl, sessionName, token, "close-session"), {
    method: "POST",
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
  closeSession,
  extractConnectionStatus,
  extractQrCode,
  getQrCodeSession,
  startSession
};
