/**
 * Local AI Explanation Generator for TOEFL Grammar Questions
 * QC C.O.R.E ANALYSIS Framework
 * No external APIs - runs entirely in browser
 */

class ExplanationGenerator {
    constructor() {
        this.grammarRules = {
            "Subject & Appositive": {
                concept: "Subject & Appositive (Subjek & Keterangan Tambahan)",
                patterns: ["appositive", "subject", "noun phrase"],
                indicators: [",", "between commas"],
            },
            "Subject-Verb Agreement": {
                concept: "Subject-Verb Agreement (Kesesuaian Subjek-Verba)",
                patterns: ["singular", "plural", "verb form"],
                indicators: ["verb", "subject"],
            },
            "Participles as Modifiers": {
                concept: "Participles as Modifiers (Partisip sebagai Pengubah)",
                patterns: ["ing", "ed", "present participle", "past participle"],
                indicators: ["modifying", "describing"],
            },
            "Reduced Relative Clauses": {
                concept: "Reduced Relative Clauses (Klausa Relatif Tereduksi)",
                patterns: ["which", "that", "who", "reduced", "clause"],
                indicators: ["relative", "omitted"],
            },
            "Inversion": {
                concept: "Inversion (Inversi)",
                patterns: ["inverted", "order", "adverb", "beginning"],
                indicators: ["only", "never", "rarely", "seldom"],
            },
            "Prepositions": {
                concept: "Prepositions (Preposisi)",
                patterns: ["in", "on", "at", "by", "for", "with"],
                indicators: ["location", "time", "manner"],
            },
            "Double Verb": {
                concept: "Double Verb Problem (Masalah Verba Ganda)",
                patterns: ["double verb", "two verbs", "no connector"],
                indicators: ["verb", "and", "but", "because"],
            },
        };
    }

    /**
     * Detect grammar concept from question text
     */
    detectConcept(questionText, options) {
        let detectedConcept = "Grammar Structure";
        let confidence = 0;

        for (const [conceptName, rule] of Object.entries(this.grammarRules)) {
            let score = 0;
            const text = (questionText + " " + options.join(" ")).toLowerCase();

            rule.patterns.forEach((pattern) => {
                if (text.includes(pattern.toLowerCase())) score++;
            });

            rule.indicators.forEach((indicator) => {
                if (text.includes(indicator.toLowerCase())) score += 2;
            });

            if (score > confidence) {
                confidence = score;
                detectedConcept = conceptName;
            }
        }

        return {
            concept: this.grammarRules[detectedConcept].concept,
            name: detectedConcept,
        };
    }

    /**
     * Analyze sentence structure (S-V-C)
     */
    analyzeSentence(sentence) {
        const analysis = {
            subject: "[KOSONG/BLANK]",
            verb: "[KOSONG/BLANK]",
            complement: "[KOSONG/BLANK]",
            formula: "SVC",
        };

        // Common verb patterns
        const verbPatterns = [
            "is",
            "are",
            "was",
            "were",
            "be",
            "been",
            "has",
            "have",
            "had",
            "do",
            "does",
            "did",
            "will",
            "would",
            "can",
            "could",
            "should",
            "may",
            "might",
            "must",
            "harnesses",
            "generates",
            "creates",
            "develops",
            "causes",
            "produces",
        ];

        // Find verb
        for (const verb of verbPatterns) {
            if (sentence.toLowerCase().includes(" " + verb + " ")) {
                analysis.verb = verb;
                break;
            }
        }

        // Find subject (simple heuristic)
        const words = sentence.split(/[\s,]/);
        if (words.length > 0 && words[0].match(/^[A-Z]/)) {
            analysis.subject = words[0];
        }

        // Detect complements
        if (sentence.includes(",")) {
            const complementMatch = sentence.match(/,\s*([^,]+),/);
            if (complementMatch) {
                analysis.complement = complementMatch[1].trim();
            }
        }

        return analysis;
    }

    /**
     * Generate HTML for color-coded sentence breakdown
     */
    generateSentenceBreakdown(sentence, analysis) {
        let html = `<div style="font-family: sans-serif; line-height: 2.2; background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">`;

        // Highlight Subject
        if (analysis.subject !== "[KOSONG/BLANK]") {
            html = html.replace(
                analysis.subject,
                `<span style="background-color: #0EA5E9; color: white; padding: 3px 6px; border-radius: 3px; font-weight: 600;">${analysis.subject}</span>`
            );
        }

        // Highlight Verb
        if (analysis.verb !== "[KOSONG/BLANK]") {
            html = html.replace(
                " " + analysis.verb + " ",
                ` <span style="background-color: #30B0C7; color: white; padding: 3px 6px; border-radius: 3px; font-weight: 600;">${analysis.verb}</span> `
            );
        }

        // Highlight Complement
        if (analysis.complement !== "[KOSONG/BLANK]") {
            html = html.replace(
                analysis.complement,
                `<span style="background-color: #E675C9; color: white; padding: 3px 6px; border-radius: 3px; font-weight: 600;">${analysis.complement}</span>`
            );
        }

        html += sentence;

        // Add tag boxes
        html += `<div style="display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap;">`;

        if (analysis.subject !== "[KOSONG/BLANK]") {
            html += `<span style="background-color: #0EA5E9; color: white; border: 1px solid #0EA5E9; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;">Subject</span>`;
        }

        if (analysis.verb !== "[KOSONG/BLANK]") {
            html += `<span style="background-color: #30B0C7; color: white; border: 1px solid #30B0C7; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;">Verb</span>`;
        }

        if (analysis.complement !== "[KOSONG/BLANK]") {
            html += `<span style="background-color: #E675C9; color: white; border: 1px solid #E675C9; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;">Complement</span>`;
        }

        html += `</div></div>`;

        return html;
    }

    /**
     * Generate requirement analysis
     */
    generateRequirement(analysis, correctAnswer) {
        let requirement = `Kalimat ini `;

        const missing = [];
        if (analysis.subject === "[KOSONG/BLANK]") missing.push("Subject");
        if (analysis.verb === "[KOSONG/BLANK]") missing.push("Verb");
        if (analysis.complement === "[KOSONG/BLANK]")
            missing.push("Complement/Modifier");

        if (missing.length === 0) {
            requirement += `sudah memiliki semua komponen (Subject, Verb, Complement). Fokus pada aksesori atau modifier yang diperlukan.`;
        } else {
            requirement += `memerlukan ${missing.join(" dan ")}. `;
        }

        requirement += `Karena tidak ada Connector (seperti and, but, because), kita hanya butuh satu Subject. Jangan tambahkan Verb tanpa konektor.`;

        return requirement;
    }

    /**
     * Generate elimination analysis for each option
     */
    generateElimination(options, correctAnswer) {
        const analysis = [];

        for (let i = 0; i < options.length; i++) {
            const option = options[i];
            const letter = String.fromCharCode(65 + i);
            const isCorrect = letter === correctAnswer;

            let explanation = "";

            if (isCorrect) {
                explanation = `✓ <strong style="color: #16a34a;"> BENAR</strong>: Pilihan ini menyediakan elemen yang hilang dan tidak menciptakan struktur yang tidak valid. Ini melengkapi kalimat dengan benar.`;
            } else {
                // Analyze why it's wrong
                if (
                    option.includes(" is ") ||
                    option.includes(" are ") ||
                    option.includes(" was ")
                ) {
                    explanation = `✕ <strong style="color: #dc2626;"> SALAH</strong>: Pilihan ini menambahkan verb extra. Kalimat akan mengalami Double Verb tanpa konektor.`;
                } else if (option.startsWith("That ") || option.startsWith("Which ")) {
                    explanation = `✕ <strong style="color: #dc2626;"> SALAH</strong>: Penambahan connector ini mengubah kalimat menjadi dependent clause tanpa induk kalimat.`;
                } else if (option.includes(" it ") || option.startsWith("It ")) {
                    explanation = `✕ <strong style="color: #dc2626;"> SALAH</strong>: Ini menciptakan pronoun dan verb extra, menyebabkan Double Subject dan Double Verb.`;
                } else {
                    explanation = `✕ <strong style="color: #dc2626;"> SALAH</strong>: Pilihan ini tidak memenuhi struktur kalimat yang diperlukan atau menciptakan fragmentasi.`;
                }
            }

            analysis.push({
                option: `(${letter}) ${option}`,
                explanation: explanation,
                isCorrect: isCorrect,
            });
        }

        return analysis;
    }

    /**
     * Main function: Generate complete explanation
     */
    generate(questionData) {
        const {
            questionText,
            options,
            correctAnswer,
            correctOptionText,
        } = questionData;

        // 1. Detect concept
        const conceptAnalysis = this.detectConcept(questionText, options);

        // 2. Build complete sentence
        const completeSentence = questionText.replace("_____", correctOptionText);

        // 3. Analyze sentence structure
        const sentenceAnalysis = this.analyzeSentence(completeSentence);

        // 4. Generate HTML components
        const explanationHtml = `
        <div style="font-family: 'Poppins', sans-serif; color: #334155; line-height: 1.8;">
            
            <!-- Header -->
            <div style="margin-bottom: 24px;">
                <h3 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 0 0 12px 0;">
                    Why (${correctAnswer})?
                </h3>
                <p style="font-size: 16px; color: #475569; margin: 0; line-height: 1.6;">
                    <u><strong>${correctOptionText}</strong></u>, ${completeSentence.split(",").slice(1).join(",")}
                </p>
            </div>

            <!-- QC C.O.R.E ANALYSIS Banner -->
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; font-weight: 600; font-size: 14px;">
                💡 QC C.O.R.E ANALYSIS
            </div>

            <!-- C - Concept -->
            <div style="margin-bottom: 20px; padding: 12px; background: #f0f9ff; border-left: 4px solid #0ea5e9; border-radius: 4px;">
                <strong style="color: #0ea5e9; font-size: 15px;">C - Concept:</strong>
                <span style="color: #334155; margin-left: 8px;">${conceptAnalysis.concept}</span>
            </div>

            <!-- O - Observe S-V-C -->
            <div style="margin-bottom: 20px;">
                <strong style="color: #30b0c7; font-size: 15px; display: block; margin-bottom: 12px;">O - Observe S-V-C:</strong>
                
                <!-- Sentence Breakdown -->
                ${this.generateSentenceBreakdown(completeSentence, sentenceAnalysis)}

                <!-- Observation Bullets -->
                <div style="margin-top: 12px; padding: 12px; background: #f1f5f9; border-radius: 4px;">
                    <div style="margin: 8px 0;">
                        <strong>• Subject:</strong> 
                        <span style="color: #475569;">${sentenceAnalysis.subject}</span>
                    </div>
                    <div style="margin: 8px 0;">
                        <strong>• Verb:</strong> 
                        <span style="color: #475569;">${sentenceAnalysis.verb} (Sudah ada)</span>
                    </div>
                    <div style="margin: 8px 0;">
                        <strong>• Complement:</strong> 
                        <span style="color: #475569;">${sentenceAnalysis.complement || "Tidak ada dalam kalimat ini"}</span>
                    </div>
                </div>
            </div>

            <!-- R - Requirement -->
            <div style="margin-bottom: 20px; padding: 12px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
                <strong style="color: #f59e0b; font-size: 15px; display: block; margin-bottom: 8px;">R - Requirement:</strong>
                <span style="color: #334155;">${this.generateRequirement(sentenceAnalysis, correctAnswer)}</span>
            </div>

            <!-- E - Eliminate -->
            <div style="margin-bottom: 20px;">
                <strong style="color: #e675c9; font-size: 15px; display: block; margin-bottom: 12px;">E - Eliminate:</strong>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${this.generateElimination(options, correctAnswer)
                        .map(
                            (item) => `
                        <div style="padding: 10px 12px; background: ${item.isCorrect ? "#dcfce7" : "#fee2e2"}; border-left: 4px solid ${item.isCorrect ? "#16a34a" : "#dc2626"}; border-radius: 4px;">
                            <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">${item.option}</div>
                            <div style="font-size: 13px; color: #334155;">${item.explanation}</div>
                        </div>
                    `
                        )
                        .join("")}
                </div>
            </div>

        </div>
        `;

        return explanationHtml;
    }
}

// Export for use in HTML
window.ExplanationGenerator = ExplanationGenerator;
