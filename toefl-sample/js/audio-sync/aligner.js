/*
 * Forced alignment bridge.
 * Option A: Deepgram prerecorded transcription + utterance mapping.
 * Option B: WhisperX local Python script bridge.
 */

"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalizeText(text).split(" ").filter(Boolean);
}

function jaccardScore(left, right) {
  const l = new Set(tokenize(left));
  const r = new Set(tokenize(right));
  if (l.size === 0 || r.size === 0) return 0;

  let intersection = 0;
  for (const token of l) {
    if (r.has(token)) intersection += 1;
  }
  const union = l.size + r.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function precision3(num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(3));
}

function flattenTranscript(parsedQuestions) {
  const flattened = [];
  for (const q of parsedQuestions || []) {
    const lines = Array.isArray(q.transcript) ? q.transcript : [];
    lines.forEach((line, idx) => {
      flattened.push({
        question_number: q.question_number,
        transcript_index: idx,
        speaker: String(line?.speaker || "Narrator"),
        text: String(line?.text || "")
      });
    });
  }
  return flattened;
}

function mapUtterancesToTranscript(transcriptLines, utterances) {
  const mapped = [];
  let cursor = 0;

  for (const line of transcriptLines) {
    let best = null;
    let bestScore = -1;

    // Search forward first to preserve chronology.
    for (let i = cursor; i < utterances.length; i += 1) {
      const candidate = utterances[i];
      const score = jaccardScore(line.text, candidate.transcript);
      if (score > bestScore) {
        bestScore = score;
        best = { ...candidate, _idx: i };
      }
      if (score >= 0.92) break;
    }

    // Fallback full scan when no close match found in forward scan.
    if (!best || bestScore < 0.25) {
      for (let i = 0; i < utterances.length; i += 1) {
        const candidate = utterances[i];
        const score = jaccardScore(line.text, candidate.transcript);
        if (score > bestScore) {
          bestScore = score;
          best = { ...candidate, _idx: i };
        }
      }
    }

    if (best) {
      cursor = Math.max(cursor, best._idx + 1);
      mapped.push({
        ...line,
        start: precision3(best.start),
        end: precision3(best.end),
        confidence: precision3(bestScore)
      });
    } else {
      mapped.push({
        ...line,
        start: null,
        end: null,
        confidence: 0
      });
    }
  }

  return mapped;
}

function rehydrateQuestionsWithAlignment(parsedQuestions, mappedLines) {
  const grouped = new Map();
  for (const line of mappedLines) {
    const key = `${line.question_number}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(line);
  }

  return (parsedQuestions || []).map((q) => {
    const key = `${q.question_number}`;
    const alignedLines = (grouped.get(key) || [])
      .sort((a, b) => a.transcript_index - b.transcript_index)
      .map((line) => ({
        speaker: line.speaker,
        text: line.text,
        start: line.start,
        end: line.end
      }));

    return {
      ...q,
      transcripts: alignedLines
    };
  });
}

async function alignWithDeepgram(params) {
  const {
    audioUrl,
    parsedQuestions,
    deepgramApiKey,
    model = "nova-3"
  } = params || {};

  if (!audioUrl) throw new Error("alignWithDeepgram: audioUrl is required");
  if (!Array.isArray(parsedQuestions)) throw new Error("alignWithDeepgram: parsedQuestions must be an array");

  const apiKey = deepgramApiKey || process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("Deepgram API key missing. Provide deepgramApiKey or set DEEPGRAM_API_KEY.");
  }

  let deepgramSdk;
  try {
    deepgramSdk = require("@deepgram/sdk");
  } catch {
    throw new Error("Missing @deepgram/sdk dependency. Run: npm install @deepgram/sdk");
  }

  const { createClient } = deepgramSdk;
  const deepgram = createClient(apiKey);

  let response;
  try {
    response = await deepgram.listen.prerecorded.transcribeUrl(
      { url: audioUrl },
      {
        model,
        smart_format: true,
        diarize: true,
        utterances: true,
        punctuate: true,
        paragraphs: false,
        detect_language: true
      }
    );
  } catch (error) {
    throw new Error(`Deepgram request failed: ${error?.message || String(error)}`);
  }

  const utterances = response?.result?.results?.utterances || response?.results?.utterances || [];
  if (!Array.isArray(utterances) || utterances.length === 0) {
    throw new Error("Deepgram alignment returned no utterances.");
  }

  const transcriptLines = flattenTranscript(parsedQuestions);
  const mapped = mapUtterancesToTranscript(transcriptLines, utterances);
  const alignedQuestions = rehydrateQuestionsWithAlignment(parsedQuestions, mapped);

  return {
    provider: "deepgram",
    audio_url: audioUrl,
    utterance_count: utterances.length,
    questions: alignedQuestions
  };
}

async function alignWithWhisperXScript(params) {
  const {
    audioUrl,
    parsedQuestions,
    pythonCommand = "python",
    scriptPath = path.resolve(__dirname, "whisperx_aligner.py")
  } = params || {};

  if (!audioUrl) throw new Error("alignWithWhisperXScript: audioUrl is required");
  if (!Array.isArray(parsedQuestions)) throw new Error("alignWithWhisperXScript: parsedQuestions must be an array");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "toefl-align-"));
  const inputPath = path.join(tmpDir, "input.json");
  const outputPath = path.join(tmpDir, "output.json");

  const payload = {
    audio_url: audioUrl,
    questions: parsedQuestions
  };

  await fs.writeFile(inputPath, JSON.stringify(payload, null, 2), "utf8");

  const args = [scriptPath, "--input", inputPath, "--output", outputPath];

  const proc = spawn(pythonCommand, args, {
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  let stdout = "";
  proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  const exitCode = await new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`WhisperX aligner failed (code ${exitCode}): ${stderr || stdout}`);
  }

  const outputRaw = await fs.readFile(outputPath, "utf8");
  const output = JSON.parse(outputRaw);

  return {
    provider: "whisperx",
    ...output
  };
}

module.exports = {
  alignWithDeepgram,
  alignWithWhisperXScript,
  mapUtterancesToTranscript,
  rehydrateQuestionsWithAlignment
};
