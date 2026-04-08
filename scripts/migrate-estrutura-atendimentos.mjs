import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import admin from "firebase-admin";

const CUTOFF_DATE = "2026-04-01";

function getArgValue(flagName) {
  const flagIndex = process.argv.indexOf(flagName);

  if (flagIndex === -1) return "";
  return process.argv[flagIndex + 1] || "";
}

function loadServiceAccount() {
  const explicitPath = getArgValue("--service-account");
  const envPath = process.env.FIREBASE_SERVICE_ACCOUNT;
  const serviceAccountPath = explicitPath || envPath;

  if (!serviceAccountPath) {
    throw new Error(
      "Informe o caminho do JSON da service account com --service-account caminho/do/arquivo.json"
    );
  }

  const resolvedPath = path.resolve(serviceAccountPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Arquivo de service account não encontrado: ${resolvedPath}`);
  }

  return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
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

function formatDayId(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildNewDocId(snapshotDoc, dayId, operator) {
  return `${dayId}_${operator}_${snapshotDoc.id}`;
}

function extractLegacyPathData(snapshotDoc) {
  const segments = snapshotDoc.ref.path.split("/");

  return {
    dayId: segments[1] || "",
    operator: segments[3] || ""
  };
}

async function run() {
  const serviceAccount = loadServiceAccount();

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }

  const db = admin.firestore();
  const cutoff = new Date(`${CUTOFF_DATE}T00:00:00`);
  const snapshot = await db.collectionGroup("ligacoes").get();

  let totalAnalisadas = 0;
  let totalApagadas = 0;
  let totalMigradas = 0;
  let totalIgnoradasSemData = 0;

  for (const snapshotDoc of snapshot.docs) {
    totalAnalisadas += 1;

    const data = snapshotDoc.data();
    const legacyDate = parseStoredDate(data.date);

    if (!legacyDate) {
      totalIgnoradasSemData += 1;
      continue;
    }

    if (legacyDate < cutoff) {
      await snapshotDoc.ref.delete();
      totalApagadas += 1;
      continue;
    }

    const { operator } = extractLegacyPathData(snapshotDoc);
    const dayId = formatDayId(legacyDate);
    const targetRef = db
      .collection("registrosAtendimento")
      .doc(buildNewDocId(snapshotDoc, dayId, operator));

    const existingDoc = await targetRef.get();

    if (!existingDoc.exists) {
      await targetRef.set({
        ...data,
        operator,
        dayId,
        whatsappSent: data.whatsappSent ?? false,
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        migratedFromPath: snapshotDoc.ref.path
      });

      totalMigradas += 1;
    }

    await snapshotDoc.ref.delete();
  }

  console.log("Migracao da nova estrutura concluida.");
  console.log(`Ligacoes analisadas: ${totalAnalisadas}`);
  console.log(`Ligacoes apagadas por serem anteriores a 01/04/2026: ${totalApagadas}`);
  console.log(`Ligacoes migradas para registrosAtendimento: ${totalMigradas}`);
  console.log(`Ligacoes ignoradas por data invalida: ${totalIgnoradasSemData}`);
}

run().catch((error) => {
  console.error("Falha na migracao:", error.message);
  process.exitCode = 1;
});
