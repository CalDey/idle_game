// style.css 花括号配对：忽略注释与字符串中的括号，文件整体必须成对闭合。
// 用法：node tools/css-brace-balance.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');

function braceBalance(source) {
  const stack = [];
  const unmatchedCloses = [];
  let i = 0;
  const n = source.length;
  let inString = null;
  let inComment = false;
  let line = 1;
  let col = 1;

  const step = (count) => {
    for (let k = 0; k < count; k += 1) {
      if (i >= n) return;
      if (source[i] === '\n') {
        line += 1;
        col = 1;
      } else {
        col += 1;
      }
      i += 1;
    }
  };

  while (i < n) {
    const c = source[i];
    const next = i + 1 < n ? source[i + 1] : '';

    if (inComment) {
      if (c === '*' && next === '/') {
        inComment = false;
        step(2);
        continue;
      }
      step(1);
      continue;
    }

    if (inString) {
      if (c === '\\') {
        step(2);
        continue;
      }
      if (c === inString) inString = null;
      step(1);
      continue;
    }

    if (c === '/' && next === '*') {
      inComment = true;
      step(2);
      continue;
    }

    if (c === '"' || c === "'") {
      inString = c;
      step(1);
      continue;
    }

    if (c === '{') {
      stack.push({ line, col });
      step(1);
      continue;
    }

    if (c === '}') {
      if (stack.length) stack.pop();
      else unmatchedCloses.push({ line, col });
      step(1);
      continue;
    }

    step(1);
  }

  return { unclosedOpens: stack, unmatchedCloses, inString, inComment };
}

// 自检：注释和字符串里的括号不计入，正文必须成对。
const self = braceBalance('/* { } */ .a { content: "{"; } .b { color: red; }');
assert.deepStrictEqual(self.unclosedOpens, []);
assert.deepStrictEqual(self.unmatchedCloses, []);
assert.strictEqual(self.inString, null);
assert.strictEqual(self.inComment, false);

const unclosed = braceBalance('.a { color: red;');
assert.strictEqual(unclosed.unclosedOpens.length, 1);
assert.strictEqual(unclosed.unclosedOpens[0].line, 1);

const extra = braceBalance('.a { color: red; } }');
assert.strictEqual(extra.unmatchedCloses.length, 1);

const escaped = braceBalance('.a { content: "\\"{"; }');
assert.deepStrictEqual(escaped.unclosedOpens, []);
assert.deepStrictEqual(escaped.unmatchedCloses, []);

const result = braceBalance(css);
assert.deepStrictEqual(
  result.unmatchedCloses,
  [],
  `style.css 有多余的 }：${JSON.stringify(result.unmatchedCloses)}`
);
assert.deepStrictEqual(
  result.unclosedOpens,
  [],
  `style.css 有未闭合的 {：${JSON.stringify(result.unclosedOpens)}`
);
assert.strictEqual(result.inString, null, 'style.css 有未闭合的字符串');
assert.strictEqual(result.inComment, false, 'style.css 有未闭合的注释');

console.log('ok - style.css 花括号配对');
