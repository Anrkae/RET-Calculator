import {
  excluirItemFila,
  listarFila
} from "../services/atendimentos-service.js";
import {
  loadCurrentProfile,
  loginOperator,
  logoutOperator
} from "../services/auth-service.js";

const CANCELAMENTO_COLLECTION = "cancelamentoFila";
const DEMANDA_COLLECTION = "demandasFila";

let currentProfile = null;
let currentTab = CANCELAMENTO_COLLECTION;
let cancelamentos = [];
let demandas = [];

function setFeedback(message = "", type = "error") {
  const feedback = document.getElementById("queueFeedback");
  if (!feedback) return;

  feedback.textContent = message;
  feedback.classList.toggle("hidden", !message);
  feedback.dataset.type = type;
}

function setAuthFeedback(message = "", type = "error") {
  const feedback = document.getElementById("queueAuthFeedback");
  if (!feedback) return;

  feedback.textContent = message;
  feedback.classList.toggle("hidden", !message);
  feedback.dataset.type = type;
}

function showQueueApp(profile) {
  document.getElementById("queueLogin")?.classList.add("hidden");
  document.getElementById("queueApp")?.classList.remove("hidden");
  document.getElementById("queueIdentity").textContent =
    `${profile.nome} • ${profile.matricula}`;
}

function showLogin() {
  document.getElementById("queueLogin")?.classList.remove("hidden");
  document.getElementById("queueApp")?.classList.add("hidden");
}

function getCurrentItems() {
  return currentTab === CANCELAMENTO_COLLECTION ? cancelamentos : demandas;
}

function getStatusLabel(status) {
  if (status === "sent") return "Enviado";
  if (status === "blocked_supervisor") return "Bloqueado";
  if (status === "pending") return "Pendente";
  return status || "Sem status";
}

function buildQueueDescription(item) {
  if (currentTab === CANCELAMENTO_COLLECTION) {
    return `Motivo: ${item.reason || "-"} • ${item.time || "-"} • #${item.cancelCountOfDay || 0}`;
  }

  return item.message || "Sem mensagem";
}

function renderQueues() {
  const list = document.getElementById("queueList");
  const title = document.getElementById("queuePanelTitle");
  const summary = document.getElementById("queueSummary");
  const cancelamentosTab = document.getElementById("showCancelamentosTab");
  const demandasTab = document.getElementById("showDemandasTab");

  if (!list || !title || !summary || !cancelamentosTab || !demandasTab) return;

  const items = getCurrentItems();

  title.textContent =
    currentTab === CANCELAMENTO_COLLECTION ? "Fila de cancelamentos" : "Fila de demandas";

  summary.textContent = `${items.length} item(ns) nesta visualização`;

  cancelamentosTab.classList.toggle("is-active", currentTab === CANCELAMENTO_COLLECTION);
  cancelamentosTab.classList.toggle("ghost-button", currentTab !== CANCELAMENTO_COLLECTION);
  demandasTab.classList.toggle("is-active", currentTab === DEMANDA_COLLECTION);
  demandasTab.classList.toggle("ghost-button", currentTab !== DEMANDA_COLLECTION);

  if (!items.length) {
    list.innerHTML = `
      <div class="queue-empty">
        <strong>Nenhum item encontrado</strong>
        <span>Quando houver registros nesta fila, eles aparecerão aqui.</span>
      </div>
    `;
    return;
  }

  list.innerHTML = items.map((item) => `
    <article class="queue-item">
      <div class="queue-item-head">
        <div>
          <strong>${item.operatorName || item.operator || "Sem operador"}</strong>
          <span>Supervisor: ${item.supervisor || "não definido"}</span>
        </div>
        <span class="queue-status-pill" data-status="${item.status || "pending"}">${getStatusLabel(item.status)}</span>
      </div>

      <div class="queue-item-body">
        <span>${buildQueueDescription(item)}</span>
        <small>${item.createdAt || "-"}</small>
      </div>

      <div class="queue-item-actions">
        <button class="table-action queue-delete-button" type="button" data-queue-id="${item.id}">
          Apagar
        </button>
      </div>
    </article>
  `).join("");
}

async function carregarFilas() {
  setFeedback("");

  try {
    [cancelamentos, demandas] = await Promise.all([
      listarFila(CANCELAMENTO_COLLECTION),
      listarFila(DEMANDA_COLLECTION)
    ]);
    renderQueues();
  } catch (error) {
    console.error("Erro ao carregar filas:", error);
    setFeedback(error.message || "Não foi possível carregar as filas agora.", "error");
  }
}

async function handleDeleteQueueItem(id) {
  if (!id) return;

  try {
    await excluirItemFila(currentTab, id);
    setFeedback("Item removido da fila com sucesso.", "success");
    await carregarFilas();
  } catch (error) {
    console.error("Erro ao remover item da fila:", error);
    setFeedback(error.message || "Não foi possível remover este item.", "error");
  }
}

async function handleAdminLogin() {
  const matricula = document.getElementById("queueMatriculaInput")?.value.trim() || "";
  const password = document.getElementById("queuePasswordInput")?.value || "";

  setAuthFeedback("");

  try {
    const result = await loginOperator({ matricula, password });

    if (!result.exists) {
      setAuthFeedback("Não encontrei um acesso ativo para esse Almope.", "error");
      return;
    }

    const refreshedProfile = await loadCurrentProfile();

    if (refreshedProfile?.tag !== "adm") {
      await logoutOperator();
      setAuthFeedback("Seu acesso foi reconhecido, mas esta área é exclusiva para administradores.", "error");
      return;
    }

    currentProfile = refreshedProfile;
    showQueueApp(currentProfile);
    await carregarFilas();
  } catch (error) {
    setAuthFeedback(error.message || "Não foi possível entrar.", "error");
  }
}

async function initializeQueuePage() {
  currentProfile = await loadCurrentProfile();

  if (!currentProfile) {
    showLogin();
    return;
  }

  if (currentProfile.tag !== "adm") {
    await logoutOperator();
    showLogin();
    setAuthFeedback("Seu acesso não tem permissão para abrir esta área.", "error");
    return;
  }

  showQueueApp(currentProfile);
  await carregarFilas();
}

document.addEventListener("DOMContentLoaded", async () => {
  const loginButton = document.getElementById("queueLoginButton");
  const passwordInput = document.getElementById("queuePasswordInput");
  const matriculaInput = document.getElementById("queueMatriculaInput");
  const refreshButton = document.getElementById("refreshQueuesButton");
  const logoutButton = document.getElementById("queueLogoutButton");
  const cancelamentosTab = document.getElementById("showCancelamentosTab");
  const demandasTab = document.getElementById("showDemandasTab");
  const queueList = document.getElementById("queueList");

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

  refreshButton?.addEventListener("click", carregarFilas);
  logoutButton?.addEventListener("click", async () => {
    await logoutOperator();
    window.location.href = "../index.html";
  });

  cancelamentosTab?.addEventListener("click", () => {
    currentTab = CANCELAMENTO_COLLECTION;
    renderQueues();
  });

  demandasTab?.addEventListener("click", () => {
    currentTab = DEMANDA_COLLECTION;
    renderQueues();
  });

  queueList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-queue-id]");
    if (!button) return;
    handleDeleteQueueItem(button.dataset.queueId);
  });

  await initializeQueuePage();
});
