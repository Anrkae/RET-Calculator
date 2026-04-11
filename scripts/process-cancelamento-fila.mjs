import { readFile } from "node:fs/promises";
import process from "node:process";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DEFAULT_CANCELAMENTO_WEBHOOK_URL = "http://localhost:5678/webhook/cancelamento-whatsapp";
const DEFAULT_DEMANDA_WEBHOOK_URL = "http://localhost:5678/webhook/demanda-whatsapp";
const DEFAULT_INTERVAL_MS = 5000;
const BOT_SETTINGS_COLLECTION = "configuracoesBot";
const BOT_SETTINGS_DOC = "default";
const SUPERVISOR_GROUPS_COLLECTION = "supervisorGrupos";

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

async function loadServiceAccount(filePath) {
  if (!filePath) {
    throw new Error("Informe o caminho da service account com --service-account.");
  }

  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function ensureAdmin(serviceAccountPath) {
  const serviceAccount = await loadServiceAccount(serviceAccountPath);

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount)
    });
  }
}

function normalizeUrl(baseUrl, path, fallbackUrl) {
  const normalizedBase = String(baseUrl || "").trim().replace(/\/+$/, "");
  const normalizedPath = String(path || "").trim();

  if (!normalizedBase || !normalizedPath) {
    return fallbackUrl;
  }

  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  const safePath = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  return `${normalizedBase}${safePath}`;
}

function normalizeSupervisor(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
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
    throw new Error("Defina o token do WPPConnect nas configuracoes do bot.");
  }

  if (normalizedToken.startsWith(`${normalizedSessionName}:`)) {
    return encodeURIComponent(normalizedToken);
  }

  return encodeURIComponent(normalizedSessionName);
}

function buildWppconnectRequest(settings) {
  const baseUrl = normalizeBaseUrl(settings?.wppconnectBaseUrl);
  const sessionName = normalizeSessionName(settings?.wppconnectSessionName);
  const token = normalizeToken(settings?.wppconnectBearerToken);

  if (!baseUrl) {
    throw new Error("Defina a Base do WPPConnect nas configuracoes do bot.");
  }

  const sessionIdentifier = buildSessionIdentifier(sessionName, token);
  const headers = {
    accept: "application/json,text/html,application/xhtml+xml,application/xml,text/*;q=0.9, image/*;q=0.8, */*;q=0.7"
  };

  if (token && !token.includes(":")) {
    headers.Authorization = `Bearer ${token}`;
  }

  return {
    baseUrl,
    sessionName,
    sessionIdentifier,
    tokenMode: token.includes(":") ? "path" : "bearer",
    url: `${baseUrl}/api/${sessionIdentifier}/send-message`,
    headers
  };
}

async function loadRuntimeConfig(db) {
  const [settingsSnap, mappingsSnap] = await Promise.all([
    db.collection(BOT_SETTINGS_COLLECTION).doc(BOT_SETTINGS_DOC).get(),
    db.collection(SUPERVISOR_GROUPS_COLLECTION).get()
  ]);

  const settings = settingsSnap.exists ? settingsSnap.data() : {};
  const mappings = mappingsSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  return {
    settings,
    mappings
  };
}

function resolveRouting(data, runtimeConfig, cliOptions) {
  const supervisor = String(data.supervisor || "").trim();
  const normalizedItemSupervisor = normalizeSupervisor(supervisor);
  const normalizedCliSupervisor = normalizeSupervisor(cliOptions.supervisorFilter);

  if (normalizedCliSupervisor && normalizedItemSupervisor !== normalizedCliSupervisor) {
    return {
      allowed: false,
      reason: `Supervisor fora do filtro ativo: ${cliOptions.supervisorFilter}`
    };
  }

  const mapping = runtimeConfig.mappings.find((item) => {
    return Boolean(item.enabled) && normalizeSupervisor(item.supervisor) === normalizedItemSupervisor;
  });

  if (mapping?.groupId) {
    return {
      allowed: true,
      groupId: String(mapping.groupId).trim(),
      routingMode: "supervisor_group"
    };
  }

  const fallbackGroupId =
    String(cliOptions.fallbackGroupId || runtimeConfig.settings.fallbackGroupId || "").trim();

  if (fallbackGroupId) {
    return {
      allowed: true,
      groupId: fallbackGroupId,
      routingMode: "fallback_group"
    };
  }

  return {
    allowed: false,
    reason: supervisor
      ? `Nenhum grupo configurado para o supervisor ${supervisor}`
      : "Supervisor nao informado e nenhum grupo padrao configurado"
  };
}

async function markBlocked(docSnap, data, reason) {
  await docSnap.ref.update({
    status: "blocked_supervisor",
    sentAt: null,
    attempts: data.attempts || 0,
    lastError: reason,
    lastAttemptAt: new Date().toISOString()
  });
}

async function sendWebhook(webhookUrl, payload) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Webhook respondeu com status ${response.status}`);
  }
}

async function processCancelamentos(db, webhookUrl, runtimeConfig, cliOptions) {
  const snapshot = await db
    .collection("cancelamentoFila")
    .where("status", "==", "pending")
    .limit(20)
    .get();

  if (snapshot.empty) return;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const routing = resolveRouting(data, runtimeConfig, cliOptions);

    if (!routing.allowed) {
      await markBlocked(docSnap, data, routing.reason);
      console.log(`Cancelamento bloqueado: ${docSnap.id} -> ${routing.reason}`);
      continue;
    }

    try {
      const whatsappRequest = buildWppconnectRequest(runtimeConfig.settings);

      await sendWebhook(webhookUrl, {
        operator: data.operator,
        operatorName: data.operatorName,
        cancelCountOfDay: data.cancelCountOfDay,
        reason: data.reason,
        contract: data.contract || "",
        observation: data.observation || "",
        duration: data.duration,
        time: data.time,
        supervisor: data.supervisor || "",
        groupId: routing.groupId,
        routingMode: routing.routingMode,
        whatsappRequest
      });

      await docSnap.ref.update({
        status: "sent",
        sentAt: new Date().toISOString(),
        attempts: (data.attempts || 0) + 1,
        lastError: null,
        targetGroupId: routing.groupId,
        routingMode: routing.routingMode
      });

      console.log(`Cancelamento enviado: ${docSnap.id} -> ${routing.groupId}`);
    } catch (error) {
      await docSnap.ref.update({
        attempts: (data.attempts || 0) + 1,
        lastAttemptAt: new Date().toISOString(),
        lastError: error.message,
        targetGroupId: routing.groupId,
        routingMode: routing.routingMode
      });

      console.error(`Falha ao enviar cancelamento ${docSnap.id}: ${error.message}`);
    }
  }
}

async function processDemandas(db, webhookUrl, runtimeConfig, cliOptions) {
  const snapshot = await db
    .collection("demandasFila")
    .where("status", "==", "pending")
    .limit(20)
    .get();

  if (snapshot.empty) return;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const routing = resolveRouting(data, runtimeConfig, cliOptions);

    if (!routing.allowed) {
      await markBlocked(docSnap, data, routing.reason);
      console.log(`Demanda bloqueada: ${docSnap.id} -> ${routing.reason}`);
      continue;
    }

    try {
      const whatsappRequest = buildWppconnectRequest(runtimeConfig.settings);

      await sendWebhook(webhookUrl, {
        message: data.message,
        supervisor: data.supervisor || "",
        groupId: routing.groupId,
        routingMode: routing.routingMode,
        whatsappRequest
      });

      await docSnap.ref.update({
        status: "sent",
        sentAt: new Date().toISOString(),
        attempts: (data.attempts || 0) + 1,
        lastError: null,
        targetGroupId: routing.groupId,
        routingMode: routing.routingMode
      });

      console.log(`Demanda enviada: ${docSnap.id} -> ${routing.groupId}`);
    } catch (error) {
      await docSnap.ref.update({
        attempts: (data.attempts || 0) + 1,
        lastAttemptAt: new Date().toISOString(),
        lastError: error.message,
        targetGroupId: routing.groupId,
        routingMode: routing.routingMode
      });

      console.error(`Falha ao enviar demanda ${docSnap.id}: ${error.message}`);
    }
  }
}

async function processQueues(db, cliOptions) {
  const runtimeConfig = await loadRuntimeConfig(db);
  const cancelamentoWebhookUrl = normalizeUrl(
    cliOptions.n8nBaseUrl || runtimeConfig.settings.n8nBaseUrl,
    cliOptions.cancelamentoWebhookPath || runtimeConfig.settings.cancelamentoWebhookPath,
    cliOptions.cancelamentoWebhookUrl || DEFAULT_CANCELAMENTO_WEBHOOK_URL
  );
  const demandaWebhookUrl = normalizeUrl(
    cliOptions.n8nBaseUrl || runtimeConfig.settings.n8nBaseUrl,
    cliOptions.demandaWebhookPath || runtimeConfig.settings.demandaWebhookPath,
    cliOptions.demandaWebhookUrl || DEFAULT_DEMANDA_WEBHOOK_URL
  );

  await processCancelamentos(db, cancelamentoWebhookUrl, runtimeConfig, cliOptions);
  await processDemandas(db, demandaWebhookUrl, runtimeConfig, cliOptions);
}

async function main() {
  const serviceAccountPath = getArgValue("--service-account");
  const webhookUrl = getArgValue("--webhook-url");
  const cliOptions = {
    cancelamentoWebhookUrl: getArgValue("--cancelamento-webhook-url") || webhookUrl || "",
    demandaWebhookUrl: getArgValue("--demanda-webhook-url") || webhookUrl || "",
    cancelamentoWebhookPath: getArgValue("--cancelamento-webhook-path") || "",
    demandaWebhookPath: getArgValue("--demanda-webhook-path") || "",
    n8nBaseUrl: getArgValue("--n8n-base-url") || "",
    fallbackGroupId: getArgValue("--fallback-group-id") || "",
    supervisorFilter: String(getArgValue("--supervisor") || "").trim()
  };
  const intervalMs = Number(getArgValue("--interval-ms") || DEFAULT_INTERVAL_MS);

  await ensureAdmin(serviceAccountPath);
  const db = getFirestore();

  console.log("Worker da fila iniciado.");
  console.log(`Supervisor filtrado: ${cliOptions.supervisorFilter || "todos"}`);
  console.log(`Intervalo de varredura: ${intervalMs}ms`);
  console.log("Configuracoes do bot serao lidas do Firestore a cada ciclo.");

  await processQueues(db, cliOptions);

  setInterval(async () => {
    try {
      await processQueues(db, cliOptions);
    } catch (error) {
      console.error("Erro ao processar fila:", error.message);
    }
  }, intervalMs);
}

main().catch((error) => {
  console.error("Falha ao iniciar worker da fila:", error.message);
  process.exitCode = 1;
});
