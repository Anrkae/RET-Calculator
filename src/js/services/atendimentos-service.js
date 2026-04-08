import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDocs,
  query
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";

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

async function salvarAtendimento(matricula, data) {
  const todayId = getTodayId();
  const dayDoc = doc(db, "atendimentos", todayId);
  const operadorDoc = doc(dayDoc, "operadores", matricula);
  const ligacoes = collection(operadorDoc, "ligacoes");

  await addDoc(ligacoes, data);
}

async function buscarLigacoes(matricula) {
  const todayId = getTodayId();
  const dayDoc = doc(db, "atendimentos", todayId);
  const operadorDoc = doc(dayDoc, "operadores", matricula);
  const ligacoes = collection(operadorDoc, "ligacoes");
  const snapshot = await getDocs(ligacoes);

  return snapshot.docs.map((snapshotDoc) => snapshotDoc.data());
}

async function listarLigacoes() {
  const ligacoesQuery = query(collectionGroup(db, "ligacoes"));
  const snapshot = await getDocs(ligacoesQuery);

  return snapshot.docs.map((snapshotDoc) => {
    const data = snapshotDoc.data();

    return {
      ...data,
      objetoData: parseStoredDate(data.date)
    };
  });
}

export {
  buscarLigacoes,
  getTodayId,
  listarLigacoes,
  parseStoredDate,
  salvarAtendimento
};
