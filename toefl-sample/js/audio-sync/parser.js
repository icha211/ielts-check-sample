/*
 * Smart input parser for TOEFL/IELTS listening editors.
 *
 * Input format example:
 * 1.
 * Man: ...
 * Woman: ...
 * Narrator: ...
 * A. ...
 * B. ...
 * C. ...
 * D. ...
 */

(function bootstrap(globalScope) {
  "use strict";

  const QUESTION_START_RE = /^\s*(\d{1,3})[.)]\s*(.*)$/;
  const OPTION_START_RE = /^\s*[\[(]?([A-D])[\])\.:\-]\s*(.*)$/i;
  const SPEAKER_RE = /^\s*(Man|Woman|Narrator|Speaker\s*[A-Z]|Host|Interviewer|Professor|Student)\s*:\s*(.+)$/i;

  function normalizeLineBreaks(text) {
    return String(text || "").replace(/\r\n?/g, "\n");
  }

  function normalizeWhitespace(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function splitQuestionBlocks(rawText) {
    const lines = normalizeLineBreaks(rawText).split("\n");
    const blocks = [];
    let current = null;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const startMatch = line.match(QUESTION_START_RE);

      if (startMatch) {
        if (current) blocks.push(current);
        current = {
          questionNumber: Number(startMatch[1]),
          rawLines: [],
          firstLineTail: normalizeWhitespace(startMatch[2])
        };
        if (current.firstLineTail) {
          current.rawLines.push(current.firstLineTail);
        }
        continue;
      }

      if (current) {
        current.rawLines.push(line);
      }
    }

    if (current) blocks.push(current);
    return blocks;
  }

  function parseQuestionBlock(block) {
    const options = [];
    const transcript = [];
    let currentOption = null;
    let currentUtterance = null;

    for (const rawLine of block.rawLines) {
      const line = normalizeWhitespace(rawLine);
      if (!line) continue;

      const optionMatch = line.match(OPTION_START_RE);
      if (optionMatch) {
        const optionLetter = optionMatch[1].toUpperCase();
        const optionText = normalizeWhitespace(optionMatch[2]);
        currentOption = {
          letter: optionLetter,
          text: optionText
        };
        options.push(currentOption);
        currentUtterance = null;
        continue;
      }

      const speakerMatch = line.match(SPEAKER_RE);
      if (speakerMatch) {
        const speaker = speakerMatch[1]
          .replace(/\s+/g, " ")
          .trim()
          .replace(/^speaker\s*([a-z])$/i, (_, x) => `Speaker ${x.toUpperCase()}`)
          .replace(/^man$/i, "Man")
          .replace(/^woman$/i, "Woman")
          .replace(/^narrator$/i, "Narrator");

        const text = normalizeWhitespace(speakerMatch[2]);
        currentUtterance = { speaker, text };
        transcript.push(currentUtterance);
        currentOption = null;
        continue;
      }

      // Continuation lines:
      // 1) continue current option text if we are in options section
      // 2) continue current speaker text if we are in transcript section
      if (currentOption) {
        currentOption.text = normalizeWhitespace(`${currentOption.text} ${line}`);
        continue;
      }

      if (currentUtterance) {
        currentUtterance.text = normalizeWhitespace(`${currentUtterance.text} ${line}`);
      }
    }

    return {
      question_number: block.questionNumber,
      options: options.map((opt) => `(${opt.letter}) ${opt.text}`),
      transcript
    };
  }

  function validateResult(parsedQuestions, strict) {
    const errors = [];

    parsedQuestions.forEach((q) => {
      if (!Array.isArray(q.options) || q.options.length === 0) {
        errors.push(`Question ${q.question_number}: no options detected`);
      }
      if (!Array.isArray(q.transcript) || q.transcript.length === 0) {
        errors.push(`Question ${q.question_number}: no speaker transcript detected`);
      }
    });

    if (strict && errors.length > 0) {
      const error = new Error(`Smart parser validation failed: ${errors.join("; ")}`);
      error.details = errors;
      throw error;
    }

    return errors;
  }

  function parseSmartInput(rawText, options) {
    const opts = options && typeof options === "object" ? options : {};
    const strict = Boolean(opts.strict);

    if (typeof rawText !== "string") {
      throw new TypeError("parseSmartInput(rawText): rawText must be a string");
    }

    const normalized = normalizeLineBreaks(rawText).trim();
    if (!normalized) {
      return {
        questions: [],
        warnings: ["Input is empty"],
        raw: rawText
      };
    }

    const blocks = splitQuestionBlocks(normalized);
    if (blocks.length === 0) {
      throw new Error("No question blocks found. Expected lines like '1.' or '2.'");
    }

    const questions = blocks.map(parseQuestionBlock);
    const warnings = validateResult(questions, strict);

    return {
      questions,
      warnings,
      raw: rawText
    };
  }

  const api = {
    parseSmartInput,
    _internals: {
      splitQuestionBlocks,
      parseQuestionBlock,
      normalizeWhitespace
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.smartInputParser = api;
})(typeof window !== "undefined" ? window : globalThis);
