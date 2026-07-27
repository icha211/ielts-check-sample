/**
 * Section 2 Part A Explanation Generator
 * Generates QC C.O.R.E ANALYSIS framework explanations
 * 
 * Usage:
 * const explanation = generateSection2PartAExplanation({
 *   question: "The discovery of insulin _____ a major breakthrough in medical history.",
 *   options: {
 *     A: "represented",
 *     B: "representing", 
 *     C: "is represented",
 *     D: "has been represented"
 *   },
 *   correctAnswer: "A",
 *   concept: "Subject-Verb Agreement",
 *   subjectComponent: "The discovery of insulin",
 *   verbComponent: "represented",
 *   complementComponent: "a major breakthrough in medical history",
 *   sentenceFormula: "SVC",
 *   analysis: { ... }
 * });
 */

class Section2ExplanationGenerator {
    /**
     * Color scheme for S-V-C highlighting
     */
    static COLORS = {
        subject: {
            bg: "#0EA5E9",
            text: "#FFFFFF"
        },
        verb: {
            bg: "#30B0C7", 
            text: "#FFFFFF"
        },
        complement: {
            bg: "#E675C9",
            text: "#FFFFFF"
        }
    };

    /**
     * Sentence formulas
     */
    static FORMULAS = {
        SV: "Subject + Verb",
        SVC: "Subject + Verb + Complement",
        SVO: "Subject + Verb + Object",
        SVOO: "Subject + Verb + Indirect Object + Direct Object",
        SVOC: "Subject + Verb + Object + Complement"
    };

    /**
     * Main generation function
     */
    static generateExplanation(data) {
        try {
            const {
                question,
                options,
                correctAnswer,
                concept,
                conceptIndonesian,
                subjectComponent,
                verbComponent,
                complementComponent,
                sentenceFormula,
                requirement,
                eliminationAnalysis,
                sentences = {}
            } = data;

            let html = "";

            // 1. HEADER: Why (Answer)?
            html += this._generateHeader(correctAnswer, options[correctAnswer], sentences.fullSentence);

            // 2. QC C.O.R.E ANALYSIS banner
            html += `<div style="margin: 24px 0 20px 0;">
                <h3 style="font-weight: 600; font-size: 16px; margin-bottom: 12px;">
                    💡 <strong>QC C.O.R.E ANALYSIS</strong>
                </h3>
            </div>`;

            // 3. C - Concept
            html += this._generateConceptSection(concept, conceptIndonesian);

            // 4. O - Observe S-V-C
            html += this._generateObserveSVCSection(
                sentenceFormula,
                sentences.fullSentence || question,
                subjectComponent,
                verbComponent,
                complementComponent
            );

            // 5. R - Requirement
            html += this._generateRequirementSection(requirement);

            // 6. E - Eliminate
            html += this._generateEliminateSection(options, correctAnswer, eliminationAnalysis);

            return html;

        } catch (error) {
            console.error("[Section2ExplanationGenerator] Error:", error);
            return `<div style="color: #dc2626; padding: 16px; border-radius: 6px; background: #fee2e2;">
                Error generating explanation: ${error.message}
            </div>`;
        }
    }

    /**
     * Generate Header Section: Why (Answer)?
     */
    static _generateHeader(correctAnswer, answerText, fullSentence) {
        return `<div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e5e7eb;">
            <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #1f2937;">
                Why <span style="color: #667eea;">(<strong>${correctAnswer}</strong>)</span>?
            </h2>
            ${fullSentence ? `
            <p style="font-size: 15px; line-height: 1.6; color: #374151;">
                ${fullSentence.replace(
                    new RegExp(`\\b${answerText}\\b`, 'gi'),
                    `<u><strong>${answerText}</strong></u>`
                )}
            </p>
            ` : ""}
        </div>`;
    }

    /**
     * Generate C - Concept Section
     */
    static _generateConceptSection(concept, conceptIndonesian = "") {
        return `<div style="margin-bottom: 20px; padding: 16px; background: #f3f4f6; border-radius: 8px; border-left: 4px solid #667eea;">
            <h3 style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #1f2937;">
                <strong>C - Concept</strong>
            </h3>
            <p style="font-size: 14px; color: #374151; margin: 0;">
                <strong>${concept}</strong>
                ${conceptIndonesian ? `<br><span style="color: #666; font-size: 13px;">(${conceptIndonesian})</span>` : ""}
            </p>
        </div>`;
    }

    /**
     * Generate O - Observe S-V-C Section with visual breakdown
     */
    static _generateObserveSVCSection(formula, fullSentence, subject, verb, complement) {
        const formulaLabel = this.FORMULAS[formula] || formula;

        let sentenceHtml = fullSentence;
        
        // Highlight components
        if (subject && subject !== "[KOSONG/BLANK]") {
            sentenceHtml = sentenceHtml.replace(
                new RegExp(`\\b${this._escapeRegex(subject)}\\b`, 'i'),
                `<span style="background-color: ${this.COLORS.subject.bg}; color: ${this.COLORS.subject.text}; padding: 2px 4px; border-radius: 2px; margin: 0 2px;">${subject}</span>`
            );
        }

        if (verb && verb !== "[KOSONG/BLANK]") {
            sentenceHtml = sentenceHtml.replace(
                new RegExp(`\\b${this._escapeRegex(verb)}\\b`, 'i'),
                `<span style="background-color: ${this.COLORS.verb.bg}; color: ${this.COLORS.verb.text}; padding: 2px 4px; border-radius: 2px; margin: 0 2px;">${verb}</span>`
            );
        }

        if (complement && complement !== "[KOSONG/BLANK]") {
            sentenceHtml = sentenceHtml.replace(
                new RegExp(`${this._escapeRegex(complement)}(?![^<]*>)`, 'i'),
                `<span style="background-color: ${this.COLORS.complement.bg}; color: ${this.COLORS.complement.text}; padding: 2px 4px; border-radius: 2px; margin: 0 2px;">${complement}</span>`
            );
        }

        let html = `<div style="margin-bottom: 20px; padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #30b0c7;">
            <h3 style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #1f2937;">
                <strong>O - Observe S-V-C</strong>
            </h3>
            
            <div style="font-size: 13px; margin-bottom: 12px; color: #666;">
                <strong>Sentence Formula:</strong> ${formulaLabel}
            </div>

            <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid #e5e7eb;">
                <div style="font-family: sans-serif; line-height: 2; font-size: 15px; color: #1f2937; margin-bottom: 12px;">
                    ${sentenceHtml}
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
                    ${subject && subject !== "[KOSONG/BLANK]" ? `
                    <span style="background-color: ${this.COLORS.subject.bg}; color: ${this.COLORS.subject.text}; border: 1px solid #d1dce8; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 500;">
                        Subject
                    </span>
                    ` : ""}
                    ${verb && verb !== "[KOSONG/BLANK]" ? `
                    <span style="background-color: ${this.COLORS.verb.bg}; color: ${this.COLORS.verb.text}; border: 1px solid #d1dce8; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 500;">
                        Verb
                    </span>
                    ` : ""}
                    ${complement && complement !== "[KOSONG/BLANK]" ? `
                    <span style="background-color: ${this.COLORS.complement.bg}; color: ${this.COLORS.complement.text}; border: 1px solid #d1dce8; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 500;">
                        Complement
                    </span>
                    ` : ""}
                </div>
            </div>

            <div style="font-size: 14px; line-height: 1.8; color: #374151;">
                <div style="margin-bottom: 8px;">• <strong>Subject</strong>: ${subject || "[KOSONG/BLANK]"}</div>
                <div style="margin-bottom: 8px;">• <strong>Verb</strong>: ${verb || "[KOSONG/BLANK]"}</div>
                <div>• <strong>Complement</strong>: ${complement || "[KOSONG/BLANK]"}</div>
            </div>
        </div>`;

        return html;
    }

    /**
     * Generate R - Requirement Section
     */
    static _generateRequirementSection(requirement) {
        return `<div style="margin-bottom: 20px; padding: 16px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <h3 style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #92400e;">
                <strong>R - Requirement</strong>
            </h3>
            <p style="font-size: 14px; line-height: 1.6; color: #78350f; margin: 0;">
                ${requirement}
            </p>
        </div>`;
    }

    /**
     * Generate E - Eliminate Section
     */
    static _generateEliminateSection(options, correctAnswer, analysis) {
        let html = `<div style="margin-bottom: 20px; padding: 16px; background: #ecfdf5; border-radius: 8px; border-left: 4px solid #10b981;">
            <h3 style="font-weight: 600; font-size: 14px; margin-bottom: 16px; color: #065f46;">
                <strong>E - Eliminate</strong>
            </h3>
            <div style="display: flex; flex-direction: column; gap: 12px;">`;

        Object.entries(options).forEach(([optionKey, optionText]) => {
            const isCorrect = optionKey === correctAnswer;
            const bgColor = isCorrect ? "#d1fae5" : "#fee2e2";
            const borderColor = isCorrect ? "#10b981" : "#ef4444";
            const textColor = isCorrect ? "#065f46" : "#7f1d1d";
            const statusBg = isCorrect ? "#10b981" : "#ef4444";
            const statusText = isCorrect ? "✓ (BENAR)" : "✕ (SALAH)";

            const analysisText = analysis?.[optionKey] || "Analysis not provided";

            html += `<div style="padding: 12px; background: white; border: 1px solid ${borderColor}; border-left: 4px solid ${borderColor}; border-radius: 6px;">
                <div style="display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px;">
                    <span style="background: ${statusBg}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; white-space: nowrap;">
                        (${optionKey})
                    </span>
                    <span style="background: ${statusBg}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; white-space: nowrap;">
                        ${statusText}
                    </span>
                </div>
                <div style="margin-bottom: 8px;">
                    <strong style="font-size: 14px; color: #1f2937;">${optionText}</strong>
                </div>
                <div style="font-size: 14px; line-height: 1.6; color: #374151;">
                    ${analysisText}
                </div>
            </div>`;
        });

        html += `</div></div>`;
        return html;
    }

    /**
     * Helper: Escape special regex characters
     */
    static _escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// Export for use in developer.js
if (typeof window !== "undefined") {
    window.Section2ExplanationGenerator = Section2ExplanationGenerator;
}
