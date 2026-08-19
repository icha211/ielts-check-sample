(() => {
    function setupNavigation() {
        const shell = document.querySelector(".shell, .app-shell");
        const primaryToggle = document.getElementById("sidebarToggle") || document.getElementById("studySidebarToggle");
        const secondaryToggle = document.getElementById("sidebarToggleButton") || document.getElementById("studySidebarToggleButton");
        const expandToggle = document.getElementById("sidebarExpandButton") || document.getElementById("studySidebarExpandButton");

        if (!shell || !primaryToggle || !secondaryToggle || !expandToggle) return;

        function setCollapsed(collapsed) {
            shell.classList.toggle("toefl-nav-collapsed", collapsed);
            shell.classList.toggle("sidebar-collapsed", collapsed);
            primaryToggle.setAttribute("aria-expanded", String(!collapsed));
            primaryToggle.setAttribute("aria-label", collapsed ? "Expand navigation" : "Collapse navigation");
            primaryToggle.title = collapsed ? "Expand navigation" : "Collapse navigation";
            primaryToggle.dataset.tooltip = collapsed ? "Open Sidebar" : "Close Sidebar";
            secondaryToggle.setAttribute("aria-label", collapsed ? "Expand navigation" : "Collapse navigation");
            secondaryToggle.title = collapsed ? "Expand navigation" : "Collapse navigation";
        }

        primaryToggle.addEventListener("click", () => setCollapsed(!shell.classList.contains("sidebar-collapsed")));
        secondaryToggle.addEventListener("click", () => setCollapsed(!shell.classList.contains("sidebar-collapsed")));
        expandToggle.addEventListener("click", () => {
            if (shell.classList.contains("sidebar-collapsed")) setCollapsed(false);
        });

        const today = new Date();
        const todayText = `Today, ${new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(today)}`;
        const label = document.getElementById("todayNavLabel") || document.getElementById("studyTodayLabel");
        const number = document.getElementById("todayCalendarNumber") || document.getElementById("studyTodayNumber");
        if (label) {
            label.textContent = todayText;
            label.closest("[data-tooltip]")?.setAttribute("data-tooltip", todayText);
        }
        if (number) number.textContent = String(today.getDate());
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", setupNavigation, { once: true });
    } else {
        setupNavigation();
    }
})();
