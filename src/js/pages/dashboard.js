let pipWindow = null
let callInterval = null
let seconds = 0

let selectedResult = null
let history = []

let matricula = null
let historyExpanded = false


/* LOGIN */

async function login() {

const input = document.getElementById("matriculaInput")

if (!input.value.trim()) {
alert("Digite a matrícula")
return
}

matricula = input.value.trim()

loginScreen.classList.add("hidden")
dashboard.classList.remove("hidden")

document.getElementById("operatorInfo").innerText =
"Operador: " + matricula


/* BUSCAR LIGAÇÕES DO DIA */

if (window.buscarLigacoes) {

const ligacoes = await buscarLigacoes(matricula)

history = []

ligacoes.forEach(l => history.push(l))

history.sort((a, b) => b.timestamp - a.timestamp)

renderHistory()

}

}


/* HISTÓRICO */

function renderHistory() {

const historyList = document.getElementById("historyList")
const toggleBtn = document.getElementById("toggleHistoryBtn")

if (!historyList) return

historyList.innerHTML = ""

if (!history || history.length === 0) {

const div = document.createElement("div")
div.className = "history-item"
div.innerHTML = `
<strong>Nenhum atendimento encontrado</strong>
<small>Quando houver registros, eles aparecerão aqui.</small>
`
historyList.appendChild(div)

if (toggleBtn) {
toggleBtn.classList.add("hidden")
toggleBtn.classList.remove("expanded")
toggleBtn.setAttribute("aria-label", "Expandir histórico")
}

historyExpanded = false
applyHistoryState()

updateStats()
return
}

history.forEach(item => {

const div = document.createElement("div")

let statusClass = ""

if (item.result === "Retido") {
statusClass = "retido"
} else if (item.result === "Cancelado") {
statusClass = "cancelado"
}

div.className = `history-item ${statusClass}`.trim()

div.innerHTML =
`<strong>${item.result}</strong>
${item.reason ? " • " + item.reason : ""}
<br><small>${item.duration} • ${item.date} ${item.time}</small>`

historyList.appendChild(div)

})

if (toggleBtn) {
if (history.length > 2) {
toggleBtn.classList.remove("hidden")
toggleBtn.classList.toggle("expanded", historyExpanded)
toggleBtn.setAttribute("aria-label", historyExpanded ? "Minimizar histórico" : "Expandir histórico")
} else {
toggleBtn.classList.add("hidden")
toggleBtn.classList.remove("expanded")
toggleBtn.setAttribute("aria-label", "Expandir histórico")
historyExpanded = false
}
}

applyHistoryState()
updateStats()

}

function getHistoryGap() {
const historyList = document.getElementById("historyList")
if (!historyList) return 0

const styles = window.getComputedStyle(historyList)
const gap = parseFloat(styles.rowGap || styles.gap || "0")
return isNaN(gap) ? 0 : gap
}

function getCollapsedHistoryHeight() {
const historyList = document.getElementById("historyList")
if (!historyList) return 0

const cards = historyList.querySelectorAll(".history-item")
if (cards.length === 0) return 0
if (cards.length === 1) return Math.ceil(cards[0].offsetHeight)

const gap = getHistoryGap()
return Math.ceil(cards[0].offsetHeight + cards[1].offsetHeight + gap)
}

function applyHistoryState(animate = false) {
const historyList = document.getElementById("historyList")
const toggleBtn = document.getElementById("toggleHistoryBtn")

if (!historyList) return

const needsCollapse = history.length > 2

historyList.classList.remove("collapsed", "expanded")

if (!needsCollapse) {
historyList.classList.add("expanded")
historyList.style.maxHeight = historyList.scrollHeight + "px"

if (toggleBtn) {
toggleBtn.classList.remove("expanded")
toggleBtn.setAttribute("aria-label", "Expandir histórico")
}

return
}

if (historyExpanded) {
historyList.classList.add("expanded")

if (animate) {
const startHeight = getCollapsedHistoryHeight()
historyList.style.maxHeight = startHeight + "px"

requestAnimationFrame(() => {
historyList.style.maxHeight = historyList.scrollHeight + "px"
})
} else {
historyList.style.maxHeight = historyList.scrollHeight + "px"
}

if (toggleBtn) {
toggleBtn.classList.add("expanded")
toggleBtn.setAttribute("aria-label", "Minimizar histórico")
}
} else {
historyList.classList.add("collapsed")

const collapsedHeight = getCollapsedHistoryHeight()
historyList.style.maxHeight = collapsedHeight + "px"

if (toggleBtn) {
toggleBtn.classList.remove("expanded")
toggleBtn.setAttribute("aria-label", "Expandir histórico")
}
}
}

function toggleHistory() {

const historyList = document.getElementById("historyList")
const toggleBtn = document.getElementById("toggleHistoryBtn")

if (!historyList || !toggleBtn) return
if (history.length <= 2) return

historyExpanded = !historyExpanded
applyHistoryState(true)

}


/* MINI PAINEL */

function updateStats() {

let atendidas = history.length

let canceladas = history.filter(
item => item.result === "Cancelado"
).length

let taxa = 0

if (atendidas > 0) {
taxa = (canceladas / atendidas) * 100
}

const totalEl = document.getElementById("statTotal")
const rateEl = document.getElementById("statRate")

if (totalEl) {
totalEl.textContent = atendidas
}

if (rateEl) {
rateEl.textContent = taxa.toFixed(1) + "%"
}

/* COR AUTOMÁTICA DA TAXA */

const rateCard = rateEl?.closest(".stats-card")

if (rateCard) {

if (taxa <= 12.5) {
rateCard.style.borderLeftColor = "#10b981"
}

else if (taxa <= 14) {
rateCard.style.borderLeftColor = "#f59e0b"
}

else {
rateCard.style.borderLeftColor = "#ef4444"
}

}

}


/* SALVAR HISTÓRICO */

function addToHistory(duration, result, reason) {

const now = new Date()

const data = {

date: now.toLocaleDateString(),
time: now.toLocaleTimeString(),
duration: duration,
result: result,
reason: reason,
timestamp: now.getTime(),
operator: matricula

}

history.unshift(data)

renderHistory()

if (window.salvarAtendimento) {
salvarAtendimento(matricula, data)
}

}


/* TIMER */

function formatTime(sec) {

const min = String(Math.floor(sec / 60)).padStart(2, "0")
const s = String(sec % 60).padStart(2, "0")

return `${min}:${s}`

}


/* CONFIRMAR */

function confirmAction(btn, callback) {

if (!btn) return false
if (btn.dataset.loading === "true") return false

if (btn.classList.contains("confirming")) {
btn.dataset.loading = "true"
btn.disabled = true
callback()
return true
}

const label = btn.dataset.confirmLabel || "Confirmar"
btn.dataset.originalHtml = btn.innerHTML

btn.innerHTML = `<span>${label}</span>`
btn.classList.add("confirming")

setTimeout(() => {
if (btn.dataset.loading === "true") return

btn.classList.remove("confirming")
if (btn.dataset.originalHtml) {
btn.innerHTML = btn.dataset.originalHtml
}
}, 2000)

return false

}

function resetButtonConfirm(btn) {
if (!btn) return

btn.classList.remove("confirming")
btn.disabled = false
btn.dataset.loading = "false"

if (btn.dataset.originalHtml) {
btn.innerHTML = btn.dataset.originalHtml
}
}


/* REGRAS DE ABERTURA DO PIP */

function canOpenPip() {
return !!(matricula && String(matricula).trim())
}


/* ABRIR PAINEL */

async function openFloatingPanel() {

if (!canOpenPip()) {
alert("Faça login com a matrícula antes de abrir o painel.")
return
}

if (!("documentPictureInPicture" in window)) {
alert("Sem suporte.")
return
}

if (pipWindow && !pipWindow.closed) {
try {
pipWindow.focus()
} catch (e) {}
return
}

pipWindow = await window.documentPictureInPicture.requestWindow({
width: 340,
height: 430
})

pipWindow.addEventListener("pagehide", () => {
clearInterval(callInterval)
pipWindow = null
})

pipWindow.document.body.innerHTML = `

<style>
*{
box-sizing:border-box;
}

:root{
--bg:#141414;
--card:#1c1c1c;
--card-2:#232323;
--text:#ffffff;
--muted:rgba(255,255,255,0.68);
--line:rgba(255,255,255,0.08);
--primary:#e60000;
--primary-dark:#b80000;
--success:#10b981;
--danger:#ef4444;
--shadow:0 10px 24px rgba(0,0,0,0.32);
}

html, body{
scroll-behavior:smooth;
}

body{
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
background:linear-gradient(180deg,#111 0%, #1b1b1b 100%);
color:var(--text);
margin:0;
padding:12px;
display:flex;
flex-direction:column;
gap:12px;
overflow-y:auto;
}

.panel-card{
background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)), var(--card);
border:1px solid var(--line);
border-radius:18px;
padding:14px;
box-shadow:var(--shadow);
}

#statusTitle{
margin:0 0 4px 0;
font-size:20px;
font-weight:700;
letter-spacing:-0.02em;
}

.sub{
font-size:12px;
color:var(--muted);
margin:0 0 10px 0;
}

.timer-wrap{
display:flex;
align-items:center;
justify-content:center;
min-height:56px;
background:rgba(255,255,255,0.035);
border:1px solid rgba(255,255,255,0.05);
border-radius:14px;
padding:8px;
}

.timer{
margin:0;
font-size:30px;
font-weight:700;
letter-spacing:0.04em;
}

button{
padding:12px 14px;
border-radius:12px;
border:none;
cursor:pointer;
font-size:14px;
font-weight:600;
width:100%;
position:relative;
overflow:hidden;
transition:transform .18s ease, opacity .18s ease, box-shadow .18s ease, background .18s ease;
}

button:hover{
transform:translateY(-1px);
}

button:active{
transform:scale(0.99);
}

button:disabled{
opacity:0.7;
cursor:not-allowed;
transform:none;
}

.primary{
background:linear-gradient(180deg,var(--primary) 0%, var(--primary-dark) 100%);
color:white;
box-shadow:0 8px 18px rgba(230,0,0,0.22);
}

.success{
background:linear-gradient(180deg,#10b981 0%, #0a8f65 100%);
color:white;
box-shadow:0 8px 18px rgba(16,185,129,0.22);
}

.danger{
background:linear-gradient(180deg,#ef4444 0%, #cf3030 100%);
color:white;
box-shadow:0 8px 18px rgba(239,68,68,0.22);
}

.secondary{
background:rgba(255,255,255,0.06);
color:white;
border:1px solid rgba(255,255,255,0.08);
box-shadow:none;
}

.row{
display:flex;
gap:8px;
}

.row button{
flex:1;
}

select{
width:100%;
padding:11px 12px;
margin-top:10px;
border-radius:10px;
background:#151515;
border:1px solid rgba(255,255,255,0.1);
color:white;
outline:none;
font-size:14px;
transition:border-color .2s ease, box-shadow .2s ease, opacity .2s ease, transform .2s ease;
}

select:focus{
border-color:var(--primary);
box-shadow:0 0 0 3px rgba(230,0,0,0.18);
}

.hidden{
display:none !important;
}

.fade-in{
animation:fadeInUp .22s ease;
}

@keyframes fadeInUp{
from{
opacity:0;
transform:translateY(10px);
}
to{
opacity:1;
transform:translateY(0);
}
}

.confirming::before{
content:"";
position:absolute;
top:0;
left:0;
height:100%;
width:100%;
background:rgba(255,255,255,0.12);
animation:loadbar 2s linear forwards;
z-index:0;
}

button span{
position:relative;
z-index:1;
}

@keyframes loadbar{
from{width:0%}
to{width:100%}
}
</style>

<div class="panel-card">
<h3 id="statusTitle">Disponível</h3>
<div class="sub">Operador: ${matricula}</div>

<div class="timer-wrap">
<div id="timer" class="timer hidden">00:00</div>
</div>

<div style="margin-top:12px;">
<button id="startBtn" class="primary"><span>Iniciar</span></button>
<button id="endBtn" class="danger hidden"><span>Encerrar</span></button>
</div>

<div id="resultArea" class="hidden fade-in" style="margin-top:12px;">
<div class="row">
<button id="retidoBtn" class="success"><span>Retido</span></button>
<button id="canceladoBtn" class="danger"><span>Cancelado</span></button>
</div>

<select id="reasonSelect" class="hidden fade-in">
<option value="">Selecione o motivo</option>
<option>Atendimento</option>
<option>Produto</option>
<option>Técnico</option>
<option>Mudança de endereço</option>
<option>021</option>
</select>

<button id="confirmBtn" class="primary hidden fade-in" style="margin-top:10px;">
<span>Concluir</span>
</button>
</div>
</div>
`

bindPanel()

}


/* PIP HELPERS */

function getPipScrollElement() {
if (!pipWindow || pipWindow.closed) return null
return pipWindow.document.scrollingElement || pipWindow.document.documentElement || pipWindow.document.body
}

function smoothScrollPipTo(targetEl) {
if (!pipWindow || pipWindow.closed || !targetEl) return

const scrollEl = getPipScrollElement()
if (!scrollEl) return

requestAnimationFrame(() => {
requestAnimationFrame(() => {
try {
const targetTop = targetEl.offsetTop + targetEl.offsetHeight + 24
scrollEl.scrollTo({
top: targetTop,
behavior: "smooth"
})
} catch (e) {}
})
})
}

function scrollPipToBottom() {
if (!pipWindow || pipWindow.closed) return

const scrollEl = getPipScrollElement()
if (!scrollEl) return

requestAnimationFrame(() => {
requestAnimationFrame(() => {
try {
scrollEl.scrollTo({
top: scrollEl.scrollHeight,
behavior: "smooth"
})
} catch (e) {}
})
})
}

function setPipIdleState(doc) {
const reasonSelect = doc.getElementById("reasonSelect")
const confirmBtn = doc.getElementById("confirmBtn")
const retidoBtn = doc.getElementById("retidoBtn")
const canceladoBtn = doc.getElementById("canceladoBtn")
const endBtn = doc.getElementById("endBtn")

selectedResult = null

if (reasonSelect) {
reasonSelect.classList.add("hidden")
reasonSelect.value = ""
}

if (confirmBtn) {
confirmBtn.classList.add("hidden")
confirmBtn.innerHTML = "<span>Concluir</span>"
resetButtonConfirm(confirmBtn)
}

if (retidoBtn) {
retidoBtn.innerHTML = "<span>Retido</span>"
retidoBtn.dataset.confirmLabel = "Confirmar retido"
resetButtonConfirm(retidoBtn)
}

if (canceladoBtn) {
canceladoBtn.innerHTML = "<span>Cancelado</span>"
canceladoBtn.dataset.confirmLabel = "Confirmar cancelado"
resetButtonConfirm(canceladoBtn)
}

if (endBtn) {
endBtn.innerHTML = "<span>Encerrar</span>"
endBtn.dataset.confirmLabel = "Confirmar encerramento"
resetButtonConfirm(endBtn)
}
}

function prepareCanceladoState(doc) {
const reasonSelect = doc.getElementById("reasonSelect")
const confirmBtn = doc.getElementById("confirmBtn")
const retidoBtn = doc.getElementById("retidoBtn")
const canceladoBtn = doc.getElementById("canceladoBtn")

selectedResult = "Cancelado"

if (retidoBtn) {
retidoBtn.innerHTML = "<span>Retido</span>"
resetButtonConfirm(retidoBtn)
}

if (canceladoBtn) {
canceladoBtn.innerHTML = "<span>Cancelado</span>"
resetButtonConfirm(canceladoBtn)
}

if (reasonSelect) {
reasonSelect.classList.remove("hidden")
reasonSelect.classList.add("fade-in")
}

if (confirmBtn) {
confirmBtn.classList.remove("hidden")
confirmBtn.innerHTML = "<span>Concluir cancelamento</span>"
resetButtonConfirm(confirmBtn)
}

if (confirmBtn) {
smoothScrollPipTo(confirmBtn)
} else if (reasonSelect) {
smoothScrollPipTo(reasonSelect)
}
}


/* BIND */

function bindPanel() {

if (!pipWindow || pipWindow.closed) return

const doc = pipWindow.document

const statusTitle = doc.getElementById("statusTitle")
const timer = doc.getElementById("timer")

const startBtn = doc.getElementById("startBtn")
const endBtn = doc.getElementById("endBtn")

const resultArea = doc.getElementById("resultArea")

const retidoBtn = doc.getElementById("retidoBtn")
const canceladoBtn = doc.getElementById("canceladoBtn")

const reasonSelect = doc.getElementById("reasonSelect")
const confirmBtn = doc.getElementById("confirmBtn")

setPipIdleState(doc)

startBtn.onclick = () => {

seconds = 0
timer.textContent = "00:00"

statusTitle.textContent = "Atendendo"

startBtn.classList.add("hidden")
timer.classList.remove("hidden")
endBtn.classList.remove("hidden")
resultArea.classList.add("hidden")

setPipIdleState(doc)

clearInterval(callInterval)
callInterval = setInterval(() => {
seconds++
timer.textContent = formatTime(seconds)
}, 1000)

scrollPipToBottom()

}

endBtn.onclick = () => {
const confirmed = confirmAction(endBtn, () => {
clearInterval(callInterval)

statusTitle.textContent = "Finalizar"

endBtn.classList.add("hidden")
resultArea.classList.remove("hidden")

setPipIdleState(doc)
scrollPipToBottom()
})

if (!confirmed) {
scrollPipToBottom()
}
}

retidoBtn.onclick = () => {

if (selectedResult !== "Retido") {
selectedResult = "Retido"

if (reasonSelect) {
reasonSelect.classList.add("hidden")
reasonSelect.value = ""
}

if (confirmBtn) {
confirmBtn.classList.add("hidden")
resetButtonConfirm(confirmBtn)
}

if (canceladoBtn) {
canceladoBtn.innerHTML = "<span>Cancelado</span>"
resetButtonConfirm(canceladoBtn)
}

resetButtonConfirm(retidoBtn)
retidoBtn.dataset.confirmLabel = "Confirmar retido"
confirmAction(retidoBtn, () => {})
return
}

confirmAction(retidoBtn, () => {

addToHistory(
formatTime(seconds),
"Retido",
""
)

resetPanel()

})

}

canceladoBtn.onclick = () => {
prepareCanceladoState(doc)
}

confirmBtn.onclick = () => {

if (!reasonSelect.value) return

confirmAction(confirmBtn, () => {

addToHistory(
formatTime(seconds),
"Cancelado",
reasonSelect.value
)

resetPanel()

})

}

}


/* RESET */

function resetPanel() {

clearInterval(callInterval)

if (!pipWindow || pipWindow.closed) return

const doc = pipWindow.document

seconds = 0
selectedResult = null

doc.getElementById("statusTitle").textContent = "Disponível"
doc.getElementById("timer").textContent = "00:00"

doc.getElementById("timer").classList.add("hidden")
doc.getElementById("endBtn").classList.add("hidden")
doc.getElementById("resultArea").classList.add("hidden")

doc.getElementById("startBtn").classList.remove("hidden")

setPipIdleState(doc)

}


/* AUTO PIP */

document.addEventListener("visibilitychange", () => {

if (document.visibilityState === "hidden" && canOpenPip()) {
openFloatingPanel()
}

})


/* AJUSTE RESPONSIVO DO HISTÓRICO */

window.addEventListener("resize", () => {
applyHistoryState()
})