document.addEventListener("DOMContentLoaded", () => {
  animateEntrance();
});

function animateEntrance() {
  const items = document.querySelectorAll(".fade-up");

  items.forEach((el, i) => {
    setTimeout(() => {
      el.classList.add("show");
    }, 100 + (i * 120));
  });
}

function animateDashboard() {
  const dashboardCard = document.querySelector("#dashboard .card");
  if (dashboardCard) {
    dashboardCard.classList.add("fade-up");
    setTimeout(() => {
      dashboardCard.classList.add("show");
    }, 50);
  }
}

function animateHistoryItems() {
  const items = document.querySelectorAll(".history-item");

  items.forEach((item, index) => {
    item.style.animation = "none";
    item.offsetHeight;
    item.style.animation = `historyFade .35s ease forwards`;
    item.style.animationDelay = `${index * 0.05}s`;
  });
}

window.animateDashboard = animateDashboard;
window.animateHistoryItems = animateHistoryItems;