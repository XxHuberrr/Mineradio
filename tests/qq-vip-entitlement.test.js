'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const qqVip = require('../qq-vip-api');

const ROOT = path.join(__dirname, '..');

function activeVipPayload(uin, expiresAt) {
  return {
    code: 0,
    req_1: {
      code: 0,
      data: {
        uin_map: {
          [String(uin)]: {
            vip_info: {
              is_vip: true,
              vip_type: 1,
              end_time: Math.floor(expiresAt / 1000),
            },
          },
        },
      },
    },
  };
}

function ordinaryPayload(uin) {
  return {
    code: 0,
    req_1: {
      code: 0,
      data: {
        uin_map: {
          [String(uin)]: {
            vip_info: {
              is_vip: false,
              vip_type: 0,
            },
          },
        },
      },
    },
  };
}

function testStrictMembershipNormalization() {
  const now = Date.now();
  const unknown = qqVip.normalizeQQVipPayload({ code: 0, data: {} });
  assert.strictEqual(unknown.decision, 'unknown');
  assert.strictEqual(unknown.resolved, false, 'empty response must not become an ordinary account');

  const textOnly = qqVip.normalizeQQVipPayload({
    code: 0,
    data: { vip_info: { label: 'VIP', title: 'Green Diamond' } },
  });
  assert.strictEqual(textOnly.decision, 'unknown', 'VIP-looking labels alone must not promote an account');

  const ordinary = qqVip.normalizeQQVipPayload(ordinaryPayload('10001'));
  assert.strictEqual(ordinary.decision, 'negative');
  assert.strictEqual(ordinary.isVip, false, 'explicit ordinary account must remain ordinary');

  const active = qqVip.normalizeQQVipPayload(activeVipPayload('10001', now + 60 * 60 * 1000));
  assert.strictEqual(active.decision, 'positive');
  assert.strictEqual(active.isVip, true, 'unexpired official VIP evidence must be retained');
  assert(active.expiresAt > now, 'active VIP must retain its expiration boundary');

  const expired = qqVip.normalizeQQVipPayload(activeVipPayload('10001', now - 60 * 1000));
  assert.strictEqual(expired.decision, 'negative');
  assert.strictEqual(expired.isVip, false, 'expired membership must not remain active');

  const svipOnlyNegative = qqVip.normalizeQQVipPayload({
    code: 0,
    data: { svip_info: { is_svip: false, svip_type: 0 } },
  });
  assert.strictEqual(
    svipOnlyNegative.decision,
    'unknown',
    'not owning SVIP alone does not prove that the account lacks regular VIP'
  );
}

async function testAllProbeAggregationAndNegativeQuorum() {
  const uin = '10002';
  const probes = [
    { source: 'first', responseKey: 'req_1', uin },
    { source: 'second', responseKey: 'req_1', uin },
    { source: 'third', responseKey: 'req_1', uin },
  ];
  const responses = [
    ordinaryPayload(uin),
    { code: 0, req_1: { code: 0, data: {} } },
    activeVipPayload(uin, Date.now() + 60 * 60 * 1000),
  ];
  let calls = 0;
  const resolved = await qqVip.resolveQQVipFromProbes(probes, async () => responses[calls++]);
  assert.strictEqual(calls, 3, 'all QQ VIP mirrors must be checked');
  assert.strictEqual(resolved.isVip, true, 'a later explicit positive must win over an earlier ordinary response');
  assert.strictEqual(resolved.vipSource, 'third');

  const defaultZeroShell = await qqVip.resolveQQVipFromProbes(
    [{ source: 'zero-shell', responseKey: 'req_1', uin }],
    async () => ({ code: 1000, req_1: { code: 1000 }, vip: 0 })
  );
  assert.strictEqual(defaultZeroShell.decision, 'unknown', 'failed/default zero shell must not downgrade membership');

  const unattributedSingleNegative = await qqVip.resolveQQVipFromProbes(
    [{ source: 'single', responseKey: 'req_1', uin }],
    async () => ({ code: 0, req_1: { code: 0, data: { vip_info: { is_vip: false, vip_type: 0 } } } })
  );
  assert.strictEqual(
    unattributedSingleNegative.decision,
    'unknown',
    'one unattributed replicated zero response must not be authoritative'
  );

  const unmatchedZeroShells = await qqVip.resolveQQVipFromProbes(
    [
      { source: 'zero-a', responseKey: 'req_1', uin },
      { source: 'zero-b', responseKey: 'req_1', uin },
    ],
    async () => ({ code: 0, req_1: { code: 0, data: { vip_info: { is_vip: false, vip_type: 0 } } } })
  );
  assert.strictEqual(
    unmatchedZeroShells.decision,
    'unknown',
    'even repeated default zero shells must remain unknown when no entitlement subtree belongs to the current UIN'
  );

  const otherAccountPositive = await qqVip.resolveQQVipFromProbes(
    [{ source: 'other-user', responseKey: 'req_1', uin }],
    async () => activeVipPayload('99999', Date.now() + 60 * 60 * 1000)
  );
  assert.strictEqual(
    otherAccountPositive.decision,
    'unknown',
    'positive membership for another UIN must never promote the current account'
  );

  let mixedCalls = 0;
  const matchedPositiveWithTimeouts = await qqVip.resolveQQVipFromProbes(
    [
      { source: 'matched-positive', responseKey: 'req_1', uin },
      { source: 'zero-shell', responseKey: 'req_1', uin },
      { source: 'timeout', responseKey: 'req_1', uin },
    ],
    async () => {
      mixedCalls += 1;
      if (mixedCalls === 1) return activeVipPayload(uin, Date.now() + 60 * 60 * 1000);
      if (mixedCalls === 2) return { code: 0, req_1: { code: 0, data: { vip: 0 } } };
      throw new Error('timeout');
    }
  );
  assert.strictEqual(matchedPositiveWithTimeouts.isVip, true, 'one current-UIN positive must survive zero shells and timeouts');

  const attributedNegative = await qqVip.resolveQQVipFromProbes(
    [{ source: 'attributed', responseKey: 'req_1', uin }],
    async () => ordinaryPayload(uin)
  );
  assert.strictEqual(attributedNegative.decision, 'negative', 'a successful response tied to the current UIN may confirm ordinary membership');
}

function testSessionScopedCacheFingerprintAndExpiry() {
  const cookieA = { login_type: '1', qm_keyst: 'ticket-A' };
  const cookieB = { login_type: '1', qm_keyst: 'ticket-B' };
  const keyA = qqVip.qqVipSessionCacheKey('10003', 'ticket-A', cookieA);
  assert.strictEqual(keyA, qqVip.qqVipSessionCacheKey('10003', 'ticket-A', cookieA));
  assert.notStrictEqual(keyA, qqVip.qqVipSessionCacheKey('10003', 'ticket-B', cookieB));
  assert.notStrictEqual(keyA, qqVip.qqVipSessionCacheKey('10004', 'ticket-A', cookieA));
  assert(!keyA.includes('ticket-A'), 'cache key must not expose a raw QQ ticket');

  const now = Date.now();
  const ttl = qqVip.qqVipCacheTtlMs({
    resolved: true,
    membershipKnown: true,
    isVip: true,
    expiresAt: now + 2500,
  }, { now, positiveTtlMs: 120000 });
  assert(ttl > 0 && ttl <= 2500, 'positive cache must not outlive entitlement expiry');
  assert.strictEqual(
    qqVip.qqVipCacheTtlMs({ resolved: false, membershipKnown: false }, { now }),
    0,
    'unknown membership must not be cached as ordinary'
  );
}

async function testTransientFrontendFailureKeepsLastKnownGood() {
  const source = fs.readFileSync(path.join(ROOT, 'public/js/modules/08-account/02-login-status.js'), 'utf8');
  const normalizeStart = source.indexOf('function normalizeQQLoginStatus');
  const normalizeEnd = source.indexOf('\nfunction qqMembershipLabel', normalizeStart);
  const refreshStart = source.indexOf('async function refreshQQLoginStatus');
  const refreshEnd = source.indexOf('\nfunction refreshQQVipStatusNow', refreshStart);
  assert(normalizeStart >= 0 && normalizeEnd > normalizeStart && refreshStart >= 0 && refreshEnd > refreshStart);

  const context = {
    console: { warn() {} },
    qqLoginStatus: {
      provider: 'qq',
      loggedIn: true,
      userId: '10005',
      nickname: 'Verified VIP',
      vipType: 1,
      vipLevel: 'vip',
      isVip: true,
      isSvip: false,
      membershipKnown: true,
      playbackKeyReady: true,
    },
    qqLoginWasLoggedIn: true,
    qqPlaylists: [],
    userPlaylists: [],
    playlistCatalogRevision: 0,
    homeDiscoverState: {},
    activeAccountProvider: 'qq',
    apiJson: async () => { throw new Error('temporary network failure'); },
    auditProviderVipState() {},
    showToast() {},
    loadHomeDiscover() {},
    refreshUserPlaylists() {},
    hasPlatformLogin() { return true; },
    firstLoggedProvider() { return 'qq'; },
    renderUserBtn() {},
  };
  vm.createContext(context);
  vm.runInContext(source.slice(normalizeStart, normalizeEnd) + '\n' + source.slice(refreshStart, refreshEnd), context);
  const status = await context.refreshQQLoginStatus({});
  assert.strictEqual(status.loggedIn, true, 'transient refresh failure must keep the current account');
  assert.strictEqual(status.isVip, true, 'transient refresh failure must keep last-known verified VIP');
  assert.strictEqual(status.membershipKnown, true);
  assert.strictEqual(status.stale, true, 'preserved status must be marked stale');
  assert.strictEqual(status.membershipStale, true);
}

function testDesktopReauthCookieSelectionAndBudgets() {
  const mainSource = fs.readFileSync(path.join(ROOT, 'desktop/main.js'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(ROOT, 'desktop/preload.js'), 'utf8');
  const loginSource = fs.readFileSync(path.join(ROOT, 'public/js/modules/08-account/03-login-modal-flows.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const playbackSource = fs.readFileSync(path.join(ROOT, 'public/js/modules/05-playback/13-playback-start-audio.js'), 'utf8');
  const prefetchSource = fs.readFileSync(path.join(ROOT, 'public/js/modules/03-beat/00-tempo-worker-cache-prefetch.js'), 'utf8');
  const accountSource = fs.readFileSync(path.join(ROOT, 'public/js/modules/08-account/02-login-status.js'), 'utf8');

  assert(/openQQMusicLoginWindow\(owner, options\)/.test(mainSource));
  assert(/options\.forceReauth[\s\S]{0,180}clearStorageData/.test(mainSource));
  assert(/!options\.forceReauth && qqCookieHasPlaybackLogin/.test(mainSource));
  assert(/ipcRenderer\.invoke\('qq-music-open-login', options \|\| \{\}\)/.test(preloadSource));
  assert(/forceReauth:\s*!!\(qqLoginStatus && qqLoginStatus\.loggedIn\)/.test(loginSource));

  const cookieStart = mainSource.indexOf('function cookieIsExpired');
  const cookieEnd = mainSource.indexOf('\nasync function readQQLoginCookieHeader', cookieStart);
  const cookieContext = {
    Date,
    Map,
    QQ_LOGIN_COOKIE_PRIORITY: ['uin', 'qm_keyst'],
    isQQCookieDomain(domain) {
      return String(domain || '').replace(/^\./, '').toLowerCase().endsWith('qq.com');
    },
  };
  vm.createContext(cookieContext);
  vm.runInContext(mainSource.slice(cookieStart, cookieEnd), cookieContext);
  const future = Date.now() / 1000 + 3600;
  const past = Date.now() / 1000 - 60;
  const header = cookieContext.buildCookieHeader([
    { name: 'uin', value: 'old-parent', domain: '.qq.com', path: '/', expirationDate: future },
    { name: 'uin', value: 'preferred-y', domain: 'y.qq.com', path: '/', expirationDate: future },
    { name: 'qm_keyst', value: 'expired-key', domain: 'y.qq.com', path: '/', expirationDate: past },
    { name: 'qm_keyst', value: 'valid-key', domain: '.qq.com', path: '/', expirationDate: future },
  ]);
  assert(header.includes('uin=preferred-y'), 'QQ cookie selection must prefer the official y.qq.com scope');
  assert(header.includes('qm_keyst=valid-key'), 'QQ cookie selection must retain a valid playback key');
  assert(!header.includes('expired-key'), 'expired QQ cookies must be excluded');

  assert(/const QQ_VKEY_REQUEST_TIMEOUT_MS = 6000/.test(serverSource));
  assert(/const QQ_AUDIO_PROBE_TOTAL_MS = 6200/.test(serverSource));
  const vkeyBudget = Number((serverSource.match(/QQ_VKEY_REQUEST_TIMEOUT_MS\s*=\s*(\d+)/) || [])[1]);
  const audioProbeBudget = Number((serverSource.match(/QQ_AUDIO_PROBE_TOTAL_MS\s*=\s*(\d+)/) || [])[1]);
  assert(
    vkeyBudget + audioProbeBudget < 15000,
    'the complete QQ URL handler deadline must finish before the renderer 15s request deadline'
  );
  assert((playbackSource.match(/timeoutMs: 15000/g) || []).length >= 2);
  assert(/timeoutMs: 15000/.test(prefetchSource));

  assert(!/vipEvidence:\s*playbackVipEvidence/.test(serverSource));
  assert(!/member-track-playback/.test(serverSource));
  assert(/function qqPlaybackShowsMemberAccess[\s\S]{0,260}return false;/.test(accountSource));
  assert(!/writeQQPlaybackVipEvidence\(Object\.assign\(\{\}, merged/.test(accountSource));

  const fallbackSource = fs.readFileSync(path.join(ROOT, 'public/js/modules/05-playback/11-provider-fallback.js'), 'utf8');
  assert(/membershipUnknown[\s\S]{0,700}!membershipUnknown/.test(fallbackSource));
  assert(/会员待同步/.test(fallbackSource), 'unknown QQ membership must not be rendered as an ordinary account');
  assert(/membershipUnknown[\s\S]{0,500}vipSyncState:\s*authIncomplete/.test(serverSource));
}

function testPackagingIncludesQQVipModule() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const files = pkg && pkg.build && pkg.build.files || [];
  assert(files.includes('*-api.js'), 'Electron package must include provider API modules');
  assert(/-api\.js$/.test(path.basename(require.resolve('../qq-vip-api'))));
}

async function main() {
  testStrictMembershipNormalization();
  await testAllProbeAggregationAndNegativeQuorum();
  testSessionScopedCacheFingerprintAndExpiry();
  await testTransientFrontendFailureKeepsLastKnownGood();
  testDesktopReauthCookieSelectionAndBudgets();
  testPackagingIncludesQQVipModule();
  console.log('[OK] QQ VIP entitlement regression tests passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
