import { listarLigacoes } from "../services/atendimentos-service.js";
import * as authService from "../services/auth-service.js";

let dadosBrutos = [];
let currentProfile = null;
let selectedUser = null;

const {
  loadCurrentProfile,
  loginOperator,
  logoutOperator,
  updateUserAccess
} = authService;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeMatricula(value) {
  return String(value || "").replace(/\D/g, "").trim();
}

function setFeedback(elementId, message = "", type = "error") {
  const feedback = document.getElementById(elementId);
  if (!feedback) return;

  feedback.textContent = message;
  feedback.classList.toggle("hidden", !message);
  feedback.dataset.type = type;
}

function showAdminApp(profile) {
  document.getElementById("adminLogin")?.classList.add("hidden");
  document.getElementById("adminApp")?.classList.remove("hidden");
  document.body.classList.remove("auth-pending");

  const identity = document.getElementById("adminIdentity");
  if (identity) {
    identity.textContent = `${profile.nome} • ${profile.matricula}`;
  }
}

function showLogin() {
  document.getElementById("adminLogin")?.classList.remove("hidden");
  document.getElementById("adminApp")?.classList.add("hidden");
  document.body.classList.remove("auth-pending");
}

function openUserSearchModal() {
  document.getElementById("userSearchModal")?.classList.remove("hidden");
  document.getElementById("userSearchInput")?.focus();
}

function closeUserSearchModal() {
  document.getElementById("userSearchModal")?.classList.add("hidden");
}

function renderSelectedUser() {
  const card = document.getElementById("selectedUserCard");
  const name = document.getElementById("selectedUserName");
  const meta = document.getElementById("selectedUserMeta");
  const badge = document.getElementById("selectedUserTagBadge");
  const select = document.getElementById("selectedUserTagSelect");
  const supervisorInput = document.getElementById("selectedUserSupervisorInput");

  if (!card || !name || !meta || !badge || !select || !supervisorInput) return;

  if (!selectedUser) {
    card.classList.add("hidden");
    return;
  }

  card.classList.remove("hidden");
  name.textContent = selectedUser.nome || "Sem nome";
  meta.textContent = `Almope ${selectedUser.matricula || "-"}${selectedUser.supervisor ? ` • Supervisor ${selectedUser.supervisor}` : ""}`;
  badge.textContent = selectedUser.tag || "cr";
  badge.dataset.tag = selectedUser.tag || "cr";
  select.value = selectedUser.tag || "cr";
  supervisorInput.value = selectedUser.supervisor || "";
}

async function carregarDados() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  try {
    const ligacoes = await listarLigacoes();

    dadosBrutos = ligacoes.filter((item) => {
      if (!item.objetoData) return false;

      const month = item.objetoData.getMonth() + 1;
      const year = item.objetoData.getFullYear();

      return month === currentMonth && year === currentYear;
    });

    processarEExibir();
  } catch (error) {
    console.error("Erro ao carregar resultados:", error);
  }
}

function processarEExibir() {
  const filtro = document.getElementById("periodFilter")?.value || "mensal";
  const consolidado = {};
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(now);
  const day = now.getDay();
  const diff = now.getDate() - (day === 0 ? 6 : day - 1);
  startOfWeek.setDate(diff);

  dadosBrutos.forEach((item) => {
    if (item.reason === "021") return;

    let incluir = false;

    if (filtro === "diario") {
      const hojeStr = new Date().toLocaleDateString();
      incluir = item.date === hojeStr;
    } else if (filtro === "semanal") {
      incluir = item.objetoData >= startOfWeek;
    } else {
      incluir = true;
    }

    if (!incluir) return;

    const op = item.operatorName || item.operator || "S/M";
    if (!consolidado[op]) {
      consolidado[op] = { atendidas: 0, cancelados: 0 };
    }

    consolidado[op].atendidas += 1;
    if (item.result === "Cancelado") {
      consolidado[op].cancelados += 1;
    }
  });

  renderizarTabela(consolidado);
}

function renderizarTabela(dados) {
  const tbody = document.getElementById("tableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  Object.keys(dados).sort().forEach((op) => {
    const { atendidas, cancelados } = dados[op];
    const taxa = atendidas > 0 ? ((cancelados / atendidas) * 100).toFixed(1) : "0.0";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(op)}</td>
      <td>${escapeHtml(atendidas)}</td>
      <td>${escapeHtml(cancelados)}</td>
      <td>
        <span class="rate-badge" style="background:${getCorTaxa(taxa)};color:white">
          ${escapeHtml(taxa)}%
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function getCorTaxa(taxa) {
  const t = parseFloat(taxa);
  if (t <= 12.5) return "#10b981";
  if (t <= 14) return "#f59e0b";
  return "#ef4444";
}

async function handleSearchUser() {
  const input = document.getElementById("userSearchInput");
  const matricula = normalizeMatricula(input?.value);

  setFeedback("userSearchFeedback", "");

  if (!matricula) {
    setFeedback("userSearchFeedback", "Digite o Almope que voce quer localizar.", "error");
    return;
  }

  try {
    const user = authService.searchUserByMatricula
      ? await authService.searchUserByMatricula(matricula)
      : await fallbackSearchUserByMatricula(matricula);

    if (!user) {
      setFeedback("userSearchFeedback", "Nao encontrei um colaborador com esse Almope.", "error");
      return;
    }

    selectedUser = user;
    renderSelectedUser();
    closeUserSearchModal();
    setFeedback("usersFeedback", `Colaborador ${user.nome} carregado para edicao.`, "success");
  } catch (error) {
    console.error("Erro ao buscar colaborador:", error);
    setFeedback("userSearchFeedback", error.message || "Nao foi possivel buscar esse colaborador agora.", "error");
  }
}

async function fallbackSearchUserByMatricula(matricula) {
  if (!authService.listUsers) {
    throw new Error("A busca de colaborador ainda nao esta disponivel nesta versao carregada.");
  }

  const users = await authService.listUsers();
  return users.find((user) => String(user.matricula || "").trim() === matricula) || null;
}

async function handleSaveSelectedUser() {
  const select = document.getElementById("selectedUserTagSelect");
  const supervisorInput = document.getElementById("selectedUserSupervisorInput");

  if (!selectedUser || !select || !supervisorInput) return;

  try {
    await updateUserAccess(selectedUser.uid || selectedUser.id, {
      tag: select.value,
      supervisor: supervisorInput.value
    });

    selectedUser = {
      ...selectedUser,
      tag: select.value,
      supervisor: supervisorInput.value.trim()
    };

    renderSelectedUser();
    setFeedback("usersFeedback", "Acesso atualizado com sucesso.", "success");
  } catch (error) {
    console.error("Erro ao atualizar acesso:", error);
    setFeedback("usersFeedback", error.message || "Nao foi possivel atualizar o acesso.", "error");
  }
}

async function handleAdminLogin() {
  const matricula = document.getElementById("adminMatriculaInput")?.value.trim() || "";
  const password = document.getElementById("adminPasswordInput")?.value || "";

  setFeedback("adminAuthFeedback", "");

  try {
    const result = await loginOperator({ matricula, password });

    if (!result.exists) {
      setFeedback("adminAuthFeedback", "Nao encontrei um acesso ativo para esse Almope.", "error");
      return;
    }

    const refreshedProfile = await loadCurrentProfile();

    if (refreshedProfile?.tag !== "adm") {
      await logoutOperator();
      setFeedback("adminAuthFeedback", "Seu acesso foi reconhecido, mas esta area e exclusiva para administradores.", "error");
      return;
    }

    currentProfile = refreshedProfile;
    showAdminApp(currentProfile);
    await carregarDados();
  } catch (error) {
    setFeedback("adminAuthFeedback", error.message || "Nao foi possivel entrar.", "error");
  }
}

async function initializeAdmin() {
  currentProfile = await loadCurrentProfile();

  if (!currentProfile) {
    showLogin();
    return;
  }

  if (currentProfile.tag !== "adm") {
    await logoutOperator();
    showLogin();
    setFeedback("adminAuthFeedback", "Seu acesso nao tem permissao para abrir esta area administrativa.", "error");
    return;
  }

  showAdminApp(currentProfile);
  await carregarDados();
}

document.addEventListener("DOMContentLoaded", async () => {
  const loginButton = document.getElementById("adminLoginButton");
  const passwordInput = document.getElementById("adminPasswordInput");
  const matriculaInput = document.getElementById("adminMatriculaInput");
  const periodFilter = document.getElementById("periodFilter");
  const adminLogoutButton = document.getElementById("adminLogoutButton");
  const openUserSearchButton = document.getElementById("openUserSearchButton");
  const closeUserSearchButton = document.getElementById("closeUserSearchButton");
  const searchUserButton = document.getElementById("searchUserButton");
  const userSearchInput = document.getElementById("userSearchInput");
  const saveSelectedUserButton = document.getElementById("saveSelectedUserButton");
  const userSearchModal = document.getElementById("userSearchModal");

  loginButton?.addEventListener("click", handleAdminLogin);
  passwordInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleAdminLogin();
    }
  });
  matriculaInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleAdminLogin();
    }
  });

  periodFilter?.addEventListener("change", () => {
    const labels = {
      diario: "de hoje",
      semanal: "desta semana",
      mensal: "deste mes"
    };
    document.getElementById("periodLabel").textContent =
      `Exibindo resultados ${labels[periodFilter.value]}`;
    processarEExibir();
  });

  adminLogoutButton?.addEventListener("click", async () => {
    await logoutOperator();
    window.location.href = "../index.html";
  });

  openUserSearchButton?.addEventListener("click", openUserSearchModal);
  closeUserSearchButton?.addEventListener("click", closeUserSearchModal);
  searchUserButton?.addEventListener("click", handleSearchUser);
  userSearchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleSearchUser();
    }
  });
  saveSelectedUserButton?.addEventListener("click", handleSaveSelectedUser);

  userSearchModal?.addEventListener("click", (event) => {
    if (event.target === userSearchModal) {
      closeUserSearchModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeUserSearchModal();
    }
  });

  try {
    await initializeAdmin();
  } catch (error) {
    console.error("Erro ao inicializar area administrativa:", error);
    showLogin();
    setFeedback("adminAuthFeedback", "Nao foi possivel validar sua sessao agora.", "error");
  } finally {
    document.body.classList.remove("auth-pending");
  }
});
