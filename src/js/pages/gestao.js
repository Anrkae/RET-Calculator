import { listarLigacoes } from "../services/atendimentos-service.js";
import {
  listUsers,
  loadCurrentProfile,
  loginOperator,
  logoutOperator,
  updateUserTag
} from "../services/auth-service.js";

let dadosBrutos = [];
let currentProfile = null;

function setAuthFeedback(message = "", type = "error") {
  const feedback = document.getElementById("adminAuthFeedback");
  if (!feedback) return;

  feedback.textContent = message;
  feedback.classList.toggle("hidden", !message);
  feedback.dataset.type = type;
}

function setUsersFeedback(message = "", type = "success") {
  const feedback = document.getElementById("usersFeedback");
  if (!feedback) return;

  feedback.textContent = message;
  feedback.classList.toggle("hidden", !message);
  feedback.dataset.type = type;
}

function showAdminApp(profile) {
  document.getElementById("adminLogin")?.classList.add("hidden");
  document.getElementById("adminApp")?.classList.remove("hidden");

  const identity = document.getElementById("adminIdentity");
  if (identity) {
    identity.textContent = `${profile.nome} • Matrícula ${profile.matricula}`;
  }
}

function showLogin() {
  document.getElementById("adminLogin")?.classList.remove("hidden");
  document.getElementById("adminApp")?.classList.add("hidden");
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
      <td>${op}</td>
      <td>${atendidas}</td>
      <td>${cancelados}</td>
      <td>
        <span class="rate-badge" style="background:${getCorTaxa(taxa)};color:white">
          ${taxa}%
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

async function carregarUsuarios() {
  try {
    const users = await listUsers();
    renderizarUsuarios(users);
  } catch (error) {
    console.error("Erro ao carregar usuários:", error);
    setUsersFeedback("Não foi possível carregar os acessos.", "error");
  }
}

function renderizarUsuarios(users) {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  users
    .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")))
    .forEach((user) => {
      const tr = document.createElement("tr");
      const userUid = user.uid || user.id;
      const disabled = userUid === currentProfile?.uid ? "disabled" : "";

      tr.innerHTML = `
        <td>${user.matricula || "-"}</td>
        <td>${user.nome || "-"}</td>
        <td>
          <select class="tag-select" data-uid="${userUid}" ${disabled}>
            <option value="cr" ${user.tag === "cr" ? "selected" : ""}>cr</option>
            <option value="adm" ${user.tag === "adm" ? "selected" : ""}>adm</option>
          </select>
        </td>
        <td>
          <button class="table-action" data-uid="${userUid}" ${disabled}>Salvar</button>
        </td>
      `;

      tbody.appendChild(tr);
    });

  tbody.querySelectorAll(".table-action").forEach((button) => {
    button.addEventListener("click", async () => {
      const uid = button.dataset.uid;
      const select = tbody.querySelector(`.tag-select[data-uid="${uid}"]`);
      const tag = select?.value;

      if (!uid || !tag) return;

      try {
        button.disabled = true;
        await updateUserTag(uid, tag);
        setUsersFeedback("Tag atualizada com sucesso.", "success");
        await carregarUsuarios();
      } catch (error) {
        console.error("Erro ao atualizar tag:", error);
        setUsersFeedback(error.message || "Não foi possível atualizar a tag.", "error");
        button.disabled = false;
      }
    });
  });
}

async function handleAdminLogin() {
  const matricula = document.getElementById("adminMatriculaInput")?.value.trim() || "";
  const password = document.getElementById("adminPasswordInput")?.value || "";

  setAuthFeedback("");

  try {
    const result = await loginOperator({ matricula, password });

    if (!result.exists) {
      setAuthFeedback("Essa matrícula ainda não possui acesso.", "error");
      return;
    }

    const refreshedProfile = await loadCurrentProfile();

    if (refreshedProfile?.tag !== "adm") {
      await logoutOperator();
      setAuthFeedback("Acesso negado. Somente usuários com tag adm podem entrar.", "error");
      return;
    }

    currentProfile = refreshedProfile;
    showAdminApp(currentProfile);
    await carregarDados();
    await carregarUsuarios();
  } catch (error) {
    setAuthFeedback(error.message || "Não foi possível entrar.", "error");
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
    setAuthFeedback("Acesso negado. Somente usuários com tag adm podem entrar.", "error");
    return;
  }

  showAdminApp(currentProfile);
  await carregarDados();
  await carregarUsuarios();
}

document.addEventListener("DOMContentLoaded", async () => {
  const loginButton = document.getElementById("adminLoginButton");
  const passwordInput = document.getElementById("adminPasswordInput");
  const matriculaInput = document.getElementById("adminMatriculaInput");
  const periodFilter = document.getElementById("periodFilter");
  const adminLogoutButton = document.getElementById("adminLogoutButton");

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
      mensal: "deste mês"
    };
    document.getElementById("periodLabel").textContent =
      `Exibindo resultados ${labels[periodFilter.value]}`;
    processarEExibir();
  });

  adminLogoutButton?.addEventListener("click", async () => {
    await logoutOperator();
    window.location.href = "../index.html";
  });

  await initializeAdmin();
});
