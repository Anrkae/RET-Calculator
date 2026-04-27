import {
  buscarLigacoes,
  salvarAtendimento,
  salvarDemanda
} from "../services/atendimentos-service.js";
import {
  loadCurrentProfile,
  logoutOperator,
  saveUserDashboardPreferences
} from "../services/auth-service.js";

let pipWindow = null;
let callInterval = null;
let seconds = 0;

let selectedResult = null;
let history = [];
let currentProfile = null;
let historyExpanded = false;
let historyAnimation = null;
let selectedDemandType = "";
let selectedDemandDate = "";
let demandCalendarMonth = new Date().getMonth();
let demandCalendarYear = new Date().getFullYear();
const DEFAULT_DASHBOARD_PREFERENCES = {
  autoOpenPipOnPageChange: false,
  askObservationOnCancel: false,
  showContractFieldOnCancel: false
};
let dashboardPreferences = normalizeDashboardPreferences(DEFAULT_DASHBOARD_PREFERENCES);
let draftDashboardPreferences = null;

function normalizeDashboardPreferences(value = {}) {
  return {
    autoOpenPipOnPageChange: Boolean(value.autoOpenPipOnPageChange),
    askObservationOnCancel: Boolean(value.askObservationOnCancel),
    showContractFieldOnCancel: Boolean(value.showContractFieldOnCancel)
  };
}

function loadDashboardPreferences() {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_PREFERENCES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    return normalizeDashboardPreferences({
      ...DEFAULT_DASHBOARD_PREFERENCES,
      ...parsed
    });
  } catch (error) {
    console.error("Erro ao carregar preferências da dashboard:", error);
    return normalizeDashboardPreferences(DEFAULT_DASHBOARD_PREFERENCES);
  }
}

function persistDashboardPreferences() {
  window.localStorage.setItem(
    DASHBOARD_PREFERENCES_KEY,
    JSON.stringify(dashboardPreferences)
  );
}

function updateDashboardPreference(key, value) {
  dashboardPreferences = {
    ...dashboardPreferences,
    [key]: value
  };
  persistDashboardPreferences();
  renderDashboardPreferences();
}

function hasPreferenceChanges() {
  if (!draftDashboardPreferences) return false;

  return JSON.stringify(normalizeDashboardPreferences(dashboardPreferences))
    !== JSON.stringify(normalizeDashboardPreferences(draftDashboardPreferences));
}

const demandTemplates = {
  "encaixe-vt": `
    <div class="demand-grid">
      <div>
        <label for="demandContract">Contrato</label>
        <input id="demandContract" type="text" placeholder="000/123456789">
      </div>
      <div>
        <label for="demandDate">Data</label>
        <input id="demandDate" type="date">
      </div>
    </div>
    <div class="demand-grid">
      <div>
        <label for="demandStartHour">Das</label>
        <input id="demandStartHour" type="text" placeholder="14h">
      </div>
      <div>
        <label for="demandEndHour">Às</label>
        <input id="demandEndHour" type="text" placeholder="17h">
      </div>
    </div>
    <div class="demand-grid">
      <div>
        <label for="demandArea">Área</label>
        <input id="demandArea" type="text" placeholder="Área X">
      </div>
      <div>
        <label for="demandClasse">Classe</label>
        <input id="demandClasse" type="text" placeholder="Classe Y">
      </div>
    </div>
  `,
  "retirar-ponto": `
    <div class="demand-grid">
      <div>
        <label for="demandContract">Contrato</label>
        <input id="demandContract" type="text" placeholder="000/123456789">
      </div>
      <div>
        <label for="demandDate">Data</label>
        <input id="demandDate" type="date">
      </div>
    </div>
    <div class="demand-grid-3">
      <div>
        <label for="demandStartHour">Das</label>
        <input id="demandStartHour" type="text" placeholder="14h">
      </div>
      <div>
        <label for="demandEndHour">Às</label>
        <input id="demandEndHour" type="text" placeholder="17h">
      </div>
      <div>
        <label for="demandPoint">Ponto</label>
        <input id="demandPoint" type="text" placeholder="2">
      </div>
    </div>
  `,
  suspensao: `
    <div>
      <label for="demandContract">Contrato</label>
      <input id="demandContract" type="text" placeholder="000/123456789">
    </div>
    <div>
      <label>O que será suspenso?</label>
      <div class="checkbox-row">
        <label class="checkbox-chip"><input type="checkbox" value="TV" data-suspension-item> TV</label>
        <label class="checkbox-chip"><input type="checkbox" value="Virtua" data-suspension-item> Virtua</label>
        <label class="checkbox-chip"><input type="checkbox" value="Fone" data-suspension-item> Fone</label>
      </div>
    </div>
  `
};

function renderDashboardPreferences() {
  const currentPreferences = normalizeDashboardPreferences(
    draftDashboardPreferences || dashboardPreferences
  );
  const autoOpenInput = document.getElementById("prefAutoOpenPip");
  const autoOpenState = document.getElementById("prefAutoOpenPipState");
  const observationInput = document.getElementById("prefAskCancelObservation");
  const observationState = document.getElementById("prefAskCancelObservationState");
  const contractInput = document.getElementById("prefShowCancelContract");
  const contractState = document.getElementById("prefShowCancelContractState");
  const savePreferencesBtn = document.getElementById("savePreferencesBtn");

  if (autoOpenInput) {
    autoOpenInput.checked = currentPreferences.autoOpenPipOnPageChange;
  }

  if (autoOpenState) {
    autoOpenState.textContent = currentPreferences.autoOpenPipOnPageChange ? "Ativado" : "Desativado";
  }

  if (observationInput) {
    observationInput.checked = currentPreferences.askObservationOnCancel;
  }

  if (observationState) {
    observationState.textContent = currentPreferences.askObservationOnCancel ? "Ativado" : "Desativado";
  }

  if (contractInput) {
    contractInput.checked = currentPreferences.showContractFieldOnCancel;
  }

  if (contractState) {
    contractState.textContent = currentPreferences.showContractFieldOnCancel ? "Ativado" : "Desativado";
  }

  if (savePreferencesBtn) {
    savePreferencesBtn.disabled = !hasPreferenceChanges();
  }
}

function shouldShowCancelContractField() {
  return Boolean(dashboardPreferences.showContractFieldOnCancel);
}

function updateDraftDashboardPreference(key, value) {
  draftDashboardPreferences = normalizeDashboardPreferences({
    ...(draftDashboardPreferences || dashboardPreferences),
    [key]: value
  });
  renderDashboardPreferences();
}

function saveDashboardPreferences() {
  if (!draftDashboardPreferences || !currentProfile?.uid) return;

  const normalizedPreferences = normalizeDashboardPreferences(draftDashboardPreferences);
  const saveButton = document.getElementById("savePreferencesBtn");

  if (saveButton) {
    saveButton.disabled = true;
  }

  saveUserDashboardPreferences(currentProfile.uid, normalizedPreferences)
    .then(() => {
      dashboardPreferences = normalizedPreferences;
      draftDashboardPreferences = normalizeDashboardPreferences(dashboardPreferences);
      currentProfile = {
        ...currentProfile,
        dashboardPreferences
      };
      renderDashboardPreferences();
      closePreferencesModal();
    })
    .catch((error) => {
      console.error("Erro ao salvar preferências da dashboard:", error);
      alert("Nao foi possivel salvar suas preferencias agora.");
      renderDashboardPreferences();
    });
}

function buildDayOptions() {
  return Array.from({ length: 31 }, (_, index) => {
    const value = String(index + 1).padStart(2, "0");
    return `<option value="${value}">${value}</option>`;
  }).join("");
}

function buildMonthOptions() {
  return [
    ["01", "Jan"],
    ["02", "Fev"],
    ["03", "Mar"],
    ["04", "Abr"],
    ["05", "Mai"],
    ["06", "Jun"],
    ["07", "Jul"],
    ["08", "Ago"],
    ["09", "Set"],
    ["10", "Out"],
    ["11", "Nov"],
    ["12", "Dez"]
  ].map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
}

function buildYearOptions() {
  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear + 1]
    .map((year) => `<option value="${year}">${year}</option>`)
    .join("");
}

function buildDateFieldsTemplateLegacy() {
  return `
    <div>
      <label>Data</label>
      <div class="demand-grid-3 demand-date-grid">
        <select id="demandDateDay">
          <option value="">Dia</option>
          ${buildDayOptions()}
        </select>
        <select id="demandDateMonth">
          <option value="">Mês</option>
          ${buildMonthOptions()}
        </select>
        <select id="demandDateYear">
          <option value="">Ano</option>
          ${buildYearOptions()}
        </select>
      </div>
    </div>
  `;
}

function getDemandTemplate(type) {
  if (type === "encaixe-vt") {
    return `
      <div class="demand-grid demand-grid-wide">
        <div>
          <label for="demandContract">Contrato</label>
          <input id="demandContract" type="text" inputmode="numeric" maxlength="13" placeholder="000/123456789">
        </div>
        ${buildDateFieldsTemplate()}
      </div>
      <div class="demand-grid demand-grid-wide">
        <div>
          <label for="demandStartHour">Das</label>
          <input id="demandStartHour" type="text" inputmode="numeric" maxlength="3" placeholder="14h">
        </div>
        <div>
          <label for="demandEndHour">Às</label>
          <input id="demandEndHour" type="text" inputmode="numeric" maxlength="3" placeholder="17h">
        </div>
      </div>
      <div class="demand-grid demand-grid-wide">
        <div>
          <label for="demandArea">Área</label>
          <input id="demandArea" type="text" maxlength="24" placeholder="X">
        </div>
        <div>
          <label for="demandClasse">Classe</label>
          <input id="demandClasse" type="text" maxlength="24" placeholder="Y">
        </div>
      </div>
    `;
  }

  if (type === "retirar-ponto") {
    return `
      <div class="demand-grid demand-grid-wide">
        <div>
          <label for="demandContract">Contrato</label>
          <input id="demandContract" type="text" inputmode="numeric" maxlength="13" placeholder="000/123456789">
        </div>
        ${buildDateFieldsTemplate()}
      </div>
      <div class="demand-grid-3 demand-grid-spacious">
        <div>
          <label for="demandStartHour">Das</label>
          <input id="demandStartHour" type="text" inputmode="numeric" maxlength="3" placeholder="14h">
        </div>
        <div>
          <label for="demandEndHour">Às</label>
          <input id="demandEndHour" type="text" inputmode="numeric" maxlength="3" placeholder="17h">
        </div>
        <div>
          <label for="demandPoint">Ponto</label>
          <input id="demandPoint" type="text" inputmode="numeric" maxlength="2" placeholder="2">
        </div>
      </div>
    `;
  }

  if (type === "suspensao") {
    return `
      <div>
        <label for="demandContract">Contrato</label>
        <input id="demandContract" type="text" inputmode="numeric" maxlength="13" placeholder="000/123456789">
      </div>
      <div>
        <label>O que será suspenso?</label>
        <div class="checkbox-row">
          <label class="checkbox-chip"><input type="checkbox" value="TV" data-suspension-item> TV</label>
          <label class="checkbox-chip"><input type="checkbox" value="Virtua" data-suspension-item> Virtua</label>
          <label class="checkbox-chip"><input type="checkbox" value="Fone" data-suspension-item> Fone</label>
        </div>
      </div>
    `;
  }

  return demandTemplates[type] || "";
}

function getOperatorDisplayName() {
  return currentProfile?.nome || currentProfile?.matricula || "";
}

function getOperatorInfoLabel() {
  if (!currentProfile) return "";

  return `Operador: ${getOperatorDisplayName()} • ${currentProfile.matricula}`;
}

function renderOperatorInfo() {
  const operatorInfo = document.getElementById("operatorInfo");

  if (!operatorInfo) return;

  operatorInfo.textContent = getOperatorInfoLabel();
}

function setDemandFeedback(message = "", type = "error") {
  const feedback = document.getElementById("demandFeedback");
  if (!feedback) return;

  feedback.textContent = message;
  feedback.classList.toggle("hidden", !message);
  feedback.dataset.type = type;
}

function openDemandModal() {
  document.getElementById("demandModal")?.classList.remove("hidden");
}

function closeDemandModal() {
  document.getElementById("demandModal")?.classList.add("hidden");
  setDemandFeedback("");
  selectedDemandType = "";
  selectedDemandDate = "";
  syncDemandTypeTrigger();
  closeDemandTypeMenu();
  closeDemandCalendar();
  renderDemandFields();
}

function renderDemandFieldsLegacy() {
  const container = document.getElementById("demandDynamicFields");
  if (!container) return;

  if (!selectedDemandType) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }

  container.innerHTML = getDemandTemplate(selectedDemandType);
  container.classList.remove("hidden");
}

function formatContractInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 12);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}/${digits.slice(3)}`;
}

function normalizeContract(value) {
  const raw = String(value || "").replace(/\D/g, "").slice(0, 12);
  if (raw.length < 12) return formatContractInput(raw);
  return `${raw.slice(0, 3)}/${raw.slice(3, 12)}`;
}

function normalizeOptionalContract(value) {
  const normalized = normalizeContract(value);

  if (!normalized) return "";

  if (!/^\d{3}\/\d{9}$/.test(normalized)) {
    throw new Error("Digite o contrato no formato 000/123456789 ou deixe em branco.");
  }

  return normalized;
}

function normalizeHour(value) {
  const raw = String(value || "").replace(/\D/g, "").slice(0, 2);
  if (!raw) return "";
  return `${raw.slice(0, 2)}h`;
}

function buildDemandDateLegacy() {
  const day = getDemandValue("demandDateDay");
  const month = getDemandValue("demandDateMonth");
  const year = getDemandValue("demandDateYear");

  if (!day || !month || !year) return "";

  return `${day}/${month}/${year}`;
}

function getDemandValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function normalizeAreaLabel(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return /^área\s+/i.test(trimmed) ? trimmed : `Área ${trimmed}`;
}

function normalizeClasseLabel(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return /^classe\s+/i.test(trimmed) ? trimmed : `Classe ${trimmed}`;
}

function handleDemandFieldFormatting(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  if (target.id === "demandContract") {
    target.value = formatContractInput(target.value);
  }

  if (target.id === "demandStartHour" || target.id === "demandEndHour") {
    target.value = normalizeHour(target.value);
  }

  if (target.id === "demandPoint") {
    target.value = String(target.value || "").replace(/\D/g, "").slice(0, 2);
  }
}

function buildDateFieldsTemplate() {
  return `
    <div>
      <label for="demandDateDisplay">Data</label>
      <div class="custom-date-picker">
        <button id="demandDateTrigger" class="custom-date-trigger" type="button" aria-expanded="false">
          <span id="demandDateDisplay">${selectedDemandDate || "Selecionar data"}</span>
        </button>
        <div id="demandCalendar" class="demand-calendar hidden">
          <div class="demand-calendar-header">
            <button id="demandCalendarPrev" class="calendar-nav-button" type="button" aria-label="Mês anterior">‹</button>
            <strong id="demandCalendarLabel"></strong>
            <button id="demandCalendarNext" class="calendar-nav-button" type="button" aria-label="Próximo mês">›</button>
          </div>
          <div class="demand-calendar-weekdays">
            <span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span>
          </div>
          <div id="demandCalendarGrid" class="demand-calendar-grid"></div>
        </div>
      </div>
    </div>
  `;
}

function buildDemandDate() {
  return selectedDemandDate;
}

function formatDemandTypeLabel(type) {
  if (type === "encaixe-vt") return "Encaixe VT";
  if (type === "retirar-ponto") return "Retirar Ponto Virtua";
  if (type === "suspensao") return "Suspensão Temporária";
  return "Selecione";
}

function syncDemandTypeTrigger() {
  const label = document.getElementById("demandTypeTriggerLabel");
  if (label) {
    label.textContent = formatDemandTypeLabel(selectedDemandType);
  }
}

function openDemandTypeMenu() {
  const menu = document.getElementById("demandTypeMenu");
  const trigger = document.getElementById("demandTypeTrigger");
  menu?.classList.remove("hidden");
  trigger?.setAttribute("aria-expanded", "true");
}

function closeDemandTypeMenu() {
  const menu = document.getElementById("demandTypeMenu");
  const trigger = document.getElementById("demandTypeTrigger");
  menu?.classList.add("hidden");
  trigger?.setAttribute("aria-expanded", "false");
}

function getCalendarMonthLabel() {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(demandCalendarYear, demandCalendarMonth, 1));
}

function getTodayCalendarReference() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function renderDemandCalendar() {
  const grid = document.getElementById("demandCalendarGrid");
  const label = document.getElementById("demandCalendarLabel");
  if (!grid || !label) return;

  label.textContent = getCalendarMonthLabel();
  const firstDay = new Date(demandCalendarYear, demandCalendarMonth, 1).getDay();
  const daysInMonth = new Date(demandCalendarYear, demandCalendarMonth + 1, 0).getDate();
  const selectedIso = selectedDemandDate ? selectedDemandDate.split("/").reverse().join("-") : "";
  const today = getTodayCalendarReference();
  const cells = [];

  for (let i = 0; i < firstDay; i += 1) {
    cells.push('<span class="calendar-day calendar-day-empty"></span>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${demandCalendarYear}-${String(demandCalendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const currentDate = new Date(demandCalendarYear, demandCalendarMonth, day);
    const isSelected = iso === selectedIso;
    const isPastDate = currentDate < today;
    const isToday = currentDate.getTime() === today.getTime();
    cells.push(
      `<button class="calendar-day${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}" type="button" data-calendar-day="${day}" ${isPastDate ? "disabled" : ""}>${day}</button>`
    );
  }

  grid.innerHTML = cells.join("");
}

function openDemandCalendar() {
  const calendar = document.getElementById("demandCalendar");
  const trigger = document.getElementById("demandDateTrigger");
  calendar?.classList.remove("hidden");
  trigger?.setAttribute("aria-expanded", "true");
  renderDemandCalendar();
}

function closeDemandCalendar() {
  const calendar = document.getElementById("demandCalendar");
  const trigger = document.getElementById("demandDateTrigger");
  calendar?.classList.add("hidden");
  trigger?.setAttribute("aria-expanded", "false");
}

function selectDemandDate(day) {
  selectedDemandDate = `${String(day).padStart(2, "0")}/${String(demandCalendarMonth + 1).padStart(2, "0")}/${demandCalendarYear}`;
  const display = document.getElementById("demandDateDisplay");
  if (display) {
    display.textContent = selectedDemandDate;
  }
  closeDemandCalendar();
}

function attachDemandFieldEnhancements() {
  const dateTrigger = document.getElementById("demandDateTrigger");
  const prevMonthBtn = document.getElementById("demandCalendarPrev");
  const nextMonthBtn = document.getElementById("demandCalendarNext");
  const calendarGrid = document.getElementById("demandCalendarGrid");

  dateTrigger?.addEventListener("click", () => {
    const calendar = document.getElementById("demandCalendar");
    if (calendar?.classList.contains("hidden")) {
      openDemandCalendar();
    } else {
      closeDemandCalendar();
    }
  });

  prevMonthBtn?.addEventListener("click", () => {
    demandCalendarMonth -= 1;
    if (demandCalendarMonth < 0) {
      demandCalendarMonth = 11;
      demandCalendarYear -= 1;
    }
    renderDemandCalendar();
  });

  nextMonthBtn?.addEventListener("click", () => {
    demandCalendarMonth += 1;
    if (demandCalendarMonth > 11) {
      demandCalendarMonth = 0;
      demandCalendarYear += 1;
    }
    renderDemandCalendar();
  });

  calendarGrid?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-calendar-day]");
    if (!target) return;
    selectDemandDate(Number(target.dataset.calendarDay));
  });
}

function renderDemandFields() {
  const container = document.getElementById("demandDynamicFields");
  if (!container) return;

  if (!selectedDemandType) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }

  container.innerHTML = getDemandTemplate(selectedDemandType);
  container.classList.remove("hidden");
  attachDemandFieldEnhancements();
}

function buildDemandMessage(payload) {
  const operatorName = getOperatorDisplayName();

  if (payload.demandType === "encaixe-vt") {
    return `📌 *${operatorName}* - *Encaixe VT*\n\n📄 *${payload.contract}*\n📅 *${payload.date}* - *das ${payload.startHour} às ${payload.endHour}*\n👨🏾‍🔧 *${payload.area}* - *${payload.classe}*`;
  }

  if (payload.demandType === "retirar-ponto") {
    return `📌 *${operatorName}* - *Retirar Ponto Virtua*\n\n📄 *${payload.contract}*\n🔢 *Ponto ${payload.point}*\n📅 *${payload.date}* - *das ${payload.startHour} às ${payload.endHour}*`;
  }

  return `📌 *${operatorName}* - *Suspensão Temporária:* *(${formatSuspensionItems(payload.suspensionItems)})*\n\n📄 *${payload.contract}*`;
}

function formatSuspensionItems(items = []) {
  const sanitizedItems = items
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  if (!sanitizedItems.length) return "";

  if (typeof Intl !== "undefined" && typeof Intl.ListFormat === "function") {
    return new Intl.ListFormat("pt-BR", {
      style: "long",
      type: "conjunction"
    }).format(sanitizedItems);
  }

  if (sanitizedItems.length === 1) return sanitizedItems[0];
  if (sanitizedItems.length === 2) return sanitizedItems.join(" e ");

  return `${sanitizedItems.slice(0, -1).join(", ")} e ${sanitizedItems.at(-1)}`;
}

function collectDemandPayload() {
  const contract = normalizeContract(getDemandValue("demandContract"));
  const contractPattern = /^\d{3}\/\d{9}$/;

  if (!selectedDemandType) {
    throw new Error("Selecione o tipo de demanda.");
  }

  if (!contractPattern.test(contract)) {
    throw new Error("Digite o contrato no formato 000/123456789.");
  }

  if (selectedDemandType === "suspensao") {
    const suspensionItems = Array.from(document.querySelectorAll("[data-suspension-item]:checked"))
      .map((input) => input.value);

    if (!suspensionItems.length) {
      throw new Error("Selecione pelo menos um item para suspender.");
    }

    const payload = {
      demandType: selectedDemandType,
      contract,
      suspensionItems
    };

    return {
      ...payload,
      message: buildDemandMessage(payload)
    };
  }

  const date = buildDemandDate();
  const startHour = normalizeHour(getDemandValue("demandStartHour"));
  const endHour = normalizeHour(getDemandValue("demandEndHour"));

  if (!date) {
    throw new Error("Selecione a data da demanda.");
  }

  if (!/^\d{2}h$/.test(startHour) || !/^\d{2}h$/.test(endHour)) {
    throw new Error("Preencha o horário no formato 14h e 17h.");
  }

  if (selectedDemandType === "encaixe-vt") {
    const area = normalizeAreaLabel(getDemandValue("demandArea"));
    const classe = normalizeClasseLabel(getDemandValue("demandClasse"));

    if (!area || !classe) {
      throw new Error("Preencha a área e a classe.");
    }

    const payload = {
      demandType: selectedDemandType,
      contract,
      date,
      startHour,
      endHour,
      area,
      classe
    };

    return {
      ...payload,
      message: buildDemandMessage(payload)
    };
  }

  const point = getDemandValue("demandPoint");

  if (!/^\d{1,2}$/.test(point)) {
    throw new Error("O ponto deve ter 1 ou 2 dígitos.");
  }

  const payload = {
    demandType: selectedDemandType,
    contract,
    date,
    startHour,
    endHour,
    point
  };

  return {
    ...payload,
    message: buildDemandMessage(payload)
  };
}

async function submitDemand() {
  try {
    const payload = collectDemandPayload();
    await salvarDemanda(currentProfile, payload);
    setDemandFeedback("Demanda enviada para a fila com sucesso.", "success");
    setTimeout(() => {
      closeDemandModal();
    }, 700);
  } catch (error) {
    setDemandFeedback(error.message || "Não foi possível enviar a demanda.", "error");
  }
}

function renderHistory() {
  const historyList = document.getElementById("historyList");
  const toggleBtn = document.getElementById("toggleHistoryBtn");

  if (!historyList) return;

  historyList.innerHTML = "";

  if (!history || history.length === 0) {
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `
      <strong>Nenhum atendimento encontrado</strong>
      <small>Quando houver registros, eles aparecerão aqui.</small>
    `;
    historyList.appendChild(div);

    if (toggleBtn) {
      toggleBtn.classList.add("hidden");
      toggleBtn.classList.remove("expanded");
      toggleBtn.setAttribute("aria-label", "Expandir histórico");
    }

    historyExpanded = false;
    applyHistoryState();
    updateStats();
    return;
  }

  history.forEach((item) => {
    const div = document.createElement("div");
    let statusClass = "";
    const detailParts = [
      item.reason || "",
      item.contract ? `Contrato ${item.contract}` : "",
      item.observation ? `Obs: ${item.observation}` : ""
    ].filter(Boolean);

    if (item.result === "Retido") {
      statusClass = "retido";
    } else if (item.result === "Cancelado") {
      statusClass = "cancelado";
    }

    div.className = `history-item ${statusClass}`.trim();
    div.innerHTML = `<strong>${item.result}</strong>
      ${detailParts.length ? ` • ${detailParts.join(" • ")}` : ""}
      <br><small>${item.duration} • ${item.date} ${item.time}</small>`;

    historyList.appendChild(div);
  });

  if (toggleBtn) {
    if (history.length > 2) {
      toggleBtn.classList.remove("hidden");
      toggleBtn.classList.toggle("expanded", historyExpanded);
      toggleBtn.setAttribute("aria-label", historyExpanded ? "Minimizar histórico" : "Expandir histórico");
    } else {
      toggleBtn.classList.add("hidden");
      toggleBtn.classList.remove("expanded");
      toggleBtn.setAttribute("aria-label", "Expandir histórico");
      historyExpanded = false;
    }
  }

  applyHistoryState();
  updateStats();
}

function getHistoryGap() {
  const historyList = document.getElementById("historyList");
  if (!historyList) return 0;

  const styles = window.getComputedStyle(historyList);
  const gap = parseFloat(styles.rowGap || styles.gap || "0");
  return Number.isNaN(gap) ? 0 : gap;
}

function getCollapsedHistoryHeight() {
  const historyList = document.getElementById("historyList");
  if (!historyList) return 0;

  const cards = historyList.querySelectorAll(".history-item");
  if (cards.length === 0) return 0;
  if (cards.length === 1) return Math.ceil(cards[0].offsetHeight);

  const gap = getHistoryGap();
  return Math.ceil(cards[0].offsetHeight + cards[1].offsetHeight + gap);
}

function syncHistoryButtonState(isExpanded) {
  const toggleBtn = document.getElementById("toggleHistoryBtn");
  if (!toggleBtn) return;

  toggleBtn.classList.toggle("expanded", isExpanded);
  toggleBtn.setAttribute("aria-label", isExpanded ? "Minimizar histórico" : "Expandir histórico");
}

function applyHistoryState(animate = false) {
  const historyList = document.getElementById("historyList");
  const toggleBtn = document.getElementById("toggleHistoryBtn");

  if (!historyList) return;

  const needsCollapse = history.length > 2;

  historyList.classList.remove("collapsed", "expanded");

  if (!needsCollapse) {
    historyList.classList.add("expanded");
    historyList.style.height = `${historyList.scrollHeight}px`;

    if (toggleBtn) {
      toggleBtn.classList.remove("expanded");
      toggleBtn.setAttribute("aria-label", "Expandir histórico");
    }

    return;
  }

  if (historyExpanded) {
    historyList.classList.add("expanded");

    if (animate) {
      const startHeight = historyList.offsetHeight;
      historyList.style.height = `${startHeight}px`;

      requestAnimationFrame(() => {
        historyList.style.height = `${historyList.scrollHeight}px`;
      });
    } else {
      historyList.style.height = `${historyList.scrollHeight}px`;
    }

    syncHistoryButtonState(true);
  } else {
    historyList.classList.add("collapsed");
    historyList.style.height = `${getCollapsedHistoryHeight()}px`;
    syncHistoryButtonState(false);
  }
}

function toggleHistory() {
  if (history.length <= 2) return;

  historyExpanded = !historyExpanded;
  applyHistoryState(true);
}

function updateStats() {
  const atendidas = history.length;
  const canceladas = history.filter((item) => item.result === "Cancelado").length;
  const taxa = atendidas > 0 ? (canceladas / atendidas) * 100 : 0;

  const totalEl = document.getElementById("statTotal");
  const rateEl = document.getElementById("statRate");

  if (totalEl) {
    totalEl.textContent = atendidas;
  }

  if (rateEl) {
    rateEl.textContent = `${taxa.toFixed(1)}%`;
  }

  const rateCard = rateEl?.closest(".stats-card");
  if (!rateCard) return;

  if (taxa <= 12.5) {
    rateCard.style.borderLeftColor = "#10b981";
  } else if (taxa <= 14) {
    rateCard.style.borderLeftColor = "#f59e0b";
  } else {
    rateCard.style.borderLeftColor = "#ef4444";
  }
}

async function addToHistory(duration, result, reason, extraData = {}) {
  if (!currentProfile) return;

  const now = new Date();
  const cancelCountOfDay =
    result === "Cancelado"
      ? history.filter((item) => item.result === "Cancelado").length + 1
      : 0;

  const data = {
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
    duration,
    result,
    reason,
    contract: extraData.contract || "",
    observation: extraData.observation || "",
    timestamp: now.getTime(),
    operator: currentProfile.matricula,
    operatorName: currentProfile.nome,
    cancelCountOfDay
  };

  history.unshift(data);
  renderHistory();

  try {
    await salvarAtendimento(currentProfile, data);
  } catch (error) {
    console.error("Erro ao salvar atendimento:", error);
  }
}

function formatTime(sec) {
  const min = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${min}:${s}`;
}

async function confirmAction(btn, callback) {
  if (!btn || btn.dataset.loading === "true") return false;

  if (btn.classList.contains("confirming")) {
    btn.dataset.loading = "true";
    btn.disabled = true;
    btn.classList.remove("confirming");

    try {
      await Promise.resolve(callback());
    } catch (error) {
      resetButtonConfirm(btn);
      throw error;
    }

    return true;
  }

  const label = btn.dataset.confirmLabel || "Confirmar";
  btn.dataset.originalHtml = btn.innerHTML;
  btn.innerHTML = `<span>${label}</span>`;
  btn.classList.add("confirming");

  setTimeout(() => {
    if (btn.dataset.loading === "true") return;

    btn.classList.remove("confirming");
    if (btn.dataset.originalHtml) {
      btn.innerHTML = btn.dataset.originalHtml;
    }
  }, 2000);

  return false;
}

function resetButtonConfirm(btn) {
  if (!btn) return;

  btn.classList.remove("confirming");
  btn.disabled = false;
  btn.dataset.loading = "false";

  if (btn.dataset.originalHtml) {
    btn.innerHTML = btn.dataset.originalHtml;
  }
}

function canOpenPip() {
  return Boolean(currentProfile?.matricula);
}

function resetCallState() {
  clearInterval(callInterval);
  seconds = 0;
  selectedResult = null;
}

function renderMainPipPanel() {
  if (!pipWindow || pipWindow.closed) return;

  pipWindow.document.body.innerHTML = window.createPipPanelMarkup(getOperatorDisplayName());
  bindPanel();
}

async function openFloatingPanel() {
  if (!canOpenPip()) {
    alert("Faça login novamente antes de abrir o painel.");
    return;
  }

  if (!("documentPictureInPicture" in window)) {
    alert("Seu navegador não oferece suporte ao painel flutuante.");
    return;
  }

  if (pipWindow && !pipWindow.closed) {
    try {
      pipWindow.focus();
    } catch (error) {
      console.error(error);
    }
    return;
  }

  pipWindow = await window.documentPictureInPicture.requestWindow({
    width: 228,
    height: 168
  });

  pipWindow.addEventListener("pagehide", () => {
    resetCallState();
    pipWindow = null;
  });

  renderMainPipPanel();
}

function requestCancelObservation(context = {}) {
  if (!dashboardPreferences.askObservationOnCancel) {
    return Promise.resolve("");
  }

  if (!pipWindow || pipWindow.closed) {
    return Promise.resolve("");
  }

  if (typeof window.createPipObservationMarkup !== "function") {
    return Promise.resolve("");
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (value = "") => {
      if (settled) return;
      settled = true;
      pipWindow?.removeEventListener("pagehide", handleClose);
      resolve(String(value || "").trim());
    };

    const handleClose = () => {
      finish("");
    };

    pipWindow.addEventListener("pagehide", handleClose);
    pipWindow.document.body.innerHTML = window.createPipObservationMarkup(
      getOperatorDisplayName(),
      context
    );

    const observationInput = pipWindow.document.getElementById("observationInput");
    const submitButton = pipWindow.document.getElementById("submitObservationBtn");
    const syncSubmitButton = () => {
      if (!submitButton) return;

      const hasObservation = Boolean(String(observationInput?.value || "").trim());
      submitButton.innerHTML = hasObservation
        ? "<span>Salvar observação</span>"
        : "<span>Enviar sem observação</span>";
    };

    const handleSubmit = () => {
      if (!submitButton || submitButton.classList.contains("loading")) return;

      submitButton.disabled = true;
      submitButton.classList.add("loading");
      window.setTimeout(() => {
        finish(observationInput?.value || "");
      }, 450);
    };

    observationInput?.addEventListener("input", syncSubmitButton);
    observationInput?.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        handleSubmit();
      }
    });
    submitButton?.addEventListener("click", handleSubmit);

    syncSubmitButton();
    observationInput?.focus();
  });
}

function getPipScrollElement() {
  if (!pipWindow || pipWindow.closed) return null;
  return pipWindow.document.scrollingElement || pipWindow.document.documentElement || pipWindow.document.body;
}

function smoothScrollPipTo(targetEl) {
  if (!pipWindow || pipWindow.closed || !targetEl) return;

  const scrollEl = getPipScrollElement();
  if (!scrollEl) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        const targetTop = targetEl.offsetTop + targetEl.offsetHeight + 24;
        scrollEl.scrollTo({
          top: targetTop,
          behavior: "smooth"
        });
      } catch (error) {
        console.error(error);
      }
    });
  });
}

function scrollPipToBottom() {
  if (!pipWindow || pipWindow.closed) return;

  const scrollEl = getPipScrollElement();
  if (!scrollEl) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        scrollEl.scrollTo({
          top: scrollEl.scrollHeight,
          behavior: "smooth"
        });
      } catch (error) {
        console.error(error);
      }
    });
  });
}

function setPipIdleState(doc) {
  const reasonSelect = doc.getElementById("reasonSelect");
  const contractFieldLabel = doc.getElementById("contractFieldLabel");
  const contractInput = doc.getElementById("contractInput");
  const confirmBtn = doc.getElementById("confirmBtn");
  const retidoBtn = doc.getElementById("retidoBtn");
  const canceladoBtn = doc.getElementById("canceladoBtn");
  const endBtn = doc.getElementById("endBtn");

  selectedResult = null;

  if (reasonSelect) {
    reasonSelect.classList.add("hidden");
    reasonSelect.value = "";
  }

  if (contractFieldLabel) {
    contractFieldLabel.classList.add("hidden");
  }

  if (contractInput) {
    contractInput.classList.add("hidden");
    contractInput.value = "";
  }

  if (confirmBtn) {
    confirmBtn.classList.add("hidden");
    confirmBtn.innerHTML = "<span>Concluir</span>";
    resetButtonConfirm(confirmBtn);
  }

  if (retidoBtn) {
    retidoBtn.innerHTML = "<span>Retido</span>";
    retidoBtn.dataset.confirmLabel = "Confirmar retido";
    resetButtonConfirm(retidoBtn);
  }

  if (canceladoBtn) {
    canceladoBtn.innerHTML = "<span>Cancelado</span>";
    canceladoBtn.dataset.confirmLabel = "Confirmar cancelado";
    resetButtonConfirm(canceladoBtn);
  }

  if (endBtn) {
    endBtn.innerHTML = "<span>Encerrar</span>";
    endBtn.dataset.confirmLabel = "Confirmar encerramento";
    resetButtonConfirm(endBtn);
  }
}

function prepareCanceladoState(doc) {
  const reasonSelect = doc.getElementById("reasonSelect");
  const contractFieldLabel = doc.getElementById("contractFieldLabel");
  const contractInput = doc.getElementById("contractInput");
  const confirmBtn = doc.getElementById("confirmBtn");
  const retidoBtn = doc.getElementById("retidoBtn");
  const canceladoBtn = doc.getElementById("canceladoBtn");

  selectedResult = "Cancelado";

  if (retidoBtn) {
    retidoBtn.innerHTML = "<span>Retido</span>";
    resetButtonConfirm(retidoBtn);
  }

  if (canceladoBtn) {
    canceladoBtn.innerHTML = "<span>Cancelado</span>";
    resetButtonConfirm(canceladoBtn);
  }

  if (reasonSelect) {
    reasonSelect.classList.remove("hidden");
    reasonSelect.classList.add("fade-in");
  }

  if (shouldShowCancelContractField()) {
    if (contractFieldLabel) {
      contractFieldLabel.classList.remove("hidden");
    }

    if (contractInput) {
      contractInput.classList.remove("hidden");
      contractInput.classList.add("fade-in");
    }
  } else {
    if (contractFieldLabel) {
      contractFieldLabel.classList.add("hidden");
    }

    if (contractInput) {
      contractInput.classList.add("hidden");
      contractInput.value = "";
    }
  }

  if (confirmBtn) {
    confirmBtn.classList.remove("hidden");
    confirmBtn.innerHTML = "<span>Concluir cancelamento</span>";
    resetButtonConfirm(confirmBtn);
  }

  if (confirmBtn) {
    smoothScrollPipTo(confirmBtn);
  } else if (reasonSelect) {
    smoothScrollPipTo(reasonSelect);
  }
}

function bindPanel() {
  if (!pipWindow || pipWindow.closed) return;

  const doc = pipWindow.document;
  const statusTitle = doc.getElementById("statusTitle");
  const timer = doc.getElementById("timer");
  const startBtn = doc.getElementById("startBtn");
  const endBtn = doc.getElementById("endBtn");
  const resultArea = doc.getElementById("resultArea");
  const retidoBtn = doc.getElementById("retidoBtn");
  const canceladoBtn = doc.getElementById("canceladoBtn");
  const reasonSelect = doc.getElementById("reasonSelect");
  const contractFieldLabel = doc.getElementById("contractFieldLabel");
  const contractInput = doc.getElementById("contractInput");
  const confirmBtn = doc.getElementById("confirmBtn");

  contractInput?.addEventListener("input", () => {
    contractInput.value = formatContractInput(contractInput.value);
  });

  setPipIdleState(doc);

  startBtn.onclick = () => {
    seconds = 0;
    timer.textContent = "00:00";
    statusTitle.textContent = "Atendendo";

    startBtn.classList.add("hidden");
    timer.classList.remove("hidden");
    endBtn.classList.remove("hidden");
    resultArea.classList.add("hidden");

    setPipIdleState(doc);

    clearInterval(callInterval);
    callInterval = setInterval(() => {
      seconds += 1;
      timer.textContent = formatTime(seconds);
    }, 1000);

    scrollPipToBottom();
  };

  endBtn.onclick = async () => {
    const confirmed = await confirmAction(endBtn, () => {
      clearInterval(callInterval);

      statusTitle.textContent = "Finalizar";
      endBtn.classList.add("hidden");
      resultArea.classList.remove("hidden");

      setPipIdleState(doc);
      scrollPipToBottom();
    });

    if (!confirmed) {
      scrollPipToBottom();
    }
  };

  retidoBtn.onclick = async () => {
    if (selectedResult !== "Retido") {
      selectedResult = "Retido";

      if (reasonSelect) {
        reasonSelect.classList.add("hidden");
        reasonSelect.value = "";
      }

      if (contractFieldLabel) {
        contractFieldLabel.classList.add("hidden");
      }

      if (contractInput) {
        contractInput.classList.add("hidden");
        contractInput.value = "";
      }

      if (confirmBtn) {
        confirmBtn.classList.add("hidden");
        resetButtonConfirm(confirmBtn);
      }

      if (canceladoBtn) {
        canceladoBtn.innerHTML = "<span>Cancelado</span>";
        resetButtonConfirm(canceladoBtn);
      }

      resetButtonConfirm(retidoBtn);
      retidoBtn.dataset.confirmLabel = "Confirmar retido";
      await confirmAction(retidoBtn, () => {});
      return;
    }

    await confirmAction(retidoBtn, async () => {
      await addToHistory(formatTime(seconds), "Retido", "");
      resetPanel();
    });
  };

  canceladoBtn.onclick = () => {
    prepareCanceladoState(doc);
  };

  confirmBtn.onclick = async () => {
    if (!reasonSelect.value) return;

    await confirmAction(confirmBtn, async () => {
      const contract = normalizeOptionalContract(contractInput?.value || "");
      const observation = await requestCancelObservation({
        reason: reasonSelect.value,
        contract
      });

      await addToHistory(formatTime(seconds), "Cancelado", reasonSelect.value, {
        contract,
        observation
      });

      if (dashboardPreferences.askObservationOnCancel) {
        resetCallState();
        if (pipWindow && !pipWindow.closed) {
          renderMainPipPanel();
        }
        return;
      }

      resetPanel();
    });
  };
}

function resetPanel() {
  resetCallState();

  if (!pipWindow || pipWindow.closed) return;

  const doc = pipWindow.document;

  doc.getElementById("statusTitle").textContent = "Disponível";
  doc.getElementById("timer").textContent = "00:00";
  doc.getElementById("timer").classList.add("hidden");
  doc.getElementById("endBtn").classList.add("hidden");
  doc.getElementById("resultArea").classList.add("hidden");
  doc.getElementById("startBtn").classList.remove("hidden");

  setPipIdleState(doc);
}

async function performLogout() {
  try {
    await logoutOperator();
  } finally {
    window.location.href = "../index.html";
  }
}

function openLogoutModal() {
  const modal = document.getElementById("logoutModal");
  const confirmBtn = document.getElementById("confirmLogoutBtn");

  if (!modal) return;

  modal.classList.remove("hidden");
  confirmBtn?.focus();
}

function closeLogoutModal() {
  const modal = document.getElementById("logoutModal");
  modal?.classList.add("hidden");
}

function openPreferencesModal() {
  const modal = document.getElementById("preferencesModal");

  if (!modal) return;

  draftDashboardPreferences = normalizeDashboardPreferences(dashboardPreferences);
  renderDashboardPreferences();
  modal.classList.remove("hidden");
  document.getElementById("prefAutoOpenPip")?.focus();
}

function closePreferencesModal() {
  draftDashboardPreferences = null;
  document.getElementById("preferencesModal")?.classList.add("hidden");
}

async function initializeDashboard() {
  currentProfile = await loadCurrentProfile();

  if (!currentProfile) {
    window.location.href = "../index.html";
    return;
  }

  document.getElementById("dashboard")?.classList.remove("hidden");
  renderOperatorInfo();
  dashboardPreferences = normalizeDashboardPreferences({
    ...DEFAULT_DASHBOARD_PREFERENCES,
    ...(currentProfile.dashboardPreferences || {})
  });
  renderDashboardPreferences();

  history = await buscarLigacoes(currentProfile);
  history.sort((a, b) => b.timestamp - a.timestamp);
  renderHistory();
}

document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "hidden" &&
    dashboardPreferences.autoOpenPipOnPageChange &&
    canOpenPip()
  ) {
    openFloatingPanel();
  }
});

window.addEventListener("resize", () => {
  applyHistoryState();
});

document.addEventListener("DOMContentLoaded", async () => {
  const logoutButton = document.getElementById("logoutButton");
  const openPreferencesButton = document.getElementById("openPreferencesButton");
  const toggleHistoryBtn = document.getElementById("toggleHistoryBtn");
  const openPipButton = document.getElementById("openPipButton");
  const openDemandButton = document.getElementById("openDemandButton");
  const modal = document.getElementById("logoutModal");
  const preferencesModal = document.getElementById("preferencesModal");
  const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
  const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");
  const closePreferencesModalBtn = document.getElementById("closePreferencesModalBtn");
  const savePreferencesBtn = document.getElementById("savePreferencesBtn");
  const demandModal = document.getElementById("demandModal");
  const demandTypeTrigger = document.getElementById("demandTypeTrigger");
  const demandTypeMenu = document.getElementById("demandTypeMenu");
  const demandDynamicFields = document.getElementById("demandDynamicFields");
  const closeDemandModalBtn = document.getElementById("closeDemandModalBtn");
  const cancelDemandBtn = document.getElementById("cancelDemandBtn");
  const submitDemandBtn = document.getElementById("submitDemandBtn");
  const prefAutoOpenPip = document.getElementById("prefAutoOpenPip");
  const prefAskCancelObservation = document.getElementById("prefAskCancelObservation");
  const prefShowCancelContract = document.getElementById("prefShowCancelContract");

  logoutButton?.addEventListener("click", openLogoutModal);
  openPreferencesButton?.addEventListener("click", openPreferencesModal);
  toggleHistoryBtn?.addEventListener("click", toggleHistory);
  openPipButton?.addEventListener("click", openFloatingPanel);
  openDemandButton?.addEventListener("click", openDemandModal);
  cancelLogoutBtn?.addEventListener("click", closeLogoutModal);
  confirmLogoutBtn?.addEventListener("click", performLogout);
  closePreferencesModalBtn?.addEventListener("click", closePreferencesModal);
  savePreferencesBtn?.addEventListener("click", saveDashboardPreferences);
  closeDemandModalBtn?.addEventListener("click", closeDemandModal);
  cancelDemandBtn?.addEventListener("click", closeDemandModal);
  submitDemandBtn?.addEventListener("click", submitDemand);
  prefAutoOpenPip?.addEventListener("change", () => {
    updateDraftDashboardPreference("autoOpenPipOnPageChange", Boolean(prefAutoOpenPip.checked));
  });
  prefAskCancelObservation?.addEventListener("change", () => {
    updateDraftDashboardPreference("askObservationOnCancel", Boolean(prefAskCancelObservation.checked));
  });
  prefShowCancelContract?.addEventListener("change", () => {
    updateDraftDashboardPreference("showContractFieldOnCancel", Boolean(prefShowCancelContract.checked));
  });
  demandDynamicFields?.addEventListener("input", handleDemandFieldFormatting);
  demandTypeTrigger?.addEventListener("click", () => {
    const menuIsHidden = demandTypeMenu?.classList.contains("hidden");
    if (menuIsHidden) {
      openDemandTypeMenu();
    } else {
      closeDemandTypeMenu();
    }
  });
  demandTypeMenu?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-demand-type-option]");
    if (!option) return;
    selectedDemandType = option.dataset.demandTypeOption;
    setDemandFeedback("");
    syncDemandTypeTrigger();
    closeDemandTypeMenu();
    renderDemandFields();
  });

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeLogoutModal();
    }
  });

  preferencesModal?.addEventListener("click", (event) => {
    if (event.target === preferencesModal) {
      closePreferencesModal();
    }
  });

  demandModal?.addEventListener("click", (event) => {
    if (event.target === demandModal) {
      closeDemandModal();
    }
  });

  document.addEventListener("click", (event) => {
    const selectWrap = document.getElementById("demandTypeSelectWrap");
    const calendarWrap = document.querySelector(".custom-date-picker");

    if (selectWrap && !selectWrap.contains(event.target)) {
      closeDemandTypeMenu();
    }

    if (calendarWrap && !calendarWrap.contains(event.target)) {
      closeDemandCalendar();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal && !modal.classList.contains("hidden")) {
      closeLogoutModal();
    }
    if (event.key === "Escape" && preferencesModal && !preferencesModal.classList.contains("hidden")) {
      closePreferencesModal();
    }
    if (event.key === "Escape" && demandModal && !demandModal.classList.contains("hidden")) {
      closeDemandModal();
    }
  });

  await initializeDashboard();
});
