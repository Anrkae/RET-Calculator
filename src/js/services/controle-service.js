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

function defaultBotSettings() {
  return {
    workerIntervalMs: "5000",
    fallbackGroupId: "",
    cancelamentoWebhookPath: "/webhook/cancelamento-whatsapp",
    demandaWebhookPath: "/webhook/demanda-whatsapp",
    wppconnectBaseUrl: "http://localhost:21465",
    wppconnectSessionName: "equipe-ret",
    wppconnectBearerToken: "",
    n8nBaseUrl: "http://localhost:5678",
    textTemplates: {
      cancelamento: "*1° Cancelamento de Fulano* ❌\n\n🗒️ *Motivo:* Mudança de endereço",
      demanda: "📌 *Fulano* - *Encaixe VT*\n\n📄 *000/123456789*\n📅 *10/04/2026* - *das 14h às 17h*\n👨🏾‍🔧 *Área X* - *Classe Y*"
    },
    updatedAt: ""
  };
}

async function loadBotSettings() {
  const snapshot = await getDoc(doc(db, BOT_SETTINGS_COLLECTION, DEFAULT_SETTINGS_DOC));

  if (!snapshot.exists()) {
    return defaultBotSettings();
  }

  return {
    ...defaultBotSettings(),
    ...snapshot.data()
  };
}

async function saveBotSettings(settings) {
  await setDoc(doc(db, BOT_SETTINGS_COLLECTION, DEFAULT_SETTINGS_DOC), {
    ...defaultBotSettings(),
    ...settings,
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
