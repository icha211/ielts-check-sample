(function () {
  const COLORS = [
    "#F8F8F8", "rgba(78,115,248,0.08)", "rgba(244,60,60,0.08)", "rgba(252,165,73,0.08)", "rgba(7,162,135,0.08)", "rgba(255,75,110,0.08)", "rgba(85,82,217,0.08)",
    "#F1F2F3", "rgba(78,115,248,0.24)", "rgba(244,60,60,0.24)", "rgba(252,165,73,0.24)", "rgba(7,162,135,0.2)", "rgba(255,75,110,0.24)", "rgba(85,82,217,0.24)",
    "#E1E3E6", "rgba(78,115,248,0.4)", "rgba(244,60,60,0.4)", "rgba(252,165,73,0.4)", "rgba(7,162,135,0.45)", "rgba(255,75,110,0.4)", "rgba(85,82,217,0.4)",
    "#C3C7CE", "rgba(78,115,248,0.64)", "rgba(244,60,60,0.64)", "rgba(252,165,73,0.64)", "rgba(7,162,135,0.64)", "rgba(255,75,110,0.64)", "rgba(85,82,217,0.64)",
    "#757D8A", "#4E73F8", "#F43C3C", "#FCA549", "#07A287", "#FF4B6E", "#5552D9",
    "#5A6474", "#3C64F4", "#EF2C2C", "#F39531", "#0C977F", "#EC234A", "#4D4AC8"
  ];

  const STYLE_ID = "rich-editor-color-palette-style";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .toolbar-color-input {
        position: absolute !important;
        width: 0 !important;
        height: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .toolbar-color-btn {
        width: 36px;
        height: 32px;
        border: 1px solid var(--border, #d0d7de);
        border-radius: 8px;
        background: #fff;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }
      .color-preview-circle {
        width: 16px;
        height: 16px;
        border-radius: 999px;
        border: 1px solid rgba(0, 0, 0, 0.18);
        background: #000000;
      }
      .toolbar-color-btn:hover {
        background: #f0f4f2;
        border-color: var(--teal2, #0f766e);
      }
      .toolbar-pop {
        position: relative;
      }
      .toolbar-pop-panel {
        position: absolute;
        top: 38px;
        left: 0;
        display: none;
        background: #fff;
        border: 1px solid var(--border, #d0d7de);
        border-radius: 12px;
        box-shadow: 0 16px 30px rgba(15, 23, 42, 0.12);
        padding: 10px;
        z-index: 15;
      }
      .toolbar-pop.open .toolbar-pop-panel {
        display: block;
      }
      .color-palette-panel {
        min-width: 220px;
        max-width: min(280px, calc(100vw - 32px));
        max-height: 180px;
        overflow: auto;
        left: auto;
        right: 0;
      }
      .color-swatch-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 5px;
      }
      .color-swatch {
        width: 24px;
        height: 24px;
        border-radius: 4px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        cursor: pointer;
        transition: transform 0.15s ease;
        padding: 0;
      }
      .color-swatch:hover {
        transform: scale(1.08);
      }
    `;
    document.head.appendChild(style);
  }

  function buildSwatches(target) {
    return COLORS.map((color) => `<button type="button" class="color-swatch" data-color-target="${target}" data-color-value="${color}" style="background:${color}" title="${color}"></button>`).join("");
  }

  function createControl(input, iconType, toolbar) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toolbar-color-btn";
    button.dataset.paletteButton = iconType;
    button.innerHTML = `<span class="color-preview-circle"></span>`;

    const panel = document.createElement("div");
    panel.className = "toolbar-pop-panel color-palette-panel";
    panel.innerHTML = `<div class="color-swatch-grid">${buildSwatches(iconType)}</div>`;

    const wrap = document.createElement("div");
    wrap.className = "toolbar-pop";
    wrap.style.display = "inline-flex";
    wrap.style.gap = "6px";
    wrap.style.alignItems = "center";
    wrap.appendChild(button);
    wrap.appendChild(panel);

    const updatePreview = () => {
      const defaultValue = iconType === "bg" ? "#FCA549" : "#5A6474";
      const value = COLORS.includes(input.value) ? input.value : defaultValue;
      input.value = value;
      const previewCircle = button.querySelector(".color-preview-circle");
      if (previewCircle) previewCircle.style.backgroundColor = value;
    };

    button.addEventListener("click", (event) => {
      event.preventDefault();
      const willOpen = panel.style.display !== "block";
      toolbar.querySelectorAll(".toolbar-pop-panel.color-palette-panel").forEach((otherPanel) => {
        otherPanel.style.display = "none";
      });
      panel.style.display = willOpen ? "block" : "none";
    });

    panel.querySelectorAll(".color-swatch").forEach((swatch) => {
      swatch.addEventListener("click", () => {
        const color = swatch.dataset.colorValue;
        input.value = color;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        updatePreview();
        panel.style.display = "none";
      });
    });

    input.addEventListener("change", updatePreview);
    updatePreview();
    input.replaceWith(wrap);
  }

  function getHighlightIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M11.096.644a2 2 0 0 1 2.791.036l1.433 1.433a2 2 0 0 1 .035 2.791l-.413.435-8.07 8.995a.5.5 0 0 1-.372.166h-3a.5.5 0 0 1-.234-.058l-.412.412A.5.5 0 0 1 2.5 15h-2a.5.5 0 0 1-.354-.854l1.412-1.412A.5.5 0 0 1 1.5 12.5v-3a.5.5 0 0 1 .166-.372l8.995-8.07zm-.115 1.47L2.727 9.52l3.753 3.753 7.406-8.254zm3.585 2.17.064-.068a1 1 0 0 0-.017-1.396L13.18 1.387a1 1 0 0 0-1.396-.018l-.068.065zM5.293 13.5 2.5 10.707v1.586L3.707 13.5z"/></svg>';
  }

  function enhanceToolbar(toolbar) {
    if (toolbar.dataset.paletteEnhanced === "true") return;
    const colorInputs = Array.from(toolbar.querySelectorAll('input[type="color"]'));
    if (!colorInputs.length) return;
    toolbar.dataset.paletteEnhanced = "true";

    colorInputs.forEach((input) => {
      const isBackground = /bgcolor/i.test(input.id || "") || /highlight/i.test(input.title || "");
      createControl(input, isBackground ? "bg" : "text", toolbar);
    });

    document.addEventListener("click", (event) => {
      if (toolbar.contains(event.target)) return;
      toolbar.querySelectorAll(".toolbar-pop-panel.color-palette-panel").forEach((panel) => {
        panel.style.display = "none";
      });
    });
  }

  function run() {
    ensureStyles();
    document.querySelectorAll(".rich-editor-toolbar").forEach(enhanceToolbar);
  }

  function observeToolbars() {
    if (window.__richEditorPaletteObserver) return;
    window.__richEditorPaletteObserver = true;
    const observer = new MutationObserver(() => {
      document.querySelectorAll(".rich-editor-toolbar").forEach(enhanceToolbar);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  observeToolbars();
})();
