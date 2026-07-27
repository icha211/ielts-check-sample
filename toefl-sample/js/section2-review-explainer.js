/**
 * Section 2 Gemini Explainer Integration
 * Integrates with section 2-answered.html to display inline QC C.O.R.E ANALYSIS
 * 
 * This script:
 * 1. Detects when a question is displayed
 * 2. Automatically generates explanation using Gemini
 * 3. Injects inline expandable panel below question options
 * 4. Handles API key from localStorage or sessionStorage
 */

class Section2ReviewExplainer {
    static apiKey = null;
    static isInitialized = false;
    static explanationCache = {};
    static apiKeyStorageKey = "toefl_section2_gemini_api_key";

    /**
     * Initialize the explainer
     */
    static init() {
        // Try to get API key from localStorage or sessionStorage
        // Check both old key name and new key name for compatibility
        this.apiKey = localStorage.getItem("toefl_gemini_api_key") ||  // Existing key name
                      localStorage.getItem(this.apiKeyStorageKey) || 
                      sessionStorage.getItem(this.apiKeyStorageKey);

        if (!this.apiKey) {
            console.warn("[Section2ReviewExplainer] No Gemini API key found.");
            console.info("[Section2ReviewExplainer] Set key using: localStorage.setItem('toefl_gemini_api_key', 'YOUR_KEY')");
            this._setupConfigPrompt();
            return;
        }

        this.isInitialized = true;
        console.log("[Section2ReviewExplainer] ✅ Initialized with Gemini API");
        
        // Watch for question changes and generate explanations
        this._watchQuestionChanges();
    }

    /**
     * Manually set API key
     */
    static setApiKey(key) {
        if (!key || typeof key !== 'string' || key.trim() === '') {
            console.error("[Section2ReviewExplainer] Invalid API key");
            return;
        }
        
        const trimmedKey = key.trim();
        localStorage.setItem(this.apiKeyStorageKey, trimmedKey);
        this.apiKey = trimmedKey;
        this.isInitialized = true;
        
        console.log("[Section2ReviewExplainer] ✅ API key set successfully");
        console.log("[Section2ReviewExplainer] Reloading page to initialize...");
        
        // Reload page to trigger explanation generation
        setTimeout(() => {
            location.reload();
        }, 500);
    }

    /**
     * Clear API key
     */
    static clearApiKey() {
        localStorage.removeItem(this.apiKeyStorageKey);
        sessionStorage.removeItem(this.apiKeyStorageKey);
        this.apiKey = null;
        this.isInitialized = false;
        console.log("[Section2ReviewExplainer] API key cleared");
    }

    /**
     * Setup configuration prompt if no API key
     */
    static _setupConfigPrompt() {
        const key = prompt(
            "🔑 Enter your Google Gemini API key to enable AI explanations:\n\n" +
            "Get free key from: https://aistudio.google.com/app/apikey\n\n" +
            "Example format: AIzaXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        );

        if (key && key.trim()) {
            this.setApiKey(key.trim());
        } else {
            console.warn("[Section2ReviewExplainer] API key entry cancelled. Explanations will not generate.");
            console.info("[Section2ReviewExplainer] To enable later, run: Section2ReviewExplainer.setApiKey('YOUR_KEY')");
        }
    }

    /**
     * Watch for question changes on the page
     */
    static _watchQuestionChanges() {
        // Listen to global function calls that change questions
        const originalGoToQuestion = window.goToReviewQuestion;
        const self = this;

        if (originalGoToQuestion) {
            window.goToReviewQuestion = function(index) {
                originalGoToQuestion.call(this, index);
                // Generate explanation after question loads
                setTimeout(() => self._generateForCurrentQuestion(), 200);
            };
        }

        // Also hook into next/previous buttons
        const originalNext = window.goToNextReviewQuestion;
        if (originalNext) {
            window.goToNextReviewQuestion = function() {
                originalNext.call(this);
                setTimeout(() => self._generateForCurrentQuestion(), 200);
            };
        }

        const originalPrev = window.goToPreviousReviewQuestion;
        if (originalPrev) {
            window.goToPreviousReviewQuestion = function() {
                originalPrev.call(this);
                setTimeout(() => self._generateForCurrentQuestion(), 200);
            };
        }

        // Generate for initial question
        setTimeout(() => this._generateForCurrentQuestion(), 500);
    }

    /**
     * Generate explanation for currently displayed question
     */
    static _generateForCurrentQuestion() {
        if (!this.isInitialized || !window.reviewCurrentQuestion) {
            return;
        }

        const question = window.reviewCurrentQuestion;
        const questionKey = this._makeQuestionKey(question);

        // Check cache first
        if (this.explanationCache[questionKey]) {
            this._injectExplanation(question, this.explanationCache[questionKey]);
            return;
        }

        // Generate new explanation
        this._generateExplanation(question).then((explanation) => {
            if (explanation) {
                this.explanationCache[questionKey] = explanation;
                this._injectExplanation(question, explanation);
            }
        }).catch((error) => {
            console.error("[Section2ReviewExplainer] Generation error:", error);
            this._injectErrorExplanation(question, error);
        });
    }

    /**
     * Make cache key from question
     */
    static _makeQuestionKey(question) {
        // Use question number for most reliable key
        if (question.number) {
            return `q_${question.number}`;
        }
        // Fallback to first 50 chars of text
        const textKey = (question.questionText || '').substring(0, 50).replace(/\s+/g, '_');
        return `q_text_${textKey}`;
    }

    /**
     * Clear explanation cache
     */
    static clearCache() {
        this.explanationCache = {};
        console.log("[Section2ReviewExplainer] Cache cleared");
    }

    /**
     * Generate explanation via Gemini API
     */
    static async _generateExplanation(question) {
        if (!this.apiKey) {
            throw new Error("Gemini API key not configured");
        }

        const questionData = {
            questionText: question.questionText,
            options: question.options || {},
            correctAnswer: question.correctAnswer
        };

        return await Section2GeminiExplainer.generateExplanation(questionData, this.apiKey);
    }

    /**
     * Inject explanation into page
     */
    static _injectExplanation(question, explanation) {
        // Remove existing explanation if present
        this._removeExistingExplanation();

        // Create and inject container
        const container = this._createExplanationContainer(explanation);
        
        // Find the right place to inject (after options)
        const optionsSection = document.querySelector(".section2-options") ||
                              document.querySelector(".question-options");
        
        if (optionsSection) {
            optionsSection.insertAdjacentElement("afterend", container);
        } else {
            // Fallback: inject after tab content
            const tabContent = document.querySelector(".explaination-figma");
            if (tabContent) {
                tabContent.appendChild(container);
            }
        }
    }

    /**
     * Inject error message
     */
    static _injectErrorExplanation(question, error) {
        this._removeExistingExplanation();
        
        const container = document.createElement("div");
        container.className = "section2-explanation-error";
        container.innerHTML = `
            <div style="
                padding: 16px;
                background: #fef2f2;
                border: 1px solid #fecaca;
                border-radius: 8px;
                color: #7f1d1d;
                margin-top: 16px;
            ">
                <strong>⚠ Explanation Error:</strong><br>
                ${error.message}
            </div>
        `;

        const tabContent = document.querySelector(".explaination-figma");
        if (tabContent) {
            tabContent.appendChild(container);
        }
    }

    /**
     * Remove existing explanation
     */
    static _removeExistingExplanation() {
        const existing = document.querySelector(".section2-explanation-container") ||
                        document.querySelector(".section2-explanation-error");
        if (existing) {
            existing.remove();
        }
    }

    /**
     * Create explanation container (expandable)
     */
    static _createExplanationContainer(explanation) {
        const container = document.createElement("div");
        container.className = "section2-explanation-container";
        
        const isExpanded = false;
        const html = Section2GeminiExplainer._formatExplanationHTML(explanation);

        container.innerHTML = `
            <div style="margin-top: 16px;">
                <div class="section2-explanation-header" style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 12px 16px;
                    border-radius: 8px 8px 0 0;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    user-select: none;
                ">
                    <div style="display: flex; align-items: center; gap: 8px; font-weight: 600;">
                        <span style="font-size: 18px;">💡</span>
                        <span>QC C.O.R.E ANALYSIS</span>
                    </div>
                    <span class="toggle-icon" style="font-size: 18px; transition: transform 0.3s;">▼</span>
                </div>
                <div class="section2-explanation-content" style="
                    display: none;
                    padding: 16px;
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-top: none;
                    border-radius: 0 0 8px 8px;
                ">
                    ${html}
                </div>
            </div>
        `;

        // Setup click handler
        const header = container.querySelector(".section2-explanation-header");
        const content = container.querySelector(".section2-explanation-content");
        const toggleIcon = container.querySelector(".toggle-icon");

        header.addEventListener("click", () => {
            const isVisible = content.style.display === "block";
            if (isVisible) {
                content.style.display = "none";
                toggleIcon.style.transform = "rotate(0deg)";
            } else {
                content.style.display = "block";
                toggleIcon.style.transform = "rotate(180deg)";
            }
        });

        return container;
    }

    /**
     * Set API key manually
     */
    static setApiKey(key) {
        if (!key || typeof key !== 'string' || key.trim() === '') {
            console.error("[Section2ReviewExplainer] Invalid API key");
            return false;
        }
        
        const trimmedKey = key.trim();
        localStorage.setItem(this.apiKeyStorageKey, trimmedKey);
        this.apiKey = trimmedKey;
        this.isInitialized = true;
        
        console.log("[Section2ReviewExplainer] ✅ API key set successfully");
        console.log("[Section2ReviewExplainer] Reloading page to initialize...");
        
        // Reload page to trigger explanation generation
        setTimeout(() => {
            location.reload();
        }, 500);
        return true;
    }

    /**
     * Clear API key
     */
    static clearApiKey() {
        localStorage.removeItem(this.apiKeyStorageKey);
        sessionStorage.removeItem(this.apiKeyStorageKey);
        this.apiKey = null;
        this.isInitialized = false;
        console.log("[Section2ReviewExplainer] ✅ API key cleared");
    }

    /**
     * Get current API key status
     */
    static getStatus() {
        return {
            initialized: this.isInitialized,
            hasApiKey: !!this.apiKey,
            cacheSize: Object.keys(this.explanationCache).length,
            apiKeyStorageKey: this.apiKeyStorageKey
        };
    }

    /**
     * Debug: Show setup instructions
     */
    static showSetupInstructions() {
        console.log(`
╔════════════════════════════════════════════════════════════════╗
║         Section 2 Gemini Explainer - Setup Instructions        ║
╚════════════════════════════════════════════════════════════════╝

📌 STATUS: ${this.isInitialized ? '✅ Initialized' : '❌ Not Initialized'}
🔑 API Key: ${this.apiKey ? '✅ Configured' : '❌ Not Configured'}
💾 Cache Size: ${Object.keys(this.explanationCache).length} questions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 QUICK START:

1️⃣  Get a free API key:
    https://aistudio.google.com/app/apikey

2️⃣  Set it in console:
    Section2ReviewExplainer.setApiKey("AIza...")

3️⃣  Reload page and navigate to a question

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚙️  COMMANDS:

setApiKey(key)       - Set API key and reload
clearApiKey()        - Remove API key
getStatus()          - Show current status
showSetupInstructions() - Show this help

        `);
    }
}

// Auto-initialize on page load
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        Section2ReviewExplainer.init();
    });
} else {
    Section2ReviewExplainer.init();
}

// Expose globally for debugging
window.Section2ReviewExplainer = Section2ReviewExplainer;
