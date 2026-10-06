(function () {
    function parseQuestions(rawText, passageNumber) {
        const text = String(rawText || "").replace(/\r/g, "");
        const blocks = {};
        const headings = Array.from(text.matchAll(/^\s*(?:#{1,6}\s*)?(?:\*\*\s*)?(?:question\s+)?(\d+)\s*[.):]?\s*(?:\*\*)?\s*(.*)$/gim));
        headings.forEach((heading, index) => {
            const end = index + 1 < headings.length ? headings[index + 1].index : text.length;
            const content = [heading[2].trim(), text.slice(heading.index + heading[0].length, end).trim()]
                .filter(Boolean).join("\n");
            if (content) blocks[`${passageNumber}_${Number(heading[1])}`] = content;
        });
        return blocks;
    }

    function parseAll(rawText) {
        const text = String(rawText || "").replace(/\r/g, "");
        const blocks = {};
        const headings = Array.from(text.matchAll(/^\s*(?:#{1,6}\s*)?(?:\*\*\s*)?(?:passage|part)\s+(\d+)\s*[:.]?\s*(?:\*\*)?\s*$/gim));
        if (!headings.length) return parseQuestions(text, 1);
        headings.forEach((heading, index) => {
            const start = heading.index + heading[0].length;
            const end = index + 1 < headings.length ? headings[index + 1].index : text.length;
            Object.assign(blocks, parseQuestions(text.slice(start, end), Number(heading[1])));
        });
        return blocks;
    }

    function toBulkText(blocks) {
        const passages = new Map();
        Object.entries(blocks).forEach(([key, content]) => {
            const [passage, question] = key.split("_").map(Number);
            if (!passages.has(passage)) passages.set(passage, []);
            passages.get(passage).push({ question, content });
        });
        return [...passages].sort(([left], [right]) => left - right).map(([passage, questions]) =>
            `Passage ${passage}\n\n${questions.sort((left, right) => left.question - right.question)
                .map(({ question, content }) => `**Question ${question}**\n${content}`).join("\n\n")}`
        ).join("\n\n");
    }

    function getDraftBulkText(draft, language) {
        const field = language === "en" ? "bulkExplanationEn" : "bulkExplanationId";
        const blocks = {};
        Object.entries(draft.passages || {}).forEach(([passage, row]) => {
            if (language !== "en") Object.assign(blocks, parseQuestions(row.explanation, passage));
            Object.assign(blocks, parseQuestions(row[field], passage));
        });
        Object.assign(blocks, parseAll(draft[field]));
        return toBulkText(blocks);
    }

    window.readingExplanations = { parseQuestions, parseAll, getDraftBulkText };
})();
