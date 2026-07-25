'use strict';

// Strict, account-scoped QQ Music membership resolution.

const crypto = require('crypto');

const VIP_TYPE_KEYS = new Set([
  'viptype',
  'viplevel',
  'musicviptype',
  'musicviplevel',
  'greenviptype',
  'greenviplevel',
  'greenlevel',
  'associatortype',
  'associatorlevel',
]);
const SVIP_TYPE_KEYS = new Set([
  'sviptype',
  'sviplevel',
  'superviptype',
  'superviplevel',
  'luxuryviptype',
  'luxuryviplevel',
  'greensvip',
]);
const VIP_FLAG_KEYS = new Set([
  'isvip',
  'vip',
  'vipflag',
  'isgreenvip',
  'greenvip',
  'ismember',
  'member',
  'isassociator',
  'associator',
]);
const SVIP_FLAG_KEYS = new Set([
  'issvip',
  'svip',
  'issupervip',
  'supervip',
  'isluxuryvip',
  'luxuryvip',
]);
const MEMBERSHIP_STATUS_KEYS = new Set([
  'status',
  'state',
  'active',
  'opened',
  'valid',
  'vipstatus',
  'memberstatus',
]);
const MEMBERSHIP_LEVEL_KEYS = new Set([
  'level',
  'viplevel',
  'memberlevel',
]);
const EXPIRY_KEY_RE = /(?:expire|expiry|endtime|validuntil|validtime|deadline|duetime)$/;
const MEMBERSHIP_CONTEXT_RE = /vip|member|membership|green|luxury|associator/;
const SVIP_CONTEXT_RE = /svip|supervip|luxuryvip|luxury/;
const MAX_WALK_DEPTH = 8;

function canonicalQQVipKey(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function primitiveMembershipSignal(value) {
  if (value === true) return 1;
  if (value === false) return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value > 0 ? 1 : 0;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (!text) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text) > 0 ? 1 : 0;
  if (/^(?:true|yes|active|valid|opened|open|vip|svip|premium|member)$/.test(text)) return 1;
  if (/^(?:false|no|none|normal|ordinary|expired|inactive|closed|invalid)$/.test(text)) return 0;
  if (/^(?:已开通|有效|会员|绿钻|豪华绿钻)$/.test(text)) return 1;
  if (/^(?:未开通|已过期|过期|普通用户|普通账号|非会员)$/.test(text)) return 0;
  return null;
}

function normalizedExpiryMs(value) {
  if (value == null || value === '') return 0;
  let numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric < 10000000000) numeric *= 1000;
    return numeric >= 946684800000 ? numeric : 0;
  }
  if (typeof value === 'string') {
    numeric = Date.parse(value);
    return Number.isFinite(numeric) && numeric >= 946684800000 ? numeric : 0;
  }
  return 0;
}

function qqVipObjectExpiry(obj) {
  const values = [];
  Object.keys(obj || {}).forEach(key => {
    if (!EXPIRY_KEY_RE.test(canonicalQQVipKey(key))) return;
    const value = normalizedExpiryMs(obj[key]);
    if (value > 0) values.push(value);
  });
  if (!values.length) return { present: false, expired: false, expiresAt: 0 };
  const expiresAt = Math.max(...values);
  return {
    present: true,
    expired: expiresAt <= Date.now(),
    expiresAt,
  };
}

function qqVipObjectLooksExpired(obj, now) {
  const expiry = qqVipObjectExpiry(obj);
  return !!(expiry.present && expiry.expiresAt <= (Number(now) || Date.now()));
}

function pathMembershipContext(pathParts) {
  const pathText = (pathParts || []).map(canonicalQQVipKey).join(' ');
  return {
    membership: MEMBERSHIP_CONTEXT_RE.test(pathText),
    svip: SVIP_CONTEXT_RE.test(pathText),
  };
}

function objectHasDirectMembershipKey(obj) {
  return Object.keys(obj || {}).some(key => {
    const normalized = canonicalQQVipKey(key);
    return VIP_TYPE_KEYS.has(normalized) ||
      SVIP_TYPE_KEYS.has(normalized) ||
      VIP_FLAG_KEYS.has(normalized) ||
      SVIP_FLAG_KEYS.has(normalized);
  });
}

function assessQQVipObject(obj, context, now) {
  let vipPositive = false;
  let svipPositive = false;
  let vipNegative = false;
  let svipNegative = false;
  let vipType = 0;
  let svipType = 0;
  let evidence = false;
  const expiryValues = [];
  const keys = Object.keys(obj || {});

  keys.forEach(key => {
    const normalized = canonicalQQVipKey(key);
    const value = obj[key];
    const signal = primitiveMembershipSignal(value);
    const numeric = Number(value);
    const isVipType = VIP_TYPE_KEYS.has(normalized);
    const isSvipType = SVIP_TYPE_KEYS.has(normalized);
    const isVipFlag = VIP_FLAG_KEYS.has(normalized);
    const isSvipFlag = SVIP_FLAG_KEYS.has(normalized);
    const inMembershipContext = !!(context && context.membership);
    const inSvipContext = !!(context && context.svip);
    const isContextStatus = inMembershipContext && MEMBERSHIP_STATUS_KEYS.has(normalized);
    const isContextLevel = inMembershipContext && MEMBERSHIP_LEVEL_KEYS.has(normalized);

    if (EXPIRY_KEY_RE.test(normalized)) {
      const expiry = normalizedExpiryMs(value);
      if (expiry > 0) expiryValues.push(expiry);
      return;
    }

    if (isVipType) {
      evidence = true;
      if (Number.isFinite(numeric) && numeric > 0) {
        vipType = Math.max(vipType, numeric);
        vipPositive = true;
      } else if (signal === 0) {
        vipNegative = true;
      }
      return;
    }
    if (isSvipType) {
      evidence = true;
      if (Number.isFinite(numeric) && numeric > 0) {
        svipType = Math.max(svipType, numeric);
        svipPositive = true;
      } else if (signal === 0) {
        svipNegative = true;
      }
      return;
    }
    if (isVipFlag) {
      if (signal == null) return;
      evidence = true;
      if (signal > 0) vipPositive = true;
      else vipNegative = true;
      return;
    }
    if (isSvipFlag) {
      if (signal == null) return;
      evidence = true;
      if (signal > 0) svipPositive = true;
      else svipNegative = true;
      return;
    }
    if (isContextStatus || isContextLevel) {
      if (signal == null) return;
      evidence = true;
      if (inSvipContext) {
        if (signal > 0) svipPositive = true;
        else svipNegative = true;
      } else {
        if (signal > 0) vipPositive = true;
        else vipNegative = true;
      }
    }
  });

  const expiryPresent = expiryValues.length > 0;
  const expiresAt = expiryPresent ? Math.max(...expiryValues) : 0;
  const expired = expiryPresent && expiresAt <= now;
  if (expiryPresent) evidence = true;
  if (expired) {
    if (context && context.svip) svipNegative = true;
    else vipNegative = true;
    vipPositive = false;
    svipPositive = false;
    vipType = 0;
    svipType = 0;
  } else if (expiryPresent && expiresAt > now) {
    if (context && context.svip) svipPositive = true;
    else vipPositive = true;
  }

  return {
    evidence,
    vipPositive,
    svipPositive,
    vipNegative,
    svipNegative,
    vipType,
    svipType,
    expiresAt: (vipPositive || svipPositive) && expiresAt > now ? expiresAt : 0,
  };
}

function collectQQVipAssessments(value, out, pathParts, depth, now, expectedUin) {
  if (depth > MAX_WALK_DEPTH || value == null) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectQQVipAssessments(item, out, pathParts.concat('#' + String(index)), depth + 1, now, expectedUin));
    return out;
  }
  if (typeof value !== 'object') return out;
  if (expectedUin) {
    const lastPathPart = String(pathParts[pathParts.length - 1] || '');
    if (/^(?:o0*)?\d+$/i.test(lastPathPart)) {
      const pathUin = lastPathPart.replace(/\D/g, '').replace(/^0+/, '');
      if (pathUin && pathUin !== expectedUin) return out;
    }
    const directUins = Object.keys(value).filter(key => {
      return /^(?:uin|useruin|userid|qq|accountuin)$/.test(canonicalQQVipKey(key));
    }).map(key => String(value[key] == null ? '' : value[key]).replace(/\D/g, '').replace(/^0+/, '')).filter(Boolean);
    if (directUins.length && !directUins.includes(expectedUin)) return out;
  }
  const context = pathMembershipContext(pathParts);
  if (context.membership || objectHasDirectMembershipKey(value)) {
    const assessment = assessQQVipObject(value, context, now);
    if (assessment.evidence) out.push(assessment);
  }
  Object.keys(value).forEach(key => {
    collectQQVipAssessments(value[key], out, pathParts.concat(key), depth + 1, now, expectedUin);
  });
  return out;
}

function emptyQQVipStatus() {
  return {
    vipType: 0,
    svipType: 0,
    vipLevel: 'none',
    isVip: false,
    isSvip: false,
    vipLabel: '无VIP',
    membershipKnown: false,
    resolved: false,
    decision: 'unknown',
    expiresAt: 0,
  };
}

function fallbackQQVipStatus(fallback) {
  fallback = fallback || {};
  const isSvip = !!fallback.isSvip || fallback.vipLevel === 'svip' || Number(fallback.svipType || fallback.svip_type || 0) > 0;
  const isVip = isSvip || !!fallback.isVip || fallback.vipLevel === 'vip' || Number(fallback.vipType || fallback.vip_type || 0) > 0;
  const known = isVip || fallback.membershipKnown === true || fallback.resolved === true;
  if (!known) return emptyQQVipStatus();
  return {
    vipType: isVip ? Math.max(1, Number(fallback.vipType || fallback.vip_type || 0) || 0) : 0,
    svipType: isSvip ? Math.max(1, Number(fallback.svipType || fallback.svip_type || 0) || 0) : 0,
    vipLevel: isSvip ? 'svip' : (isVip ? 'vip' : 'none'),
    isVip,
    isSvip,
    vipLabel: isSvip ? 'SVIP' : (isVip ? 'VIP' : '无VIP'),
    membershipKnown: true,
    resolved: true,
    decision: isVip ? 'positive' : 'negative',
    expiresAt: Number(fallback.expiresAt || fallback.expireAt || 0) || 0,
  };
}

function normalizeQQVipPayload(payload, fallback, options) {
  options = options || {};
  const now = Number(options.now) || Date.now();
  const expectedUin = String(options.expectedUin || '').replace(/\D/g, '').replace(/^0+/, '');
  const assessments = collectQQVipAssessments(payload, [], [], 0, now, expectedUin);
  const positive = assessments.filter(item => item.vipPositive || item.svipPositive);
  const explicitVipNegative = assessments.some(item => item.vipNegative);
  if (!positive.length) {
    if (explicitVipNegative) {
      return {
        ...emptyQQVipStatus(),
        membershipKnown: true,
        resolved: true,
        decision: 'negative',
      };
    }
    return fallbackQQVipStatus(fallback);
  }

  const isSvip = positive.some(item => item.svipPositive);
  const futureExpiries = positive.map(item => Number(item.expiresAt) || 0).filter(value => value > now);
  const vipType = Math.max(1, ...positive.map(item => Number(item.vipType) || 0));
  const svipType = isSvip ? Math.max(1, ...positive.map(item => Number(item.svipType) || 0)) : 0;
  return {
    vipType,
    svipType,
    vipLevel: isSvip ? 'svip' : 'vip',
    isVip: true,
    isSvip,
    vipLabel: isSvip ? 'SVIP' : 'VIP',
    membershipKnown: true,
    resolved: true,
    decision: 'positive',
    expiresAt: futureExpiries.length ? Math.min(...futureExpiries) : 0,
  };
}

function combineQQVipResults(results) {
  const valid = (Array.isArray(results) ? results : []).filter(Boolean);
  const positives = valid.filter(item => item.decision === 'positive' || item.isVip || item.isSvip);
  if (positives.length) {
    const isSvip = positives.some(item => item.isSvip || item.vipLevel === 'svip');
    const futureExpiries = positives
      .map(item => Number(item.expiresAt) || 0)
      .filter(value => value > Date.now());
    const strongest = positives.find(item => isSvip && (item.isSvip || item.vipLevel === 'svip')) || positives[0];
    return {
      ...emptyQQVipStatus(),
      vipType: Math.max(1, ...positives.map(item => Number(item.vipType) || 0)),
      svipType: isSvip ? Math.max(1, ...positives.map(item => Number(item.svipType) || 0)) : 0,
      vipLevel: isSvip ? 'svip' : 'vip',
      isVip: true,
      isSvip,
      vipLabel: isSvip ? 'SVIP' : 'VIP',
      membershipKnown: true,
      resolved: true,
      decision: 'positive',
      expiresAt: futureExpiries.length ? Math.min(...futureExpiries) : 0,
      vipSource: strongest.vipSource || '',
      rawCode: Number(strongest.rawCode) || 0,
    };
  }
  const negative = valid.find(item => item.decision === 'negative' && item.membershipKnown);
  if (negative) {
    return {
      ...emptyQQVipStatus(),
      membershipKnown: true,
      resolved: true,
      decision: 'negative',
      vipSource: negative.vipSource || '',
      rawCode: Number(negative.rawCode) || 0,
    };
  }
  return emptyQQVipStatus();
}

function qqVipProbeResponseSuccessful(body, probe) {
  if (!body || typeof body !== 'object') return false;
  const rootCodes = [body.code, body.result]
    .filter(value => value != null && typeof value !== 'object')
    .map(Number)
    .filter(Number.isFinite);
  if (rootCodes.some(code => code !== 0)) return false;
  const responseKey = probe && probe.responseKey;
  const block = responseKey && body[responseKey];
  if (block && typeof block === 'object') {
    const blockCodes = [block.code, block.result]
      .filter(value => value != null && typeof value !== 'object')
      .map(Number)
      .filter(Number.isFinite);
    if (blockCodes.some(code => code !== 0)) return false;
  }
  return true;
}

function qqVipPayloadBelongsToUin(payload, uin) {
  const expected = String(uin || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!expected || !payload || typeof payload !== 'object') return false;
  let matched = false;
  function walk(value, depth) {
    if (matched || depth > MAX_WALK_DEPTH || value == null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(item => walk(item, depth + 1));
      return;
    }
    Object.keys(value).forEach(key => {
      if (matched) return;
      const normalizedKey = canonicalQQVipKey(key);
      const normalizedValue = String(value[key] == null ? '' : value[key])
        .replace(/\D/g, '')
        .replace(/^0+/, '');
      if (
        (/^(?:uin|useruin|userid|qq|accountuin)$/.test(normalizedKey) && normalizedValue === expected) ||
        (String(key).replace(/\D/g, '').replace(/^0+/, '') === expected && value[key] && typeof value[key] === 'object')
      ) {
        matched = true;
        return;
      }
      walk(value[key], depth + 1);
    });
  }
  walk(payload, 0);
  return matched;
}

function qqVipPayloadScopesForUin(payload, uin) {
  const expected = String(uin || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!expected || !payload || typeof payload !== 'object') return [];
  const scopes = [];
  const seen = new Set();
  function addScope(value) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    scopes.push(value);
  }
  function walk(value, depth) {
    if (depth > MAX_WALK_DEPTH || value == null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(item => walk(item, depth + 1));
      return;
    }
    const keys = Object.keys(value);
    const directIdentityMatch = keys.some(key => {
      const normalizedKey = canonicalQQVipKey(key);
      if (!/^(?:uin|useruin|userid|qq|accountuin)$/.test(normalizedKey)) return false;
      const normalizedValue = String(value[key] == null ? '' : value[key])
        .replace(/\D/g, '')
        .replace(/^0+/, '');
      return normalizedValue === expected;
    });
    if (directIdentityMatch) addScope(value);
    keys.forEach(key => {
      const child = value[key];
      const mapKey = String(key).trim();
      const mapKeyUin = /^(?:o0*)?\d+$/i.test(mapKey)
        ? mapKey.replace(/\D/g, '').replace(/^0+/, '')
        : '';
      if (mapKeyUin === expected && child && typeof child === 'object') {
        addScope(child);
        return;
      }
      walk(child, depth + 1);
    });
  }
  walk(payload, 0);
  return scopes;
}

async function resolveQQVipFromProbes(probes, requestProbe) {
  if (!Array.isArray(probes) || typeof requestProbe !== 'function') {
    return { ...emptyQQVipStatus(), errorCount: 0 };
  }
  const settled = await Promise.allSettled(probes.map(async probe => {
    const body = await requestProbe(probe);
    const accountScopes = qqVipPayloadScopesForUin(body, probe && probe.uin);
    const scopedResults = accountScopes.map(scope => normalizeQQVipPayload(scope, {}, {
      expectedUin: String(probe && probe.uin || '').replace(/\D/g, '').replace(/^0+/, ''),
    }));
    const normalized = accountScopes.length
      ? combineQQVipResults(scopedResults)
      : emptyQQVipStatus();
    return {
      ...normalized,
      vipSource: probe && probe.source || '',
      rawCode: Number(body && (body.code || body.result)) || 0,
      probeSuccessful: qqVipProbeResponseSuccessful(body, probe),
      accountMatched: accountScopes.length > 0,
    };
  }));
  const values = settled
    .filter(item => item.status === 'fulfilled')
    .map(item => item.value);
  const positiveValues = values.filter(item => item.decision === 'positive' && item.probeSuccessful);
  const negativeValues = values.filter(item => item.decision === 'negative' && item.probeSuccessful);
  const authoritativeNegativeValues = negativeValues.filter(item => item.accountMatched);
  let combined = emptyQQVipStatus();
  if (positiveValues.length) {
    combined = combineQQVipResults(positiveValues);
  } else if (authoritativeNegativeValues.length) {
    combined = combineQQVipResults(authoritativeNegativeValues);
  }
  combined.errorCount = settled.filter(item => item.status === 'rejected').length;
  return combined;
}

function qqVipSessionCacheKey(uin, musicKey, cookieObj) {
  const userId = String(uin || '').replace(/\D/g, '');
  const ticket = String(musicKey || '');
  if (!userId || !ticket) return '';
  cookieObj = cookieObj || {};
  const material = [
    userId,
    ticket,
    String(cookieObj.login_type || ''),
    String(cookieObj.qm_keyst || ''),
    String(cookieObj.qqmusic_key || ''),
    String(cookieObj.music_key || ''),
    String(cookieObj.wxskey || ''),
    String(cookieObj.psrf_qqaccess_token || ''),
    String(cookieObj.psrf_qqrefresh_token || ''),
  ].join('\n');
  const fingerprint = crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
  return userId + ':' + fingerprint;
}

function qqVipCacheTtlMs(status, options) {
  options = options || {};
  const now = Number(options.now) || Date.now();
  const positiveTtl = Math.max(0, Number(options.positiveTtlMs) || 2 * 60 * 1000);
  const negativeTtl = Math.max(0, Number(options.negativeTtlMs) || 30 * 1000);
  if (!status || !status.resolved || !status.membershipKnown) return 0;
  if (!status.isVip) return negativeTtl;
  const expiresAt = Number(status.expiresAt) || 0;
  if (!expiresAt) return positiveTtl;
  return Math.max(0, Math.min(positiveTtl, expiresAt - now));
}

module.exports = {
  normalizeQQVipPayload,
  combineQQVipResults,
  resolveQQVipFromProbes,
  qqVipSessionCacheKey,
  qqVipCacheTtlMs,
  qqVipObjectLooksExpired,
  _test: {
    canonicalQQVipKey,
    primitiveMembershipSignal,
    normalizedExpiryMs,
    assessQQVipObject,
    collectQQVipAssessments,
    emptyQQVipStatus,
    qqVipProbeResponseSuccessful,
    qqVipPayloadBelongsToUin,
    qqVipPayloadScopesForUin,
  },
};
