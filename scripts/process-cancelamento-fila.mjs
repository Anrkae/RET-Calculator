import { readFile } from "node:fs/promises";
import process from "node:process";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DEFAULT_WEBHOOK_URL = "http://localhost:5678/webhook/cancelamento-whatsapp";
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

async function processQueue(db, webhookUrl) {
  const snapshot = await db
    .collection("cancelamentoFila")
    .where("status", "==", "pending")
    .limit(20)
    .get();

  if (snapshot.empty) {
    return;
  }

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          operator: data.operator,
          operatorName: data.operatorName,
          operatorTag: data.operatorTag,
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

      console.log(`Evento enviado: ${docSnap.id}`);
    } catch (error) {
      await docSnap.ref.update({
        attempts: (data.attempts || 0) + 1,
        lastAttemptAt: new Date().toISOString(),
        lastError: error.message
      });

      console.error(`Falha ao enviar ${docSnap.id}: ${error.message}`);
    }
  }
}

async function main() {
  const serviceAccountPath = getArgValue("--service-account");
  const webhookUrl = getArgValue("--webhook-url") || DEFAULT_WEBHOOK_URL;
  const intervalMs = Number(getArgValue("--interval-ms") || DEFAULT_INTERVAL_MS);

  await ensureAdmin(serviceAccountPath);
  const db = getFirestore();

  console.log(`Worker da fila iniciado. Webhook: ${webhookUrl}`);
  console.log(`Intervalo de varredura: ${intervalMs}ms`);

  await processQueue(db, webhookUrl);

  setInterval(async () => {
    try {
      await processQueue(db, webhookUrl);
    } catch (error) {
      console.error("Erro ao processar fila:", error.message);
    }
  }, intervalMs);
}

main().catch((error) => {
  console.error("Falha ao iniciar worker da fila:", error.message);
  process.exitCode = 1;
});
