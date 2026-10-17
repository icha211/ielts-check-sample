/**
 * card-strike.js
 * Renders the weekly "Daily Strike" cards (Mon-Sun) inside .strike-card.
 * A strike is a completed study-plan section for that day; counts come from
 * getDayData() (defined by the dashboard page) so they stay in sync with the calendar.
 */
(() => {
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DAILY_GOAL = 3;
  const FLAME_PATH = "M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.2 1.3.8 2 1.8 2.3C10.5 8 11 5 12 2z";

  // Shared gradients referenced by card-strike.css (#fill-gradient / #stroke-gradient)
  function ensureGradients() {
    if (document.getElementById("strike-gradients")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <svg id="strike-gradients" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="stroke-gradient" x1="0.71" y1="0.05" x2="0.29" y2="0.95">
            <stop offset="0%" stop-color="#28E192"/><stop offset="100%" stop-color="#08AC88"/>
          </linearGradient>
          <linearGradient id="fill-gradient" x1="0.71" y1="0.05" x2="0.29" y2="0.95">
            <stop offset="0%" stop-color="#FFFFFF"/><stop offset="100%" stop-color="#4AE7A9"/>
          </linearGradient>
        </defs>
      </svg>`);
  }

  function strikesFor(date) {
    if (typeof getDayData !== "function") return 0;
    try {
      const sections = getDayData(date.getFullYear(), date.getMonth(), date.getDate()).sections || {};
      return Object.values(sections).filter((section) => section && section.completed).length;
    } catch (_error) {
      return 0;
    }
  }

  function weekDates(today) {
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return DAYS.map((_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  }

  function dayCard(date, index, today) {
    const count = strikesFor(date);
    const active = count > 0;
    const isToday = date.toDateString() === today.toDateString();
    const state = active ? "active" : "inactive";
    const width = String(count).length * 13 + 4;
    const status = active ? "Completed strikes today" : "No strike today";
    return `
      <div class="day-card-strike card-${state}${isToday ? " is-today" : ""}" aria-label="${DAYS[index]} ${date.getDate()} ${MONTHS[date.getMonth()]}: ${count} strikes"${isToday ? ' aria-current="date"' : ""}>
        <div class="day-text">${DAYS[index]}</div>
        <div class="date-text">${date.getDate()} ${MONTHS[date.getMonth()]}</div>
        <div class="strike-content">
          <svg class="strike-number" width="${width}" height="24" viewBox="0 0 ${width} 24" aria-hidden="true">
            <text class="strike-number-text text-${state}" x="${width / 2}" y="20" text-anchor="middle">${count}</text>
          </svg>
          <svg class="strike-flame" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path class="flame-${state}" d="${FLAME_PATH}" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="strike-status ${active ? "status-completed" : "status-empty"}" title="${status}">${active ? "Done" : "None"}</div>
      </div>`;
  }

  function render() {
    const grid = document.getElementById("strike-days");
    if (!grid) return;
    ensureGradients();
    const today = new Date();
    grid.innerHTML = weekDates(today).map((date, i) => dayCard(date, i, today)).join("");
    const progress = document.getElementById("strike-progress");
    if (progress) progress.textContent = `${Math.min(strikesFor(today), DAILY_GOAL)}/${DAILY_GOAL}`;
  }

  window.cardStrike = { render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true });
  else render();
})();
