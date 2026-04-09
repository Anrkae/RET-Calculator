import { readFile } from "node:fs/promises";
import process from "node:process";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DEFAULT_CANCELAMENTO_WEBHOOK_URL = "http://localhost:5678/webhook/cancelamento-whatsapp";
const DEFAULT_DEMANDA_WEBHOOK_URL = "http://localhost:5678/webhook/demanda-whatsapp";
const DEFAULT_INTERVAL_MS = 5000;

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

function supervisorAllowed(itemSupervisor, filterSupervisor) {
  if (!filterSupervisor) return true;
  return String(itemSupervisor || "").trim().toLowerCase() === filterSupervisor.toLowerCase();
}

async function markBlockedBySupervisor(docSnap, data, filterSupervisor) {
  await docSnap.ref.update({
    status: "blocked_supervisor",
    sentAt: null,
    attempts: data.attempts || 0,
    lastError: `Supervisor fora do filtro ativo: ${filterSupervisor}`,
    lastAttemptAt: new Date().toISOString()
  });
}

async function processCancelamentos(db, webhookUrl, filterSupervisor) {
  const snapshot = await db
    .collection("cancelamentoFila")
    .where("status", "==", "pending")
    .limit(20)
    .get();

  if (snapshot.empty) return;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();

    if (!supervisorAllowed(data.supervisor, filterSupervisor)) {
      await markBlockedBySupervisor(docSnap, data, filterSupervisor);
      console.log(`Cancelamento bloqueado por supervisor: ${docSnap.id}`);
      continue;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          operator: data.operator,
          operatorName: data.operatorName,
          cancelCountOfDay: data.cancelCountOfDay,
          reason: data.reason,
          duration: data.duration,
          time: data.time
        })
      });

      if (!response.ok) {
        throw new Error(`Webhook respondeu com status ${response.status}`);
      }

      await docSnap.ref.update({
        status: "sent",
        sentAt: new Date().toISOString(),
        attempts: (data.attempts || 0) + 1,
        lastError: null
      });

      console.log(`Cancelamento enviado: ${docSnap.id}`);
    } catch (error) {
      await docSnap.ref.update({
        attempts: (data.attempts || 0) + 1,
        lastAttemptAt: new Date().toISOString(),
        lastError: error.message
      });

      console.error(`Falha ao enviar cancelamento ${docSnap.id}: ${error.message}`);
    }
  }
}

async function processDemandas(db, webhookUrl, filterSupervisor) {
  const snapshot = await db
    .collection("demandasFila")
    .where("status", "==", "pending")
    .limit(20)
    .get();

  if (snapshot.empty) return;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();

    if (!supervisorAllowed(data.supervisor, filterSupervisor)) {
      await markBlockedBySupervisor(docSnap, data, filterSupervisor);
      console.log(`Demanda bloqueada por supervisor: ${docSnap.id}`);
      continue;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: data.message
        })
      });

      if (!response.ok) {
        throw new Error(`Webhook respondeu com status ${response.status}`);
      }

      await docSnap.ref.update({
        status: "sent",
        sentAt: new Date().toISOString(),
        attempts: (data.attempts || 0) + 1,
        lastError: null
      });

      console.log(`Demanda enviada: ${docSnap.id}`);
    } catch (error) {
      await docSnap.ref.update({
        attempts: (data.attempts || 0) + 1,
        lastAttemptAt: new Date().toISOString(),
        lastError: error.message
      });

      console.error(`Falha ao enviar demanda ${docSnap.id}: ${error.message}`);
    }
  }
}

async function processQueues(db, cancelamentoWebhookUrl, demandaWebhookUrl, filterSupervisor) {
  await processCancelamentos(db, cancelamentoWebhookUrl, filterSupervisor);
  await processDemandas(db, demandaWebhookUrl, filterSupervisor);
}

async function main() {
  const serviceAccountPath = getArgValue("--service-account");
  const webhookUrl = getArgValue("--webhook-url");
  const cancelamentoWebhookUrl =
    getArgValue("--cancelamento-webhook-url") ||
    webhookUrl ||
    DEFAULT_CANCELAMENTO_WEBHOOK_URL;
  const demandaWebhookUrl =
    getArgValue("--demanda-webhook-url") ||
    webhookUrl ||
    DEFAULT_DEMANDA_WEBHOOK_URL;
  const intervalMs = Number(getArgValue("--interval-ms") || DEFAULT_INTERVAL_MS);
  const supervisorFilter = String(getArgValue("--supervisor") || "").trim();

  await ensureAdmin(serviceAccountPath);
  const db = getFirestore();

  console.log("Worker da fila iniciado.");
  console.log(`Webhook de cancelamento: ${cancelamentoWebhookUrl}`);
  console.log(`Webhook de demanda: ${demandaWebhookUrl}`);
  console.log(`Supervisor filtrado: ${supervisorFilter || "todos"}`);
  console.log(`Intervalo de varredura: ${intervalMs}ms`);

  await processQueues(db, cancelamentoWebhookUrl, demandaWebhookUrl, supervisorFilter);

  setInterval(async () => {
    try {
      await processQueues(db, cancelamentoWebhookUrl, demandaWebhookUrl, supervisorFilter);
    } catch (error) {
      console.error("Erro ao processar fila:", error.message);
    }
  }, intervalMs);
}

main().catch((error) => {
  console.error("Falha ao iniciar worker da fila:", error.message);
  process.exitCode = 1;
});
