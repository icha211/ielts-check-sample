(function () {
    "use strict";

    const SOURCES = [
        {
            sectionId: "listening",
            storageKey: "toefl_section1_result",
            groupKey: "partId",
            groupNames: {
                1: "Part A: Short Conversation",
                2: "Part B: Long Conversation",
                3: "Part C: Short Talks"
            }
        },
        {
            sectionId: "structure",
            storageKey: "toefl_section2_result",
            groupKey: "partId",
            groupNames: { 1: "Structure", 2: "Written Expression" }
        },
        {
            sectionId: "reading",
            storageKey: "toefl_section3_result",
            groupKey: "passageId",
            groupNames: {}
        }
    ];

    function getRecommendations() {
        const recommendations = [];

        SOURCES.forEach((source) => {
            let result;
            try {
                result = JSON.parse(localStorage.getItem(source.storageKey) || "null");
            } catch (error) {
                console.warn(`[PracticeRecommendations] Could not read ${source.storageKey}:`, error);
                return;
            }
            if (!result || !Array.isArray(result.questions) || !result.questions.length) return;

            const groups = new Map();
            const sectionRecommendations = [];
            result.questions.forEach((question) => {
                if (!question || typeof question !== "object") return;
                const id = question[source.groupKey] ?? question.partId ?? 1;
                if (!groups.has(id)) groups.set(id, []);
                groups.get(id).push(question);
            });

            groups.forEach((questions, id) => {
                const correctCount = questions.filter((question) => question.isCorrect === true).length;
                const accuracy = Math.round((correctCount / questions.length) * 100);
                const sectionName = source.sectionId === "structure"
                    ? "Structure & Writing"
                    : source.sectionId[0].toUpperCase() + source.sectionId.slice(1);
                const fallbackLabel = source.sectionId === "reading" ? `Passage ${id}` : `Part ${id}`;
                const practiceFocus = source.sectionId === "listening"
                    ? `part${["a", "b", "c"][Number(id) - 1] || "a"}`
                    : source.sectionId === "structure"
                        ? `part${Number(id) === 2 ? "b" : "a"}`
                        : "";
                sectionRecommendations.push({
                    sectionId: source.sectionId,
                    sectionName,
                    focus: source.groupNames[id] || questions[0]?.partName || fallbackLabel,
                    practiceFocus,
                    accuracy
                });
            });

            sectionRecommendations.sort((first, second) => first.accuracy - second.accuracy);
            if (sectionRecommendations.length) recommendations.push(sectionRecommendations[0]);
        });

        return recommendations.sort((first, second) => first.accuracy - second.accuracy).slice(0, 3);
    }

    window.toeflPracticeRecommendations = Object.freeze({ getRecommendations });
})();
