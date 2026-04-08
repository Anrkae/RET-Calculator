import {
  buscarLigacoes,
  salvarAtendimento
} from "../services/atendimentos-service.js";
import {
  loadCurrentProfile,
  logoutOperator
} from "../services/auth-service.js";

let pipWindow = null;
let callInterval = null;
let seconds = 0;

let selectedResult = null;
let history = [];
let currentProfile = null;
let historyExpanded = false;
let historyAnimation = null;

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

    if (item.result === "Retido") {
      statusClass = "retido";
    } else if (item.result === "Cancelado") {
      statusClass = "cancelado";
    }

    div.className = `history-item ${statusClass}`.trim();
    div.innerHTML = `<strong>${item.result}</strong>
      ${item.reason ? ` • ${item.reason}` : ""}
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

async function addToHistory(duration, result, reason) {
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
    timestamp: now.getTime(),
    operator: currentProfile.matricula,
    operatorName: currentProfile.nome,
    operatorTag: currentProfile.tag,
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

function confirmAction(btn, callback) {
  if (!btn || btn.dataset.loading === "true") return false;

  if (btn.classList.contains("confirming")) {
    btn.dataset.loading = "true";
    btn.disabled = true;
    callback();
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
    clearInterval(callInterval);
    pipWindow = null;
  });

  pipWindow.document.body.innerHTML = window.createPipPanelMarkup(getOperatorDisplayName());
  bindPanel();
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
  const confirmBtn = doc.getElementById("confirmBtn");
  const retidoBtn = doc.getElementById("retidoBtn");
  const canceladoBtn = doc.getElementById("canceladoBtn");
  const endBtn = doc.getElementById("endBtn");

  selectedResult = null;

  if (reasonSelect) {
    reasonSelect.classList.add("hidden");
    reasonSelect.value = "";
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
  const confirmBtn = doc.getElementById("confirmBtn");

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

  endBtn.onclick = () => {
    const confirmed = confirmAction(endBtn, () => {
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

  retidoBtn.onclick = () => {
    if (selectedResult !== "Retido") {
      selectedResult = "Retido";

      if (reasonSelect) {
        reasonSelect.classList.add("hidden");
        reasonSelect.value = "";
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
      confirmAction(retidoBtn, () => {});
      return;
    }

    confirmAction(retidoBtn, async () => {
      await addToHistory(formatTime(seconds), "Retido", "");
      resetPanel();
    });
  };

  canceladoBtn.onclick = () => {
    prepareCanceladoState(doc);
  };

  confirmBtn.onclick = () => {
    if (!reasonSelect.value) return;

    confirmAction(confirmBtn, async () => {
      await addToHistory(formatTime(seconds), "Cancelado", reasonSelect.value);
      resetPanel();
    });
  };
}

function resetPanel() {
  clearInterval(callInterval);

  if (!pipWindow || pipWindow.closed) return;

  const doc = pipWindow.document;

  seconds = 0;
  selectedResult = null;

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

async function initializeDashboard() {
  currentProfile = await loadCurrentProfile();

  if (!currentProfile) {
    window.location.href = "../index.html";
    return;
  }

  document.getElementById("dashboard")?.classList.remove("hidden");
  renderOperatorInfo();

  history = await buscarLigacoes(currentProfile);
  history.sort((a, b) => b.timestamp - a.timestamp);
  renderHistory();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && canOpenPip()) {
    openFloatingPanel();
  }
});

window.addEventListener("resize", () => {
  applyHistoryState();
});

document.addEventListener("DOMContentLoaded", async () => {
  const logoutButton = document.getElementById("logoutButton");
  const toggleHistoryBtn = document.getElementById("toggleHistoryBtn");
  const openPipButton = document.getElementById("openPipButton");
  const modal = document.getElementById("logoutModal");
  const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
  const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

  logoutButton?.addEventListener("click", openLogoutModal);
  toggleHistoryBtn?.addEventListener("click", toggleHistory);
  openPipButton?.addEventListener("click", openFloatingPanel);
  cancelLogoutBtn?.addEventListener("click", closeLogoutModal);
  confirmLogoutBtn?.addEventListener("click", performLogout);

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeLogoutModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal && !modal.classList.contains("hidden")) {
      closeLogoutModal();
    }
  });

  await initializeDashboard();
});
