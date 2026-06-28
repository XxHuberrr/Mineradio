const test = require('node:test');
const assert = require('node:assert/strict');
const { redactSecrets } = require('../../desktop/custom-source/redact');

test('redacts nested credentials without mutating input', () => {
  const input = { headers: { Authorization: 'Bearer abc', Cookie: 'a=b', Accept: 'json' }, access_token: 'secret' };
  const output = redactSecrets(input);
  assert.equal(output.headers.Authorization, '[REDACTED]');
  assert.equal(output.headers.Cookie, '[REDACTED]');
  assert.equal(output.headers.Accept, 'json');
  assert.equal(output.access_token, '[REDACTED]');
  assert.equal(input.access_token, 'secret');
});

test('redacts circular array references', () => {
  const input = ['safe'];
  input.push(input);
  const output = redactSecrets(input);
  assert.deepEqual(output, ['safe', '[CIRCULAR]']);
});

test('redacts nested password and credential keys', () => {
  const output = redactSecrets({
    auth: {
      password: 'one',
      passwd: 'two',
      pwd: 'three',
      credential: 'four',
      credentials: 'five',
    },
  });
  assert.equal(output.auth.password, '[REDACTED]');
  assert.equal(output.auth.passwd, '[REDACTED]');
  assert.equal(output.auth.pwd, '[REDACTED]');
  assert.equal(output.auth.credential, '[REDACTED]');
  assert.equal(output.auth.credentials, '[REDACTED]');
});
