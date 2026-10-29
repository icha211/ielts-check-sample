/* Shared TOEFL top bar + sidebar + mobile dock. Include right after <body> opens. */
(() => {
  import("./js/partner-directory.js").catch((error) => {
    console.error("[PartnerDirectory] Could not start live partner updates:", error);
    window.dispatchEvent(new CustomEvent("toefl-partner-directory-error", {
      detail: { message: "Live partner updates could not start. Please reload this page." }
    }));
  });
  import("./js/message-notifications.js?v=20261030b").catch((error) => {
    console.error("[MessageNotifications] Could not start unread message updates:", error);
  });
  const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const pageKey = {
    "index.html": "dashboard",
    "study-plan.html": "today",
    "myprogress.html": "progress",
    "history.html": "history",
    "full-test-summary.html": "history",
    "social.html": "social",
    "message.html": "message"
  }[page] || "";

  const now = new Date();
  const todayLabel = `Today, ${new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(now)}`;
  const cls = (key) => (pageKey === key ? " active" : "");
  const cur = (key) => (pageKey === key ? ' aria-current="page"' : "");

  const calendarIcon = `<svg class="qcnav-calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/><text x="12" y="18" text-anchor="middle" stroke="none" fill="currentColor">${now.getDate()}</text></svg>`;

  const renderIcons = () => { if (window.lucide && window.lucide.createIcons) window.lucide.createIcons(); };
  const ensureIcons = () => {
    if (window.lucide && window.lucide.createIcons) {
      renderIcons();
    } else {
      const s = doc.createElement("script");
      s.src = "https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js";
      s.onload = renderIcons;
      doc.head.appendChild(s);
    }
  };

  const quickGroups = {
    progress: { label: "Study progress", items: [
      { label: "Study Progress", icon: "chart-line", href: "MyProgress.html" },
      { label: "Test History", icon: "history", href: "history.html" }
    ] },
    social: { label: "Social", items: [
      { label: "Messages", icon: "message-circle", href: "message.html" },
      { label: "Friends", icon: "users", href: "social.html#community" }
    ] }
  };
  const R = 120;
  const html = `
<header class="qcnav-topbar">
  <button class="qcnav-icon-btn qcnav-menu-btn" id="qcnavMenuBtn" type="button" aria-label="Open menu"><i data-lucide="menu"></i></button>
  <a class="qcnav-brand" href="index.html" aria-label="Quick Check dashboard"><img src="../asset/icon/logo.png" alt="Quick Check"></a>
  <nav class="qcnav-links" aria-label="Main navigation">
    <a class="qcnav-link${cls("dashboard")}" href="index.html"${cur("dashboard")}><i data-lucide="house"></i>TOEFL ITP Dashboard</a>
    <a class="qcnav-link" href="developer.html" data-developer-only hidden><i data-lucide="book-bookmark"></i>English Materials</a>
  </nav>
  <div class="qcnav-actions">
    <a class="qcnav-upgrade" href="index.html#upgrade">Upgrade</a>
    <a class="qcnav-icon-btn" href="../index.html#settings" aria-label="Settings"><i data-lucide="settings"></i></a>
    <div class="qcnav-notify">
      <button class="qcnav-icon-btn qcnav-notify-btn" id="qcnavNotifyBtn" type="button" aria-label="Notifications" aria-haspopup="true" aria-expanded="false" aria-controls="qcnavNotifyPanel"><i data-lucide="bell"></i><span class="qcnav-badge" data-notify-badge aria-hidden="true" hidden></span></button>
      <section class="qcnav-notify-panel" id="qcnavNotifyPanel" aria-label="Notifications" hidden>
        <h2 class="qcnav-notify-title">Notifications</h2>
        <div class="qcnav-notify-list" id="qcnavNotifyList" aria-live="polite"><p class="qcnav-notify-empty">Sign in to see notifications.</p></div>
      </section>
    </div>
    <div class="qcnav-account-menu">
      <button class="qcnav-account-btn" id="qcnavAccountBtn" type="button" aria-label="Account menu" aria-haspopup="true" aria-expanded="false" aria-controls="qcnavAccountPanel"><span class="qcnav-avatar" aria-hidden="true">U</span></button>
      <section class="qcnav-account-panel" id="qcnavAccountPanel" aria-label="Account" hidden>
        <div class="qcnav-account-head" data-account-signed-in hidden>
          <span class="qcnav-account-avatar" data-account-avatar aria-hidden="true">U</span>
          <div class="qcnav-account-id">
            <p class="qcnav-account-name" data-account-name>Student</p>
            <p class="qcnav-account-email" data-account-email></p>
          </div>
          <span class="qcnav-account-plan" data-account-plan>Free</span>
        </div>
        <div class="qcnav-account-head" data-account-signed-out>
          <div class="qcnav-account-id"><p class="qcnav-account-name">You are not signed in</p><p class="qcnav-account-email">Sign in to manage your profile.</p></div>
        </div>
        <div class="qcnav-account-sep" role="presentation"></div>
        <a class="qcnav-account-item" href="profile.html" data-account-signed-in hidden><i data-lucide="user-round"></i><span>Profile</span></a>
        <a class="qcnav-account-item" href="mailto:support@quickcheck.id"><i data-lucide="headset"></i><span>Support</span></a>
        <div class="qcnav-account-sep" role="presentation"></div>
        <button class="qcnav-account-item" type="button" data-account-logout data-account-signed-in hidden><i data-lucide="log-out"></i><span>Log out</span></button>
        <a class="qcnav-account-item" href="signup.html" data-account-signed-out><i data-lucide="log-in"></i><span>Sign in</span></a>
      </section>
    </div>
  </div>
</header>
<div class="qcnav-scrim" id="qcnavScrim"></div>
<aside class="qcnav-sidebar" id="qcnavSidebar" aria-label="TOEFL navigation">
  <div class="qcnav-sidebar-top">
    <span class="qcnav-label">TOEFL ITP</span>
    <button class="qcnav-collapse" id="qcnavCollapse" type="button" aria-label="Collapse sidebar" title="Collapse sidebar"><i data-lucide="panel-left-close"></i></button>
  </div>
  <a class="qcnav-item${cls("today")}" href="study-plan.html"${cur("today")}><span class="qcnav-ico">${calendarIcon}</span><span class="qcnav-text">${todayLabel}</span></a>
  <div class="qcnav-divider"></div>
  <div class="qcnav-label">Study Progress</div>
  <a class="qcnav-item${cls("progress")}" href="MyProgress.html"${cur("progress")}><span class="qcnav-ico"><i data-lucide="chart-line"></i></span><span class="qcnav-text">My Progress</span></a>
  <a class="qcnav-item${cls("history")}" href="history.html"${cur("history")}><span class="qcnav-ico"><i data-lucide="history"></i></span><span class="qcnav-text">Test History</span></a>
  <div class="qcnav-divider"></div>
  <div class="qcnav-label">Social</div>
  <a class="qcnav-item${cls("message")}" href="message.html" data-message-link="Message"${cur("message")}><span class="qcnav-ico"><i data-lucide="message-circle"></i><span class="qcnav-badge" data-message-badge aria-hidden="true" hidden></span></span><span class="qcnav-text">Message</span></a>
  <a class="qcnav-item" href="social.html#community"><span class="qcnav-ico"><i data-lucide="users"></i></span><span class="qcnav-text">Community</span></a>
  <div class="qcnav-divider"></div>
  <div class="qcnav-label" data-developer-only hidden>Admin</div>
  <a class="qcnav-item" href="developer.html" data-developer-only hidden><span class="qcnav-ico"><i data-lucide="book-open"></i></span><span class="qcnav-text">Developer</span></a>
  <a class="qcnav-item" href="../index.html"><span class="qcnav-ico"><i data-lucide="undo-2"></i></span><span class="qcnav-text">Back to IELTS</span></a>
</aside>
<div class="qcnav-quick" id="qcnavQuick">
  ${Object.entries(quickGroups).map(([g, grp]) => `<div class="qcnav-fan" data-group="${g}" role="menu" aria-label="${grp.label}">${grp.items.map((q, i) => {
    const a = (125 - 70 * i / (grp.items.length - 1)) * Math.PI / 180;
    const isMessages = q.href === "message.html";
    return `<a role="menuitem" href="${q.href}" tabindex="-1"${isMessages ? ` data-message-link="${q.label}"` : ""} style="--i:${i};--x:${Math.round(R * Math.cos(a))}px;--y:${-Math.round(R * Math.sin(a))}px"><i data-lucide="${q.icon}"></i><span>${q.label}</span>${isMessages ? '<b class="qcnav-badge" data-message-badge aria-hidden="true" hidden></b>' : ""}</a>`;
  }).join("")}</div>`).join("")}
</div>
<nav class="qcnav-dock" aria-label="Primary">
  <a class="${cls("dashboard").trim()}" href="index.html" aria-label="Dashboard"><i data-lucide="house"></i><em>Home</em></a>
  <button type="button" class="${cls("progress").trim() || (pageKey === "history" ? "active" : "")}" data-tab="progress" aria-haspopup="menu" aria-expanded="false" aria-label="Progress menu"><i data-lucide="chart-line"></i><em>Progress</em></button>
  <a class="qcnav-today${cls("today")}" href="study-plan.html" aria-label="Today"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M16 3v4M8 3v4M4 11h16"/><text x="12" y="18.2" text-anchor="middle" stroke="none" fill="currentColor">${now.getDate()}</text></svg><em>Today</em></a>
  <button type="button" class="${cls("social").trim() || (pageKey === "message" ? "active" : "")}" data-tab="social" aria-haspopup="menu" aria-expanded="false" aria-label="Social menu" data-message-link="Social menu"><span class="qcnav-dock-ico"><i data-lucide="messages-square"></i><span class="qcnav-badge" data-message-badge aria-hidden="true" hidden></span></span><em>Social</em></button>
  <button type="button" id="qcnavProfileBtn" aria-label="Profile"><i data-lucide="user"></i><em>Profile</em></button>
</nav></div>`;


  const doc = document;
  const body = doc.body;
  body.classList.add("qcnav");
  body.insertAdjacentHTML("afterbegin", html);

  ensureIcons();

  import("./js/developer-access.js").then(({ watchDeveloperAccess }) => {
    watchDeveloperAccess((isDeveloper) => {
      doc.querySelectorAll("[data-developer-only]").forEach((el) => { el.hidden = !isDeveloper; });
    });
  }).catch((error) => {
    console.error("[DeveloperAccess] Could not check developer access:", error);
  });
  import("./js/account-menu.js?v=20261031-account").then(({ initAccountMenu }) => initAccountMenu()).catch((error) => {
    console.error("[AccountMenu] Could not load account menu:", error);
  });
  const setCollapsed = (value) => {
    body.classList.toggle("qcnav-collapsed", value);
    const btn = doc.getElementById("qcnavCollapse");
    btn.innerHTML = `<i data-lucide="${value ? "panel-left-open" : "panel-left-close"}"></i>`;
    btn.setAttribute("aria-label", value ? "Expand sidebar" : "Collapse sidebar");
    btn.title = value ? "Expand sidebar" : "Collapse sidebar";
    renderIcons();
  };

  const closeAll = () => {
    body.classList.remove("qcnav-menu-open", "qcnav-quick-open");
    delete body.dataset.quick;
    doc.getElementById("qcnavSidebar").classList.remove("open");
    doc.querySelectorAll(".qcnav-dock [data-tab]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    doc.querySelectorAll(".qcnav-fan a").forEach((a) => { a.tabIndex = -1; });
  };
  const positionQuick = (group, trigger) => {
    const fan = doc.querySelector(`.qcnav-fan[data-group="${group}"]`);
    if (!fan || !trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const anchorX = triggerRect.left + triggerRect.width / 2;
    fan.style.left = `${anchorX}px`;
    fan.querySelectorAll("a").forEach((link) => {
      const originalX = Number(link.dataset.offsetX || parseFloat(link.style.getPropertyValue("--x"))) || 0;
      link.dataset.offsetX = String(originalX);
      const minCenter = 44;
      const maxCenter = Math.max(minCenter, window.innerWidth - minCenter);
      const centerX = Math.min(maxCenter, Math.max(minCenter, anchorX + originalX));
      link.style.setProperty("--x", `${centerX - anchorX}px`);
    });
  };
  const toggleQuick = (group, trigger) => {
    const open = body.dataset.quick !== group;
    closeAll();
    if (!open) return;
    positionQuick(group, trigger);
    body.classList.add("qcnav-quick-open");
    body.dataset.quick = group;
    doc.querySelectorAll(".qcnav-dock [data-tab]").forEach((b) => b.setAttribute("aria-expanded", String(b.dataset.tab === group)));
    doc.querySelectorAll(`.qcnav-fan[data-group="${group}"] a`).forEach((a) => { a.tabIndex = 0; });
  };
  doc.getElementById("qcnavCollapse").addEventListener("click", () => setCollapsed(!body.classList.contains("qcnav-collapsed")));
  doc.getElementById("qcnavMenuBtn").addEventListener("click", () => {
    const open = !doc.getElementById("qcnavSidebar").classList.contains("open");
    closeAll();
    doc.getElementById("qcnavSidebar").classList.toggle("open", open);
    body.classList.toggle("qcnav-menu-open", open);
  });
  doc.getElementById("qcnavScrim").addEventListener("click", closeAll);
  doc.querySelectorAll(".qcnav-dock [data-tab]").forEach((b) => b.addEventListener("click", () => toggleQuick(b.dataset.tab, b)));
  window.addEventListener("resize", () => {
    const group = body.dataset.quick;
    if (!group) return;
    const trigger = doc.querySelector(`.qcnav-dock [data-tab="${group}"]`);
    positionQuick(group, trigger);
  });
  doc.getElementById("qcnavProfileBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    doc.getElementById("qcnavAccountBtn").click();
  });
  doc.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });

  const notifyBtn = doc.getElementById("qcnavNotifyBtn");
  const notifyPanel = doc.getElementById("qcnavNotifyPanel");
  const setNotifyOpen = (open, restoreFocus = false) => {
    if (notifyPanel.hidden === !open) return;
    notifyPanel.hidden = !open;
    notifyBtn.setAttribute("aria-expanded", String(open));
    if (open) window.dispatchEvent(new CustomEvent("toefl-notifications-opened"));
    if (!open && restoreFocus) notifyBtn.focus();
  };
  const accountBtn = doc.getElementById("qcnavAccountBtn");
  const accountPanel = doc.getElementById("qcnavAccountPanel");
  const setAccountOpen = (open, restoreFocus = false) => {
    if (accountPanel.hidden === !open) return;
    accountPanel.hidden = !open;
    accountBtn.setAttribute("aria-expanded", String(open));
    if (!open && restoreFocus) accountBtn.focus();
  };
  accountBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAll();
    setNotifyOpen(false);
    setAccountOpen(accountPanel.hidden);
  });
  doc.addEventListener("click", (e) => {
    if (!accountPanel.hidden && !e.target.closest(".qcnav-account-menu")) setAccountOpen(false);
  });
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !accountPanel.hidden) setAccountOpen(false, true);
  });
  notifyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAll();
    setAccountOpen(false);
    setNotifyOpen(notifyPanel.hidden);
  });
  doc.addEventListener("click", (e) => {
    if (!notifyPanel.hidden && !e.target.closest(".qcnav-notify")) setNotifyOpen(false);
  });
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !notifyPanel.hidden) setNotifyOpen(false, true);
  });

})();
