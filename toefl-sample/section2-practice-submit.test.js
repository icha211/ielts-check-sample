const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "section 2.html"), "utf8");

function functionSource(name, nextName) {
    const functionIndex = source.indexOf(`function ${name}(`);
    const start = source.lastIndexOf("\n", functionIndex) + 1;
    const end = source.indexOf(`\n        function ${nextName}(`, start);
    assert.ok(start >= 0 && end > start, `Missing ${name}`);
    return source.slice(start, end);
}

test("instant practice submission saves answers and opens the Structure summary", async () => {
    const saved = new Map();
    const params = new URLSearchParams("testType=practicetest&runMode=instant&setDate=2026-10-28");
    const context = vm.createContext({
        URLSearchParams,
        Date,
        Math,
        Number,
        Object,
        String,
        parseInt,
        clearInterval() {},
        timerInterval: null,
        globalAnswerKey: { "1_1": "a" },
        globalQuestions: { "1_1": { questionText: "Choose the correct answer", options: { A: "correct" } } },
        PARTS: [{ id: 1, name: "Structure" }],
        currentSetId: "practice-structure-2026-10-28",
        currentTestType: "practicetest",
        currentPackageDate: "2026-10-28",
        isInstantFeedbackMode: () => true,
        getSection2PracticeRunMode: () => "instant",
        getPracticeVariant: () => ({ focus: "structure" }),
        getSection2ExplanationSource: () => "Explanation",
        parseIndexedLineMap: () => ({}),
        document: {
            getElementById(id) {
                return id === "set-date" ? { value: "2026-10-28" } : null;
            },
            querySelector() {
                return { value: "A" };
            }
        },
        localStorage: {
            setItem(key, value) {
                saved.set(key, value);
            }
        },
        window: { location: { search: params.toString(), href: "" } }
    });

    vm.runInContext(`${functionSource("submitAnswers", "startTimer")}; submitAnswers(true)`, context);
    await new Promise((resolve) => setImmediate(resolve));

    const destination = new URL(context.window.location.href, "https://example.test/toefl-sample/");
    assert.equal(destination.pathname, "/toefl-sample/full-test-summary.html");
    assert.equal(destination.searchParams.get("testType"), "practicetest");
    assert.equal(destination.searchParams.get("section"), "structure");
    assert.equal(destination.searchParams.get("runMode"), "instant");

    const result = JSON.parse(saved.get("toefl_section2_result"));
    assert.equal(result.questions[0].userAnswer, "a");
    assert.equal(result.questions[0].isCorrect, true);
});

test("instant submit uses the shared result flow after copying selected answers", () => {
    assert.match(functionSource("finishInstantPractice", "renderInstantQuestion"), /submitAnswers\(true\)/);
    assert.match(source, /submitBtn\.addEventListener\("click", \(\) => submitAnswers\(\)\)/);
});
