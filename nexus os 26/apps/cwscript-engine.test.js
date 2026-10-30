/* CWScript 2.0.1 引擎测试（node apps/cwscript-engine.test.js） */
const CW = require('./cwscript-engine.js');

let pass = 0, fail = 0;
function t(name, code, expect) {
  const r = CW.run(code);
  let ok, detail;
  if (expect.error) {
    ok = !r.ok && r.error.message.includes(expect.error);
    detail = r.ok ? '期望报错但通过了；输出=' + JSON.stringify(r.output) : r.error.message;
  } else {
    const got = r.output.join('\n');
    ok = r.ok && got === expect.out;
    detail = r.ok ? '输出=' + JSON.stringify(got) : '报错=' + r.error.message;
  }
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '  → ' + detail); }
}

console.log('CWScript 版本:', CW.VERSION);

console.log('\n[1] for 循环里声明变量（核心 bug）');
t('循环体里 let，循环外可用', `
for (let i = 0; i < 3; i++) {
  let sum = i * 10;
  print(sum);
}
print("after:", sum);
`, { out: '0\n10\n20\nafter: 20' });

t('循环里累加外部变量', `
let total = 0;
for (let i = 1; i <= 4; i++) {
  let step = i * i;
  total += step;
}
print(total);
`, { out: '30' });

t('嵌套 for，内层用外层变量', `
for (let i = 0; i < 2; i++) {
  for (let j = 0; j < 2; j++) {
    let cell = i * 10 + j;
    print(cell);
  }
}
`, { out: '0\n1\n10\n11' });

console.log('\n[2] Fn 函数');
t('Fn 定义与调用', `
Fn add(a, b) {
  return a + b;
}
print(add(2, 3));
`, { out: '5' });

t('递归 + Fn', `
Fn fib(n) {
  if (n < 2) { return n; }
  return fib(n - 1) + fib(n - 2);
}
print(fib(10));
`, { out: '55' });

t('function 关键字应报迁移提示', `
function foo() { return 1; }
`, { error: 'Fn' });

t('函数内局部变量不污染全局', `
Fn f() {
  let hidden = 42;
  return hidden;
}
print(f());
print(hidden);
`, { error: '未定义的变量' });

console.log('\n[3] 变量与赋值便利性');
t('let 无初值', `let x; print(x);`, { out: 'null' });
t('i++ 后缀', `let i = 0; i++; i++; print(i);`, { out: '2' });
t('++i 前缀', `let i = 0; print(++i);`, { out: '1' });
t('-= 复合赋值', `let n = 10; n -= 3; print(n);`, { out: '7' });
t('const 不可改', `const c = 1; c = 2;`, { error: '常量' });

console.log('\n[4] 数组与内置函数');
t('数组 + 下标 + len', `let a = [1, 2, 3]; a[1] = 9; print(a, len(a));`, { out: '[1, 9, 3] 3' });
t('range + append', `let a = range(3); append(a, 99); print(a);`, { out: '[0, 1, 2, 99]' });
t('字符串内置', `print(upper("ab"), len("hello"), join(["a","b"], "-"));`, { out: 'AB 5 a-b' });
t('sum / max', `print(sum([1,2,3]), max(4, 7, 2));`, { out: '6 7' });
t('字符串 + 数字拼接', `print("n=" + 42);`, { out: 'n=42' });

console.log('\n[5] 控制流');
t('if / else', `let x = 7; if (x > 5) { print("big"); } else { print("small"); }`, { out: 'big' });
t('while + break', `let i = 0; while (true) { i++; if (i == 3) { break; } } print(i);`, { out: '3' });
t('continue', `for (let i = 0; i < 5; i++) { if (i % 2 == 0) { continue; } print(i); }`, { out: '1\n3' });
t('and / or / not 别名', `print(1 and 2, 0 or 5, not 0);`, { out: '2 5 true' });

console.log('\n[6] 错误定位');
t('未闭合字符串报行号', `let a = 1;\nlet b = "oops;`, { error: '字符串没有闭合' });
t('缺分号提示', `let a = 1 let b = 2;`, { error: '分号' });

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
