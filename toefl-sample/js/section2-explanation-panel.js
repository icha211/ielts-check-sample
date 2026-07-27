/**
 * Section 2 Explanation Generator UI Panel
 * Integrates into developer.js for auto-generating explanations
 * 
 * This module provides UI controls for developers to:
 * 1. Configure API key (Claude)
 * 2. Generate explanations with a single click
 * 3. Preview and store explanations
 * 4. Non-blocking, graceful error handling
 */

class Section2ExplanationPanel {
    static panelId = "section2-explanation-panel";
    static modalId = "section2-explanation-modal";
    static apiKeyStorageKey = "toefl_dev_section2_api_key";
    static isGenerating = false;

    /**
     * Initialize the panel in developer dashboard
     * Should be called during developer.js initialization
     */
    static init() {
        // Create styles
        this._injectStyles();
        
        // Hook into developer panel
        document.addEventListener("DOMContentLoaded", () => {
            this._setupPanel();
            this._setupModal();
        });
    }

    /**
     * Inject CSS styles
     */
    static _injectStyles() {
        const styles = `
        .section2-explanation-panel {
            margin-top: 20px;
            padding: 16px;
            background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
            border-radius: 8px;
            border: 1px solid #667eea30;
        }

        .section2-explanation-title {
            font-size: 14px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .section2-explanation-controls {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-bottom: 12px;
        }

        .section2-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .section2-btn-primary {
            background: #667eea;
            color: white;
        }

        .section2-btn-primary:hover:not(:disabled) {
            background: #5568d3;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .section2-btn-secondary {
            background: #e5e7eb;
            color: #374151;
        }

        .section2-btn-secondary:hover:not(:disabled) {
            background: #d1d5db;
        }

        .section2-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .section2-btn .spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .section2-api-status {
            font-size: 12px;
            color: #666;
            margin-top: 8px;
        }

        .section2-api-status.configured {
            color: #10b981;
        }

        .section2-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            align-items: center;
            justify-content: center;
        }

        .section2-modal.show {
            display: flex;
        }

        .section2-modal-content {
            background: white;
            border-radius: 12px;
            padding: 24px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .section2-modal-header {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 16px;
            color: #1f2937;
        }

        .section2-form-group {
            margin-bottom: 16px;
        }

        .section2-form-label {
            font-size: 13px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 6px;
            display: block;
        }

        .section2-form-input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 13px;
            font-family: monospace;
        }

        .section2-form-input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .section2-form-hint {
            font-size: 12px;
            color: #666;
            margin-top: 4px;
        }

        .section2-modal-actions {
            display: flex;
            gap: 8px;
            margin-top: 20px;
        }

        .section2-modal-actions button {
            flex: 1;
            padding: 10px 16px;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }

        .section2-modal-actions .btn-save {
            background: #667eea;
            color: white;
        }

        .section2-modal-actions .btn-save:hover {
            background: #5568d3;
        }

        .section2-modal-actions .btn-cancel {
            background: #e5e7eb;
            color: #374151;
        }

        .section2-modal-actions .btn-cancel:hover {
            background: #d1d5db;
        }

        .section2-result {
            padding: 16px;
            background: #f0fdf4;
            border-radius: 6px;
            border-left: 4px solid #10b981;
            font-size: 13px;
            color: #065f46;
            margin-top: 12px;
        }

        .section2-result.error {
            background: #fef2f2;
            border-left-color: #dc2626;
            color: #7f1d1d;
        }
        `;

        const styleTag = document.createElement("style");
        styleTag.textContent = styles;
        document.head.appendChild(styleTag);
    }

    /**
     * Setup the main panel
     */
    static _setupPanel() {
        // Find where to insert the panel (after API Gateway section)
        const apiGatewaySection = document.getElementById("apiGatewaySection");
        if (!apiGatewaySection) return;

        const panelHtml = `
        <div id="${this.panelId}" class="section2-explanation-panel">
            <div class="section2-explanation-title">
                ✨ Section 2 Part A - Explanation Generator
            </div>
            <div class="section2-explanation-controls">
                <button class="section2-btn section2-btn-primary" id="section2-config-btn" onclick="Section2ExplanationPanel.openConfigModal()">
                    ⚙️ Configure API Key
                </button>
                <button class="section2-btn section2-btn-primary" id="section2-generate-btn" onclick="Section2ExplanationPanel.generateExplanation()">
                    🚀 Generate Explanation
                </button>
            </div>
            <div class="section2-api-status" id="section2-api-status">
                Status: Not configured
            </div>
        </div>
        `;

        apiGatewaySection.insertAdjacentHTML("afterend", panelHtml);
        this._updateApiStatus();
    }

    /**
     * Setup the configuration modal
     */
    static _setupModal() {
        const modalHtml = `
        <div id="${this.modalId}" class="section2-modal">
            <div class="section2-modal-content">
                <div class="section2-modal-header">Configure Claude API Key</div>
                
                <div class="section2-form-group">
                    <label class="section2-form-label">Claude API Key</label>
                    <input 
                        type="password" 
                        id="section2-api-key-input" 
                        class="section2-form-input"
                        placeholder="sk-ant-..."
                    >
                    <div class="section2-form-hint">
                        Get your API key from <a href="https://console.anthropic.com/" target="_blank" style="color: #667eea;">console.anthropic.com</a>
                    </div>
                </div>

                <div class="section2-form-group">
                    <label class="section2-form-label">How it works</label>
                    <div class="section2-form-hint" style="line-height: 1.6;">
                        • Input a Section 2 Part A question with options<br>
                        • Click "Generate Explanation"<br>
                        • AI generates QC C.O.R.E ANALYSIS framework<br>
                        • Preview and save to your draft
                    </div>
                </div>

                <div class="section2-modal-actions">
                    <button class="btn-save" onclick="Section2ExplanationPanel.saveApiKey()">Save Key</button>
                    <button class="btn-cancel" onclick="Section2ExplanationPanel.closeConfigModal()">Cancel</button>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML("beforeend", modalHtml);
    }

    /**
     * Open configuration modal
     */
    static openConfigModal() {
        const modal = document.getElementById(this.modalId);
        const input = document.getElementById("section2-api-key-input");
        
        // Pre-fill existing key (masked)
        const existingKey = localStorage.getItem(this.apiKeyStorageKey);
        if (existingKey) {
            input.value = existingKey;
        }
        
        modal.classList.add("show");
    }

    /**
     * Close configuration modal
     */
    static closeConfigModal() {
        const modal = document.getElementById(this.modalId);
        modal.classList.remove("show");
    }

    /**
     * Save API key
     */
    static saveApiKey() {
        const input = document.getElementById("section2-api-key-input");
        const apiKey = input.value.trim();

        if (!apiKey) {
            alert("Please enter an API key");
            return;
        }

        if (!apiKey.startsWith("sk-ant-")) {
            alert("Invalid API key format. Should start with 'sk-ant-'");
            return;
        }

        localStorage.setItem(this.apiKeyStorageKey, apiKey);
        this._updateApiStatus();
        this.closeConfigModal();
        alert("✓ API key saved successfully!");
    }

    /**
     * Update API status indicator
     */
    static _updateApiStatus() {
        const statusEl = document.getElementById("section2-api-status");
        const apiKey = localStorage.getItem(this.apiKeyStorageKey);

        if (apiKey) {
            statusEl.textContent = "✓ API Key configured (Claude ready)";
            statusEl.classList.add("configured");
        } else {
            statusEl.textContent = "⚠ API Key not configured";
            statusEl.classList.remove("configured");
        }
    }

    /**
     * Generate explanation (main function)
     */
    static async generateExplanation() {
        const apiKey = localStorage.getItem(this.apiKeyStorageKey);
        if (!apiKey) {
            alert("Please configure your API key first");
            this.openConfigModal();
            return;
        }

        // Show prompt for question data
        const questionData = this._promptForQuestionData();
        if (!questionData) return;

        const btn = document.getElementById("section2-generate-btn");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Generating...';
        this.isGenerating = true;

        try {
            // Generate explanation
            const explanation = await Section2AIExplanationGenerator.generateExplanation(questionData, apiKey);
            
            // Format as HTML
            const html = Section2AIExplanationGenerator.formatExplanationHTML(explanation);
            
            // Store in draft
            this._storeExplanationDraft(explanation, html);
            
            // Show result
            const resultPanel = document.getElementById("section2-result") || 
                document.createElement("div");
            resultPanel.id = "section2-result";
            resultPanel.className = "section2-result";
            resultPanel.innerHTML = `
                ✓ Explanation generated successfully!<br>
                <strong>Concept:</strong> ${explanation.concept}<br>
                <strong>Formula:</strong> ${explanation.sentenceFormula}
            `;
            
            btn.parentElement.insertAdjacentElement("afterend", resultPanel);
            
            // Show preview
            setTimeout(() => {
                this._showExplanationPreview(html);
            }, 500);

        } catch (error) {
            console.error("[Section2ExplanationPanel] Error:", error);
            
            const errorPanel = document.getElementById("section2-result") || 
                document.createElement("div");
            errorPanel.id = "section2-result";
            errorPanel.className = "section2-result error";
            errorPanel.innerHTML = `✗ Error: ${error.message}`;
            
            btn.parentElement.insertAdjacentElement("afterend", errorPanel);
            
        } finally {
            btn.disabled = false;
            btn.innerHTML = '🚀 Generate Explanation';
            this.isGenerating = false;
        }
    }

    /**
     * Prompt developer for question data
     */
    static _promptForQuestionData() {
        // Simple JSON input for now
        const jsonInput = prompt(
            `Enter question data as JSON:\n\n` +
            `{\n` +
            `  "questionText": "The discovery of insulin _____ a major breakthrough...",\n` +
            `  "options": {\n` +
            `    "A": "represented",\n` +
            `    "B": "representing",\n` +
            `    "C": "is represented",\n` +
            `    "D": "has been represented"\n` +
            `  },\n` +
            `  "correctAnswer": "A",\n` +
            `  "context": "Optional additional context"\n` +
            `}`
        );

        if (!jsonInput) return null;

        try {
            return JSON.parse(jsonInput);
        } catch (e) {
            alert("Invalid JSON format: " + e.message);
            return null;
        }
    }

    /**
     * Store explanation in draft data
     */
    static _storeExplanationDraft(explanation, html) {
        // Store for later retrieval
        const draft = {
            explanation,
            html,
            generatedAt: new Date().toISOString()
        };

        const draftKey = "section2_latest_explanation";
        sessionStorage.setItem(draftKey, JSON.stringify(draft));
    }

    /**
     * Show explanation preview
     */
    static _showExplanationPreview(html) {
        // Create preview modal
        const previewHtml = `
        <div class="section2-modal show" style="z-index: 10001;">
            <div class="section2-modal-content" style="max-height: 90vh;">
                <div class="section2-modal-header">
                    Explanation Preview
                    <button onclick="this.closest('.section2-modal').remove()" 
                        style="float: right; background: none; border: none; font-size: 20px; cursor: pointer;">
                        ✕
                    </button>
                </div>
                <div style="margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; background: #f9fafb;">
                    ${html}
                </div>
                <div style="text-align: center;">
                    <p style="font-size: 12px; color: #666;">Copy the HTML above and paste it into your draft explanation</p>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML("beforeend", previewHtml);
    }
}

// Auto-initialize when page loads
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => Section2ExplanationPanel.init());
} else {
    Section2ExplanationPanel.init();
}
