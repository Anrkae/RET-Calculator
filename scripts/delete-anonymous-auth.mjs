import { readFile } from "node:fs/promises";
import process from "node:process";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

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

function isAnonymousUser(userRecord) {
  return userRecord.providerData.length === 0;
}

async function listAnonymousUsers(auth) {
  const anonymousUsers = [];
  let nextPageToken;

  do {
    const page = await auth.listUsers(1000, nextPageToken);

    page.users.forEach((userRecord) => {
      if (isAnonymousUser(userRecord)) {
        anonymousUsers.push(userRecord);
      }
    });

    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return anonymousUsers;
}

async function deleteAnonymousUsers(auth, dryRun) {
  const anonymousUsers = await listAnonymousUsers(auth);

  if (anonymousUsers.length === 0) {
    console.log("Nenhum usuário anônimo foi encontrado.");
    return;
  }

  console.log(`Usuários anônimos encontrados: ${anonymousUsers.length}`);

  if (dryRun) {
    anonymousUsers.forEach((userRecord) => {
      console.log(`- ${userRecord.uid}`);
    });
    console.log("Dry run ativado. Nenhum usuário foi apagado.");
    return;
  }

  const uids = anonymousUsers.map((userRecord) => userRecord.uid);
  const result = await auth.deleteUsers(uids);

  console.log(`Usuários anônimos removidos: ${result.successCount}`);
  console.log(`Falhas ao remover: ${result.failureCount}`);

  if (result.failureCount > 0) {
    result.errors.forEach((error) => {
      console.log(`- Índice ${error.index}: ${error.error?.message || "erro desconhecido"}`);
    });
  }
}

async function main() {
  const serviceAccountPath = getArgValue("--service-account");
  const dryRun = process.argv.includes("--dry-run");

  await ensureAdmin(serviceAccountPath);
  const auth = getAuth();

  await deleteAnonymousUsers(auth, dryRun);
}

main().catch((error) => {
  console.error("Falha ao excluir usuários anônimos:", error.message);
  process.exitCode = 1;
});
