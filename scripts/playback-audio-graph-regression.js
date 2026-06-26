const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function assertMatch(name, pattern) {
  if (!pattern.test(html)) {
    console.error(`FAIL ${name}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${name}`);
  }
}

assertMatch(
  'audio graph has a health check that rejects closed contexts',
  /function\s+audioGraphHealthy\s*\(\)\s*{[\s\S]*audioCtx\.state\s*!==\s*['"]closed['"][\s\S]*gainNode[\s\S]*}/
);

assertMatch(
  'closed AudioContext recovery replaces the media element before rebinding',
  /function\s+replaceAudioElementForGraphRecovery\s*\([\s\S]*audio\s*=\s*new\s+Audio\s*\([\s\S]*bindPlaybackProgressEvents\s*\(\s*audio\s*\)/
);

assertMatch(
  'playback attempts ensure the graph around audio.play',
  /async\s+function\s+attemptAudioPlay\s*\([\s\S]*await\s+ensurePlaybackAudioGraph\s*\([\s\S]*audio\.play\s*\(/
);

assertMatch(
  'resume handles closed contexts, not only suspended contexts',
  /function\s+resumeAudioAnalysis\s*\(\)\s*{[\s\S]*audioCtx\.state\s*===\s*['"]closed['"][\s\S]*audioCtx\.state\s*===\s*['"]suspended['"]/
);
