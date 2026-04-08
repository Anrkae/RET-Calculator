import { listarLigacoes } from "../services/atendimentos-service.js";

let dadosBrutos = [];

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
    } catch (e) {
        console.error("Erro:", e);
    }
}

function processarEExibir() {
    const filtro = document.getElementById("periodFilter").value;
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
            if (item.date === hojeStr) incluir = true;
        } else if (filtro === "semanal") {
            if (item.objetoData >= startOfWeek) incluir = true;
        } else {
            incluir = true;
        }

        if (incluir) {
            const op = item.operator || "S/M";
            if (!consolidado[op]) consolidado[op] = { atendidas: 0, cancelados: 0 };

            consolidado[op].atendidas++;
            if (item.result === "Cancelado") consolidado[op].cancelados++;
        }
    });

    renderizarTabela(consolidado);
}

function renderizarTabela(dados) {
    const tbody = document.getElementById("tableBody");
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
                <span class="rate-badge" style="background: ${getCorTaxa(taxa)}; color: white">
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

document.getElementById("periodFilter").addEventListener("change", () => {
    const labels = { diario: "hoje", semanal: "desta semana", mensal: "deste mes" };
    document.getElementById("periodLabel").textContent = `Exibindo resultados ${labels[document.getElementById("periodFilter").value]}`;
    processarEExibir();
});

carregarDados();
