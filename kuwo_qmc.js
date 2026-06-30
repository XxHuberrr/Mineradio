'use strict';
// 酷我至臻 .mflac (QMCv2) 解密器: ekey -> rawkey -> QMC 流密码, 解出标准 FLAC。
// QmcCipher.process 按密文绝对偏移寻址, 支持按 HTTP Range 分段解密。

// SimpleMakeKey('j',8): int(abs(tan(0x6a+i*0.1))*100)&0xff
const SIMPLE_KEY = Buffer.from(Array.from({ length: 8 }, (_, i) =>
  (Math.trunc(Math.abs(Math.tan(0x6a + i * 0.1)) * 100.0)) & 0xff));

function beU32(b, o) { return (((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0); }
function putBeU32(out, o, v) { out[o] = (v >>> 24) & 0xff; out[o + 1] = (v >>> 16) & 0xff; out[o + 2] = (v >>> 8) & 0xff; out[o + 3] = v & 0xff; }

// TEA 单块解密 (16 轮, delta=0x9E3779B9, sum0=delta*16)
function teaEcbDecrypt(block, boff, key16) {
  let v0 = beU32(block, boff), v1 = beU32(block, boff + 4);
  const k0 = beU32(key16, 0), k1 = beU32(key16, 4), k2 = beU32(key16, 8), k3 = beU32(key16, 12);
  let s = 0xE3779B90;
  for (let i = 0; i < 16; i++) {
    v1 = (v1 - ((((v0 << 4) >>> 0) + k2 ^ (v0 + s) ^ ((v0 >>> 5) + k3)) >>> 0)) >>> 0;
    v0 = (v0 - ((((v1 << 4) >>> 0) + k0 ^ (v1 + s) ^ ((v1 >>> 5) + k1)) >>> 0)) >>> 0;
    s = (s + 0x61C88647) >>> 0;
  }
  const out = Buffer.alloc(8);
  putBeU32(out, 0, v0); putBeU32(out, 4, v1);
  return out;
}

// tc_tea CBC 变体解密。失败返回 null。
function tcTeaDecrypt(cipher, key16) {
  const n = cipher.length;
  if (n % 8 !== 0 || n < 16) return null;
  let blk = teaEcbDecrypt(cipher, 0, key16);
  const pad = blk[0] & 7;
  const outLen = n - pad - 10;
  if (outLen < 0) return null;
  const out = Buffer.alloc(outLen);

  let curIdx = 0, nxtIdx = 8, consumed = 8, skip = pad + 1, prevIdx = 0, prevZero = true;
  function advance() {
    prevZero = false; prevIdx = curIdx; curIdx = nxtIdx;
    for (let j = 0; j < 8; j++) { if (consumed + j >= n) return false; blk[j] ^= cipher[nxtIdx + j]; }
    blk = teaEcbDecrypt(blk, 0, key16);
    nxtIdx += 8; consumed += 8; skip = 0;
    return true;
  }
  // Phase1: 跳过 2 个 salt 字节
  let cnt = 1;
  while (cnt < 3) { if (skip < 8) { skip++; cnt++; } else if (!advance()) return null; }
  // Phase2: 输出明文
  let rem = outLen, o = 0;
  while (rem > 0) {
    if (skip < 8) { const pb = prevZero ? 0 : (cipher[prevIdx + skip] & 0xff); out[o++] = (blk[skip] ^ pb) & 0xff; skip++; rem--; }
    else if (!advance()) return null;
  }
  // Phase3: 校验 7 个零字节
  cnt = 1;
  while (cnt < 8) {
    if (skip < 8) { const pb = prevZero ? 0 : (cipher[prevIdx + skip] & 0xff); if ((blk[skip] & 0xff) !== pb) return null; skip++; cnt++; }
    else if (!advance()) return null;
  }
  return out;
}

// 宽松 base64 (容忍 url-safe / 空白 / 缺 padding)
function qmcB64decode(s) {
  let t = String(s).trim().replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');
  const idx = t.indexOf('='); if (idx >= 0) t = t.slice(0, idx);
  const m = t.length % 4;
  if (m === 2) t += '=='; else if (m === 3) t += '='; else if (m === 1) t = t.slice(0, -1);
  return Buffer.from(t, 'base64');
}

// 明文 QMC ekey -> rawkey
function decryptEkeyRaw(ekeyB64) {
  const ek = qmcB64decode(ekeyB64);
  if (ek.length < 8) throw new Error('ekey too short');
  const teakey = Buffer.alloc(16);
  for (let i = 0; i < 8; i++) { teakey[2 * i] = SIMPLE_KEY[i]; teakey[2 * i + 1] = ek[i]; }
  const tail = tcTeaDecrypt(ek.slice(8), teakey);
  if (tail === null) throw new Error('tc_tea 解密/校验失败');
  return Buffer.concat([ek.slice(0, 8), tail]);
}

// 标准 base64 (补 padding) —— DES 包装态 ekey 用
function stdB64decode(s) {
  let t = String(s).replace(/\s/g, '');
  const m = t.length % 4;
  if (m) t += '='.repeat(4 - m);
  return Buffer.from(t, 'base64');
}

// ekey(base64) -> rawkey。自动兼容: ① 明文 QMC ekey; ② 酷我 DES 包装态
//   = base64(DES-ECB("<16字符设备前缀>"+明文ekey, "ylzsxkwm"))
// desDecrypt: (buf, "ylzsxkwm") => Buffer (复用项目已有的 kwDecrypt; 小端块序 ECB)
function decryptEkeyB64(ekeyB64, desDecrypt) {
  const s = String(ekeyB64 || '').trim();
  try { return decryptEkeyRaw(s); } catch (e) { /* 落到 DES 包装态 */ }
  if (typeof desDecrypt !== 'function') throw new Error('ekey 非明文形态, 需提供 desDecrypt(ylzsxkwm)');
  const dec = desDecrypt(stdB64decode(s), 'ylzsxkwm');
  // dec 末尾可能有 DES 尾块填充; 按 latin-1 转字符串再 trim
  const uw = Buffer.from(dec).toString('latin1').replace(/\x00+$/g, '').trim();
  if (uw.length > 16) { try { return decryptEkeyRaw(uw.slice(16)); } catch (e) { /* 再试不剥前缀 */ } }
  return decryptEkeyRaw(uw);
}

// QMC 流密码: map(<=300B) / RC4 变体(>300B)
class QmcCipher {
  constructor(key) {
    this.key = Buffer.from(key);
    this.n = this.key.length;
    this.useRc4 = this.n > 300;
    if (this.useRc4) this._initRc4();
  }
  _mapL(off) {
    const n = this.n;
    if (off > 0x7FFF) off %= 0x7FFF;
    const v = (off * off + 0x1162E) % n;
    const b = this.key[v];
    let sh = v & 7; sh = sh < 4 ? sh + 4 : sh - 4;
    return ((b << sh) | (b >> sh)) & 0xff;
  }
  _initRc4() {
    const n = this.n;
    const box = Buffer.alloc(n);
    for (let i = 0; i < n; i++) box[i] = i & 0xff;
    let j = 0;
    for (let i = 0; i < n; i++) { j = (box[i] + j + this.key[i]) % n; const t = box[i]; box[i] = box[j]; box[j] = t; }
    this.box = box;
    let h = 1;
    for (let i = 0; i < n; i++) { const v = this.key[i]; if (v !== 0) { const p = (h * v) >>> 0; if (p === 0 || p <= h) break; h = p; } }
    this.hashBase = h;
  }
  _encFirstSegment(off, data, start, length) {
    const n = this.n;
    for (let k = 0; k < length; k++) {
      const o = off + k;
      const seg = this.key[o % n];
      const x = Math.trunc(this.hashBase / ((o + 1) * seg) * 100.0);
      data[start + k] ^= this.key[(((x % n) + n) % n)];
    }
  }
  _encASegment(off, data, start, length) {
    const n = this.n;
    const b = Buffer.from(this.box);
    const blk = Math.floor(off / 0x1400) & 0x1FF;
    if (blk >= n) return;
    const seg = this.key[blk];
    const inner = Math.trunc(this.hashBase / ((Math.floor(off / 0x1400) + 1) * seg) * 100.0);
    const skip = (inner & 0x1FF) + (off % 0x1400);
    let i = 0, j = 0;
    for (let s = 0; s < skip; s++) { i = (i + 1) % n; j = (b[i] + j) % n; const t = b[i]; b[i] = b[j]; b[j] = t; }
    for (let d = 0; d < length; d++) {
      i = (i + 1) % n; j = (b[i] + j) % n; const t = b[i]; b[i] = b[j]; b[j] = t;
      const idx = (b[i] + b[j]) % n;
      data[start + d] ^= b[idx];
    }
  }
  _processRc4(off, data, start, length) {
    let pos = 0;
    if (off < 0x80) {
      const first = Math.min(0x80 - off, length);
      this._encFirstSegment(off, data, start, first);
      pos += first; off += first; length -= first;
      if (length <= 0) return;
    }
    if (off % 0x1400 !== 0) {
      const nseg = Math.min(0x1400 - off % 0x1400, length);
      this._encASegment(off, data, start + pos, nseg);
      pos += nseg; off += nseg; length -= nseg;
      if (length <= 0) return;
    }
    while (length > 0x1400) {
      this._encASegment(off, data, start + pos, 0x1400);
      pos += 0x1400; off += 0x1400; length -= 0x1400;
    }
    this._encASegment(off, data, start + pos, length);
  }
  // 原地异或解密 data[start..start+length); baseOff 为这段数据在密文里的绝对偏移
  process(data, start, length, baseOff) {
    if (this.useRc4) this._processRc4(baseOff, data, start, length);
    else for (let i = 0; i < length; i++) data[start + i] ^= this._mapL(baseOff + i);
  }
}

module.exports = { SIMPLE_KEY, decryptEkeyRaw, decryptEkeyB64, qmcB64decode, stdB64decode, QmcCipher, tcTeaDecrypt, teaEcbDecrypt };
