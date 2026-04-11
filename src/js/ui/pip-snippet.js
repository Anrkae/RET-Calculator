function createPipPanelMarkup(matricula) {
  return `
<style>
*{
box-sizing:border-box;
}

:root{
--bg:#141414;
--text:#ffffff;
--muted:rgba(255,255,255,0.68);
--line:rgba(255,255,255,0.08);
--primary:#e60000;
--primary-dark:#b80000;
--success:#10b981;
--danger:#ef4444;
--shadow:0 8px 20px rgba(0,0,0,0.28);
}

html, body{
width:100%;
height:100%;
scroll-behavior:smooth;
}

body{
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
background:linear-gradient(180deg,#111 0%, #1b1b1b 100%);
color:var(--text);
margin:0;
padding:6px;
display:flex;
flex-direction:column;
gap:6px;
overflow-x:hidden;
overflow-y:auto;
overscroll-behavior:none;
}

#statusTitle{
margin:0;
font-size:16px;
font-weight:700;
letter-spacing:-0.02em;
}

.sub{
font-size:11px;
color:var(--muted);
margin:0 0 4px 0;
}

.timer-wrap{
display:flex;
align-items:center;
justify-content:center;
min-height:40px;
background:rgba(255,255,255,0.035);
border:1px solid rgba(255,255,255,0.05);
border-radius:10px;
padding:4px 6px;
}

.timer{
margin:0;
font-size:22px;
font-weight:700;
letter-spacing:0.03em;
line-height:1;
}

button{
padding:9px 10px;
border-radius:9px;
border:none;
cursor:pointer;
font-size:12px;
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
box-shadow:0 6px 14px rgba(230,0,0,0.2);
}

.success{
background:linear-gradient(180deg,#10b981 0%, #0a8f65 100%);
color:white;
box-shadow:0 6px 14px rgba(16,185,129,0.2);
}

.danger{
background:linear-gradient(180deg,#ef4444 0%, #cf3030 100%);
color:white;
box-shadow:0 6px 14px rgba(239,68,68,0.2);
}

.ghost{
background:rgba(255,255,255,0.06);
color:white;
border:1px solid rgba(255,255,255,0.08);
}

.row{
display:flex;
gap:6px;
}

.row button{
flex:1;
}

select,
input,
textarea{
width:100%;
padding:9px 10px;
margin-top:6px;
border-radius:9px;
background:#151515;
border:1px solid rgba(255,255,255,0.1);
color:white;
outline:none;
font-size:12px;
font-family:inherit;
transition:border-color .2s ease, box-shadow .2s ease, opacity .2s ease, transform .2s ease;
-webkit-user-select:text;
user-select:text;
}

textarea{
resize:vertical;
}

select:focus,
input:focus,
textarea:focus{
border-color:var(--primary);
box-shadow:0 0 0 3px rgba(230,0,0,0.18);
}

.field-label{
display:block;
margin-top:8px;
font-size:11px;
color:var(--muted);
}

.helper{
font-size:11px;
color:var(--muted);
margin-top:6px;
line-height:1.35;
}

.hidden{
display:none !important;
}

.fade-in{
animation:fadeInUp .2s ease;
}

@keyframes fadeInUp{
from{
opacity:0;
transform:translateY(8px);
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

<h3 id="statusTitle">Disponível</h3>
<div class="sub">Operador: ${matricula}</div>

<div class="timer-wrap">
<div id="timer" class="timer hidden">00:00</div>
</div>

<div style="margin-top:6px;">
<button id="startBtn" class="primary"><span>Iniciar</span></button>
<button id="endBtn" class="danger hidden"><span>Encerrar</span></button>
</div>

<div id="resultArea" class="hidden fade-in" style="margin-top:6px;">
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

<label id="contractFieldLabel" class="field-label hidden" for="contractInput">Contrato opcional</label>
<input id="contractInput" class="hidden fade-in" type="text" inputmode="numeric" maxlength="13" placeholder="000/123456789">

<button id="confirmBtn" class="primary hidden fade-in" style="margin-top:6px;">
<span>Concluir</span>
</button>
</div>
`;
}

function createPipObservationMarkup(matricula, context = {}) {
  return `
<style>
*{
box-sizing:border-box;
}

:root{
--text:#ffffff;
--muted:rgba(255,255,255,0.68);
--primary:#e60000;
--primary-dark:#b80000;
}

html, body{
width:100%;
height:100%;
}

body{
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
background:linear-gradient(180deg,#111 0%, #1b1b1b 100%);
color:var(--text);
margin:0;
padding:10px;
display:flex;
flex-direction:column;
gap:10px;
}

h3{
margin:0;
font-size:15px;
font-weight:700;
letter-spacing:-0.02em;
}

p{
margin:0;
font-size:12px;
line-height:1.45;
color:var(--muted);
}

.context{
padding:10px;
border-radius:10px;
background:rgba(255,255,255,0.04);
border:1px solid rgba(255,255,255,0.06);
}

.context strong,
.context span{
display:block;
font-size:12px;
}

.context strong{
margin-bottom:4px;
}

textarea{
width:100%;
min-height:72px;
padding:10px;
border-radius:10px;
background:#151515;
border:1px solid rgba(255,255,255,0.1);
color:white;
outline:none;
font-size:12px;
font-family:inherit;
resize:vertical;
-webkit-user-select:text;
user-select:text;
}

textarea:focus{
border-color:var(--primary);
box-shadow:0 0 0 3px rgba(230,0,0,0.18);
}

button{
padding:10px 12px;
border-radius:10px;
border:none;
cursor:pointer;
font-size:12px;
font-weight:600;
width:100%;
position:relative;
overflow:hidden;
transition:transform .18s ease, opacity .18s ease, box-shadow .18s ease, background .18s ease;
}

button:hover{
transform:translateY(-1px);
}

button:disabled{
opacity:0.82;
cursor:wait;
transform:none;
}

.primary{
background:linear-gradient(180deg,var(--primary) 0%, var(--primary-dark) 100%);
color:white;
box-shadow:0 6px 14px rgba(230,0,0,0.2);
}

.ghost{
background:rgba(255,255,255,0.06);
color:white;
border:1px solid rgba(255,255,255,0.08);
}

.actions{
display:flex;
flex-direction:column;
gap:0;
margin-top:auto;
}

.loading::before{
content:"";
position:absolute;
top:0;
left:0;
height:100%;
width:100%;
background:rgba(255,255,255,0.12);
animation:loadbar 1.2s linear infinite;
z-index:0;
}

button span{
position:relative;
z-index:1;
}

@keyframes loadbar{
from{transform:translateX(-100%)}
to{transform:translateX(100%)}
}
</style>

<h3>Observação do cancelamento</h3>
<p>Operador: ${matricula}</p>

<div class="context">
<strong>Motivo: ${context.reason || "-"}</strong>
<span>Contrato: ${context.contract || "não informado"}</span>
</div>

<textarea id="observationInput" placeholder="Digite uma observação complementar, se necessário."></textarea>

<div class="actions">
<button id="submitObservationBtn" class="primary" type="button"><span>Enviar sem observação</span></button>
</div>
`;
}

window.createPipPanelMarkup = createPipPanelMarkup;
window.createPipObservationMarkup = createPipObservationMarkup;
