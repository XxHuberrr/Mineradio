(function installMineradioAppleMusicBridge() {
  'use strict';

  if (window.__mineradioAppleMusic && window.__mineradioAppleMusic.version === 1) {
    window.__mineradioAppleMusic.refresh();
    return;
  }

  var state = {
    mk: null,
    player: null,
    context: null,
    source: null,
    analyser: null,
    frequencyData: null,
    graphs: new WeakMap(),
    analyserErrorSent: false,
    lastSpectrumAt: 0,
  };

  function number(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback || 0);
  }

  function post(event) {
    window.postMessage({
      source: 'mineradio-apple-music',
      event: event,
    }, window.location.origin);
  }

  function musicKit() {
    try {
      return window.MusicKit && window.MusicKit.getInstance
        ? window.MusicKit.getInstance()
        : null;
    } catch (_) {
      return null;
    }
  }

  function artworkUrl(item) {
    var artwork = item && item.attributes && item.attributes.artwork;
    return artwork && artwork.url
      ? String(artwork.url).replace('{w}', '512').replace('{h}', '512')
      : '';
  }

  function statusEvent() {
    var mk = musicKit();
    return {
      type: 'status',
      authorized: !!(mk && mk.isAuthorized),
      storefrontId: mk && mk.storefrontId ? String(mk.storefrontId) : '',
      isPlaying: !!(mk && mk.isPlaying),
      audioContextState: state.context ? state.context.state : '',
      spectrumActive: !!state.analyser,
    };
  }

  function emitStatus() {
    post(statusEvent());
  }

  function emitNowPlaying(item) {
    item = item || (musicKit() && musicKit().nowPlayingItem);
    var attributes = item && item.attributes || {};
    post({
      type: 'now-playing',
      id: item && item.id ? String(item.id) : '',
      name: attributes.name || item && item.title || '',
      artist: attributes.artistName || item && item.artistName || '',
      album: attributes.albumName || item && item.albumName || '',
      artwork: artworkUrl(item),
      duration: number(attributes.durationInMillis, 0) / 1000,
    });
  }

  function emitPlayback() {
    var mk = musicKit();
    post({
      type: 'playback',
      isPlaying: !!(mk && mk.isPlaying),
      currentTime: number(mk && mk.currentPlaybackTime, 0),
      duration: number(mk && mk.currentPlaybackDuration, 0),
    });
  }

  function addMusicKitListener(mk, name, listener) {
    try {
      mk.addEventListener(name, listener);
    } catch (_) {}
  }

  function attachMusicKit() {
    var mk = musicKit();
    if (!mk || state.mk === mk) return !!mk;
    state.mk = mk;

    addMusicKitListener(mk, 'authorizationStatusDidChange', emitStatus);
    addMusicKitListener(mk, 'playbackStateDidChange', function () {
      if (state.context && state.context.state === 'suspended') {
        state.context.resume().catch(function () {});
      }
      emitPlayback();
      emitStatus();
    });
    addMusicKitListener(mk, 'playbackTimeDidChange', emitPlayback);
    addMusicKitListener(mk, 'nowPlayingItemDidChange', function (event) {
      emitNowPlaying(event && event.item);
      attachAnalyser();
    });
    addMusicKitListener(mk, 'mediaElementCreated', attachAnalyser);
    addMusicKitListener(mk, 'mediaPlaybackError', function (event) {
      post({
        type: 'error',
        code: 'APPLE_MUSIC_PLAYBACK_ERROR',
        message: event && event.message ? event.message : 'Apple Music playback failed',
      });
    });

    emitStatus();
    emitNowPlaying(mk.nowPlayingItem);
    emitPlayback();
    return true;
  }

  function findPlayer() {
    return document.getElementById('apple-music-player')
      || document.querySelector('audio[data-testid="audio-player"]')
      || document.querySelector('audio');
  }

  function attachAnalyser() {
    var player = findPlayer();
    if (!player || state.player === player && state.analyser) return !!state.analyser;

    if (state.player && state.player !== player) {
      try { if (state.source) state.source.disconnect(); } catch (_) {}
      try { if (state.analyser) state.analyser.disconnect(); } catch (_) {}
      state.player = null;
      state.source = null;
      state.analyser = null;
      state.frequencyData = null;
    }

    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;

    try {
      player.crossOrigin = 'anonymous';
      var context = state.context || new AudioContextClass({ latencyHint: 'playback' });
      var graph = state.graphs.get(player);
      if (!graph) {
        var source = context.createMediaElementSource(player);
        var analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.78;
        graph = {
          source: source,
          analyser: analyser,
          frequencyData: new Uint8Array(analyser.frequencyBinCount),
        };
        state.graphs.set(player, graph);
        player.addEventListener('playing', function () {
          context.resume().catch(function () {});
          emitStatus();
        });
      }
      graph.source.connect(graph.analyser);
      graph.analyser.connect(context.destination);

      state.player = player;
      state.context = context;
      state.source = graph.source;
      state.analyser = graph.analyser;
      state.frequencyData = graph.frequencyData;
      state.analyserErrorSent = false;

      emitStatus();
      return true;
    } catch (error) {
      if (!state.analyserErrorSent) {
        state.analyserErrorSent = true;
        post({
          type: 'error',
          code: 'APPLE_MUSIC_ANALYSER_UNAVAILABLE',
          message: error && error.message ? error.message : 'Unable to attach Apple Music analyser',
        });
      }
      return false;
    }
  }

  function average(values, start, end) {
    var total = 0;
    var count = 0;
    for (var index = start; index < end && index < values.length; index += 1) {
      total += values[index];
      count += 1;
    }
    return count ? total / count / 255 : 0;
  }

  function spectrumBins(values) {
    var bins = [];
    var useful = Math.min(values.length, 768);
    var logMax = Math.log(useful + 1);
    for (var index = 0; index < 64; index += 1) {
      var start = Math.floor(Math.exp(logMax * index / 64) - 1);
      var end = Math.max(start + 1, Math.floor(Math.exp(logMax * (index + 1) / 64) - 1));
      var peak = 0;
      for (var sourceIndex = start; sourceIndex < end && sourceIndex < useful; sourceIndex += 1) {
        peak = Math.max(peak, values[sourceIndex]);
      }
      bins.push(peak);
    }
    return bins;
  }

  function analyserFrame(now) {
    window.requestAnimationFrame(analyserFrame);
    if (!state.analyser || !state.frequencyData) return;
    if (now - state.lastSpectrumAt < 50) return;
    state.lastSpectrumAt = now;
    state.analyser.getByteFrequencyData(state.frequencyData);
    post({
      type: 'spectrum',
      bins: spectrumBins(state.frequencyData),
      energy: average(state.frequencyData, 1, 512),
      bass: average(state.frequencyData, 1, 12),
      mid: average(state.frequencyData, 12, 140),
      treble: average(state.frequencyData, 140, 512),
    });
  }

  function responseSongs(response) {
    var body = response && (response.data || response.json) || response || {};
    var songs = body.results && body.results.songs && body.results.songs.data || [];
    return songs.slice(0, 25).map(function (song) {
      var attributes = song.attributes || {};
      return {
        id: song.id || '',
        name: attributes.name || '',
        artist: attributes.artistName || '',
        album: attributes.albumName || '',
        artwork: artworkUrl(song),
        duration: number(attributes.durationInMillis, 0) / 1000,
      };
    });
  }

  async function runCommand(request) {
    var mk = musicKit();
    if (!mk) return { ok: false, error: 'MUSICKIT_NOT_READY' };
    var command = request.command;
    var payload = request.payload || {};

    try {
      if (command === 'status') return { ok: true, status: statusEvent() };
      if (command === 'search') {
        var storefront = mk.storefrontId || 'us';
        var url = '/v1/catalog/' + encodeURIComponent(storefront)
          + '/search?term=' + encodeURIComponent(payload.query)
          + '&types=songs&limit=' + encodeURIComponent(payload.limit || 10);
        var searchResponse = await mk.api.get(url);
        return { ok: true, songs: responseSongs(searchResponse) };
      }
      if (command === 'playSong') {
        await mk.setQueue({ song: payload.id });
        await mk.play();
        return { ok: true };
      }
      if (command === 'play') await mk.play();
      else if (command === 'pause') mk.pause();
      else if (command === 'toggle') {
        if (mk.isPlaying) mk.pause();
        else await mk.play();
      } else if (command === 'next') await mk.skipToNextItem();
      else if (command === 'previous') await mk.skipToPreviousItem();
      else if (command === 'seek') await mk.seekToTime(payload.seconds);
      else if (command === 'setVolume') mk.volume = payload.volume;
      emitPlayback();
      emitStatus();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error && error.message ? String(error.message) : 'APPLE_MUSIC_COMMAND_FAILED',
      };
    }
  }

  var bridge = Object.freeze({
    version: 1,
    command: runCommand,
    refresh: function () {
      attachMusicKit();
      attachAnalyser();
      emitStatus();
    },
  });
  Object.defineProperty(window, '__mineradioAppleMusic', {
    value: bridge,
    writable: false,
    configurable: false,
    enumerable: false,
  });

  post({ type: 'ready' });
  window.requestAnimationFrame(analyserFrame);
  setInterval(function () {
    attachMusicKit();
    attachAnalyser();
  }, 1000);
  bridge.refresh();
})();
