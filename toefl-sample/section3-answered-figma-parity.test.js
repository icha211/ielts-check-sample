const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const target = path.resolve(__dirname, '..', 'section 3-answered.html');
const html = fs.readFileSync(target, 'utf8');

// Core layout parity checkpoints from Figma frame 1198:1916
assert(html.includes('grid-template-columns: 707px 731px;'), 'Expected 707/731 two-column canvas sizing');
assert(html.includes('width: 701px;'), 'Expected left reading card width 701px');
assert(html.includes('width: 689px;'), 'Expected right review card width 689px');
assert(html.includes('min-height: 836px;'), 'Expected 836px panel height baseline');

// Typography and panel behavior checkpoints
assert(html.includes('font: 400 18px/1.42 Arial, sans-serif;'), 'Expected passage body typography to match design');
assert(html.includes('font: 400 12px/1.35 Inter, Arial, sans-serif;'), 'Expected explanation body typography to match design');
assert(html.includes('function renderHeaderNavigator(result, activeQuestionNumber)'), 'Missing header navigator renderer');
assert(html.includes('header-question-row'), 'Expected explicit header row rendering class for chip layout');

// Highlighting behavior checkpoints
assert(html.includes('passage-highlight'), 'Expected passage highlight class to exist');
assert(html.includes('applyPhraseHighlightsToHtml'), 'Expected highlight application function');
assert(html.includes('extractHighlightPhrases'), 'Expected phrase extraction function');

console.log('section3-answered parity checks passed');
