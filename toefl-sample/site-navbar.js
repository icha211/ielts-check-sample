/* Shared TOEFL top bar + sidebar + mobile dock. Include right after <body> opens. */
(() => {
  import("./js/partner-directory.js").catch((error) => {
    console.error("[PartnerDirectory] Could not start live partner updates:", error);
    window.dispatchEvent(new CustomEvent("toefl-partner-directory-error", {
      detail: { message: "Live partner updates could not start. Please reload this page." }
    }));
  });
  import("./js/message-notifications.js?v=20261031-post-activity").catch((error) => {
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
    "message.html": "message",
    "profile.html": "profile"
  }[page] || "";

  const now = new Date();
  const prefs = window.QCPrefs;
  const tr = (text, vars) => (prefs ? prefs.t(text, vars) : text.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m)));
  const formatToday = () => tr("Today, {date}", { date: new Intl.DateTimeFormat(prefs ? prefs.locale() : "en", { day: "numeric", month: "short", year: "numeric" }).format(now) });
  const todayLabel = formatToday();
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
      { label: "Explore", icon: "globe", href: "social.html#community" }
    ] }
  };
  const R = 120;
  const html = `
<header class="qcnav-topbar">
  <button class="qcnav-icon-btn qcnav-menu-btn" id="qcnavMenuBtn" type="button" aria-label="Open menu" data-i18n-attr="aria-label"><i data-lucide="menu"></i></button>
  <a class="qcnav-brand" href="index.html" aria-label="Quick Check dashboard" data-i18n-attr="aria-label"><img src="../asset/icon/logo.png" alt="Quick Check"></a>
  <nav class="qcnav-links" aria-label="Main navigation" data-i18n-attr="aria-label">
    <a class="qcnav-link${cls("dashboard")}" href="index.html"${cur("dashboard")}><i data-lucide="house"></i><span data-i18n>Home</span></a>
    <a class="qcnav-link${cls("social")}" href="social.html#community"${cur("social")}><i data-lucide="globe"></i><span data-i18n>Explore</span></a>
  </nav>
  <div class="qcnav-actions">
    <a class="qcnav-upgrade" href="index.html#upgrade" data-i18n>Upgrade</a>
    <div class="qcnav-settings-menu">
      <button class="qcnav-icon-btn qcnav-settings-btn" id="qcnavSettingsBtn" type="button" aria-label="Settings" data-i18n-attr="aria-label" aria-haspopup="true" aria-expanded="false" aria-controls="qcnavSettingsPanel"><i data-lucide="settings"></i></button>
      <section class="qcnav-account-panel qcnav-settings-panel" id="qcnavSettingsPanel" aria-label="Settings" data-i18n-attr="aria-label" hidden>
        <div class="qcnav-account-head">
          <span class="qcnav-account-avatar" aria-hidden="true"><i data-lucide="sliders-horizontal"></i></span>
          <div class="qcnav-account-id"><p class="qcnav-account-name" data-i18n>Preferences</p><p class="qcnav-account-email" data-i18n>Saved on this device</p></div>
        </div>
        <div class="qcnav-account-sep" role="presentation"></div>
        <p class="qcnav-settings-label" id="qcnavThemeLabel" data-i18n>Appearance</p>
        <div class="qcnav-settings-group" role="radiogroup" aria-labelledby="qcnavThemeLabel" data-settings-group="theme">
          <button class="qcnav-account-item" type="button" role="radio" aria-checked="false" data-theme-option="light"><i data-lucide="sun"></i><span data-i18n>Light</span><i class="qcnav-settings-check" data-lucide="check"></i></button>
          <button class="qcnav-account-item" type="button" role="radio" aria-checked="false" data-theme-option="dark"><i data-lucide="moon"></i><span data-i18n>Dark</span><i class="qcnav-settings-check" data-lucide="check"></i></button>
          <button class="qcnav-account-item" type="button" role="radio" aria-checked="false" data-theme-option="system"><i data-lucide="monitor"></i><span data-i18n>System</span><i class="qcnav-settings-check" data-lucide="check"></i></button>
        </div>
        <div class="qcnav-account-sep" role="presentation"></div>
        <p class="qcnav-settings-label" id="qcnavLangLabel" data-i18n>Language</p>
        <div class="qcnav-settings-group" role="radiogroup" aria-labelledby="qcnavLangLabel" data-settings-group="lang">
          <button class="qcnav-account-item" type="button" role="radio" aria-checked="false" data-lang-option="en" lang="en"><span class="qcnav-settings-code" aria-hidden="true">EN</span><span>English</span><i class="qcnav-settings-check" data-lucide="check"></i></button>
          <button class="qcnav-account-item" type="button" role="radio" aria-checked="false" data-lang-option="id" lang="id"><span class="qcnav-settings-code" aria-hidden="true">ID</span><span>Bahasa Indonesia</span><i class="qcnav-settings-check" data-lucide="check"></i></button>
        </div>
      </section>
    </div>
    <div class="qcnav-notify">
      <button class="qcnav-icon-btn qcnav-notify-btn" id="qcnavNotifyBtn" type="button" aria-label="Notifications" data-i18n-attr="aria-label" aria-haspopup="true" aria-expanded="false" aria-controls="qcnavNotifyPanel"><i data-lucide="bell"></i><span class="qcnav-badge" data-notify-badge aria-hidden="true" hidden></span></button>
      <section class="qcnav-notify-panel" id="qcnavNotifyPanel" aria-label="Notifications" data-i18n-attr="aria-label" hidden>
        <h2 class="qcnav-notify-title" data-i18n>Notifications</h2>
        <div class="qcnav-notify-list" id="qcnavNotifyList" aria-live="polite"><p class="qcnav-notify-empty" data-i18n>Sign in to see notifications.</p></div>
      </section>
    </div>
    <div class="qcnav-account-menu">
      <button class="qcnav-account-btn" id="qcnavAccountBtn" type="button" aria-label="Account menu" aria-haspopup="true" aria-expanded="false" aria-controls="qcnavAccountPanel"><span class="qcnav-avatar" aria-hidden="true">U</span></button>
      <section class="qcnav-account-panel" id="qcnavAccountPanel" aria-label="Account" data-i18n-attr="aria-label" hidden>
        <div class="qcnav-account-head" data-account-signed-in hidden>
          <span class="qcnav-account-avatar" data-account-avatar aria-hidden="true">U</span>
          <div class="qcnav-account-id">
            <p class="qcnav-account-name" data-account-name>Student</p>
            <p class="qcnav-account-email" data-account-email></p>
          </div>
          <span class="qcnav-account-plan" data-account-plan>Free</span>
        </div>
        <div class="qcnav-account-head" data-account-signed-out>
          <div class="qcnav-account-id"><p class="qcnav-account-name" data-i18n>You are not signed in</p><p class="qcnav-account-email" data-i18n>Sign in to manage your profile.</p></div>
        </div>
        <div class="qcnav-account-sep" role="presentation"></div>
        <a class="qcnav-account-item" href="profile.html" data-account-signed-in hidden><i data-lucide="user-round"></i><span data-i18n>Profile</span></a>
        <a class="qcnav-account-item" href="mailto:support@quickcheck.id"><i data-lucide="headset"></i><span data-i18n>Support</span></a>
        <div class="qcnav-account-sep" role="presentation"></div>
        <button class="qcnav-account-item" type="button" data-account-logout data-account-signed-in hidden><i data-lucide="log-out"></i><span data-i18n>Log out</span></button>
        <a class="qcnav-account-item" href="signup.html" data-account-signed-out><i data-lucide="log-in"></i><span data-i18n>Sign in</span></a>
      </section>
    </div>
  </div>
</header>
<div class="qcnav-scrim" id="qcnavScrim"></div>
<aside class="qcnav-sidebar" id="qcnavSidebar" aria-label="TOEFL navigation" data-i18n-attr="aria-label">
  <div class="qcnav-sidebar-top">
    <span class="qcnav-label">TOEFL ITP</span>
    <button class="qcnav-collapse" id="qcnavCollapse" type="button" aria-label="Collapse sidebar" title="Collapse sidebar"><i data-lucide="panel-left-close"></i></button>
  </div>
  <a class="qcnav-item${cls("today")}" href="study-plan.html"${cur("today")}><span class="qcnav-ico">${calendarIcon}</span><span class="qcnav-text" data-qcnav-today>${todayLabel}</span></a>
  <div class="qcnav-divider"></div>
  <div class="qcnav-label" data-i18n>Study Progress</div>
  <a class="qcnav-item${cls("progress")}" href="MyProgress.html"${cur("progress")}><span class="qcnav-ico"><i data-lucide="chart-line"></i></span><span class="qcnav-text" data-i18n>My Progress</span></a>
  <a class="qcnav-item${cls("history")}" href="history.html"${cur("history")}><span class="qcnav-ico"><i data-lucide="history"></i></span><span class="qcnav-text" data-i18n>Test History</span></a>
  <div class="qcnav-divider"></div>
  <div class="qcnav-label" data-i18n>Social</div>
  <a class="qcnav-item${cls("profile")}" href="profile.html"${cur("profile")}><span class="qcnav-ico"><i data-lucide="user-round"></i></span><span class="qcnav-text" data-i18n>Profile</span></a>
  <a class="qcnav-item${cls("message")}" href="message.html" data-message-link="Message"${cur("message")}><span class="qcnav-ico"><i data-lucide="message-circle"></i><span class="qcnav-badge" data-message-badge aria-hidden="true" hidden></span></span><span class="qcnav-text" data-i18n>Message</span></a>
  <a class="qcnav-item${cls("social")}" href="social.html#community"${cur("social")}><span class="qcnav-ico"><i data-lucide="globe"></i></span><span class="qcnav-text" data-i18n>Explore</span></a>
  <div class="qcnav-divider"></div>
  <div class="qcnav-label" data-developer-only hidden data-i18n>Admin</div>
  <a class="qcnav-item" href="developer.html" data-developer-only hidden><span class="qcnav-ico"><i data-lucide="book-open"></i></span><span class="qcnav-text">Developer</span></a>
  <a class="qcnav-item" href="../index.html"><span class="qcnav-ico"><i data-lucide="undo-2"></i></span><span class="qcnav-text" data-i18n>Back to IELTS</span></a>
</aside>
<div class="qcnav-quick" id="qcnavQuick">
  ${Object.entries(quickGroups).map(([g, grp]) => `<div class="qcnav-fan" data-group="${g}" role="menu" aria-label="${grp.label}" data-i18n-attr="aria-label">${grp.items.map((q, i) => {
    const a = (125 - 70 * i / (grp.items.length - 1)) * Math.PI / 180;
    const isMessages = q.href === "message.html";
    return `<a role="menuitem" href="${q.href}" tabindex="-1"${isMessages ? ` data-message-link="${q.label}"` : ""} style="--i:${i};--x:${Math.round(R * Math.cos(a))}px;--y:${-Math.round(R * Math.sin(a))}px"><i data-lucide="${q.icon}"></i><span data-i18n>${q.label}</span>${isMessages ? '<b class="qcnav-badge" data-message-badge aria-hidden="true" hidden></b>' : ""}</a>`;
  }).join("")}</div>`).join("")}
</div>
<nav class="qcnav-dock" aria-label="Primary" data-i18n-attr="aria-label">
  <a class="${cls("dashboard").trim()}" href="index.html" aria-label="Dashboard" data-i18n-attr="aria-label"><i data-lucide="house"></i><em data-i18n>Home</em></a>
  <button type="button" class="${cls("progress").trim() || (pageKey === "history" ? "active" : "")}" data-tab="progress" aria-haspopup="menu" aria-expanded="false" aria-label="Progress menu" data-i18n-attr="aria-label"><i data-lucide="chart-line"></i><em data-i18n>Progress</em></button>
  <a class="qcnav-today${cls("today")}" href="study-plan.html" aria-label="Today" data-i18n-attr="aria-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M16 3v4M8 3v4M4 11h16"/><text x="12" y="18.2" text-anchor="middle" stroke="none" fill="currentColor">${now.getDate()}</text></svg><em data-i18n>Today</em></a>
  <button type="button" class="${cls("social").trim() || (pageKey === "message" ? "active" : "")}" data-tab="social" aria-haspopup="menu" aria-expanded="false" aria-label="Social menu" data-i18n-attr="aria-label" data-message-link="Social menu"><span class="qcnav-dock-ico"><i data-lucide="messages-square"></i><span class="qcnav-badge" data-message-badge aria-hidden="true" hidden></span></span><em data-i18n>Social</em></button>
  <button type="button" id="qcnavProfileBtn" aria-label="Profile" data-i18n-attr="aria-label"><i data-lucide="user"></i><em data-i18n>Profile</em></button>
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
  import("./js/account-menu.js?v=20261030-prefs").then(({ initAccountMenu }) => initAccountMenu()).catch((error) => {
    console.error("[AccountMenu] Could not load account menu:", error);
  });
  const setCollapsed = (value) => {
    body.classList.toggle("qcnav-collapsed", value);
    const btn = doc.getElementById("qcnavCollapse");
    btn.innerHTML = `<i data-lucide="${value ? "panel-left-open" : "panel-left-close"}"></i>`;
    const label = tr(value ? "Expand sidebar" : "Collapse sidebar");
    btn.setAttribute("aria-label", label);
    btn.title = label;
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
  const settingsBtn = doc.getElementById("qcnavSettingsBtn");
  const settingsPanel = doc.getElementById("qcnavSettingsPanel");
  const setSettingsOpen = (open, restoreFocus = false) => {
    if (settingsPanel.hidden === !open) return;
    settingsPanel.hidden = !open;
    settingsBtn.setAttribute("aria-expanded", String(open));
    if (open) syncSettings();
    if (!open && restoreFocus) settingsBtn.focus();
  };
  const syncSettings = () => {
    const theme = prefs ? prefs.getTheme() : "light";
    const lang = prefs ? prefs.getLang() : "en";
    settingsPanel.querySelectorAll("[data-theme-option]").forEach((b) => {
      const on = b.dataset.themeOption === theme;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    settingsPanel.querySelectorAll("[data-lang-option]").forEach((b) => {
      const on = b.dataset.langOption === lang;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    });
  };
  syncSettings();
  settingsPanel.addEventListener("click", (e) => {
    const option = e.target.closest("[role='radio']");
    if (!option || !prefs) return;
    if (option.dataset.themeOption) prefs.setTheme(option.dataset.themeOption);
    if (option.dataset.langOption) prefs.setLang(option.dataset.langOption);
    syncSettings();
  });
  settingsPanel.addEventListener("keydown", (e) => {
    const option = e.target.closest("[role='radio']");
    if (!option) return;
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (!(e.key in keys) && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const items = [...option.parentElement.querySelectorAll("[role='radio']")];
    const i = items.indexOf(option);
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + keys[e.key] + items.length) % items.length;
    items[next].focus();
    items[next].click();
  });
  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAll();
    setNotifyOpen(false);
    setAccountOpen(false);
    setSettingsOpen(settingsPanel.hidden);
  });
  doc.addEventListener("click", (e) => {
    if (!settingsPanel.hidden && !e.target.closest(".qcnav-settings-menu")) setSettingsOpen(false);
  });
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !settingsPanel.hidden) setSettingsOpen(false, true);
  });
  window.addEventListener("qc:themechange", syncSettings);
  window.addEventListener("qc:langchange", () => {
    syncSettings();
    const today = doc.querySelector("[data-qcnav-today]");
    if (today) today.textContent = formatToday();
    setCollapsed(body.classList.contains("qcnav-collapsed"));
  });

  accountBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAll();
    setNotifyOpen(false);
    setSettingsOpen(false);
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
    setSettingsOpen(false);
    setNotifyOpen(notifyPanel.hidden);
  });
  doc.addEventListener("click", (e) => {
    if (!notifyPanel.hidden && !e.target.closest(".qcnav-notify")) setNotifyOpen(false);
  });
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !notifyPanel.hidden) setNotifyOpen(false, true);
  });

})();
