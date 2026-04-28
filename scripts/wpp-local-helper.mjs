import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import process from "node:process";

const DEFAULT_ENV_FILE = process.env.RET_LOCAL_ENV_FILE || "C:\\Local Server\\ret-worker.env";
const DEFAULT_PORT = 21466;

function applyEnvOverrides(rawContent = "") {
  for (const line of String(rawContent || "").split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#") || trimmedLine.startsWith("//")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!key) {
      continue;
    }

    process.env[key] = value;
  }
}

async function loadLocalEnvFile(filePath = DEFAULT_ENV_FILE) {
  try {
    const rawContent = await readFile(String(filePath || "").trim(), "utf8");
    applyEnvOverrides(rawContent);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "").replace("host.docker.internal", "localhost");
}

function normalizeSessionName(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function normalizeToken(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function buildSessionIdentifier(sessionName, token) {
  const normalizedSessionName = normalizeSessionName(sessionName);
  const normalizedToken = normalizeToken(token);

  if (!normalizedSessionName) {
    throw new Error("Defina o nome da sessao do WPPConnect nas configuracoes do bot.");
  }

  if (!normalizedToken) {
    throw new Error("Defina o token local do WPPConnect.");
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

function getLocalToken() {
  return normalizeToken(process.env.RET_WPPCONNECT_BEARER_TOKEN);
}

function buildEndpoint(baseUrl, sessionName, token, route) {
  return `${normalizeBaseUrl(baseUrl)}/api/${buildSessionIdentifier(sessionName, token)}/${route}`;
}

function jsonHeaders(statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  };
}

function sendJson(response, statusCode, payload) {
  const { headers } = jsonHeaders(statusCode);
  response.writeHead(statusCode, headers);
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Corpo JSON invalido.");
  }
}

async function requestWppJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("image/png")) {
    const buffer = Buffer.from(await response.arrayBuffer());

    if (!response.ok) {
      throw new Error(`WPPConnect respondeu com status ${response.status}.`);
    }

    return {
      status: "QRCODE",
      qrcode: `data:image/png;base64,${buffer.toString("base64")}`
    };
  }

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

async function proxyToWpp(route, payload = {}, method = "GET") {
  const token = getLocalToken();
  const baseUrl = normalizeBaseUrl(payload.baseUrl);
  const sessionName = normalizeSessionName(payload.sessionName);

  if (!baseUrl) {
    throw new Error("Base do WPPConnect nao informada.");
  }

  const url = buildEndpoint(baseUrl, sessionName, token, route);
  const headers = buildHeaders(token, method === "POST" ? { "Content-Type": "application/json" } : {});
  const body = method === "POST" ? JSON.stringify(payload.body || {}) : undefined;

  return requestWppJson(url, {
    method,
    headers,
    body
  });
}

async function handleRequest(request, response) {
  if (request.method === "OPTIONS") {
    const { headers } = jsonHeaders(204);
    response.writeHead(204, headers);
    response.end();
    return;
  }

  try {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, {
        ok: true,
        tokenConfigured: Boolean(getLocalToken())
      });
      return;
    }

    if (request.method === "POST" && request.url === "/wpp/check-connection-session") {
      const payload = await readJsonBody(request);
      const data = await proxyToWpp("check-connection-session", payload, "GET");
      sendJson(response, 200, data);
      return;
    }

    if (request.method === "POST" && request.url === "/wpp/start-session") {
      const payload = await readJsonBody(request);
      const data = await proxyToWpp(
        "start-session",
        {
          ...payload,
          body: {
            waitQrCode: payload.waitQrCode !== false
          }
        },
        "POST"
      );
      sendJson(response, 200, data);
      return;
    }

    if (request.method === "POST" && request.url === "/wpp/qrcode-session") {
      const payload = await readJsonBody(request);
      const data = await proxyToWpp("qrcode-session", payload, "GET");
      sendJson(response, 200, data);
      return;
    }

    sendJson(response, 404, {
      message: "Rota local nao encontrada."
    });
  } catch (error) {
    sendJson(response, 500, {
      message: error?.message || "Falha interna no helper local."
    });
  }
}

async function main() {
  await loadLocalEnvFile();

  const server = createServer((request, response) => {
    handleRequest(request, response);
  });

  server.listen(DEFAULT_PORT, "127.0.0.1", () => {
    console.log(`Helper local WPP ativo em http://127.0.0.1:${DEFAULT_PORT}`);
  });
}

main().catch((error) => {
  console.error("Falha ao iniciar helper local WPP:", error?.message || error);
  process.exitCode = 1;
});
