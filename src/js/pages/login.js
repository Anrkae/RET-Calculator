import {
  loadCurrentProfile,
  loginOperator,
  matriculaHasAccess,
  registerOperator
} from "../services/auth-service.js";

const authModes = {
  lookup: "lookup",
  login: "login",
  register: "register"
};

let currentMode = authModes.lookup;
let currentMatricula = "";

function normalizeMatricula(value) {
  return String(value || "").replace(/\D/g, "").trim();
}

function redirectToDashboard() {
  window.location.href = "./pages/dashboard.html";
}

function setFeedback(message = "", type = "info") {
  const feedback = document.getElementById("authFeedback");

  if (!feedback) return;

  feedback.textContent = message;
  feedback.classList.toggle("hidden", !message);
  feedback.dataset.type = type;
}

function setMode(mode) {
  currentMode = mode;

  const subtitle = document.getElementById("authSubtitle");
  const continueButton = document.getElementById("continueButton");
  const backButton = document.getElementById("backButton");
  const nameInput = document.getElementById("nameInput");
  const nameLabel = document.getElementById("nameLabel");
  const passwordInput = document.getElementById("passwordInput");
  const passwordLabel = document.getElementById("passwordLabel");

  if (!subtitle || !continueButton || !backButton || !nameInput || !nameLabel || !passwordInput || !passwordLabel) {
    return;
  }

  nameInput.classList.add("hidden");
  nameLabel.classList.add("hidden");
  passwordInput.classList.add("hidden");
  passwordLabel.classList.add("hidden");
  backButton.classList.toggle("hidden", mode === authModes.lookup);

  if (mode === authModes.lookup) {
    subtitle.textContent = "Digite sua matrícula para continuar.";
    continueButton.textContent = "Continuar";
    passwordInput.value = "";
    nameInput.value = "";
    return;
  }

  if (mode === authModes.login) {
    subtitle.textContent = "Já encontramos seu acesso. Agora é só digitar sua senha.";
    continueButton.textContent = "Entrar";
    passwordLabel.classList.remove("hidden");
    passwordInput.classList.remove("hidden");
    passwordInput.autocomplete = "current-password";
    passwordInput.placeholder = "Digite sua senha";
    passwordInput.focus();
    return;
  }

  subtitle.textContent = "Esse parece ser seu primeiro acesso. Preencha seus dados para continuar.";
  continueButton.textContent = "Criar acesso";
  nameLabel.classList.remove("hidden");
  nameInput.classList.remove("hidden");
  passwordLabel.classList.remove("hidden");
  passwordInput.classList.remove("hidden");
  passwordInput.autocomplete = "new-password";
  passwordInput.placeholder = "Crie uma senha com pelo menos 6 caracteres";
  nameInput.focus();
}

async function handleLookup() {
  const input = document.getElementById("matriculaInput");
  const matricula = normalizeMatricula(input?.value);

  if (!matricula) {
    setFeedback("Informe sua matrícula para eu continuar com o acesso.", "error");
    return;
  }

  currentMatricula = matricula;
  input.value = matricula;
  setFeedback("");

  const hasAccess = await matriculaHasAccess(matricula);
  setMode(hasAccess ? authModes.login : authModes.register);
}

async function handleLogin() {
  const passwordInput = document.getElementById("passwordInput");

  try {
    const result = await loginOperator({
      matricula: currentMatricula,
      password: passwordInput?.value || ""
    });

    if (!result.exists) {
      setFeedback("Seu acesso foi encontrado, mas não consegui carregar o perfil. Tente novamente em alguns instantes.", "error");
      return;
    }

    redirectToDashboard();
  } catch (error) {
    setFeedback(error.message || "Não foi possível entrar.", "error");
  }
}

async function handleRegister() {
  const nameInput = document.getElementById("nameInput");
  const passwordInput = document.getElementById("passwordInput");

  try {
    await registerOperator({
      matricula: currentMatricula,
      nome: nameInput?.value || "",
      password: passwordInput?.value || ""
    });

    redirectToDashboard();
  } catch (error) {
    if (error.message === "Essa matrícula já possui acesso.") {
      setFeedback("Essa matrícula já possui acesso. Digite sua senha para entrar.", "error");
      setMode(authModes.login);
      return;
    }

    setFeedback(error.message || "Não consegui criar seu acesso agora. Tente novamente.", "error");
  }
}

async function handleContinue() {
  if (currentMode === authModes.lookup) {
    await handleLookup();
    return;
  }

  if (currentMode === authModes.login) {
    await handleLogin();
    return;
  }

  await handleRegister();
}

function handleBack() {
  setFeedback("");
  setMode(authModes.lookup);
}

document.addEventListener("DOMContentLoaded", async () => {
  const input = document.getElementById("matriculaInput");
  const passwordInput = document.getElementById("passwordInput");
  const nameInput = document.getElementById("nameInput");
  const continueButton = document.getElementById("continueButton");
  const backButton = document.getElementById("backButton");

  const profile = await loadCurrentProfile();

  if (profile) {
    redirectToDashboard();
    return;
  }

  setMode(authModes.lookup);

  continueButton?.addEventListener("click", handleContinue);
  backButton?.addEventListener("click", handleBack);

  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleContinue();
    }
  });

  passwordInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleContinue();
    }
  });

  nameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleContinue();
    }
  });
});
