import {
  loadCurrentProfile,
  loginOperator,
  logoutOperator
} from "../services/auth-service.js";
import {
  createSupervisorGroupMapping,
  deleteSupervisorGroupMapping,
  loadBotSettings,
  loadSupervisorGroups,
  saveBotSettings,
  updateSupervisorGroupMapping
} from "../services/controle-service.js";
import {
  checkSessionConnection,
  closeSession,
  extractConnectionStatus,
  extractQrCode,
  getQrCodeSession,
  startSession
} from "../services/wppconnect-service.js";
import { listarFila } from "../services/atendimentos-service.js";

const panelTitles = {
  queues: "Controle das filas",
  whatsapp: "Conexao WhatsApp",
  templates: "Textos padrao",
  settings: "Configuracoes do bot"
};

const CANCELAMENTO_COLLECTION = "cancelamentoFila";
const DEMANDA_COLLECTION = "demandasFila";
const SETTINGS_FIELD_IDS = [
  "settingsWorkerInterval",
  "settingsFallbackGroup",
  "settingsCancelamentoWebhook",
  "settingsDemandaWebhook",
  "settingsWppconnectBaseUrl",
  "settingsWppconnectSessionName",
  "settingsWppconnectBearerToken",
  "settingsN8nBaseUrl"
];

let currentProfile = null;
let botSettings = null;
let supervisorGroups = [];
let deletedMappingIds = [];
let activePanel = "queues";
let isSidebarCollapsed = false;
let hasUnsavedChanges = false;
const WPP_QR_POLL_ATTEMPTS = 8;
const WPP_QR_POLL_DELAY_MS = 3000;

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function normalizeSettings(settings = {}) {
  return {
    workerIntervalMs: String(settings.workerIntervalMs || "").trim(),
    fallbackGroupId: String(settings.fallbackGroupId || "").trim(),
    cancelamentoWebhookPath: String(settings.cancelamentoWebhookPath || "").trim(),
    demandaWebhookPath: String(settings.demandaWebhookPath || "").trim(),
    wppconnectBaseUrl: String(settings.wppconnectBaseUrl || "").trim(),
    wppconnectSessionName: String(settings.wppconnectSessionName || "").trim(),
    wppconnectBearerToken: String(settings.wppconnectBearerToken || "").trim(),
    n8nBaseUrl: String(settings.n8nBaseUrl || "").trim()
  };
}

function normalizeMappings(mappings = []) {
  return mappings.map((item) => ({
    id: String(item.id || "").trim(),
    supervisor: String(item.supervisor || "").trim(),
    groupId: String(item.groupId || "").trim(),
    enabled: Boolean(item.enabled),
    notes: String(item.notes || "").trim()
  }));
}

function readCurrentSettingsForm() {
  return {
    workerIntervalMs: document.getElementById("settingsWorkerInterval")?.value.trim() || "",
    fallbackGroupId: document.getElementById("settingsFallbackGroup")?.value.trim() || "",
    cancelamentoWebhookPath: document.getElementById("settingsCancelamentoWebhook")?.value.trim() || "",
    demandaWebhookPath: document.getElementById("settingsDemandaWebhook")?.value.trim() || "",
    wppconnectBaseUrl: document.getElementById("settingsWppconnectBaseUrl")?.value.trim() || "",
    wppconnectSessionName: document.getElementById("settingsWppconnectSessionName")?.value.trim() || "",
    wppconnectBearerToken: document.getElementById("settingsWppconnectBearerToken")?.value.trim() || "",
    n8nBaseUrl: document.getElementById("settingsN8nBaseUrl")?.value.trim() || ""
  };
}

function getWhatsappConfig() {
  return {
    baseUrl: botSettings?.wppconnectBaseUrl || "",
    sessionName: botSettings?.wppconnectSessionName || "",
    token: botSettings?.wppconnectBearerToken || ""
  };
}

function getSavedSnapshot() {
  return JSON.stringify({
    settings: normalizeSettings(botSettings || {}),
    mappings: normalizeMappings(supervisorGroups),
    deletedMappingIds: []
  });
}

function getCurrentSnapshot() {
  return JSON.stringify({
    settings: normalizeSettings(readCurrentSettingsForm()),
    mappings: normalizeMappings(supervisorGroups),
    deletedMappingIds: [...deletedMappingIds].sort()
  });
}

function syncSaveButtonState() {
  const saveButton = document.getElementById("saveToolSettingsButton");
  if (!saveButton) return;

  saveButton.classList.toggle("hidden", activePanel !== "settings");
  saveButton.disabled = activePanel !== "settings" || !hasUnsavedChanges;
}

function recalculateDirtyState() {
  hasUnsavedChanges = getCurrentSnapshot() !== getSavedSnapshot();
  syncSaveButtonState();
}

function setFeedback(message = "", type = "error") {
  const feedback = document.getElementById("toolPageFeedback");
  if (!feedback) return;

  feedback.textContent = message;
  feedback.classList.toggle("hidden", !message);
  feedback.dataset.type = type;
}

function setAuthFeedback(message = "", type = "error") {
  const feedback = document.getElementById("toolAuthFeedback");
  if (!feedback) return;

  feedback.textContent = message;
  feedback.classList.toggle("hidden", !message);
  feedback.dataset.type = type;
}

function setWhatsappFeedback(message = "", type = "error") {
  const feedback = document.getElementById("whatsappFeedback");
  if (!feedback) return;

  feedback.textContent = message;
  feedback.classList.toggle("hidden", !message);
  feedback.dataset.type = type;
}

function renderWhatsappShell() {
  const config = getWhatsappConfig();

  document.getElementById("whatsappSessionName").textContent = config.sessionName || "Nao definido";
  document.getElementById("whatsappBaseUrl").textContent = config.baseUrl || "Nao definido";
}

function renderWhatsappStatus(connected = false, statusText = "Nao verificado") {
  const pill = document.getElementById("whatsappStatusPill");
  const status = document.getElementById("whatsappSessionStatus");

  if (pill) {
    pill.textContent = statusText;
    pill.className = `status-pill ${connected ? "status-success" : "status-warning"}`;
  }

  if (status) {
    status.textContent = statusText;
  }
}

function renderQrCode(imageSource = "", title = "QR indisponivel", copy = "Use o botao para consultar um QR Code novo quando a sessao precisar reconectar.") {
  const image = document.getElementById("whatsappQrImage");
  const titleElement = document.getElementById("whatsappQrTitle");
  const copyElement = document.getElementById("whatsappQrCopy");

  if (titleElement) {
    titleElement.textContent = title;
  }

  if (copyElement) {
    copyElement.textContent = copy;
  }

  if (!image) return;

  if (imageSource) {
    image.src = imageSource;
    image.classList.remove("hidden");
  } else {
    image.removeAttribute("src");
    image.classList.add("hidden");
  }
}

function getFriendlyWhatsappStatus(payload) {
  const parsed = extractConnectionStatus(payload);
  const rawStatus = String(
    payload?.status ||
    payload?.message ||
    payload?.state ||
    parsed.statusText ||
    ""
  ).trim();
  const normalized = rawStatus.toLowerCase();

  if (normalized.includes("connected")) {
    return {
      connected: true,
      label: "Conectado"
    };
  }

  if (normalized.includes("connecting")) {
    return {
      connected: false,
      label: "Conectando"
    };
  }

  if (normalized.includes("qr")) {
    return {
      connected: false,
      label: "Aguardando QR"
    };
  }

  if (normalized.includes("close") || normalized.includes("disconnected")) {
    return {
      connected: false,
      label: "Desconectado"
    };
  }

  return {
    connected: parsed.connected,
    label: parsed.connected ? "Conectado" : "Nao verificado"
  };
}

function applySidebarState() {
  const shell = document.getElementById("toolApp");
  const toggleButton = document.getElementById("toggleToolSidebarButton");

  if (!shell || !toggleButton) return;

  shell.classList.toggle("is-collapsed", isSidebarCollapsed);
  toggleButton.setAttribute("aria-expanded", String(!isSidebarCollapsed));
  toggleButton.setAttribute("aria-label", isSidebarCollapsed ? "Expandir menu" : "Minimizar menu");
}

async function refreshWhatsappStatus() {
  renderWhatsappShell();

  try {
    const response = await checkSessionConnection(getWhatsappConfig());
    const friendlyStatus = getFriendlyWhatsappStatus(response);
    renderWhatsappStatus(friendlyStatus.connected, friendlyStatus.label);

    if (friendlyStatus.connected) {
      renderQrCode(
        "",
        "Sessao conectada",
        "Nao existe QR Code enquanto o bot estiver online e conectado."
      );
    }

    setWhatsappFeedback("Status da sessao atualizado.", "success");
  } catch (error) {
    renderWhatsappStatus(false, "Falha na consulta");
    setWhatsappFeedback(error.message || "Nao foi possivel consultar o status da sessao.", "error");
  }
}

async function handleStartWhatsappSession() {
  try {
    setWhatsappFeedback("Iniciando sessao do bot...", "success");
    const response = await startSession(getWhatsappConfig());
    const qrCode = extractQrCode(response);

    if (qrCode) {
      renderQrCode(qrCode, "QR Code pronto", "Leia este QR Code no WhatsApp para reconectar a sessao.");
    } else {
      const friendlyStatus = getFriendlyWhatsappStatus(response);
      if (friendlyStatus.connected) {
        renderQrCode(
          "",
          "Sessao conectada",
          "A sessao ja esta conectada. Nenhum QR Code precisa ser exibido agora."
        );
      }
    }

    await refreshWhatsappStatus();
    setWhatsappFeedback("Sessao iniciada. Se necessario, use ou escaneie o QR Code exibido.", "success");
  } catch (error) {
    setWhatsappFeedback(error.message || "Nao foi possivel iniciar a sessao do bot.", "error");
  }
}

async function handleGenerateWhatsappQr() {
  try {
    setWhatsappFeedback("Consultando QR Code da sessao...", "success");
    const config = getWhatsappConfig();
    const connectionResponse = await checkSessionConnection(config);
    const friendlyStatus = getFriendlyWhatsappStatus(connectionResponse);

    if (friendlyStatus.connected) {
      renderWhatsappStatus(true, "Conectado");
      renderQrCode(
        "",
        "Sessao conectada",
        "Nao existe QR Code disponivel enquanto o bot estiver conectado."
      );
      setWhatsappFeedback("A sessao ja esta conectada, por isso nao ha QR para mostrar.", "success");
      return;
    }

    setWhatsappFeedback("Sessao desconectada. Iniciando nova sessao e aguardando QR...", "success");
    await startSession({ ...config, waitQrCode: true });

    for (let attempt = 1; attempt <= WPP_QR_POLL_ATTEMPTS; attempt += 1) {
      await wait(WPP_QR_POLL_DELAY_MS);
      const response = await getQrCodeSession(config);
      const qrCode = extractQrCode(response);

      if (qrCode) {
        renderWhatsappStatus(false, "Aguardando QR");
        renderQrCode(
          qrCode,
          "QR Code pronto",
          "Leia este QR Code no WhatsApp para reconectar a sessao."
        );
        setWhatsappFeedback("QR Code gerado com sucesso.", "success");
        return;
      }

      const loopStatus = String(response?.status || "").toLowerCase();
      const loopMessage = String(response?.message || "").toLowerCase();

      if (loopStatus.includes("connected")) {
        renderWhatsappStatus(true, "Conectado");
        renderQrCode(
          "",
          "Sessao conectada",
          "A sessao voltou a conectar antes de gerar um novo QR Code."
        );
        setWhatsappFeedback("A sessao reconectou automaticamente antes da exibicao do QR.", "success");
        return;
      }

      if (loopStatus.includes("initializing") || loopMessage.includes("not available")) {
        setWhatsappFeedback(`Preparando QR Code... tentativa ${attempt} de ${WPP_QR_POLL_ATTEMPTS}.`, "success");
      }
    }

    renderWhatsappStatus(false, "Aguardando QR");
    renderQrCode(
      "",
      "QR ainda nao disponivel",
      "A sessao foi iniciada, mas o WPPConnect ainda nao entregou um QR Code nesta janela de espera."
    );
    setWhatsappFeedback("Ainda nao recebi o QR Code. Aguarde alguns segundos e tente novamente.", "error");
  } catch (error) {
    setWhatsappFeedback(error.message || "Nao foi possivel obter o QR Code da sessao.", "error");
  }
}

async function handleCloseWhatsappSession() {
  try {
    setWhatsappFeedback("Fechando a sessao atual do bot...", "success");
    await closeSession(getWhatsappConfig());
    renderWhatsappStatus(false, "Sessao fechada");
    renderQrCode(
      "",
      "Sessao fechada",
      "Agora voce pode iniciar a sessao novamente e gerar um novo QR Code."
    );
    setWhatsappFeedback("Sessao fechada com sucesso. Gere um novo QR Code para reconectar.", "success");
  } catch (error) {
    setWhatsappFeedback(error.message || "Nao foi possivel fechar a sessao do bot.", "error");
  }
}

function setActivePanel(target) {
  activePanel = target;

  const buttons = document.querySelectorAll("[data-panel-target]");
  const sections = document.querySelectorAll(".tool-panel");
  const title = document.getElementById("toolPanelTitle");

  buttons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.panelTarget === target);
  });

  sections.forEach((section) => {
    section.classList.toggle("hidden", section.id !== `panel-${target}`);
  });

  if (title) {
    title.textContent = panelTitles[target] || "Painel da ferramenta";
  }

  syncSaveButtonState();

  if (target === "whatsapp") {
    renderWhatsappShell();
  }
}

function showToolApp(profile) {
  document.getElementById("toolLogin")?.classList.add("hidden");
  document.getElementById("toolApp")?.classList.remove("hidden");

  const identity = document.getElementById("toolIdentity");
  if (identity) {
    identity.textContent = `${profile.nome} • ${profile.matricula}`;
  }

  applySidebarState();
}

function showLogin() {
  document.getElementById("toolLogin")?.classList.remove("hidden");
  document.getElementById("toolApp")?.classList.add("hidden");
}

function renderBotSettings() {
  if (!botSettings) return;

  document.getElementById("settingsWorkerInterval").value = botSettings.workerIntervalMs || "";
  document.getElementById("settingsFallbackGroup").value = botSettings.fallbackGroupId || "";
  document.getElementById("settingsCancelamentoWebhook").value = botSettings.cancelamentoWebhookPath || "";
  document.getElementById("settingsDemandaWebhook").value = botSettings.demandaWebhookPath || "";
  document.getElementById("settingsWppconnectBaseUrl").value = botSettings.wppconnectBaseUrl || "";
  document.getElementById("settingsWppconnectSessionName").value = botSettings.wppconnectSessionName || "";
  document.getElementById("settingsWppconnectBearerToken").value = botSettings.wppconnectBearerToken || "";
  document.getElementById("settingsN8nBaseUrl").value = botSettings.n8nBaseUrl || "";
  document.getElementById("settingsUpdatedAt").textContent = botSettings.updatedAt || "Ainda nao salvo";
  document.getElementById("settingsSupervisorCount").textContent = String(supervisorGroups.length);
  document.getElementById("settingsGroupCount").textContent = String(
    supervisorGroups.filter((item) => item.enabled && item.groupId).length
  );

  renderWhatsappShell();
}

function renderSupervisorMappings() {
  const list = document.getElementById("supervisorMappingsList");
  const preview = document.getElementById("queueRoutingPreview");

  if (!list || !preview) return;

  if (!supervisorGroups.length) {
    list.innerHTML = `
      <div class="mapping-row">
        <span>Nenhum supervisor configurado ainda.</span>
      </div>
    `;
    preview.innerHTML = `
      <div class="mapping-row mapping-row-head">
        <span>Supervisor</span>
        <span>Grupo</span>
        <span>Status</span>
      </div>
      <div class="mapping-row">
        <span>Sem mapeamentos ativos.</span>
      </div>
    `;
    renderBotSettings();
    return;
  }

  list.innerHTML = supervisorGroups.map((item, index) => `
    <div class="mapping-row mapping-editable" data-mapping-id="${item.id || ""}" data-mapping-index="${index}">
      <input type="text" value="${item.supervisor || ""}" placeholder="Supervisor" data-mapping-field="supervisor">
      <input type="text" value="${item.groupId || ""}" placeholder="1203...@g.us" data-mapping-field="groupId">
      <label class="mapping-checkbox">
        <input type="checkbox" ${item.enabled ? "checked" : ""} data-mapping-field="enabled">
        Ativo
      </label>
      <input type="text" value="${item.notes || ""}" placeholder="Observacao" data-mapping-field="notes">
      <button class="ghost-button small-action" type="button" data-delete-mapping="${index}">Remover</button>
    </div>
  `).join("");

  preview.innerHTML = `
    <div class="mapping-row mapping-row-head">
      <span>Supervisor</span>
      <span>Grupo</span>
      <span>Status</span>
    </div>
    ${supervisorGroups.map((item) => `
      <div class="mapping-row">
        <span>${item.supervisor || "-"}</span>
        <span>${item.groupId || "Nao configurado"}</span>
        <span class="status-pill ${item.enabled ? "status-success" : "status-warning"}">${item.enabled ? "Ativo" : "Inativo"}</span>
      </div>
    `).join("")}
  `;

  renderBotSettings();
}

function attachMappingsToState() {
  const rows = document.querySelectorAll(".mapping-editable");

  supervisorGroups = Array.from(rows).map((row, index) => {
    const current = supervisorGroups[index] || {};

    return {
      ...current,
      id: row.dataset.mappingId || "",
      supervisor: row.querySelector('[data-mapping-field="supervisor"]')?.value.trim() || "",
      groupId: row.querySelector('[data-mapping-field="groupId"]')?.value.trim() || "",
      enabled: Boolean(row.querySelector('[data-mapping-field="enabled"]')?.checked),
      notes: row.querySelector('[data-mapping-field="notes"]')?.value.trim() || ""
    };
  });
}

async function refreshOverview() {
  const [cancelamentos, demandas] = await Promise.all([
    listarFila(CANCELAMENTO_COLLECTION),
    listarFila(DEMANDA_COLLECTION)
  ]);

  const totalQueues = cancelamentos.length + demandas.length;
  const totalBlocked =
    cancelamentos.filter((item) => item.status === "blocked_supervisor").length +
    demandas.filter((item) => item.status === "blocked_supervisor").length;

  const cancelamentosPendentes = cancelamentos.filter((item) => item.status === "pending").length;
  const cancelamentosBloqueados = cancelamentos.filter((item) => item.status === "blocked_supervisor").length;
  const cancelamentosEnviados = cancelamentos.filter((item) => item.status === "sent").length;

  const demandasPendentes = demandas.filter((item) => item.status === "pending").length;
  const demandasBloqueadas = demandas.filter((item) => item.status === "blocked_supervisor").length;
  const demandasEnviadas = demandas.filter((item) => item.status === "sent").length;

  document.getElementById("overviewQueues").textContent = String(totalQueues);
  document.getElementById("overviewBlocked").textContent = String(totalBlocked);
  document.getElementById("overviewGroups").textContent = String(supervisorGroups.filter((item) => item.groupId).length);
  document.getElementById("overviewSupervisors").textContent = String(supervisorGroups.length);

  document.getElementById("cancelamentosPendentes").textContent = String(cancelamentosPendentes);
  document.getElementById("cancelamentosBloqueados").textContent = String(cancelamentosBloqueados);
  document.getElementById("cancelamentosEnviados").textContent = String(cancelamentosEnviados);
  document.getElementById("cancelamentosStatusPill").textContent = `${cancelamentosPendentes} pendentes`;

  document.getElementById("demandasPendentes").textContent = String(demandasPendentes);
  document.getElementById("demandasBloqueadas").textContent = String(demandasBloqueadas);
  document.getElementById("demandasEnviadas").textContent = String(demandasEnviadas);
  document.getElementById("demandasStatusPill").textContent = `${demandasPendentes} pendentes`;
}

async function loadControlData() {
  const [settings, mappings] = await Promise.all([
    loadBotSettings(),
    loadSupervisorGroups()
  ]);

  botSettings = settings;
  supervisorGroups = mappings;
  deletedMappingIds = [];
  hasUnsavedChanges = false;

  renderSupervisorMappings();
  renderBotSettings();
  renderWhatsappStatus(false, "Nao verificado");
  renderQrCode();
  await refreshOverview();
  syncSaveButtonState();
}

async function handleSaveSettings() {
  attachMappingsToState();

  const sanitizedMappings = supervisorGroups.filter((item) => item.supervisor || item.groupId || item.notes);

  if (sanitizedMappings.some((item) => item.enabled && (!item.supervisor || !item.groupId))) {
    setFeedback("Todo mapeamento ativo precisa ter supervisor e ID do grupo.", "error");
    return;
  }

  try {
    await saveBotSettings(readCurrentSettingsForm());

    for (const item of sanitizedMappings) {
      if (item.id) {
        await updateSupervisorGroupMapping(item.id, item);
      } else {
        const docRef = await createSupervisorGroupMapping(item);
        item.id = docRef.id;
      }
    }

    for (const deletedId of deletedMappingIds) {
      await deleteSupervisorGroupMapping(deletedId);
    }

    await loadControlData();
    setFeedback("Configuracoes do bot salvas com sucesso.", "success");
  } catch (error) {
    console.error("Erro ao salvar configuracoes do bot:", error);
    setFeedback(error.message || "Nao foi possivel salvar as configuracoes agora.", "error");
  }
}

function addSupervisorMappingRow() {
  attachMappingsToState();
  supervisorGroups.push({
    id: "",
    supervisor: "",
    groupId: "",
    enabled: true,
    notes: ""
  });
  renderSupervisorMappings();
  recalculateDirtyState();
}

function removeSupervisorMapping(index) {
  attachMappingsToState();
  const currentItem = supervisorGroups[index];
  if (currentItem?.id) {
    deletedMappingIds.push(currentItem.id);
  }
  supervisorGroups.splice(index, 1);
  renderSupervisorMappings();
  recalculateDirtyState();
}

async function handleAdminLogin() {
  const matricula = document.getElementById("toolMatriculaInput")?.value.trim() || "";
  const password = document.getElementById("toolPasswordInput")?.value || "";

  setAuthFeedback("");

  try {
    const result = await loginOperator({ matricula, password });

    if (!result.exists) {
      setAuthFeedback("Nao encontrei um acesso ativo para esse Almope.", "error");
      return;
    }

    const refreshedProfile = await loadCurrentProfile();

    if (refreshedProfile?.tag !== "adm") {
      await logoutOperator();
      setAuthFeedback("Seu acesso foi reconhecido, mas esta area e exclusiva para administradores.", "error");
      return;
    }

    currentProfile = refreshedProfile;
    showToolApp(currentProfile);
    await loadControlData();
  } catch (error) {
    setAuthFeedback(error.message || "Nao foi possivel entrar.", "error");
  }
}

async function initializeControlPage() {
  currentProfile = await loadCurrentProfile();

  if (!currentProfile) {
    showLogin();
    return;
  }

  if (currentProfile.tag !== "adm") {
    await logoutOperator();
    showLogin();
    setAuthFeedback("Seu acesso nao tem permissao para abrir esta area.", "error");
    return;
  }

  showToolApp(currentProfile);
  await loadControlData();
}

document.addEventListener("DOMContentLoaded", async () => {
  const loginButton = document.getElementById("toolLoginButton");
  const passwordInput = document.getElementById("toolPasswordInput");
  const matriculaInput = document.getElementById("toolMatriculaInput");
  const logoutButton = document.getElementById("toolLogoutButton");
  const saveButton = document.getElementById("saveToolSettingsButton");
  const refreshButton = document.getElementById("refreshToolDataButton");
  const addMappingButton = document.getElementById("addSupervisorMappingButton");
  const mappingsList = document.getElementById("supervisorMappingsList");
  const sidebarToggleButton = document.getElementById("toggleToolSidebarButton");
  const refreshWhatsappStatusButton = document.getElementById("refreshWhatsappStatusButton");
  const startWhatsappSessionButton = document.getElementById("startWhatsappSessionButton");
  const closeWhatsappSessionButton = document.getElementById("closeWhatsappSessionButton");
  const generateWhatsappQrButton = document.getElementById("generateWhatsappQrButton");

  document.querySelectorAll("[data-panel-target]").forEach((button) => {
    button.addEventListener("click", () => {
      setActivePanel(button.dataset.panelTarget);
    });
  });

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

  logoutButton?.addEventListener("click", async () => {
    await logoutOperator();
    window.location.href = "../index.html";
  });

  saveButton?.addEventListener("click", handleSaveSettings);
  refreshButton?.addEventListener("click", async () => {
    setFeedback("");
    setWhatsappFeedback("");
    await loadControlData();
    if (activePanel === "whatsapp") {
      await refreshWhatsappStatus();
    }
  });

  sidebarToggleButton?.addEventListener("click", () => {
    isSidebarCollapsed = !isSidebarCollapsed;
    applySidebarState();
  });

  refreshWhatsappStatusButton?.addEventListener("click", refreshWhatsappStatus);
  startWhatsappSessionButton?.addEventListener("click", handleStartWhatsappSession);
  closeWhatsappSessionButton?.addEventListener("click", handleCloseWhatsappSession);
  generateWhatsappQrButton?.addEventListener("click", handleGenerateWhatsappQr);

  addMappingButton?.addEventListener("click", addSupervisorMappingRow);
  mappingsList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-mapping]");
    if (!button) return;
    removeSupervisorMapping(Number(button.dataset.deleteMapping));
  });
  mappingsList?.addEventListener("input", () => {
    attachMappingsToState();
    recalculateDirtyState();
  });
  mappingsList?.addEventListener("change", () => {
    attachMappingsToState();
    recalculateDirtyState();
  });

  SETTINGS_FIELD_IDS.forEach((fieldId) => {
    document.getElementById(fieldId)?.addEventListener("input", recalculateDirtyState);
    document.getElementById(fieldId)?.addEventListener("change", recalculateDirtyState);
  });

  applySidebarState();
  setActivePanel(activePanel);
  syncSaveButtonState();
  await initializeControlPage();
});
