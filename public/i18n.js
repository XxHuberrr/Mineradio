// ============================================================
//  Mineradio i18n — Lightweight internationalization module
//  Supports zh-CN, en, ja
// ============================================================
(function (root) {
  'use strict';

  var STORAGE_KEY = 'mineradio-lang';
  var DEFAULT_LANG = 'zh-CN';
  var SUPPORTED_LANGS = ['zh-CN', 'en', 'ja'];
  var currentLang = DEFAULT_LANG;
  var translations = {};
  var loadedLangs = {};
  var onLangChangeCallbacks = [];

  function normalizeLang(lang) {
    if (!lang) return DEFAULT_LANG;
    lang = String(lang).trim();
    if (SUPPORTED_LANGS.indexOf(lang) >= 0) return lang;
    var lower = lang.toLowerCase();
    if (lower === 'zh' || lower === 'zh-cn' || lower === 'zh-hans') return 'zh-CN';
    if (lower === 'en' || lower === 'en-us' || lower === 'en-gb') return 'en';
    if (lower === 'ja' || lower === 'ja-jp') return 'ja';
    return DEFAULT_LANG;
  }

  function getStoredLang() {
    try { return normalizeLang(localStorage.getItem(STORAGE_KEY)); } catch (e) { return DEFAULT_LANG; }
  }

  function setStoredLang(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  }

  function getSystemLang() {
    var nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav) {
      var bl = nav.languages && nav.languages[0];
      var lang = bl || nav.language || nav.userLanguage || '';
      return normalizeLang(lang);
    }
    return DEFAULT_LANG;
  }

  function getInitialLang() {
    var stored = getStoredLang();
    if (stored && stored !== DEFAULT_LANG) return stored;
    var sys = getSystemLang();
    if (SUPPORTED_LANGS.indexOf(sys) >= 0) return sys;
    return DEFAULT_LANG;
  }

  function loadLangFile(lang) {
    return new Promise(function (resolve, reject) {
      if (loadedLangs[lang]) { resolve(translations[lang]); return; }
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'locales/' + lang + '.json', true);
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            translations[lang] = JSON.parse(xhr.responseText);
            loadedLangs[lang] = true;
            resolve(translations[lang]);
          } catch (e) { reject(e); }
        } else { reject(new Error('Failed to load ' + lang)); }
      };
      xhr.onerror = function () { reject(new Error('Network error loading ' + lang)); };
      xhr.send();
    });
  }

  function t(key, params) {
    if (!key) return '';
    var dict = translations[currentLang] || {};
    var val = dict[key];
    if (val === undefined || val === null || val === '') {
      // fallback to zh-CN
      if (currentLang !== DEFAULT_LANG) {
        var fb = translations[DEFAULT_LANG] || {};
        val = fb[key];
      }
    }
    if (val === undefined || val === null) val = key;
    if (typeof val !== 'string') val = String(val);
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(function (k) {
        val = val.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
      });
    }
    return val;
  }

  function tHtml(key, params) {
    return t(key, params);
  }

  function translateElement(el) {
    if (!el || !el.getAttribute) return;
    var key = el.getAttribute('data-i18n');
    if (key) {
      var attr = el.getAttribute('data-i18n-attr');
      var val = t(key);
      if (attr) {
        var attrs = attr.split(',').map(function (s) { return s.trim(); });
        attrs.forEach(function (a) {
          if (a === 'html') {
            el.innerHTML = val;
          } else if (a === 'text') {
            el.textContent = val;
          } else {
            el.setAttribute(a, val);
          }
        });
      } else {
        el.textContent = val;
      }
    }
    // Also handle data-i18n-title
    var titleKey = el.getAttribute('data-i18n-title');
    if (titleKey) {
      el.setAttribute('title', t(titleKey));
    }
  }

  function scanDom(rootEl) {
    var container = rootEl || document;
    var elements = container.querySelectorAll('[data-i18n]');
    for (var i = 0; i < elements.length; i++) {
      translateElement(elements[i]);
    }
    // Also update data-i18n-title
    var titled = container.querySelectorAll('[data-i18n-title]');
    for (var j = 0; j < titled.length; j++) {
      var el = titled[j];
      var titleKey = el.getAttribute('data-i18n-title');
      if (titleKey) el.setAttribute('title', t(titleKey));
    }
    // Update html lang attribute
    document.documentElement.lang = currentLang === 'zh-CN' ? 'zh-CN' : currentLang === 'ja' ? 'ja' : 'en';
  }

  function setLanguage(lang) {
    lang = normalizeLang(lang);
    if (lang === currentLang) return;
    var prev = currentLang;
    currentLang = lang;
    setStoredLang(lang);
    loadLangFile(lang).then(function () {
      scanDom();
      onLangChangeCallbacks.forEach(function (fn) {
        try { fn(lang, prev); } catch (e) {}
      });
    });
  }

  function getLanguage() {
    return currentLang;
  }

  function onLanguageChange(fn) {
    if (typeof fn === 'function') onLangChangeCallbacks.push(fn);
  }

  function init() {
    currentLang = getInitialLang();
    return loadLangFile(currentLang).then(function () {
      scanDom();
      return currentLang;
    });
  }

  function getSupportedLangs() {
    return SUPPORTED_LANGS.slice();
  }

  function langLabel(lang) {
    var labels = { 'zh-CN': '中文', 'en': 'English', 'ja': '日本語' };
    return labels[lang] || lang;
  }

  // Expose API
  var api = {
    t: t,
    tHtml: tHtml,
    setLanguage: setLanguage,
    getLanguage: getLanguage,
    onLanguageChange: onLanguageChange,
    init: init,
    scanDom: scanDom,
    translateElement: translateElement,
    getSupportedLangs: getSupportedLangs,
    langLabel: langLabel,
    loadLangFile: loadLangFile,
    normalizeLang: normalizeLang,
  };

  // Node.js-like environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  // Browser global
  root.MineradioI18n = api;

  // Auto-init if DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { init(); });
    } else {
      init();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
