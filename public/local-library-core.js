(function(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MineradioLocalLibraryCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';

  function providerKey(song) {
    var provider = song && (song.provider || song.source || song.type) || 'netease';
    if (provider === 'local') return 'local';
    if (provider === 'qq') return 'qq';
    return 'netease';
  }

  function eligibleSearchProviders(status) {
    status = status || {};
    var providers = ['local'];
    if (status.qq) providers.push('qq');
    if (status.netease) providers.push('netease');
    return providers;
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[\s\-_.,，。!！?？、:：;；'"“”‘’()[\]{}【】《》<>]+/g, '')
      .trim();
  }

  function primaryArtist(song) {
    var artist = song && song.artist;
    if (Array.isArray(artist)) artist = artist[0];
    if (!artist && song && Array.isArray(song.artists)) artist = song.artists[0] && (song.artists[0].name || song.artists[0]);
    return String(artist || '');
  }

  function searchDedupeKey(song) {
    return normalizeSearchText(song && song.name) + '|' + normalizeSearchText(primaryArtist(song));
  }

  function providerPriority(song) {
    var provider = providerKey(song);
    if (provider === 'local') return song && song.available === false ? 9 : 0;
    if (provider === 'qq') return 1;
    return 2;
  }

  function dedupeSearchResults(songs) {
    var sorted = (Array.isArray(songs) ? songs : []).slice().sort(function(a, b) {
      return providerPriority(a) - providerPriority(b);
    });
    var seen = new Set();
    var result = [];
    sorted.forEach(function(song) {
      if (!song) return;
      var key = searchDedupeKey(song);
      if (!key || seen.has(key)) return;
      seen.add(key);
      result.push(song);
    });
    return result;
  }

  function selectAll(refs) {
    return new Set((Array.isArray(refs) ? refs : []).map(String));
  }

  function invertSelection(refs, selected) {
    selected = selected instanceof Set ? selected : new Set();
    var next = new Set();
    (Array.isArray(refs) ? refs : []).forEach(function(ref) {
      ref = String(ref);
      if (!selected.has(ref)) next.add(ref);
    });
    return next;
  }

  function stableSongRef(song) {
    var provider = providerKey(song);
    var id = provider === 'qq'
      ? song && (song.mid || song.songmid || song.id)
      : song && song.id;
    return id == null || id === '' ? '' : provider + ':' + String(id);
  }

  return {
    providerKey: providerKey,
    eligibleSearchProviders: eligibleSearchProviders,
    normalizeSearchText: normalizeSearchText,
    searchDedupeKey: searchDedupeKey,
    dedupeSearchResults: dedupeSearchResults,
    selectAll: selectAll,
    invertSelection: invertSelection,
    stableSongRef: stableSongRef,
  };
});
