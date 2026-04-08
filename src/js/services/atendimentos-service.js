import {
  addDoc,
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";

const CANCELAMENTO_WEBHOOK_URL =
  "https://gleefully-canelike-shaun.ngrok-free.dev/webhook/cancelamento-whatsapp";
const REGISTROS_COLLECTION = "registrosAtendimento";

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
  const registros = collection(db, REGISTROS_COLLECTION);

  const atendimento = {
    ...data,
    operator: matricula,
    dayId: todayId,
    whatsappSent: false
  };

  await addDoc(registros, atendimento);

  if (data.result === "Cancelado") {
    try {
      await fetch(CANCELAMENTO_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          operator: atendimento.operator,
          cancelCountOfDay: atendimento.cancelCountOfDay,
          reason: atendimento.reason,
          duration: atendimento.duration,
          time: atendimento.time
        })
      });
    } catch (error) {
      console.error("Erro ao acionar webhook do cancelamento:", error);
    }
  }
}

async function buscarLigacoes(matricula) {
  const todayId = getTodayId();
  const ligacoesQuery = query(
    collection(db, REGISTROS_COLLECTION),
    where("operator", "==", matricula),
    where("dayId", "==", todayId)
  );
  const snapshot = await getDocs(ligacoesQuery);

  return snapshot.docs.map((snapshotDoc) => snapshotDoc.data());
}

async function listarLigacoes() {
  const ligacoesQuery = query(collection(db, REGISTROS_COLLECTION));
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
