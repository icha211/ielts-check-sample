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
        this.apiKey = localStorage.getItem(this.apiKeyStorageKey) || 
                      sessionStorage.getItem(this.apiKeyStorageKey);

        if (!this.apiKey) {
            console.warn("[Section2ReviewExplainer] No Gemini API key found. Set it via localStorage or show config prompt.");
            this._setupConfigPrompt();
            return;
        }

        this.isInitialized = true;
        console.log("[Section2ReviewExplainer] Initialized with Gemini API");
        
        // Watch for question changes and generate explanations
        this._watchQuestionChanges();
    }

    /**
     * Setup configuration prompt if no API key
     */
    static _setupConfigPrompt() {
        const key = prompt(
            "🔑 Enter your Google Gemini API key to enable AI explanations:\n\n" +
            "Get one from: https://aistudio.google.com/app/apikey\n\n" +
            "Format: AIza..."
        );

        if (key) {
            localStorage.setItem(this.apiKeyStorageKey, key);
            this.apiKey = key;
            this.isInitialized = true;
            console.log("[Section2ReviewExplainer] API key saved and initialized");
            location.reload();
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
        return `q_${question.number || question.questionText.substring(0, 30)}`;
    }

    /**
     * Generate explanation via Gemini API
     */
    static async _generateExplanation(question) {
        const questionData = {
            questionText: question.questionText,
            options: question.options || {},
            correctAnswer: question.correctAnswer
        };

        return await Section2GeminiExplainer.generateExplanation(questionData);
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
        if (!key) {
            console.error("[Section2ReviewExplainer] API key cannot be empty");
            return false;
        }

        localStorage.setItem(this.apiKeyStorageKey, key);
        this.apiKey = key;
        this.isInitialized = true;
        console.log("[Section2ReviewExplainer] API key updated");
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
        console.log("[Section2ReviewExplainer] API key cleared");
    }

    /**
     * Get current API key status
     */
    static getStatus() {
        return {
            initialized: this.isInitialized,
            hasApiKey: !!this.apiKey,
            cacheSize: Object.keys(this.explanationCache).length
        };
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
