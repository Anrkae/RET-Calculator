import {
  buscarLigacoes,
  salvarAtendimento
} from "../services/atendimentos-service.js";

window.salvarAtendimento = async (matricula, data) => {
  try {
    await salvarAtendimento(matricula, data);
    console.log("Ligacao salva");
  } catch (error) {
    console.error("Erro Firebase:", error);
  }
};

window.buscarLigacoes = async (matricula) => {
  try {
    return await buscarLigacoes(matricula);
  } catch (error) {
    console.error("Erro ao buscar:", error);
    return [];
  }
};
