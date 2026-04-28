import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";

const BOT_SETTINGS_COLLECTION = "configuracoesBot";
const SUPERVISOR_GROUPS_COLLECTION = "supervisorGrupos";
const DEFAULT_SETTINGS_DOC = "default";
const LEGACY_TEXT_TEMPLATES = {
  cancelamento: "*1° Cancelamento de Fulano* ❌\n\n🗒️ *Motivo:* Mudança de endereço",
  demanda: "📌 *Fulano* - *Encaixe VT*\n\n📄 *000/123456789*\n📅 *10/04/2026* - *das 14h às 17h*\n👨🏾‍🔧 *Área X* - *Classe Y*"
};

function defaultTextTemplates() {
  return {
    cancelamento: "❌ *{{cancelCountOfDay}}° Cancelamento de {{operatorName}}*\n{{contract}}\n\n*Motivo:* {{reason}}\n\n{{observation}}",
    demandaEncaixeVt: "📌 *{{operatorName}}* - *Encaixe VT*\n\n📄 *{{contract}}*\n📅 *{{date}}* - *das {{startHour}} às {{endHour}}*\n👨🏾‍🔧 *{{area}}* - *{{classe}}*",
    demandaRetirarPonto: "📌 *{{operatorName}}* - *Retirar Ponto Virtua*\n\n📄 *{{contract}}*\n🔢 *Ponto {{point}}*\n📅 *{{date}}* - *das {{startHour}} às {{endHour}}*",
    demandaSuspensao: "📌 *{{operatorName}}* - *Suspensão Temporária:* *({{suspensionItems}})*\n\n📄 *{{contract}}*"
  };
}

function defaultBotSettings() {
  return {
    workerIntervalMs: "5000",
    fallbackGroupId: "",
    cancelamentoWebhookPath: "/webhook/cancelamento-whatsapp",
    demandaWebhookPath: "/webhook/demanda-whatsapp",
    wppconnectBaseUrl: "http://localhost:21465",
    wppconnectSessionName: "equipe-ret",
    n8nBaseUrl: "http://localhost:5678",
    textTemplates: defaultTextTemplates(),
    updatedAt: ""
  };
}

function sanitizeLegacyTextTemplates(textTemplates = {}) {
  const sanitized = { ...textTemplates };

  if (sanitized.cancelamento === LEGACY_TEXT_TEMPLATES.cancelamento) {
    delete sanitized.cancelamento;
  }

  if (sanitized.demanda === LEGACY_TEXT_TEMPLATES.demanda) {
    delete sanitized.demanda;
  }

  if (sanitized.demandaEncaixeVt === LEGACY_TEXT_TEMPLATES.demanda) {
    delete sanitized.demandaEncaixeVt;
  }

  return sanitized;
}

function normalizeBotSettings(payload = {}) {
  const defaults = defaultBotSettings();
  const rawTextTemplates = sanitizeLegacyTextTemplates(payload?.textTemplates || {});
  const textTemplates = {
    ...defaultTextTemplates(),
    ...(rawTextTemplates.demanda && !rawTextTemplates.demandaEncaixeVt
      ? { demandaEncaixeVt: rawTextTemplates.demanda }
      : {}),
    ...rawTextTemplates
  };

  return {
    workerIntervalMs: String(payload?.workerIntervalMs || defaults.workerIntervalMs).trim(),
    fallbackGroupId: String(payload?.fallbackGroupId || "").trim(),
    cancelamentoWebhookPath: String(
      payload?.cancelamentoWebhookPath || defaults.cancelamentoWebhookPath
    ).trim(),
    demandaWebhookPath: String(payload?.demandaWebhookPath || defaults.demandaWebhookPath).trim(),
    wppconnectBaseUrl: String(payload?.wppconnectBaseUrl || defaults.wppconnectBaseUrl).trim(),
    wppconnectSessionName: String(
      payload?.wppconnectSessionName || defaults.wppconnectSessionName
    ).replace(/\s+/g, "").trim(),
    n8nBaseUrl: String(payload?.n8nBaseUrl || defaults.n8nBaseUrl).trim(),
    textTemplates,
    updatedAt: String(payload?.updatedAt || "").trim()
  };
}

async function loadBotSettings() {
  const snapshot = await getDoc(doc(db, BOT_SETTINGS_COLLECTION, DEFAULT_SETTINGS_DOC));

  if (!snapshot.exists()) {
    return defaultBotSettings();
  }

  const rawData = snapshot.data();
  const normalizedSettings = normalizeBotSettings(rawData);

  if ("wppconnectBearerToken" in rawData) {
    await setDoc(doc(db, BOT_SETTINGS_COLLECTION, DEFAULT_SETTINGS_DOC), normalizedSettings);
  }

  return normalizedSettings;
}

async function saveBotSettings(settings) {
  await setDoc(doc(db, BOT_SETTINGS_COLLECTION, DEFAULT_SETTINGS_DOC), {
    ...normalizeBotSettings(settings),
    updatedAt: new Date().toISOString()
  });
}

async function loadSupervisorGroups() {
  const snapshot = await getDocs(collection(db, SUPERVISOR_GROUPS_COLLECTION));

  return snapshot.docs
    .map((groupDoc) => ({
      id: groupDoc.id,
      ...groupDoc.data()
    }))
    .sort((a, b) => String(a.supervisor || "").localeCompare(String(b.supervisor || ""), "pt-BR"));
}

async function createSupervisorGroupMapping(payload) {
  return addDoc(collection(db, SUPERVISOR_GROUPS_COLLECTION), {
    supervisor: String(payload.supervisor || "").trim(),
    groupId: String(payload.groupId || "").trim(),
    enabled: Boolean(payload.enabled),
    notes: String(payload.notes || "").trim(),
    updatedAt: new Date().toISOString()
  });
}

async function updateSupervisorGroupMapping(id, payload) {
  await setDoc(doc(db, SUPERVISOR_GROUPS_COLLECTION, id), {
    supervisor: String(payload.supervisor || "").trim(),
    groupId: String(payload.groupId || "").trim(),
    enabled: Boolean(payload.enabled),
    notes: String(payload.notes || "").trim(),
    updatedAt: new Date().toISOString()
  });
}

async function deleteSupervisorGroupMapping(id) {
  await deleteDoc(doc(db, SUPERVISOR_GROUPS_COLLECTION, id));
}

export {
  createSupervisorGroupMapping,
  deleteSupervisorGroupMapping,
  loadBotSettings,
  loadSupervisorGroups,
  saveBotSettings,
  updateSupervisorGroupMapping
};
