(function () {
  const pageName = window.location.pathname.split("/").pop().toLowerCase();
  const isDashboard = pageName === "" || pageName === "index.html";
  if (!isDashboard || document.querySelector(".qcsite-footer")) return;

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "site-footer.css?v=20261029-social";
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
        <h2 class="qcsite-footer__contact-title">Contact Support:</h2>
        <p class="qcsite-footer__contact-line">
          <a class="qcsite-footer__contact" href="mailto:support@quickcheck.id">support@quickcheck.id</a>
          <a class="qcsite-footer__contact" href="tel:+622112345678">+62 21 1234 5678</a>
        </p>
        <ul class="qcsite-footer__social" aria-label="Social media">
          <li><span role="img" aria-label="LinkedIn"><i data-lucide="linkedin" aria-hidden="true"></i></span></li>
          <li><span role="img" aria-label="Instagram"><i data-lucide="instagram" aria-hidden="true"></i></span></li>
          <li><span role="img" aria-label="Facebook"><i data-lucide="facebook" aria-hidden="true"></i></span></li>
        </ul>
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
        <ul class="qcsite-footer__legal-links">
          <li><a href="mailto:support@quickcheck.id?subject=Terms%20of%20Service"><i data-lucide="shield-check" aria-hidden="true"></i>Terms of Service</a></li>
          <li><a href="mailto:support@quickcheck.id?subject=Privacy%20Policy"><i data-lucide="file-lock-2" aria-hidden="true"></i>Privacy Policy</a></li>
          <li><a href="mailto:support@quickcheck.id?subject=Refund%20and%20Cancellation%20Policy"><i data-lucide="hand-coins" aria-hidden="true"></i>Refund &amp; Cancellation Policy</a></li>
          <li><a href="#qcsite-footer-disclaimer"><i data-lucide="file-text" aria-hidden="true"></i>Trademark Disclaimer</a></li>
        </ul>
        <ul class="qcsite-footer__badges" aria-label="Security certifications">
          <li><img src="../asset/icon/legal/Payment%20security%20certification.png" alt="PCI-DSS compliant payment processing" width="285" height="72" decoding="async"></li>
          <li><img src="../asset/icon/legal/Secure%20checkout%20certification.png" alt="SSL secured checkout" width="201" height="72" decoding="async"></li>
          <li><img src="../asset/icon/legal/Encryption%20badge.png" alt="256-bit encryption" width="285" height="72" decoding="async"></li>
        </ul>
        <img class="qcsite-footer__pse" src="../asset/icon/legal/PSE%20registration.png" alt="Terdaftar PSE, Komunikasi dan Digital RI" width="504" height="126" decoding="async">
      </section>
    </div>

    <div class="qcsite-footer__bottom">
      <ul class="qcsite-footer__payment-list" aria-label="Accepted payment methods">
        <li class="qcsite-footer__payment qcsite-footer__payment--wide"><img src="../asset/icon/payment/Logo_QRIS.svg.webp" alt="QRIS" decoding="async"></li>
        <li class="qcsite-footer__payment"><img src="../asset/icon/payment/Paypal_2014_logo.png" alt="PayPal" decoding="async"></li>
        <li class="qcsite-footer__payment"><img src="../asset/icon/payment/Mastercard-logo.svg.webp" alt="Mastercard" decoding="async"></li>
        <li class="qcsite-footer__payment"><img src="../asset/icon/payment/American_Express_logo_(2018).svg" alt="American Express" decoding="async"></li>
      </ul>
      <p class="qcsite-footer__disclaimer" id="qcsite-footer-disclaimer">TOEFL&reg; and IELTS&reg; are registered trademarks of their respective owners. Quick Check is not affiliated with, approved by, or endorsed by ETS or Cambridge Assessment.</p>
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
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.5 } });
})();
