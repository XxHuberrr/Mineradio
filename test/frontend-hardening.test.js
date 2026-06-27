const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function extractFunction(name) {
  const match = source.match(new RegExp(`function ${name}\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} must be defined`);
  return match[0];
}

test('escAttr escapes HTML attribute metacharacters', () => {
  const context = {};
  vm.runInNewContext(`${extractFunction('escAttr')}; this.result = escAttr;`, context);
  const escAttr = context.result;

  assert.equal(
    escAttr('https://img.test/a?x=" onerror="alert(1)'),
    'https://img.test/a?x=&quot; onerror=&quot;alert(1)',
  );
  assert.equal(escAttr("<&>'"), '&lt;&amp;&gt;&#39;');
});

test('dynamic image src templates use attribute-context escaping', () => {
  const unsafeLines = source.split('\n').filter((line) => (
    line.includes('<img')
    && line.includes('src="\' + ')
    && !line.includes('src="\' + escAttr(')
  ));

  assert.deepEqual(unsafeLines, []);
});
