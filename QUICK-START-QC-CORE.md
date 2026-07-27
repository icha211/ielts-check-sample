# 🎯 QC C.O.R.E Generator - Quick Start Guide

## What You Just Got

✅ **Local AI Explanation Generator** - Creates grammar explanations without APIs  
✅ **QC C.O.R.E Framework** - Concept • Observe • Requirement • Eliminate  
✅ **Color-Coded Breakdowns** - Visual HTML with highlighted sentence components  
✅ **Works 100% Offline** - No internet required after loading  

---

## 3 Ways to Use

### 1️⃣ **Test It Now (Demo Page)**

```
Open: toefl-sample/test-qc-core-explainer.html
```

Features:
- 2 pre-loaded examples (click "Generate Explanation")
- Custom question builder (fill in your own questions)
- Real-time explanation generation
- See exactly what the output looks like

**In Browser:**
```
1. Open file in Chrome/Firefox/Safari
2. Click "Generate Explanation" button
3. View color-coded QC C.O.R.E breakdown
```

---

### 2️⃣ **Use in Your HTML**

```javascript
<script src="js/explanation-generator.js"></script>

<script>
const gen = new ExplanationGenerator();

const html = gen.generate({
    questionText: "_____ is important for success.",
    options: ["Hardwork", "Hard work", "Working hard", "To work hard"],
    correctAnswer: "B",
    correctOptionText: "Hard work"
});

document.getElementById("output").innerHTML = html;
</script>
```

---

### 3️⃣ **Use in Section 2 Answered Page**

Already integrated! Use:

```javascript
// Generate explanation for a question
const html = generateQCCOREExplanation(questionObject);

// Render directly to a container
renderQCCOREExplanation("container-id", questionObject);

// Access the generator
window.explanationGeneratorInstance.detectConcept(text, options);
```

---

## Output Example

### Input:
```
Question: "_____, a major source of renewable energy, 
           harnesses the power of falling water to 
           generate electricity."

Options:
(A) Hydroelectric power      ← CORRECT
(B) Hydroelectric power is
(C) That hydroelectric power
(D) It is hydroelectric power
```

### Output (QC C.O.R.E):

```
Why (A)?

Hydroelectric power, a major source of renewable energy, 
harnesses the power of falling water to generate electricity.

💡 QC C.O.R.E ANALYSIS

C - Concept: Subject & Appositive

O - Observe S-V-C:
[Colored sentence breakdown with tag boxes]
• Subject: [KOSONG/BLANK]
• Verb: harnesses
• Complement: Frasa diapit dua koma adalah Appositive

R - Requirement:
Kalimat ini sudah memiliki Verb namun belum memiliki Subject. 
Karena tidak ada Connector, kita hanya butuh satu Subject.

E - Eliminate:
✓ (A) Hydroelectric power: Noun Phrase yang sempurna sebagai Subject
✕ (B) Hydroelectric power is: Double Verb tanpa konektor
✕ (C) That hydroelectric power: Mengubah menjadi Dependent Clause
✕ (D) It is hydroelectric power: Double Subject dan Double Verb
```

---

## Color Guide

When viewing explanations, look for these colors:

| Color | Component | What It Means |
|-------|-----------|---|
| 🔵 Blue (#0EA5E9) | **Subject** | Who/what is doing the action |
| 🔷 Teal (#30B0C7) | **Verb** | The action/state |
| 🟣 Pink (#E675C9) | **Complement** | What's affected, modifiers, appositive |
| 🟢 Green | **✓ Correct** | Right answer, grammatically sound |
| 🔴 Red | **✕ Wrong** | Error explanation |

---

## Key Features

### ✨ Auto-Detects Grammar Concepts

Recognizes:
- Subject & Appositive
- Subject-Verb Agreement
- Participles as Modifiers
- Reduced Relative Clauses
- Inversion
- Prepositions
- Double Verb problems

### 📊 Analyzes Sentence Structure (S-V-C)

Breaks down into:
- **S** = Subject
- **V** = Verb
- **C** = Complement/Modifier

Displays in color-coded HTML with tag labels.

### 💡 Generates 5 Sections Per Explanation

1. **Why (Answer)?** - Rewritten sentence with answer
2. **C - Concept** - Grammar topic identified
3. **O - Observe** - Color breakdown + observations
4. **R - Requirement** - What's needed
5. **E - Eliminate** - Why each option is right/wrong

---

## Function Reference

### Generate HTML
```javascript
const gen = new ExplanationGenerator();
const html = gen.generate(questionData);
```

### Detect Concept
```javascript
const concept = gen.detectConcept(questionText, options);
// Returns: { concept: "...", name: "..." }
```

### Analyze Sentence
```javascript
const analysis = gen.analyzeSentence(sentence);
// Returns: { subject, verb, complement, formula }
```

### Global Functions (In section 2-answered.html)
```javascript
generateQCCOREExplanation(question)    // → HTML string
renderQCCOREExplanation(id, question)  // → renders to DOM
```

---

## Files Overview

| File | Purpose |
|------|---------|
| `js/explanation-generator.js` | Core generator engine (~15KB) |
| `section 2-answered.html` | Integrated with global functions |
| `test-qc-core-explainer.html` | Interactive demo page |
| `QC-CORE-DOCUMENTATION.md` | Full technical docs |

---

## Next Steps

### For Developers:
1. ✅ Review `js/explanation-generator.js` 
2. ✅ Test with `test-qc-core-explainer.html`
3. ✅ Integrate into your UI components
4. ✅ Customize grammar rules if needed

### For Content Creators:
1. ✅ Open `test-qc-core-explainer.html` to see examples
2. ✅ Test your question with the custom builder
3. ✅ Review output for accuracy
4. ✅ Adjust question data if needed

### For Teachers:
1. ✅ Share `test-qc-core-explainer.html` with students
2. ✅ Show the QC C.O.R.E framework in action
3. ✅ Use for creating explanations for test reviews
4. ✅ Reference for classroom teaching

---

## Troubleshooting

### Issue: Explanation not generating
**Fix:** Check that `explanation-generator.js` is loaded
```javascript
console.log(window.ExplanationGenerator);  // Should not be undefined
```

### Issue: Wrong grammar concept detected
**Fix:** Improve question wording or edit `grammarRules` in the JS file

### Issue: Colors not showing
**Fix:** Check browser console for CSS issues, ensure no conflicting styles

### Issue: Performance is slow
**Fix:** This generator runs in < 50ms, check other page components

---

## Example Questions to Try

**Subject & Appositive:**
```
"_____, an ancient city in Peru, is visited by thousands of tourists yearly."
(A) Machu Picchu  (B) Machu Picchu is  (C) That Machu Picchu  (D) It is Machu Picchu
```

**Subject-Verb Agreement:**
```
"The committee of experienced members _____ their recommendations today."
(A) have given  (B) has given  (C) have giving  (D) is given
```

**Participles as Modifiers:**
```
"_____ in the garden, the children played happily all afternoon."
(A) Playing  (B) To play  (C) Play  (D) Played
```

---

## Pro Tips

💡 **Tip 1:** Use for test prep - students can understand grammar rules clearly  
💡 **Tip 2:** Works offline - perfect for locations without internet  
💡 **Tip 3:** Customize colors to match your brand  
💡 **Tip 4:** Works with any TOEFL grammar question  
💡 **Tip 5:** Can be extended to other language tests  

---

## Support Resources

📖 **Full Documentation:** See `QC-CORE-DOCUMENTATION.md`  
🧪 **Test It:** Open `test-qc-core-explainer.html`  
💻 **Source Code:** Review `js/explanation-generator.js`  
🚀 **Integration:** Check `section 2-answered.html`  

---

**Ready to use!** 🎉

Start with the demo page → test with examples → integrate into your system
