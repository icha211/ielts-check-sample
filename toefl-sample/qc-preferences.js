/* Site-wide display preferences (theme + language). Load synchronously in <head> so the theme applies before first paint.
 *
 * Theme: html[data-theme="light"|"dark"] (resolved value), stored as qc_theme = light | dark | system.
 * Language: html[lang="en"|"id"], stored as qc_lang.
 *
 * Translation: English source text is the dictionary key.
 *   <span data-i18n>Log out</span>                       -> textContent translated
 *   <button data-i18n-attr="aria-label,title">           -> listed attributes translated (their English value is the key)
 *   QCPrefs.t("Goal {n}", { n: 550 })                    -> for strings built in JavaScript
 * Elements whose text is rewritten by JavaScript must use QCPrefs.t() instead of data-i18n.
 * Listen for window "qc:langchange" / "qc:themechange" to re-render dynamic text.
 */
(() => {
  if (window.QCPrefs) return;

  const THEME_KEY = "qc_theme";
  const LANG_KEY = "qc_lang";
  const THEMES = ["light", "dark", "system"];
  const LANGS = ["en", "id"];
  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  const read = (key, allowed, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return allowed.includes(value) ? value : fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
  };

  const ID = {
    // Navbar + sidebar + dock
    "TOEFL ITP Dashboard": "Dasbor TOEFL ITP",
    "English Materials": "Materi Bahasa Inggris",
    "Upgrade": "Tingkatkan",
    "Settings": "Pengaturan",
    "Notifications": "Notifikasi",
    "Sign in to see notifications.": "Masuk untuk melihat notifikasi.",
    "Account menu": "Menu akun",
    "Account": "Akun",
    "You are not signed in": "Anda belum masuk",
    "Sign in to manage your profile.": "Masuk untuk mengelola profil Anda.",
    "Profile": "Profil",
    "Support": "Bantuan",
    "Log out": "Keluar",
    "Sign in": "Masuk",
    "Free": "Gratis",
    "Open menu": "Buka menu",
    "Quick Check dashboard": "Dasbor Quick Check",
    "Main navigation": "Navigasi utama",
    "TOEFL navigation": "Navigasi TOEFL",
    "Collapse sidebar": "Ciutkan sidebar",
    "Expand sidebar": "Lebarkan sidebar",
    "Study Progress": "Progres Belajar",
    "Study progress": "Progres belajar",
    "My Progress": "Progres Saya",
    "Test History": "Riwayat Tes",
    "Social": "Sosial",
    "Message": "Pesan",
    "Messages": "Pesan",
    "Community": "Komunitas",
    "Friends": "Teman",
    "Admin": "Admin",
    "Developer": "Developer",
    "Back to IELTS": "Kembali ke IELTS",
    "Primary": "Utama",
    "Home": "Beranda",
    "Dashboard": "Dasbor",
    "Progress": "Progres",
    "Progress menu": "Menu progres",
    "Social menu": "Menu sosial",
    "Today": "Hari ini",
    "Today, {date}": "Hari ini, {date}",

    // Settings panel
    "Preferences": "Preferensi",
    "Saved on this device": "Tersimpan di perangkat ini",
    "Appearance": "Tampilan",
    "Light": "Terang",
    "Dark": "Gelap",
    "System": "Sistem",
    "Language": "Bahasa",

    // Footer
    "Quick Check contact": "Kontak Quick Check",
    "Quick Check home": "Beranda Quick Check",
    "Contact Support:": "Hubungi Dukungan:",
    "Social media": "Media sosial",
    "Quick Check links": "Tautan Quick Check",
    "Quick Links": "Tautan Cepat",
    "Study Plan": "Rencana Belajar",
    "History": "Riwayat",
    "Products": "Produk",
    "Daily Practice": "Latihan Harian",
    "Full Mock Test": "Tes Simulasi Lengkap",
    "Listening Practice": "Latihan Listening",
    "Structure Practice": "Latihan Structure",
    "Reading Practice": "Latihan Reading",
    "Help Center": "Pusat Bantuan",
    "Contact Support": "Hubungi Dukungan",
    "Legal & Compliance": "Legal & Kepatuhan",
    "Terms of Service": "Ketentuan Layanan",
    "Privacy Policy": "Kebijakan Privasi",
    "Refund & Cancellation Policy": "Kebijakan Pengembalian Dana & Pembatalan",
    "Trademark Disclaimer": "Penafian Merek Dagang",
    "Security certifications": "Sertifikasi keamanan",
    "Accepted payment methods": "Metode pembayaran yang diterima",
    "TOEFL® and IELTS® are registered trademarks of their respective owners. Quick Check is not affiliated with, approved by, or endorsed by ETS or Cambridge Assessment.":
      "TOEFL® dan IELTS® adalah merek dagang terdaftar milik pemiliknya masing-masing. Quick Check tidak berafiliasi dengan, disetujui oleh, atau didukung oleh ETS maupun Cambridge Assessment.",
    "All rights reserved.": "Hak cipta dilindungi."
  };
  const dictionaries = { id: ID };

  let themePref = read(THEME_KEY, THEMES, "light");
  let lang = read(LANG_KEY, LANGS, "en");

  const resolveTheme = () => (themePref === "system" ? (media && media.matches ? "dark" : "light") : themePref);

  const applyTheme = () => {
    const resolved = resolveTheme();
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
  };

  const format = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)) : text);

  const t = (key, vars) => {
    const dict = dictionaries[lang];
    const text = lang !== "en" && dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
    return format(text, vars);
  };

  const translateElement = (el) => {
    if (el.hasAttribute("data-i18n")) {
      if (!el.hasAttribute("data-i18n-en")) el.setAttribute("data-i18n-en", el.textContent.trim());
      const key = el.getAttribute("data-i18n") || el.getAttribute("data-i18n-en");
      el.textContent = t(key);
    }
    const attrs = el.getAttribute("data-i18n-attr");
    if (attrs) {
      attrs.split(",").map((name) => name.trim()).filter(Boolean).forEach((name) => {
        const store = `data-i18n-en-${name}`;
        if (!el.hasAttribute(store)) {
          if (!el.hasAttribute(name)) return;
          el.setAttribute(store, el.getAttribute(name));
        }
        el.setAttribute(name, t(el.getAttribute(store)));
      });
    }
  };

  const apply = (scope = document) => {
    if (scope.nodeType === 1 && (scope.hasAttribute("data-i18n") || scope.hasAttribute("data-i18n-attr"))) translateElement(scope);
    scope.querySelectorAll?.("[data-i18n], [data-i18n-attr]").forEach(translateElement);
  };

  const applyLang = () => {
    root.lang = lang;
    apply(document);
  };

  const setTheme = (value) => {
    if (!THEMES.includes(value)) return;
    themePref = value;
    write(THEME_KEY, value);
    applyTheme();
    window.dispatchEvent(new CustomEvent("qc:themechange", { detail: { preference: themePref, theme: resolveTheme() } }));
  };

  const setLang = (value) => {
    if (!LANGS.includes(value) || value === lang) return;
    lang = value;
    write(LANG_KEY, value);
    applyLang();
    window.dispatchEvent(new CustomEvent("qc:langchange", { detail: { lang } }));
  };

  const addTranslations = (code, entries) => {
    dictionaries[code] = Object.assign(dictionaries[code] || {}, entries);
    if (code === lang && document.body) apply(document);
  };

  media?.addEventListener?.("change", () => {
    if (themePref !== "system") return;
    applyTheme();
    window.dispatchEvent(new CustomEvent("qc:themechange", { detail: { preference: themePref, theme: resolveTheme() } }));
  });

  // Keep preferences in sync across open tabs.
  window.addEventListener("storage", (event) => {
    if (event.key === THEME_KEY) {
      themePref = THEMES.includes(event.newValue) ? event.newValue : "light";
      applyTheme();
      window.dispatchEvent(new CustomEvent("qc:themechange", { detail: { preference: themePref, theme: resolveTheme() } }));
    } else if (event.key === LANG_KEY) {
      lang = LANGS.includes(event.newValue) ? event.newValue : "en";
      applyLang();
      window.dispatchEvent(new CustomEvent("qc:langchange", { detail: { lang } }));
    }
  });

  applyTheme();
  root.lang = lang;

  const startObserver = () => {
    apply(document);
    new MutationObserver((records) => {
      if (lang === "en") return;
      records.forEach((record) => record.addedNodes.forEach((node) => { if (node.nodeType === 1) apply(node); }));
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  else startObserver();

  window.QCPrefs = {
    getTheme: () => themePref,
    getResolvedTheme: resolveTheme,
    setTheme,
    getLang: () => lang,
    setLang,
    locale: () => (lang === "id" ? "id-ID" : "en"),
    t,
    apply,
    addTranslations
  };
})();
