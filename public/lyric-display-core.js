(function(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MineradioLyricCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';

  function nextLyricDisplayMode(mode) {
    if (mode === 'off') return 'single';
    if (mode === 'single') return 'scroll';
    return 'off';
  }

  function lyricWindow(lines, currentIndex, size) {
    lines = Array.isArray(lines) ? lines : [];
    size = Math.max(1, Number(size) || 7);
    currentIndex = Math.max(0, Math.min(lines.length - 1, Number(currentIndex) || 0));
    if (!lines.length) return [];
    var before = Math.floor(size / 2);
    var start = Math.max(0, currentIndex - before);
    var end = Math.min(lines.length, start + size);
    start = Math.max(0, end - size);
    var result = [];
    for (var index = start; index < end; index++) {
      result.push({ index: index, line: lines[index], offset: index - currentIndex });
    }
    return result;
  }

  function cleanTimedLines(lines) {
    return (Array.isArray(lines) ? lines : [])
      .map(function(line, index) {
        return Object.assign({}, line || {}, {
          t: Number(line && line.t) || 0,
          text: String(line && line.text || '').trim(),
          _order: index,
        });
      })
      .filter(function(line) { return !!line.text; })
      .sort(function(a, b) { return a.t === b.t ? a._order - b._order : a.t - b.t; });
  }

  function translationTolerance(lines, index) {
    var previousGap = index > 0 ? Math.max(0, lines[index].t - lines[index - 1].t) : 0;
    var nextGap = index + 1 < lines.length ? Math.max(0, lines[index + 1].t - lines[index].t) : 0;
    var usefulGap = previousGap && nextGap ? Math.min(previousGap, nextGap) : Math.max(previousGap, nextGap);
    return Math.min(3.5, Math.max(0.35, usefulGap ? usefulGap * 0.48 : 0.35));
  }

  function alignTranslations(originalLines, translationLines) {
    var originals = cleanTimedLines(originalLines);
    var translations = cleanTimedLines(translationLines);
    var cursor = 0;
    return originals.map(function(original, index) {
      var tolerance = translationTolerance(originals, index);
      while (cursor < translations.length && translations[cursor].t < original.t - tolerance) cursor++;
      var bestIndex = -1;
      var bestDistance = Infinity;
      for (var candidate = cursor; candidate < translations.length; candidate++) {
        var delta = translations[candidate].t - original.t;
        if (delta > tolerance) break;
        var distance = Math.abs(delta);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = candidate;
        }
      }
      var copy = Object.assign({}, original);
      delete copy._order;
      copy.translation = '';
      if (bestIndex >= 0 && bestDistance <= tolerance) {
        copy.translation = translations[bestIndex].text;
        cursor = bestIndex + 1;
      }
      return copy;
    });
  }

  function mergeExactTimestampBilingual(lines) {
    var source = cleanTimedLines(lines);
    var result = [];
    for (var index = 0; index < source.length; index++) {
      var current = source[index];
      var next = source[index + 1];
      var copy = Object.assign({}, current);
      delete copy._order;
      copy.translation = String(copy.translation || '');
      if (next && Math.abs(next.t - current.t) <= 0.01 && next.text !== current.text) {
        copy.translation = next.text;
        index++;
      }
      result.push(copy);
    }
    return result;
  }

  return {
    nextLyricDisplayMode: nextLyricDisplayMode,
    lyricWindow: lyricWindow,
    alignTranslations: alignTranslations,
    mergeExactTimestampBilingual: mergeExactTimestampBilingual,
  };
});
