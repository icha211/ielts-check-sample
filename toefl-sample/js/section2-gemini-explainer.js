/**
 * Section 2 Explanation Generator - Gemini AI Integration
 * Auto-generates inline QC C.O.R.E ANALYSIS explanations
 * 
 * Features:
 * - Gemini REST API integration
 * - Inline expandable/collapsible UI
 * - Auto-generate on page load
 * - Standalone module (no dependencies)
 */

class Section2GeminiExplainer {
    static apiKey = null;
    static baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    
    /**
     * Initialize the explainer
     * Call this once on page load
     * @param {String} geminiApiKey - Google Gemini API key
     */
    static init(geminiApiKey) {
        this.apiKey = geminiApiKey;
        if (!this.apiKey) {
            console.warn("[Section2Explainer] No Gemini API key provided");
            return;
        }
        
        // Find all Section 2 questions and generate explanations
        this._processAllQuestions();
    }

    /**
     * Process all questions on the page
     */
    static _processAllQuestions() {
        const questionCards = document.querySelectorAll("[data-question-id]");
        console.log(`[Section2Explainer] Found ${questionCards.length} questions`);
        
        questionCards.forEach((card, index) => {
            const questionId = card.dataset.questionId;
            const questionText = this._extractQuestionText(card);
            const options = this._extractOptions(card);
            const correctAnswer = card.dataset.answer;
            
            if (questionText && options && correctAnswer) {
                this._generateAndInjectExplanation(card, {
                    questionText,
                    options,
                    correctAnswer
                });
            }
        });
    }

    /**
     * Extract question text from card
     */
    static _extractQuestionText(card) {
        const questionEl = card.querySelector(".question-text") || 
                          card.querySelector(".question");
        return questionEl ? questionEl.innerText.trim() : null;
    }

    /**
     * Extract options from card
     */
    static _extractOptions(card) {
        const options = {};
        const optionEls = card.querySelectorAll(".option");
        
        optionEls.forEach((el) => {
            const letter = el.dataset.letter || el.innerText.charAt(0);
            const text = el.innerText.replace(/^[A-D]\.\s*/, "").trim();
            if (letter && text) {
                options[letter] = text;
            }
        });
        
        return Object.keys(options).length === 4 ? options : null;
    }

    /**
     * Generate explanation and inject into page
     */
    static async _generateAndInjectExplanation(questionCard, questionData) {
        const containerId = `explanation_${questionData.questionText.substring(0, 20).replace(/\s+/g, "_")}`;
        
        // Create explanation container
        const container = this._createExplanationContainer(containerId);
        
        // Find where to insert (after options)
        const optionsContainer = questionCard.querySelector(".options") || 
                                questionCard.querySelector(".question-options");
        if (optionsContainer) {
            optionsContainer.insertAdjacentElement("afterend", container);
        } else {
            questionCard.appendChild(container);
        }

        // Generate explanation
        try {
            const explanation = await this.generateExplanation(questionData);
            const html = this._formatExplanationHTML(explanation);
            
            // Inject into container
            const contentDiv = container.querySelector(".explanation-content");
            contentDiv.innerHTML = html;
            
            // Add expand/collapse functionality
            this._setupExpandCollapse(container);
            
        } catch (error) {
            console.error("[Section2Explainer] Generation error:", error);
            const contentDiv = container.querySelector(".explanation-content");
            contentDiv.innerHTML = `<p style="color: #ef4444;">⚠ Failed to generate explanation: ${error.message}</p>`;
        }
    }

    /**
     * Create expandable explanation container
     */
    static _createExplanationContainer(id) {
        const container = document.createElement("div");
        container.id = id;
        container.className = "section2-explanation-container";
        container.innerHTML = `
            <div class="explanation-header" style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 12px 16px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                user-select: none;
                margin-top: 16px;
                margin-bottom: 0;
            ">
                <div style="display: flex; align-items: center; gap: 8px; font-weight: 600;">
                    <span style="font-size: 18px;">💡</span>
                    <span>QC C.O.R.E ANALYSIS</span>
                </div>
                <span class="toggle-icon" style="font-size: 18px; transition: transform 0.3s;">▼</span>
            </div>
            <div class="explanation-content" style="
                display: none;
                padding: 16px;
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-top: none;
                border-radius: 0 0 8px 8px;
                margin-top: 0;
                margin-bottom: 16px;
            ">
                <div style="text-align: center; color: #667eea;">
                    <div style="display: inline-block; width: 24px; height: 24px; border: 3px solid #667eea; border-radius: 50%; border-top-color: transparent; animation: spin 0.8s linear infinite;"></div>
                </div>
            </div>
            <style>
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>
        `;
        return container;
    }

    /**
     * Setup expand/collapse functionality
     */
    static _setupExpandCollapse(container) {
        const header = container.querySelector(".explanation-header");
        const content = container.querySelector(".explanation-content");
        const toggleIcon = container.querySelector(".toggle-icon");
        
        let isExpanded = false;
        
        header.addEventListener("click", () => {
            isExpanded = !isExpanded;
            if (isExpanded) {
                content.style.display = "block";
                toggleIcon.style.transform = "rotate(180deg)";
            } else {
                content.style.display = "none";
                toggleIcon.style.transform = "rotate(0deg)";
            }
        });
    }

    /**
     * Generate explanation using Gemini API
     */
    static async generateExplanation(questionData, apiKey = null) {
        // Use provided API key or fall back to instance property
        const key = apiKey || this.apiKey;
        
        if (!key) {
            throw new Error("Gemini API key not configured");
        }

        const systemPrompt = this._buildSystemPrompt();
        const userMessage = this._buildUserMessage(questionData);

        try {
            const response = await fetch(`${this.baseUrl}?key=${key}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    system: {
                        parts: [{ text: systemPrompt }]
                    },
                    contents: {
                        parts: [{ text: userMessage }]
                    }
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(
                    error.error?.message || 
                    `API Error: ${response.status} ${response.statusText}`
                );
            }

            const data = await response.json();
            const responseText = data.candidates[0].content.parts[0].text;
            
            // Parse JSON from response
            const explanation = this._parseExplanationJSON(responseText);
            return explanation;

        } catch (error) {
            console.error("[Section2Explainer] API Error:", error);
            throw new Error(`Failed to generate explanation: ${error.message}`);
        }
    }

    /**
     * Build system prompt from framework
     */
    static _buildSystemPrompt() {
        return `You are an expert TOEFL Structure (Section 2) question analyst.

Your task is to generate QC C.O.R.E ANALYSIS explanations for TOEFL Section 2 Part A (Structure) questions.

QC C.O.R.E ANALYSIS Framework:
- C = Concept: The grammar concept being tested
- O = Observe S-V-C: Identify Subject, Verb, and Complement
- R = Requirement: Explain what's needed for grammatical correctness
- E = Eliminate: Analyze why incorrect options fail

OUTPUT FORMAT - MUST BE VALID JSON ONLY:

{
  "header": "Why (X)?",
  "concept": "English name of the grammar concept",
  "conceptIndonesian": "Indonesian translation of concept",
  "sentenceFormula": "SVC format (S-V-C, S-V-C-C, etc.)",
  "subjectComponent": "The complete subject",
  "verbComponent": "The main verb/verb phrase",
  "complementComponent": "The complete complement(s)",
  "requirement": "Clear explanation of the grammatical requirement",
  "eliminate": {
    "A": "✓ (BENAR) explanation if correct, or ✕ (SALAH) explanation if wrong",
    "B": "✕ (SALAH) explanation",
    "C": "✕ (SALAH) explanation",
    "D": "✕ (SALAH) explanation"
  },
  "keyTakeaway": "One sentence summary of the learning point"
}

CRITICAL RULES:
1. Respond with ONLY valid JSON, no markdown or extra text
2. Each option explanation should be 1-2 sentences max
3. Mark correct answer with ✓ (BENAR), incorrect with ✕ (SALAH)
4. Include Indonesian translations for key terms
5. Focus on WHY the answer is correct, not just labeling it`;
    }

    /**
     * Build user message
     */
    static _buildUserMessage(questionData) {
        const optionsText = Object.entries(questionData.options)
            .map(([key, value]) => `${key}. ${value}`)
            .join("\n");

        return `Analyze this TOEFL Section 2 question and provide a complete QC C.O.R.E ANALYSIS explanation.

QUESTION:
${questionData.questionText}

OPTIONS:
${optionsText}

CORRECT ANSWER: ${questionData.correctAnswer}

Provide your analysis in the exact JSON format specified in your system instructions.`;
    }

    /**
     * Parse JSON from response
     */
    static _parseExplanationJSON(responseText) {
        try {
            return JSON.parse(responseText);
        } catch (e) {
            // Try to extract JSON from markdown code blocks
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[1].trim());
                } catch (e2) {
                    // Continue
                }
            }

            // Try to find JSON object between { }
            const objectMatch = responseText.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                try {
                    return JSON.parse(objectMatch[0]);
                } catch (e3) {
                    // Continue
                }
            }

            throw new Error(
                `Failed to parse AI response as JSON. Response:\n${responseText.substring(0, 200)}...`
            );
        }
    }

    /**
     * Format explanation as beautiful HTML
     */
    static _formatExplanationHTML(explanation) {
        if (!explanation || typeof explanation !== "object") {
            return "<p>Error: Invalid explanation format</p>";
        }

        const {
            header = "Analysis",
            concept = "Grammar Concept",
            conceptIndonesian = "",
            sentenceFormula = "S-V-C",
            subjectComponent = "",
            verbComponent = "",
            complementComponent = "",
            requirement = "",
            eliminate = {},
            keyTakeaway = ""
        } = explanation;

        // Generate eliminate options HTML
        const eliminateHTML = Object.entries(eliminate)
            .map(([key, value]) => {
                const isCorrect = value.includes("✓") || value.includes("BENAR");
                const bgColor = isCorrect ? "#dcfce7" : "#fee2e2";
                const borderColor = isCorrect ? "#10b981" : "#ef4444";
                const textColor = isCorrect ? "#065f46" : "#7f1d1d";

                return `
                <div style="
                    padding: 10px 12px;
                    margin: 8px 0;
                    background: ${bgColor};
                    border-left: 4px solid ${borderColor};
                    border-radius: 4px;
                    color: ${textColor};
                    font-size: 13px;
                    line-height: 1.5;
                ">
                    <strong>${key}.</strong> ${this._escapeHTML(value)}
                </div>
                `;
            })
            .join("");

        // Generate S-V-C breakdown
        const svcHTML = `
        <div style="
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-bottom: 16px;
        ">
            <div style="padding: 10px; background: #e0f2fe; border-radius: 6px; border-left: 4px solid #0ea5e9;">
                <div style="font-size: 11px; font-weight: 600; color: #0c4a6e; text-transform: uppercase;">Subject</div>
                <div style="font-size: 13px; color: #164e63; margin-top: 4px;">${this._escapeHTML(subjectComponent)}</div>
            </div>
            <div style="padding: 10px; background: #d1fae5; border-radius: 6px; border-left: 4px solid #30b0c7;">
                <div style="font-size: 11px; font-weight: 600; color: #064e3b; text-transform: uppercase;">Verb</div>
                <div style="font-size: 13px; color: #047857; margin-top: 4px;">${this._escapeHTML(verbComponent)}</div>
            </div>
            <div style="padding: 10px; background: #fce7f3; border-radius: 6px; border-left: 4px solid #e675c9;">
                <div style="font-size: 11px; font-weight: 600; color: #831843; text-transform: uppercase;">Complement</div>
                <div style="font-size: 13px; color: #be185d; margin-top: 4px;">${this._escapeHTML(complementComponent)}</div>
            </div>
        </div>
        `;

        // Build final HTML
        return `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Poppins, sans-serif; color: #1f2937; line-height: 1.6;">
            
            <!-- Header -->
            <div style="border-bottom: 3px solid #667eea; padding-bottom: 12px; margin-bottom: 16px;">
                <h3 style="margin: 0 0 4px 0; font-size: 16px; color: #667eea;">${this._escapeHTML(header)}</h3>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">
                    <strong>${this._escapeHTML(concept)}</strong>
                    ${conceptIndonesian ? `<br/><em>${this._escapeHTML(conceptIndonesian)}</em>` : ""}
                </p>
            </div>

            <!-- Sentence Formula -->
            <div style="margin-bottom: 16px; padding: 10px; background: #f3f4f6; border-radius: 6px;">
                <div style="font-size: 12px; font-weight: 600; color: #666; text-transform: uppercase; margin-bottom: 4px;">Formula</div>
                <code style="font-size: 14px; font-weight: 600; color: #1f2937;">${this._escapeHTML(sentenceFormula)}</code>
            </div>

            <!-- S-V-C Breakdown -->
            <div style="margin-bottom: 16px;">
                <div style="font-size: 12px; font-weight: 600; color: #666; text-transform: uppercase; margin-bottom: 8px;">Structure Breakdown</div>
                ${svcHTML}
            </div>

            <!-- Requirement -->
            <div style="margin-bottom: 16px; padding: 12px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
                <div style="font-size: 12px; font-weight: 600; color: #92400e; text-transform: uppercase; margin-bottom: 4px;">Requirement</div>
                <div style="font-size: 13px; color: #78350f; line-height: 1.6;">${this._escapeHTML(requirement)}</div>
            </div>

            <!-- Option Analysis -->
            <div style="margin-bottom: 16px;">
                <div style="font-size: 12px; font-weight: 600; color: #666; text-transform: uppercase; margin-bottom: 8px;">E - Eliminate</div>
                ${eliminateHTML}
            </div>

            <!-- Key Takeaway -->
            ${keyTakeaway ? `
            <div style="padding: 12px; background: #f0fdf4; border-left: 4px solid #10b981; border-radius: 4px;">
                <div style="font-size: 12px; font-weight: 600; color: #065f46; text-transform: uppercase; margin-bottom: 4px;">Key Takeaway</div>
                <div style="font-size: 13px; color: #1f2937; line-height: 1.6;">${this._escapeHTML(keyTakeaway)}</div>
            </div>
            ` : ""}

        </div>
        `;
    }

    /**
     * Escape HTML entities
     */
    static _escapeHTML(text) {
        if (!text) return "";
        const map = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

// Make globally available
if (typeof window !== "undefined") {
    window.Section2GeminiExplainer = Section2GeminiExplainer;
}
