import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const USERS_COLLECTION = "usuarios";
const LOGIN_INDEX_COLLECTION = "loginIndex";
const AUTH_DOMAIN = "ret-calculator.app";

function normalizeMatricula(value) {
  const digitsOnly = String(value || "").replace(/\D/g, "");
  return digitsOnly.trim();
}

function buildSyntheticEmail(matricula) {
  return `${normalizeMatricula(matricula)}@${AUTH_DOMAIN}`;
}

function waitForAuthState() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

async function getUserProfileByUid(uid) {
  if (!uid) return null;

  const userDoc = await getDoc(doc(db, USERS_COLLECTION, uid));

  if (!userDoc.exists()) return null;

  return {
    id: userDoc.id,
    ...userDoc.data()
  };
}

async function matriculaHasAccess(matricula) {
  const normalizedMatricula = normalizeMatricula(matricula);

  if (!normalizedMatricula) return false;

  const loginIndexDoc = await getDoc(doc(db, LOGIN_INDEX_COLLECTION, normalizedMatricula));
  return loginIndexDoc.exists();
}

async function ensureLoginIndex({ uid, matricula, email }) {
  const normalizedMatricula = normalizeMatricula(matricula);

  if (!uid || !normalizedMatricula) {
    throw new Error("Não foi possível preparar o índice de login.");
  }

  await setDoc(doc(db, LOGIN_INDEX_COLLECTION, normalizedMatricula), {
    uid,
    matricula: normalizedMatricula,
    email,
    createdAt: new Date().toISOString()
  });
}

async function registerOperator({ matricula, password, nome }) {
  const normalizedMatricula = normalizeMatricula(matricula);
  const trimmedName = String(nome || "").trim();
  const trimmedPassword = String(password || "").trim();

  if (!normalizedMatricula) {
    throw new Error("Digite seu Almope para continuar.");
  }

  if (!trimmedName) {
    throw new Error("Falta informar o nome do operador.");
  }

  if (trimmedPassword.length < 6) {
    throw new Error("Crie uma senha com pelo menos 6 caracteres.");
  }

  let credential;

  try {
    credential = await createUserWithEmailAndPassword(
      auth,
      buildSyntheticEmail(normalizedMatricula),
      trimmedPassword
    );
  } catch (error) {
    if (error?.code === "auth/email-already-in-use") {
      throw new Error("Esse Almope já possui acesso.");
    }

    throw error;
  }

  const profile = {
    uid: credential.user.uid,
    matricula: normalizedMatricula,
    nome: trimmedName,
    tag: "cr",
    email: buildSyntheticEmail(normalizedMatricula),
    createdAt: new Date().toISOString()
  };

  await setDoc(doc(db, USERS_COLLECTION, credential.user.uid), profile);
  await ensureLoginIndex(profile);

  return profile;
}

async function loginOperator({ matricula, password }) {
  const normalizedMatricula = normalizeMatricula(matricula);
  const trimmedPassword = String(password || "").trim();

  if (!normalizedMatricula) {
    throw new Error("Digite seu Almope para continuar.");
  }

  if (!trimmedPassword) {
    throw new Error("Digite sua senha para entrar.");
  }

  let credential;

  try {
    credential = await signInWithEmailAndPassword(
      auth,
      buildSyntheticEmail(normalizedMatricula),
      trimmedPassword
    );
  } catch (error) {
    if (
      error?.code === "auth/invalid-credential" ||
      error?.code === "auth/user-not-found" ||
      error?.code === "auth/wrong-password"
    ) {
      throw new Error("Não consegui entrar com esses dados. Confira Almope e senha.");
    }

    throw error;
  }

  const profile = await getUserProfileByUid(credential.user.uid);

  return {
    exists: Boolean(profile),
    profile
  };
}

async function loadCurrentProfile() {
  const currentUser = auth.currentUser || (await waitForAuthState());

  if (!currentUser) return null;

  return getUserProfileByUid(currentUser.uid);
}

async function logoutOperator() {
  await signOut(auth);
}

async function listUsers() {
  const snapshot = await getDocs(collection(db, USERS_COLLECTION));

  return snapshot.docs.map((userDoc) => ({
    id: userDoc.id,
    ...userDoc.data()
  }));
}

async function updateUserTag(uid, tag) {
  if (!uid) {
    throw new Error("Não consegui identificar o usuário que será atualizado.");
  }

  if (!["cr", "adm"].includes(tag)) {
    throw new Error("A tag informada é inválida.");
  }

  await updateDoc(doc(db, USERS_COLLECTION, uid), {
    tag,
    updatedAt: new Date().toISOString()
  });
}

export {
  buildSyntheticEmail,
  listUsers,
  loadCurrentProfile,
  loginOperator,
  logoutOperator,
  matriculaHasAccess,
  registerOperator,
  updateUserTag
};
