# QC C.O.R.E Explanation Generator - Documentation

## Overview

A **local AI explanation generator** for TOEFL grammar questions that creates detailed, visually-formatted explanations following the **QC C.O.R.E ANALYSIS framework**. 

**Key Features:**
- ✅ **No external APIs** - runs 100% in the browser
- ✅ **QC C.O.R.E Framework** - Concept, Observe S-V-C, Requirement, Eliminate
- ✅ **Color-coded HTML breakdown** - Visual sentence analysis with highlighted components
- ✅ **Auto-generates explanations** - Analyzes grammar patterns and creates structured analysis
- ✅ **Works offline** - No internet required after initial load

---

## QC C.O.R.E Framework

Each explanation follows this structure:

### **C - Concept**
Identifies the grammar topic being tested:
- Subject & Appositive
- Subject-Verb Agreement
- Participles as Modifiers
- Reduced Relative Clauses
- Inversion
- Prepositions
- Double Verb problems

### **O - Observe S-V-C**
Visual breakdown of the sentence with color-coded components:
- **Subject** (Blue #0EA5E9)
- **Verb** (Teal #30B0C7)
- **Complement/Modifier** (Pink #E675C9)

Components are highlighted AND labeled below with tag boxes.

### **R - Requirement**
States what structural element is needed and what rules apply.

### **E - Eliminate**
Analyzes each option:
- ✓ (Green) Correct answers and why they work
- ✕ (Red) Incorrect answers and why they fail

---

## Files

### **js/explanation-generator.js**
Main JavaScript module that generates explanations. Core class: `ExplanationGenerator`

### **section 2-answered.html**
Integrated with new functions:
- `generateQCCOREExplanation(question)` - Generate explanation HTML
- `renderQCCOREExplanation(containerId, question)` - Render into a DOM element

### **test-qc-core-explainer.html**
Interactive demo page with:
- 2 pre-loaded example questions
- Custom question builder
- Real-time explanation generation

---

## Usage

### **Option 1: Use in HTML (Direct)**

```html
<div id="explanation-container"></div>

<script src="js/explanation-generator.js"></script>
<script>
    const generator = new ExplanationGenerator();
    
    const explanation = generator.generate({
        questionText: "_____, a major source of renewable energy, harnesses the power of falling water to generate electricity.",
        options: [
            "Hydroelectric power",
            "Hydroelectric power is",
            "That hydroelectric power",
            "It is hydroelectric power"
        ],
        correctAnswer: "A",
        correctOptionText: "Hydroelectric power"
    });
    
    document.getElementById("explanation-container").innerHTML = explanation;
</script>
```

### **Option 2: Use in section 2-answered.html**

The explanation generator is already integrated. It provides:

```javascript
// Generate explanation HTML
const html = generateQCCOREExplanation(questionObject);

// Render directly to DOM
renderQCCOREExplanation("container-id", questionObject);

// Access the generator instance
window.explanationGeneratorInstance
```

### **Option 3: Use the Demo Page**

Open `test-qc-core-explainer.html` in a browser to:
1. See pre-loaded examples generate in real-time
2. Create custom questions and test explanations
3. View the color-coded output

---

## API Reference

### **ExplanationGenerator Class**

#### **Constructor**
```javascript
const generator = new ExplanationGenerator();
```

#### **Methods**

##### **generate(questionData)**
Generates complete QC C.O.R.E explanation.

**Parameters:**
```javascript
{
    questionText: string,      // Question with _____ for blank
    options: string[],         // Array of 4 options [A, B, C, D]
    correctAnswer: string,     // "A", "B", "C", or "D"
    correctOptionText: string  // Text of the correct answer
}
```

**Returns:**
- HTML string with full QC C.O.R.E analysis

**Example:**
```javascript
const explanation = generator.generate({
    questionText: "The book _____ on the table.",
    options: ["is", "are", "were", "being"],
    correctAnswer: "A",
    correctOptionText: "is"
});
```

##### **detectConcept(questionText, options)**
Identifies the grammar concept being tested.

**Returns:**
```javascript
{
    concept: string,  // Full name in English & Indonesian
    name: string      // Concept identifier
}
```

##### **analyzeSentence(sentence)**
Analyzes S-V-C structure of a sentence.

**Returns:**
```javascript
{
    subject: string,       // Subject or "[KOSONG/BLANK]"
    verb: string,          // Verb or "[KOSONG/BLANK]"
    complement: string,    // Complement or "[KOSONG/BLANK]"
    formula: string        // "SV", "SVC", "SVO", etc.
}
```

##### **generateSentenceBreakdown(sentence, analysis)**
Creates color-coded HTML breakdown.

**Returns:**
- HTML string with highlighted components and tag labels

##### **generateElimination(options, correctAnswer)**
Analyzes each option for correctness.

**Returns:**
```javascript
[
    {
        option: string,       // "(A) Text"
        explanation: string,  // Why correct or wrong
        isCorrect: boolean
    },
    ...
]
```

---

## Color Scheme

| Component | Hex Color | RGB | Usage |
|-----------|-----------|-----|-------|
| Subject | #0EA5E9 | (14, 165, 233) | Highlights subject in sentence |
| Verb | #30B0C7 | (48, 176, 199) | Highlights verb in sentence |
| Complement | #E675C9 | (230, 117, 201) | Highlights complements/modifiers |
| Success | #16a34a | (22, 163, 74) | Correct answers (green) |
| Error | #dc2626 | (220, 38, 38) | Incorrect answers (red) |

---

## Explanation Structure (HTML Output)

```html
<div style="font-family: 'Poppins', sans-serif; color: #334155; line-height: 1.8;">
    
    <!-- Header: Why (A)? -->
    <h3>Why (A)?</h3>
    <p><u><strong>Correct Answer</strong></u>, rest of sentence here...</p>
    
    <!-- QC C.O.R.E Banner -->
    <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; ...">
        💡 QC C.O.R.E ANALYSIS
    </div>
    
    <!-- C - Concept -->
    <div style="background: #f0f9ff; border-left: 4px solid #0ea5e9; ...">
        <strong>C - Concept:</strong> [Concept Name]
    </div>
    
    <!-- O - Observe S-V-C -->
    <div>
        <strong>O - Observe S-V-C:</strong>
        <!-- Color-coded sentence with tag boxes -->
        <!-- Observation bullets -->
    </div>
    
    <!-- R - Requirement -->
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; ...">
        <strong>R - Requirement:</strong> [Analysis text]
    </div>
    
    <!-- E - Eliminate -->
    <div>
        <strong>E - Eliminate:</strong>
        <!-- Option analysis for A, B, C, D -->
    </div>
    
</div>
```

---

## Grammar Patterns Detected

The generator recognizes these grammar concepts:

1. **Subject & Appositive** - Noun phrases with descriptive commas
2. **Subject-Verb Agreement** - Singular/plural verb matching
3. **Participles as Modifiers** - -ing and -ed forms as adjectives
4. **Reduced Relative Clauses** - Omitted relative pronouns and verbs
5. **Inversion** - Inverted word order for emphasis
6. **Prepositions** - Correct preposition selection
7. **Double Verb** - Improper verb combinations

Each pattern has specific detection rules and explanation templates.

---

## Customization

### Add Custom Grammar Concept

Edit `js/explanation-generator.js`:

```javascript
this.grammarRules = {
    "Your Concept Name": {
        concept: "Your Concept (Indonesian Name)",
        patterns: ["word1", "word2", "pattern"],
        indicators: ["key", "words"],
    },
    ...
};
```

### Modify Color Scheme

Search for color hex codes in `generateSentenceBreakdown()`:
- `#0EA5E9` = Subject
- `#30B0C7` = Verb
- `#E675C9` = Complement

Change to your brand colors.

### Adjust Layout

Edit the HTML template in the `generate()` method to match your design system.

---

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers

Requires ES6 support (arrow functions, template literals, etc.).

---

## Performance

- **Generation time:** < 50ms per question
- **File size:** ~15KB (minified ~5KB)
- **Memory:** Minimal - stateless except for grammar rules lookup
- **Processing:** 100% client-side, no network calls

---

## Future Enhancements

- [ ] Support for Part B (Written Expression) questions
- [ ] Multi-language explanations (Indonesian, Mandarin, etc.)
- [ ] Audio pronunciation of explanations
- [ ] Interactive drill mode with hints
- [ ] Export explanations as PDF
- [ ] Spaced repetition integration
- [ ] Performance analytics per concept

---

## Troubleshooting

### Explanation doesn't generate

**Check:**
1. Question object has `questionText`, `options`, `correctAnswer`, `correctOptionText`
2. No JavaScript errors in console
3. `explanation-generator.js` is loaded

### Colors not displaying

**Check:**
1. CSS not overriding inline styles
2. Browser supports CSS gradients
3. No CSS filter affecting background colors

### Wrong concept detected

**Fix:**
1. Add pattern keywords to `grammarRules`
2. Improve pattern matching logic
3. Manually set concept in UI if needed

---

## License

Integrated into TOEFL ITP QuickCheck system.

---

## Support

For questions or issues:
1. Check demo page: `test-qc-core-explainer.html`
2. Review API reference above
3. Inspect browser console for errors
4. Test with example questions first

---

**Last Updated:** 2025-07-27  
**Version:** 1.0.0 (Initial Release)
