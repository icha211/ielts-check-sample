(function () {
  if (document.querySelector(".qcsite-footer")) return;

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "site-footer.css";
  document.head.appendChild(stylesheet);

  const footer = document.createElement("footer");
  footer.className = "qcsite-footer";
  footer.innerHTML = `
    <div class="qcsite-footer__main">
      <section class="qcsite-footer__brand" aria-label="Quick Check contact">
        <a class="qcsite-footer__logo" href="index.html" aria-label="Quick Check home">
          <img src="../asset/icon/logo.png" alt="Quick Check">
        </a>
        <p>Prepare for TOEFL with focused practice and progress tools.</p>
        <a class="qcsite-footer__contact" href="mailto:support@quickcheck.id">support@quickcheck.id</a>
      </section>

      <nav class="qcsite-footer__links" aria-label="Quick Check links">
        <div class="qcsite-footer__link-group">
          <h2>Quick Links</h2>
          <a href="index.html">Home</a>
          <a href="study-plan.html">Study Plan</a>
          <a href="MyProgress.html">My Progress</a>
          <a href="history.html">History</a>
        </div>
        <div class="qcsite-footer__link-group">
          <h2>Products</h2>
          <a href="daily-practice.html">Daily Practice</a>
          <a href="study-plan.html">Full Mock Test</a>
          <a href="section%201.html">Listening Practice</a>
          <a href="section%202.html">Structure Practice</a>
          <a href="section%203.html">Reading Practice</a>
        </div>
        <div class="qcsite-footer__link-group">
          <h2>Support</h2>
          <a href="index.html">Help Center</a>
          <a href="mailto:support@quickcheck.id">Contact Support</a>
        </div>
      </nav>

      <section class="qcsite-footer__legal" aria-labelledby="qcsite-footer-legal-title">
        <h2 id="qcsite-footer-legal-title">Legal &amp; Compliance</h2>
        <p>For privacy, terms, and payment questions, contact the Quick Check team.</p>
        <a href="mailto:support@quickcheck.id?subject=Legal%20and%20privacy%20inquiry">Legal inquiries</a>
      </section>
    </div>

    <div class="qcsite-footer__bottom">
      <p class="qcsite-footer__disclaimer">TOEFL is a registered trademark of ETS. Quick Check is not affiliated with or endorsed by ETS.</p>
      <p class="qcsite-footer__copyright">&copy; <span data-qc-footer-year></span> Quick Check. All rights reserved.</p>
    </div>
  `;

  const year = footer.querySelector("[data-qc-footer-year]");
  year.textContent = String(new Date().getFullYear());
  document.body.appendChild(footer);

  const sidebar = document.getElementById("qcnavSidebar");
  if (!sidebar) return;

  const shell = document.querySelector(".shell");
  if (shell && shell.querySelector(".foot")) {
    footer.classList.add("qcsite-footer--dashboard");
  }
  const sidebarTopOffset = 64;
  const footerClearance = 1;
  let sidebarStoppedAtShell = false;
  let sidebarDocumentTop = 0;
  const resetSidebarPosition = () => {
    sidebar.style.removeProperty("position");
    sidebar.style.removeProperty("top");
    sidebar.style.removeProperty("bottom");
    sidebar.style.removeProperty("height");
  };

  const setSidebarFlowMode = () => {
    if (window.innerWidth <= 780) {
      sidebarStoppedAtShell = false;
      resetSidebarPosition();
      return;
    }

    if (shell) {
      const targetBottom = footer.getBoundingClientRect().top + window.scrollY - footerClearance;
      if (sidebarStoppedAtShell && targetBottom - window.scrollY > window.innerHeight) {
        sidebarStoppedAtShell = false;
        resetSidebarPosition();
      }

      if (!sidebarStoppedAtShell && targetBottom - window.scrollY <= window.innerHeight) {
        sidebarDocumentTop = window.scrollY + sidebarTopOffset;
        sidebarStoppedAtShell = true;
      }

      if (sidebarStoppedAtShell) {
        sidebar.style.position = "absolute";
        sidebar.style.top = `${sidebarDocumentTop}px`;
        sidebar.style.bottom = "auto";
        sidebar.style.height = `${Math.max(0, targetBottom - sidebarDocumentTop)}px`;
      } else if (sidebar.style.position === "absolute") {
        resetSidebarPosition();
      }
      return;
    }

    const footerReached = footer.getBoundingClientRect().top <= window.innerHeight;
    if (footerReached && sidebar.style.position !== "absolute") {
      sidebar.style.position = "absolute";
      sidebar.style.top = `${window.scrollY + sidebarTopOffset}px`;
      sidebar.style.bottom = "auto";
      sidebar.style.height = `calc(100vh - ${sidebarTopOffset}px)`;
    } else if (!footerReached && sidebar.style.position === "absolute") {
      resetSidebarPosition();
    }
  };

  window.addEventListener("scroll", setSidebarFlowMode, { passive: true });
  window.addEventListener("resize", setSidebarFlowMode);
  stylesheet.addEventListener("load", setSidebarFlowMode, { once: true });
  window.addEventListener("load", setSidebarFlowMode, { once: true });
  if (shell && "ResizeObserver" in window) {
    new ResizeObserver(setSidebarFlowMode).observe(shell);
  }
  setSidebarFlowMode();
})();
