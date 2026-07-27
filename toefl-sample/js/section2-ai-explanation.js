/**
 * Section 2 Part A - AI Explanation Generator
 * Uses Claude API to generate QC C.O.R.E ANALYSIS explanations
 * 
 * Integration with developer.js for test creation workflows
 */

class Section2AIExplanationGenerator {
    static API_MODEL = "claude-3-5-sonnet-20241022";
    static API_TIMEOUT = 30000; // 30 seconds
    
    /**
     * QC C.O.R.E ANALYSIS System Prompt
     * Based on explaination-promp/section2-partA.md
     */
    static SYSTEM_PROMPT = `You are an expert TOEFL/Grammar AI Assistant specializing in generating detailed, visually appealing question explanations for an interactive learning website.

Your task is to analyze a given multiple-choice grammar question (Part A: Structure) and generate an explanation following the strict QC C.O.R.E ANALYSIS framework along with precise HTML formatting for sentence visual breakdown.

## REQUIRED OUTPUT FORMAT & RULES:

### 1. Header Section
* Display: **Why ([Correct Option])?**
* Render the full sentence with the correct answer filled into the blank (underlined and bolded).

### 2. Section C - Concept
* **Format:** \`C - Concept : <Topic/Concept Name> (Bahasa Indonesia Explanation)\`
* Identify the exact grammar topic being tested (e.g., Subject & Appositive, Participles as Modifiers, Reduced Relative Clauses, Inversion, Subject-Verb Agreement).

### 3. Section O - Observe S-V-C
* **Sentence Formula Classification:** Pick the best-fitting formula among: \`SV\`, \`SVC\`, \`SVO\`, \`SVOO\`, or \`SVOC\`.

* **Visual Sentence Breakdown (HTML/CSS):**
  Re-render the full reconstructed sentence and apply specific text background highlights using \`<span>\` inline styles:
  - **Subject:** Highlight background \`#0EA5E9\`, text color \`#FFFFFF\`
  - **Verb:** Highlight background \`#30B0C7\`, text color \`#FFFFFF\`
  - **Complement/Appositive/Modifier:** Highlight background \`#E675C9\`, text color \`#FFFFFF\`
  - **Unclassified / Extra text:** Leave as normal text with no highlight.

* **Under-Text Label Boxes:**
  Directly beneath the sentence break, render horizontally-aligned tag boxes directly below their corresponding highlighted text:
  - Tag Box Style: Padding \`2px 8px\`, border \`1px solid #D1DCE8\`, border-radius \`4px\`, font-size \`12px\`, text-color \`#FFFFFF\`, aligned to center.
  - Tag Box Colors match the highlight colors:
    - Subject Box: \`#0EA5E9\`
    - Verb Box: \`#30B0C7\`
    - Complement Box: \`#E675C9\`

* **Textual Observation Bullets:**
  List the components identified:
  - \`• Subject\` : [Identify present subject or write [KOSONG/BLANK]]
  - \`• Verb\` : [Identify present verb or write [KOSONG/BLANK]]
  - \`• Complement\` : [Identify appositives, modifiers, prepositional phrases, etc.]

### 4. Section R - Requirement
* Summarize what structural element is missing to make the sentence grammatically complete.
* Clearly state what rules or prohibitions apply.

### 5. Section E - Eliminate
* Analyze each option (A, B, C, D) individually:
  - Mark the correct option with \`✓\` and explanation why it satisfies the Requirement.
  - Mark incorrect options with \`✕\` and explain specifically why it breaks the S-V-C structure.

## OUTPUT STRUCTURE:
Always output a JSON object with this exact structure:
{
  "header": "Why (A)?\\n<u><b>Hydroelectric power</b></u>, a major source of renewable energy, harnesses the power of falling water to generate electricity.",
  "concept": "Subject & Appositive",
  "conceptIndonesian": "Subjek & Keterangan Tambahan",
  "sentenceFormula": "SVC",
  "observeSVC": "HTML formatted sentence with highlights and boxes",
  "subjectComponent": "Hydroelectric power",
  "verbComponent": "harnesses",
  "complementComponent": "a major source of renewable energy / the power of falling water to generate electricity",
  "requirement": "Kalimat ini sudah memiliki Verb namun belum memiliki Subject. Karena tidak ada Connector, kita hanya butuh satu Subject.",
  "eliminate": {
    "A": "✓ (BENAR) - Ini adalah Noun Phrase yang berfungsi sempurna sebagai Subject.",
    "B": "✕ (SALAH) - Terdapat verb 'is'. Jika dipilih, kalimat akan mengalami Double Verb...",
    "C": "✕ (SALAH) - Penambahan konektor 'That' mengubahnya menjadi anak kalimat...",
    "D": "✕ (SALAH) - Terdapat subject 'It' dan verb 'is'. Ini akan menciptakan Double Verb..."
  }
}`;

    /**
     * Generate explanation using Claude API
     */
    static async generateExplanation(questionData, apiKey) {
        if (!apiKey) {
            throw new Error("API key not provided. Please configure your Claude API key in developer settings.");
        }

        try {
            const userPrompt = this._buildUserPrompt(questionData);
            
            const response = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01"
                },
                body: JSON.stringify({
                    model: this.API_MODEL,
                    max_tokens: 2048,
                    system: this.SYSTEM_PROMPT,
                    messages: [
                        {
                            role: "user",
                            content: userPrompt
                        }
                    ]
                }),
                signal: AbortSignal.timeout(this.API_TIMEOUT)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const responseText = data.content[0].text;
            
            // Parse JSON from response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error("Failed to parse JSON response from AI");
            }

            const explanationData = JSON.parse(jsonMatch[0]);
            return explanationData;

        } catch (error) {
            if (error.name === "AbortError") {
                throw new Error("API request timed out. Please try again.");
            }
            throw error;
        }
    }

    /**
     * Build user prompt from question data
     */
    static _buildUserPrompt(questionData) {
        const {
            questionText,
            options = {},
            correctAnswer,
            context = ""
        } = questionData;

        let prompt = `Analyze and generate a QC C.O.R.E ANALYSIS explanation for this TOEFL Structure question:

**Question:**
${questionText}

**Options:**
${Object.entries(options)
    .map(([key, text]) => `(${key}) ${text}`)
    .join("\n")}

**Correct Answer:** (${correctAnswer})`;

        if (context) {
            prompt += `\n\n**Additional Context:**\n${context}`;
        }

        prompt += `\n\nGenerate a detailed explanation following the QC C.O.R.E ANALYSIS framework and output as JSON.`;

        return prompt;
    }

    /**
     * Format generated explanation into HTML
     */
    static formatExplanationHTML(explanationData) {
        const {
            header,
            concept,
            conceptIndonesian,
            sentenceFormula,
            subjectComponent,
            verbComponent,
            complementComponent,
            requirement,
            eliminate
        } = explanationData;

        let html = "";

        // Header
        html += `<div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e5e7eb;">
            <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #1f2937;">
                ${header}
            </h2>
        </div>`;

        // QC C.O.R.E Banner
        html += `<div style="margin: 24px 0 20px 0;">
            <h3 style="font-weight: 600; font-size: 16px; margin-bottom: 12px;">
                💡 <strong>QC C.O.R.E ANALYSIS</strong>
            </h3>
        </div>`;

        // C - Concept
        html += `<div style="margin-bottom: 20px; padding: 16px; background: #f3f4f6; border-radius: 8px; border-left: 4px solid #667eea;">
            <h3 style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #1f2937;">
                <strong>C - Concept</strong>
            </h3>
            <p style="font-size: 14px; color: #374151; margin: 0;">
                <strong>${concept}</strong>
                ${conceptIndonesian ? `<br><span style="color: #666; font-size: 13px;">(${conceptIndonesian})</span>` : ""}
            </p>
        </div>`;

        // O - Observe S-V-C
        html += `<div style="margin-bottom: 20px; padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #30b0c7;">
            <h3 style="font-weight: 600; font-size: 14px; margin-bottom: 12px; color: #1f2937;">
                <strong>O - Observe S-V-C</strong>
            </h3>
            <div style="font-size: 13px; margin-bottom: 12px; color: #666;">
                <strong>Sentence Formula:</strong> ${sentenceFormula}
            </div>
            <div style="font-size: 14px; line-height: 1.8; color: #374151;">
                <div style="margin-bottom: 8px;">• <strong>Subject</strong>: ${subjectComponent || "[KOSONG/BLANK]"}</div>
                <div style="margin-bottom: 8px;">• <strong>Verb</strong>: ${verbComponent || "[KOSONG/BLANK]"}</div>
                <div>• <strong>Complement</strong>: ${complementComponent || "[KOSONG/BLANK]"}</div>
            </div>
        </div>`;

        // R - Requirement
        html += `<div style="margin-bottom: 20px; padding: 16px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <h3 style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #92400e;">
                <strong>R - Requirement</strong>
            </h3>
            <p style="font-size: 14px; line-height: 1.6; color: #78350f; margin: 0;">
                ${requirement}
            </p>
        </div>`;

        // E - Eliminate
        html += `<div style="margin-bottom: 20px; padding: 16px; background: #ecfdf5; border-radius: 8px; border-left: 4px solid #10b981;">
            <h3 style="font-weight: 600; font-size: 14px; margin-bottom: 16px; color: #065f46;">
                <strong>E - Eliminate</strong>
            </h3>
            <div style="display: flex; flex-direction: column; gap: 12px;">`;

        if (eliminate) {
            Object.entries(eliminate).forEach(([option, analysis]) => {
                const isCorrect = analysis.includes("✓") || analysis.includes("BENAR");
                const bgColor = isCorrect ? "#d1fae5" : "#fee2e2";
                const borderColor = isCorrect ? "#10b981" : "#ef4444";
                const textColor = isCorrect ? "#065f46" : "#7f1d1d";

                html += `<div style="padding: 12px; background: white; border: 1px solid ${borderColor}; border-left: 4px solid ${borderColor}; border-radius: 6px;">
                    <div style="margin-bottom: 8px;">
                        <span style="background: ${borderColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                            (${option})
                        </span>
                    </div>
                    <div style="font-size: 14px; line-height: 1.6; color: #374151;">
                        ${analysis}
                    </div>
                </div>`;
            });
        }

        html += `</div></div>`;

        return html;
    }
}

// Export for use in developer.js
if (typeof window !== "undefined") {
    window.Section2AIExplanationGenerator = Section2AIExplanationGenerator;
}
