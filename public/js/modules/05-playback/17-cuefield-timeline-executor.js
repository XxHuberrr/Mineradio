(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CuefieldTimelineExecutor = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function toNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, toNumber(value, min)));
  }

  function round(value, digits) {
    var factor = Math.pow(10, digits == null ? 3 : digits);
    return Math.round(toNumber(value, 0) * factor) / factor;
  }

  function normalizeAction(action, leadSec, targetVolume) {
    action = action || {};
    var value = clamp(action.value == null ? 1 : action.value, 0, 1);
    var normalized = {
      t: round(toNumber(action.t, 0)),
      delayMs: Math.max(0, Math.round((toNumber(action.t, 0) + leadSec) * 1000)),
      durationMs: Math.max(0, Math.round(toNumber(action.duration, 0))),
      deck: action.deck === 'A' ? 'A' : (action.deck === 'AB' ? 'AB' : 'B'),
      op: String(action.op || ''),
      type: String(action.type || ''),
      value: value,
      at: Math.max(0, toNumber(action.at, 0)),
    };
    if (normalized.op === 'volume') normalized.target = round(targetVolume * value);
    return normalized;
  }

  function leadFromTimeline(timeline, fallback) {
    var lead = 0;
    for (var i = 0; i < timeline.length; i++) {
      var t = toNumber(timeline[i] && timeline[i].t, 0);
      if (t < 0) lead = Math.max(lead, Math.abs(t));
    }
    return lead > 0 ? round(lead) : fallback;
  }

  function bStartFromTimeline(timeline, fallback) {
    for (var i = 0; i < timeline.length; i++) {
      var action = timeline[i] || {};
      if (action.deck === 'B' && action.op === 'play') return Math.max(0, toNumber(action.at, fallback));
    }
    return fallback;
  }

  function fallbackTimeline(opts) {
    var mode = opts.executionMode || 'filtered-pickup';
    var entryTime = Math.max(0, toNumber(opts.entryTime, 0));
    if (mode === 'intro-bed') {
      var introLead = 5.2;
      return {
        leadSec: introLead,
        bStart: Math.max(0, entryTime - Math.min(5.2, Math.max(2.2, entryTime * 0.7))),
        actions: [
          { t: -introLead, deck: 'B', op: 'play', at: Math.max(0, entryTime - introLead), volume: 0 },
          { t: -introLead, deck: 'B', op: 'volume', value: 0.32, duration: 1700 },
          { t: -3.5, deck: 'A', op: 'volume', value: 0, duration: 2700 },
          { t: -3.5, deck: 'B', op: 'volume', value: 1, duration: 2700 },
          { t: -1.06, deck: 'B', op: 'handoff' },
        ],
      };
    }
    return {
      leadSec: 2.8,
      bStart: Math.max(0, entryTime - Math.min(2.4, Math.max(0.8, entryTime * 0.45))),
      actions: [
        { t: -2.8, deck: 'B', op: 'play', at: Math.max(0, entryTime - 2.8), volume: 0 },
        { t: -2.8, deck: 'B', op: 'volume', value: 1, duration: 2600 },
        { t: -2.8, deck: 'A', op: 'volume', value: 0, duration: 2600 },
        { t: -0.46, deck: 'B', op: 'handoff' },
      ],
    };
  }

  function buildCuefieldTimelineExecution(opts) {
    opts = opts || {};
    var rawTimeline = Array.isArray(opts.timeline) ? opts.timeline.slice() : [];
    var targetVolume = clamp(opts.targetVolume == null ? 1 : opts.targetVolume, 0, 1);
    var fallback = rawTimeline.length ? null : fallbackTimeline(opts);
    var timeline = rawTimeline.length ? rawTimeline : fallback.actions;
    var leadSec = rawTimeline.length ? leadFromTimeline(timeline, 2.8) : fallback.leadSec;
    var entryTime = Math.max(0, toNumber(opts.entryTime, 0));
    var bStart = rawTimeline.length ? bStartFromTimeline(timeline, entryTime) : fallback.bStart;
    var actions = timeline
      .map(function(action) { return normalizeAction(action, leadSec, targetVolume); })
      .filter(function(action) { return !!action.op; })
      .sort(function(a, b) {
        return a.delayMs - b.delayMs || a.t - b.t;
      });
    var requiresBGraph = actions.some(function(action) {
      return action.deck === 'B' && (action.op === 'filter' || action.op === 'bass');
    });
    var handoff = actions.filter(function(action) { return action.op === 'handoff'; }).slice(-1)[0];
    var crossfade = actions.filter(function(action) { return action.op === 'crossfade'; })[0] || null;
    var lastAction = actions[actions.length - 1] || null;
    var handoffDelayMs = handoff
      ? handoff.delayMs
      : (lastAction ? lastAction.delayMs + Math.max(520, lastAction.durationMs) : Math.round(leadSec * 1000));

    return {
      leadSec: round(leadSec),
      bStart: round(bStart),
      handoffDelayMs: Math.max(520, handoffDelayMs),
      fadeStartDelayMs: crossfade ? crossfade.delayMs : 0,
      fadeDurationMs: crossfade ? Math.max(320, crossfade.durationMs) : 0,
      requiresBGraph: requiresBGraph,
      actions: actions,
    };
  }

  return {
    buildCuefieldTimelineExecution: buildCuefieldTimelineExecution,
  };
});
