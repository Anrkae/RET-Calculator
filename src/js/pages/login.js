function redirectToDashboard() {
  window.location.href = "./pages/dashboard.html";
}

function startSession() {
  const input = document.getElementById("matriculaInput");
  const matricula = input?.value.trim();

  if (!matricula) {
    alert("Digite a matricula");
    return;
  }

  sessionStorage.setItem("ret:mtr", matricula);
  redirectToDashboard();
}

document.addEventListener("DOMContentLoaded", () => {
  const savedMatricula = sessionStorage.getItem("ret:mtr");
  const input = document.getElementById("matriculaInput");
  const button = document.getElementById("loginButton");

  if (savedMatricula && input) {
    input.value = savedMatricula;
  }

  button?.addEventListener("click", startSession);
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      startSession();
    }
  });
});
