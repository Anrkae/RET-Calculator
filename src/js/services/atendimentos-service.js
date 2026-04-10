import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";

const REGISTROS_COLLECTION = "registrosAtendimento";
const CANCELAMENTO_QUEUE_COLLECTION = "cancelamentoFila";
const DEMANDAS_QUEUE_COLLECTION = "demandasFila";

function getTodayId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseStoredDate(value) {
  if (!value || typeof value !== "string") return null;

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const brMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function salvarAtendimento(profile, data) {
  if (!profile?.uid || !profile?.matricula) {
    throw new Error("Perfil do operador inválido.");
  }

  const todayId = getTodayId();
  const atendimento = {
    ...data,
    uid: profile.uid,
    operator: profile.matricula,
    operatorName: profile.nome,
    supervisor: profile.supervisor || "",
    dayId: todayId,
    whatsappSent: false
  };

  await addDoc(collection(db, REGISTROS_COLLECTION), atendimento);

  if (data.result === "Cancelado") {
    await addDoc(collection(db, CANCELAMENTO_QUEUE_COLLECTION), {
      uid: atendimento.uid,
      operator: atendimento.operator,
      operatorName: atendimento.operatorName,
      supervisor: atendimento.supervisor,
      cancelCountOfDay: atendimento.cancelCountOfDay,
      reason: atendimento.reason,
      contract: atendimento.contract || "",
      observation: atendimento.observation || "",
      duration: atendimento.duration,
      time: atendimento.time,
      dayId: atendimento.dayId,
      sourceTimestamp: atendimento.timestamp,
      status: "pending",
      attempts: 0,
      createdAt: new Date().toISOString()
    });
  }
}

async function buscarLigacoes(profile) {
  if (!profile?.uid) return [];

  const todayId = getTodayId();
  const ligacoesQuery = query(
    collection(db, REGISTROS_COLLECTION),
    where("uid", "==", profile.uid),
    where("dayId", "==", todayId)
  );
  const snapshot = await getDocs(ligacoesQuery);

  return snapshot.docs.map((snapshotDoc) => snapshotDoc.data());
}

async function salvarDemanda(profile, payload) {
  if (!profile?.uid || !profile?.matricula || !profile?.nome) {
    throw new Error("Perfil do operador inválido.");
  }

  await addDoc(collection(db, DEMANDAS_QUEUE_COLLECTION), {
    uid: profile.uid,
    operator: profile.matricula,
    operatorName: profile.nome,
    supervisor: profile.supervisor || "",
    demandType: payload.demandType,
    contract: payload.contract,
    date: payload.date || "",
    startHour: payload.startHour || "",
    endHour: payload.endHour || "",
    area: payload.area || "",
    classe: payload.classe || "",
    point: payload.point || "",
    suspensionItems: payload.suspensionItems || [],
    message: payload.message,
    status: "pending",
    attempts: 0,
    createdAt: new Date().toISOString()
  });
}

async function listarLigacoes() {
  const ligacoesQuery = query(collection(db, REGISTROS_COLLECTION));
  const snapshot = await getDocs(ligacoesQuery);

  return snapshot.docs.map((snapshotDoc) => {
    const data = snapshotDoc.data();

    return {
      id: snapshotDoc.id,
      ...data,
      objetoData: parseStoredDate(data.date)
    };
  });
}

async function listarFila(collectionName) {
  const snapshot = await getDocs(collection(db, collectionName));

  return snapshot.docs
    .map((snapshotDoc) => ({
      id: snapshotDoc.id,
      ...snapshotDoc.data()
    }))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function excluirItemFila(collectionName, id) {
  if (!collectionName || !id) {
    throw new Error("Não consegui identificar o item da fila.");
  }

  await deleteDoc(doc(db, collectionName, id));
}

export {
  buscarLigacoes,
  excluirItemFila,
  getTodayId,
  listarFila,
  listarLigacoes,
  parseStoredDate,
  salvarAtendimento,
  salvarDemanda
};
