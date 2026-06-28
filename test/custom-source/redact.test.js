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
    account: {
      password: 'one',
      passwd: 'two',
      pwd: 'three',
      credential: 'four',
      credentials: 'five',
    },
  });
  assert.equal(output.account.password, '[REDACTED]');
  assert.equal(output.account.passwd, '[REDACTED]');
  assert.equal(output.account.pwd, '[REDACTED]');
  assert.equal(output.account.credential, '[REDACTED]');
  assert.equal(output.account.credentials, '[REDACTED]');
});

test('redacts auth and broad password credential key variants', () => {
  const output = redactSecrets({
    auth: 'basic abc',
    dbPassword: 'one',
    proxy_password: 'two',
    passwordHash: 'three',
    clientCredentials: 'four',
    credentialsJson: 'five',
    apiKey: 'six',
    headers: { Authorization: 'Bearer abc', Cookie: 'a=b', Accept: 'json' },
    access_token: 'seven',
  });
  assert.equal(output.auth, '[REDACTED]');
  assert.equal(output.dbPassword, '[REDACTED]');
  assert.equal(output.proxy_password, '[REDACTED]');
  assert.equal(output.passwordHash, '[REDACTED]');
  assert.equal(output.clientCredentials, '[REDACTED]');
  assert.equal(output.credentialsJson, '[REDACTED]');
  assert.equal(output.apiKey, '[REDACTED]');
  assert.equal(output.headers.Authorization, '[REDACTED]');
  assert.equal(output.headers.Cookie, '[REDACTED]');
  assert.equal(output.headers.Accept, 'json');
  assert.equal(output.access_token, '[REDACTED]');
});

test('redacts auth aliases without redacting author or Accept', () => {
  const output = redactSecrets({
    authHeader: 'one',
    basicAuth: 'two',
    proxyAuth: 'three',
    authentication: 'four',
    author: 'writer',
    Accept: 'json',
  });
  assert.equal(output.authHeader, '[REDACTED]');
  assert.equal(output.basicAuth, '[REDACTED]');
  assert.equal(output.proxyAuth, '[REDACTED]');
  assert.equal(output.authentication, '[REDACTED]');
  assert.equal(output.author, 'writer');
  assert.equal(output.Accept, 'json');
});
