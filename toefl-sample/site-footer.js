(function () {
  const pageName = window.location.pathname.split("/").pop().toLowerCase();
  if (pageName !== "index.html" || document.querySelector(".qcsite-footer")) return;

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
        <p>PT CEKCEPAT GUNANSA EDUKASI</p>
        <a class="qcsite-footer__contact" href="mailto:support@quickcheck.id">support@quickcheck.id</a>
        <div class="qcsite-footer__payments">
          <h2 id="qcsite-footer-payments-title">Payment Support</h2>
          <ul class="qcsite-footer__payment-list" aria-labelledby="qcsite-footer-payments-title">
            <li class="qcsite-footer__payment qcsite-footer__payment--wide"><img src="../asset/icon/payment/Logo_QRIS.svg.webp" alt="QRIS" decoding="async"></li>
            <li class="qcsite-footer__payment"><img src="../asset/icon/payment/Paypal_2014_logo.png" alt="PayPal" decoding="async"></li>
            <li class="qcsite-footer__payment"><img src="../asset/icon/payment/Mastercard-logo.svg.webp" alt="Mastercard" decoding="async"></li>
            <li class="qcsite-footer__payment"><img src="../asset/icon/payment/American_Express_logo_(2018).svg" alt="American Express" decoding="async"></li>
          </ul>
        </div>
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
  const mount = document.getElementById("qcsite-footer-mount");
  if (!mount) {
    throw new Error("Footer mount point is missing from the dashboard page.");
  }
  footer.classList.add("qcsite-footer--dashboard");
  mount.appendChild(footer);
})();
