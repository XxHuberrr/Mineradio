const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');

assert.ok(html.includes('id="login-provider-guest"'), 'login modal should expose a guest tab');
assert.ok(html.includes('id="guest-name-input"'), 'guest login should request a username');
assert.ok(!/id="guest-[^"]*password/i.test(html), 'guest login must not include a password field');
assert.ok(/GUEST_PROFILE_STORE_KEY/.test(html), 'guest profile should use persistent local storage');
assert.ok(/function\s+submitGuestLogin/.test(html), 'guest login submit handler should exist');
assert.ok(/function\s+isGuestLoggedIn/.test(html), 'guest login state helper should exist');
assert.ok(/maybeRunStartupLoginGuide[\s\S]*?isGuestLoggedIn\(\)/.test(html), 'startup login guide should stop for guest users');
assert.ok(/openProviderLogin\(provider,\s*opts\)/.test(html), 'provider login should distinguish explicit and automatic requests');

console.log('guest login static tests passed');
