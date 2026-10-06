const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const review = fs.readFileSync(path.join(__dirname, "section 1-answered.html"), "utf8");
const editor = fs.readFileSync(path.join(__dirname, "section 1.html"), "utf8");

function load(context, source, name) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, name);
    const end = source.indexOf("\n        }", start) + "\n        }".length;
    vm.runInContext(source.slice(start, end), context);
}

function fixture(type = "practicetest", parts = {}) {
    const context = vm.createContext({
        console, URLSearchParams,
        window: {
            location: { search: `?testType=${type}&setId=selected` },
            toeflStorage: { getDraftBySetIdAndType: async () => ({ parts }) }
        },
        localStorage: { getItem: () => { throw new Error("Shared draft must not be read"); } },
        reviewSetId: "selected", reviewResultData: null,
        reviewTranscriptMapByPart: { 1: {}, 2: {}, 3: {} },
        reviewGroupTranscriptMapByPart: { 1: null, 2: null, 3: null },
        reviewQuestionBoundaryMapByPart: { 1: {}, 2: {}, 3: {} },
        getReviewTestType: () => type,
        extractQuestionBlockBoundaries: () => ({})
    });
    for (const name of [
        "titleCaseSpeakerLabel", "parseTranscriptSpeakerLine", "normalizeSpeakerCode", "parsePlainSpeakerTranscript",
        "mapTranscriptByQuestion", "inferPartIdFromQuestion", "transcriptsMatch",
        "getQuestionTranscriptSegments", "refreshResultQuestionTranscriptSegments",
        "collectGroupTranscriptText", "parseQuestionRangeKey", "buildGroupTranscriptQuestionMap",
        "isTagOnlyTranscript", "hydrateTranscriptFallbackMaps"
    ]) {
        if (review.includes(`function ${name}(`)) load(context, review, name);
    }
    return context;
}

test("Listening editor and review inline JavaScript parses", () => {
    for (const html of [editor, review]) {
        for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1]);
    }
});

for (const partId of [2, 3]) {
    test(`Part ${partId} maps each practice talk to local and offset question numbers`, async () => {
        const groupTranscript = { "Talk 1: 1-4": "Man: First talk only", "Talk 2: 5-8": "Woman: Second talk only" };
        const context = fixture("practicetest", {
            [partId]: { transcript: "Man: Stale combined transcript", groupTranscript }
        });
        await context.hydrateTranscriptFallbackMaps({});
        const offset = partId === 2 ? 30 : 38;
        for (let number = 1; number <= 8; number++) {
            for (const qNum of [number, number + offset]) {
                const segments = context.getQuestionTranscriptSegments({
                    partId, number: qNum,
                    transcriptSegments: [{ text: "Stale combined transcript", timestamp: "0 - 90", confidence: 1 }]
                });
                assert.equal(segments.map((s) => s.text).join(" "), number <= 4 ? "First talk only" : "Second talk only");
            }
        }
    });
}

test("Mock Test global group ranges remain unchanged", () => {
    const context = fixture("mocktest");
    for (const [partId, offset] of [[2, 30], [3, 38]]) {
        const result = context.buildGroupTranscriptQuestionMap({
            [`${offset + 1}-${offset + 4}`]: "Man: First",
            [`${offset + 5}-${offset + 8}`]: "Man: Second"
        }, partId, false);
        assert.equal(result.byQuestion[offset + 1][0].text, "First");
        assert.equal(result.byQuestion[offset + 8][0].text, "Second");
        assert.equal(result.byQuestion[1], undefined);
    }
});

test("legacy numeric practice keys work and labeled edits take precedence", () => {
    const context = fixture();
    const result = context.buildGroupTranscriptQuestionMap({
        "Talk 1: 1-4": "Man: Updated",
        "31-34": "Man: Legacy",
        "35-38": "Man: Second"
    }, 2, true);
    assert.equal(result.byQuestion[1][0].text, "Updated");
    assert.equal(result.byQuestion[5][0].text, "Second");
    assert.equal(context.parseQuestionRangeKey("Talk 2: 5\u20138").start, 5);
});

test("missing or cleared talk never uses baked, combined, or another part's transcript", async () => {
    const context = fixture("practicetest", {
        2: { transcript: "Man: Old combined", groupTranscript: { "Talk 1: 1-4": "Man: First", "Talk 2: 5-8": "" } },
        3: { groupTranscript: { "Talk 2: 5-8": "Man: Foreign part" } }
    });
    await context.hydrateTranscriptFallbackMaps({ transcriptsByPart: { 2: "Man: Old result" } });
    const question = { partId: 2, number: 5, transcriptSegments: [{ text: "Old result", timestamp: "0 - 20" }] };
    assert.equal(context.getQuestionTranscriptSegments(question).length, 0);
    context.reviewResultData = { questions: [question] };
    context.refreshResultQuestionTranscriptSegments();
    assert.equal(question.transcriptSegments.length, 0);
});

test("refresh rejects stale alignment but preserves alignment matching the selected group", async () => {
    const context = fixture("practicetest", { 2: { groupTranscript: { "Talk 1: 1-4": "Man: First" } } });
    await context.hydrateTranscriptFallbackMaps({});
    const aligned = [{ text: "First", start: 12, end: 18, timestamp: "12 - 18", confidence: 0.9 }];
    const questions = [
        { partId: 2, number: 1, transcriptSegments: aligned },
        { partId: 2, number: 2, transcriptSegments: [{ text: "Combined", timestamp: "0 - 90" }] }
    ];
    context.reviewResultData = { questions };
    context.refreshResultQuestionTranscriptSegments();
    assert.equal(questions[0].transcriptSegments, aligned);
    assert.equal(questions[1].transcriptSegments[0].text, "First");
    assert.equal(context.getQuestionTranscriptSegments(questions[0])[0].start, 12);
});

test("preview and submission prefer group text without discarding matching timestamps", () => {
    const context = vm.createContext({});
    load(context, editor, "selectGroupTranscriptSegments");
    const group = [{ text: "Current talk" }];
    const aligned = [{ text: "Current talk", start: 17 }];
    assert.equal(context.selectGroupTranscriptSegments(aligned, group), aligned);
    assert.equal(context.selectGroupTranscriptSegments([{ text: "Combined" }], group), group);
    assert.equal((editor.match(/const resolvedSegments = selectGroupTranscriptSegments/g) || []).length, 2);
});

test("practice explanation audio selects the uploaded talk clip for Part B and C", () => {
    const context = fixture();
    context.REVIEW_AUDIO_GROUPS = {
        2: [{ key: "31-34", start: 31, end: 34 }, { key: "35-38", start: 35, end: 38 }],
        3: [{ key: "39-42", start: 39, end: 42 }, { key: "43-46", start: 43, end: 46 }]
    };
    for (const name of ["getReviewAudioGroup", "buildReviewQuestionAudioObjectKey", "getReviewQuestionAudioSourceKey"]) {
        load(context, review, name);
    }
    for (const partId of [2, 3]) {
        const offset = partId === 2 ? 30 : 38;
        for (let number = 1; number <= 8; number++) {
            const clip = number <= 4 ? "01-04" : "05-08";
            for (const questionNumber of [number, number + offset]) {
                assert.equal(context.buildReviewQuestionAudioObjectKey(partId, questionNumber),
                    `audio/listening/sets/selected/question_set/part_${partId}/q_${clip}.mp3`);
            }
        }
    }
    assert.equal(context.getReviewQuestionAudioSourceKey({ partId: 2, questionNumber: 1, objectKey: "clip" }),
        context.getReviewQuestionAudioSourceKey({ partId: 2, questionNumber: 4, objectKey: "clip" }));
    context.getReviewTestType = () => "mocktest";
    assert.ok(context.buildReviewQuestionAudioObjectKey(2, 31).endsWith("q_31-34.mp3"));
});

test("practice playback uses the talk clip without falling back to stale full-part audio", async () => {
    const context = fixture();
    context.REVIEW_AUDIO_GROUPS = {};
    context.REVIEW_R2_PUBLIC_BASE_URL = "https://audio.example.test";
    for (const name of ["getReviewAudioGroup", "buildReviewQuestionAudioObjectKey",
        "getReviewQuestionAudioRecord", "getReviewQuestionAudioSourceKey", "loadAudioForQuestion"]) {
        load(context, review, name);
    }
    context.getCloudflareQuestionAudioSource = async (key, url) => ({ url, fallbackUrls: [] });
    context.loadAudioForPart = () => { throw new Error("Must not load full-part audio"); };
    const played = [];
    context.setReviewAudioSource = (...args) => played.push(args);
    for (const partId of [2, 3]) {
        for (const number of [1, 4, 5, 8]) {
            await context.loadAudioForQuestion({
                partId, number, questionAudioUrl: "https://audio.example.test/full-part.mp3"
            });
            const clip = number <= 4 ? "01-04" : "05-08";
            assert.ok(played.at(-1)[0].endsWith(`/part_${partId}/q_${clip}.mp3`));
            assert.equal(played.at(-1)[4].length, 0);
        }
    }
});
