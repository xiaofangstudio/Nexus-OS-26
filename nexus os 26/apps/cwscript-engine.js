/* ============================================================
 * CWScript 2.0.1 · 解释器内核（apps/cwscript-engine.js）
 * ------------------------------------------------------------
 * 设计目标（对应本次需求）：
 *   1. 变量在哪儿都能声明 —— 采用 **函数级作用域**（和 Python 一样），
 *      块 / for / while 不再吞变量；循环体里 let 的变量循环外也能用。
 *   2. 函数关键字从 `function` 改为 **`Fn`**（`function` 会给出明确迁移提示）。
 *   3. 支持 `i++ / i-- / += -= *= /=`，不用再写 `i = i + 1`。
 *   4. 数组 + Python 风格内置函数（len/range/str/int/…）。
 *   5. **不含任何游戏 API**（画布、精灵、帧循环等一律没有）——更接近 Python。
 *   6. 语法保持 C 系不变（分号、花括号），只做加法不做破坏性改动。
 *
 * 用法：
 *   CWScript.run(code, { onPrint, onLine, maxSteps })
 *   → { ok, output:[], error:{message,line}|null, env:{}, trace:[], ms }
 *   CWScript.tokenize(code) / CWScript.parse(code) 供 IDE 展示 AST
 * ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CWScript = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '2.0.1';

  /* ---------------- 词法分析 ---------------- */
  var KEYWORDS = ['let', 'const', 'Fn', 'function', 'if', 'else', 'while', 'for',
    'return', 'break', 'continue', 'print', 'true', 'false', 'null', 'and', 'or', 'not'];

  function tokenize(code) {
    var tokens = [], i = 0, line = 1, n = code.length;
    function push(type, value, ln) { tokens.push({ type: type, value: value, line: ln }); }

    while (i < n) {
      var c = code[i];

      if (c === '\n') { line++; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }

      // 注释 // 与 /* */
      if (c === '/' && code[i + 1] === '/') {
        while (i < n && code[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && code[i + 1] === '*') {
        i += 2;
        while (i < n && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] === '\n') line++; i++; }
        i += 2;
        continue;
      }

      // 字符串（单/双引号，支持 \n \t \\ \" \'）
      if (c === '"' || c === "'") {
        var quote = c, startLine = line, out = '';
        i++;
        while (i < n && code[i] !== quote) {
          if (code[i] === '\\') {
            var nx = code[i + 1];
            if (nx === 'n') out += '\n';
            else if (nx === 't') out += '\t';
            else if (nx === 'r') out += '\r';
            else if (nx === '\\') out += '\\';
            else if (nx === '"') out += '"';
            else if (nx === "'") out += "'";
            else out += nx === undefined ? '' : nx;
            i += 2;
            continue;
          }
          if (code[i] === '\n') line++;
          out += code[i];
          i++;
        }
        if (i >= n) throw err('字符串没有闭合（起始于第 ' + startLine + ' 行）', startLine);
        i++; // 跳过结束引号
        push('string', out, startLine);
        continue;
      }

      // 数字
      if (/[0-9]/.test(c)) {
        var num = '';
        while (i < n && /[0-9]/.test(code[i])) { num += code[i]; i++; }
        if (code[i] === '.' && /[0-9]/.test(code[i + 1] || '')) {
          num += '.'; i++;
          while (i < n && /[0-9]/.test(code[i])) { num += code[i]; i++; }
        }
        push('number', parseFloat(num), line);
        continue;
      }

      // 标识符 / 关键字
      if (/[A-Za-z_$]/.test(c)) {
        var id = '';
        while (i < n && /[A-Za-z0-9_$]/.test(code[i])) { id += code[i]; i++; }
        push(KEYWORDS.indexOf(id) !== -1 ? 'keyword' : 'identifier', id, line);
        continue;
      }

      // 运算符（最长匹配）
      var three = code.substr(i, 3);
      if (three === '===' || three === '!==') { push('operator', three.slice(0, 2), line); i += 3; continue; }
      var two = code.substr(i, 2);
      if (['==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%='].indexOf(two) !== -1) {
        push('operator', two, line); i += 2; continue;
      }
      if ('+-*/%<>=!'.indexOf(c) !== -1) { push('operator', c, line); i++; continue; }

      // 分隔符
      if ('(){}[],;.'.indexOf(c) !== -1) { push('delimiter', c, line); i++; continue; }

      throw err('无法识别的字符：' + c, line);
    }

    tokens.push({ type: 'eof', value: '', line: line });
    return tokens;
  }

  function err(message, line) { return { message: message + (line ? ' (第 ' + line + ' 行)' : ''), line: line || 0 }; }

  /* ---------------- 语法分析（递归下降 → AST） ---------------- */
  function parse(codeOrTokens) {
    var tokens = Array.isArray(codeOrTokens) ? codeOrTokens : tokenize(codeOrTokens);
    var pos = 0;

    function peek(o) { return tokens[pos + (o || 0)]; }
    function atEnd() { return peek().type === 'eof'; }
    function consume() { return tokens[pos++]; }
    function is(val) { var t = peek(); return t.value === val && (t.type === 'delimiter' || t.type === 'operator' || t.type === 'keyword'); }
    function expect(val, what) {
      var t = peek();
      if (t.value !== val) throw err('这里应该是 ' + (what || ("'" + val + "'")) + '，却遇到 ' + (t.value || t.type), t.line);
      return consume();
    }
    function expectIdent(what) {
      var t = peek();
      if (t.type !== 'identifier') throw err('这里应该是' + (what || '变量名') + '，却遇到 ' + (t.value || t.type), t.line);
      return consume();
    }
    // 宽松分号：有就吃掉；没有则允许在 } 前、行尾或文件结束处省略（更接近 Python 手感）
    function optionalSemi() {
      if (is(';')) { consume(); return; }
      var t = peek();
      if (t.type === 'eof' || t.value === '}') return;
      var prev = tokens[pos - 1];
      if (prev && t.line > prev.line) return; // 换行了就放过
      throw err('语句末尾缺少分号 ;', prev ? prev.line : t.line);
    }

    function parseProgram() {
      var body = [];
      while (!atEnd()) body.push(parseStatement());
      return { type: 'Program', body: body, line: 1 };
    }

    function parseStatement() {
      var t = peek();
      if (t.type === 'keyword') {
        switch (t.value) {
          case 'let': case 'const': return parseVarDecl(t.value === 'const');
          case 'Fn': return parseFnDecl();
          case 'function':
            throw err('CWScript 2.0.1 已把 `function` 改成 `Fn`，请改写为：Fn 函数名(...) { ... }', t.line);
          case 'if': return parseIf();
          case 'while': return parseWhile();
          case 'for': return parseFor();
          case 'return': return parseReturn();
          case 'break': consume(); optionalSemi(); return { type: 'Break', line: t.line };
          case 'continue': consume(); optionalSemi(); return { type: 'Continue', line: t.line };
          case 'print': return parsePrint();
          case 'else': throw err('else 前面没有对应的 if', t.line);
        }
      }
      if (is('{')) return parseBlock();
      return parseExprStatement();
    }

    function parseVarDecl(isConst) {
      var line = peek().line; consume();
      var name = expectIdent('变量名').value;
      var init = null;
      if (is('=')) { consume(); init = parseExpression(); }
      optionalSemi();
      return { type: 'VarDecl', name: name, init: init, constant: !!isConst, line: line };
    }

    function parseFnDecl() {
      var line = peek().line; consume();
      var name = expectIdent('函数名').value;
      expect('(');
      var params = [];
      if (!is(')')) {
        params.push(expectIdent('参数名').value);
        while (is(',')) { consume(); params.push(expectIdent('参数名').value); }
      }
      expect(')');
      var body = parseBlock();
      return { type: 'FnDecl', name: name, params: params, body: body, line: line };
    }

    function parseIf() {
      var line = peek().line; consume();
      expect('(');
      var test = parseExpression();
      expect(')');
      var consequent = parseBlock();
      var alternate = null;
      if (peek().type === 'keyword' && peek().value === 'else') {
        consume();
        alternate = (peek().type === 'keyword' && peek().value === 'if') ? parseIf() : parseBlock();
      }
      return { type: 'If', test: test, consequent: consequent, alternate: alternate, line: line };
    }

    function parseWhile() {
      var line = peek().line; consume();
      expect('(');
      var test = parseExpression();
      expect(')');
      return { type: 'While', test: test, body: parseBlock(), line: line };
    }

    function parseFor() {
      var line = peek().line; consume();
      expect('(');
      var init = null;
      if (!is(';')) {
        if (peek().type === 'keyword' && (peek().value === 'let' || peek().value === 'const')) {
          var cst = peek().value === 'const'; consume();
          var nm = expectIdent('循环变量名').value;
          var v = null;
          if (is('=')) { consume(); v = parseExpression(); }
          init = { type: 'VarDecl', name: nm, init: v, constant: cst, line: line };
        } else {
          init = { type: 'ExprStmt', expr: parseExpression(), line: line };
        }
      }
      expect(';');
      var test = is(';') ? null : parseExpression();
      expect(';');
      var update = is(')') ? null : parseExpression();
      expect(')');
      var body = parseBlock();
      return { type: 'For', init: init, test: test, update: update, body: body, line: line };
    }

    function parseReturn() {
      var line = peek().line; consume();
      var value = (is(';') || is('}')) ? null : parseExpression();
      optionalSemi();
      return { type: 'Return', value: value, line: line };
    }

    function parsePrint() {
      var line = peek().line; consume();
      expect('(');
      var args = [];
      if (!is(')')) {
        args.push(parseExpression());
        while (is(',')) { consume(); args.push(parseExpression()); }
      }
      expect(')');
      optionalSemi();
      return { type: 'Print', args: args, line: line };
    }

    function parseBlock() {
      var line = peek().line;
      expect('{', '左花括号 {');
      var body = [];
      while (!is('}')) {
        if (atEnd()) throw err('代码块没有闭合，缺少 }', line);
        body.push(parseStatement());
      }
      expect('}', '右花括号 }');
      return { type: 'Block', body: body, line: line };
    }

    function parseExprStatement() {
      var line = peek().line;
      var expr = parseExpression();
      optionalSemi();
      return { type: 'ExprStmt', expr: expr, line: line };
    }

    /* --- 表达式优先级 --- */
    function parseExpression() { return parseAssignment(); }

    function parseAssignment() {
      var left = parseOr();
      if (is('=')) {
        consume();
        var right = parseAssignment();
        if (left.type !== 'Identifier' && left.type !== 'Index') throw err('赋值号左边必须是变量或数组元素', left.line);
        return { type: 'Assign', target: left, value: right, line: left.line };
      }
      // 复合赋值 += -= *= /= %=
      var ops = ['+=', '-=', '*=', '/=', '%='];
      if (peek().type === 'operator' && ops.indexOf(peek().value) !== -1) {
        var op = consume().value[0];
        var rhs = parseAssignment();
        return { type: 'Assign', target: left, value: { type: 'Binary', operator: op, left: left, right: rhs, line: left.line }, line: left.line };
      }
      return left;
    }

    function binLevel(ops, next) {
      return function () {
        var left = next();
        while (peek().type === 'operator' && ops.indexOf(peek().value) !== -1) {
          var op = consume().value;
          left = { type: 'Binary', operator: op, left: left, right: next(), line: left.line };
        }
        return left;
      };
    }
    function parseOr() { return parseAndOr(); }
    function parseAndOr() {
      var left = parseCompare();
      while ((is('||') || (peek().type === 'keyword' && peek().value === 'or')) ||
             (is('&&') || (peek().type === 'keyword' && peek().value === 'and'))) {
        var t = consume();
        var op = (t.value === 'or' || t.value === '||') ? '||' : '&&';
        left = { type: 'Logical', operator: op, left: left, right: parseCompare(), line: left.line };
      }
      return left;
    }
    var parseCompare = binLevel(['==', '!=', '<', '>', '<=', '>='], function () { return parseAdditive(); });
    var parseAdditive = binLevel(['+', '-'], function () { return parseMultiplicative(); });
    var parseMultiplicative = binLevel(['*', '/', '%'], function () { return parseUnary(); });

    function parseUnary() {
      var t = peek();
      if (is('!') || (t.type === 'keyword' && t.value === 'not')) { consume(); return { type: 'Unary', operator: '!', argument: parseUnary(), line: t.line }; }
      if (is('-')) { consume(); return { type: 'Unary', operator: '-', argument: parseUnary(), line: t.line }; }
      if (is('+')) { consume(); return parseUnary(); }
      // 前缀 ++/--
      if (is('++') || is('--')) {
        var op = consume().value;
        var target = parseUnary();
        if (target.type !== 'Identifier') throw err(op + ' 只能用于变量', t.line);
        return { type: 'Update', operator: op, prefix: true, target: target, line: t.line };
      }
      return parsePostfix();
    }

    function parsePostfix() {
      var expr = parsePrimary();
      while (true) {
        if (is('(')) {
          consume();
          var args = [];
          if (!is(')')) { args.push(parseExpression()); while (is(',')) { consume(); args.push(parseExpression()); } }
          expect(')');
          expr = { type: 'Call', callee: expr, args: args, line: expr.line };
        } else if (is('[')) {
          consume();
          var idx = parseExpression();
          expect(']');
          expr = { type: 'Index', object: expr, index: idx, line: expr.line };
        } else if (is('.')) {
          consume();
          var prop = expectIdent('属性名').value;
          expr = { type: 'Member', object: expr, property: prop, line: expr.line };
        } else if (is('++') || is('--')) {
          var op = consume().value;
          if (expr.type !== 'Identifier') throw err(op + ' 只能用于变量', expr.line);
          expr = { type: 'Update', operator: op, prefix: false, target: expr, line: expr.line };
        } else break;
      }
      return expr;
    }

    function parsePrimary() {
      var t = peek();
      if (t.type === 'number') { consume(); return { type: 'Literal', value: t.value, line: t.line }; }
      if (t.type === 'string') { consume(); return { type: 'Literal', value: t.value, line: t.line }; }
      if (t.type === 'keyword') {
        if (t.value === 'true') { consume(); return { type: 'Literal', value: true, line: t.line }; }
        if (t.value === 'false') { consume(); return { type: 'Literal', value: false, line: t.line }; }
        if (t.value === 'null') { consume(); return { type: 'Literal', value: null, line: t.line }; }
        if (t.value === 'Fn') return parseFnLiteral();
        if (t.value === 'function') throw err('请把 `function` 改成 `Fn`', t.line);
        throw err('关键字 ' + t.value + ' 不能出现在表达式里', t.line);
      }
      if (t.type === 'identifier') { consume(); return { type: 'Identifier', name: t.value, line: t.line }; }
      if (is('(')) { consume(); var e = parseExpression(); expect(')'); return e; }
      if (is('[')) return parseArray();
      throw err('这里应该是一个值，却遇到 ' + (t.value || t.type), t.line);
    }

    function parseArray() {
      var line = peek().line; expect('[');
      var items = [];
      if (!is(']')) { items.push(parseExpression()); while (is(',')) { consume(); if (is(']')) break; items.push(parseExpression()); } }
      expect(']');
      return { type: 'ArrayLiteral', items: items, line: line };
    }

    function parseFnLiteral() {
      var line = peek().line; consume(); // Fn
      var name = null;
      if (peek().type === 'identifier') name = consume().value;
      expect('(');
      var params = [];
      if (!is(')')) { params.push(expectIdent('参数名').value); while (is(',')) { consume(); params.push(expectIdent('参数名').value); } }
      expect(')');
      var body = parseBlock();
      return { type: 'FnLiteral', name: name, params: params, body: body, line: line };
    }

    return parseProgram();
  }

  /* ---------------- 运行时 ---------------- */
  function Scope(parent) { this.vars = Object.create(null); this.consts = Object.create(null); this.parent = parent || null; }
  Scope.prototype.has = function (n) { return (n in this.vars) || (this.parent ? this.parent.has(n) : false); };
  Scope.prototype.get = function (n) {
    if (n in this.vars) return this.vars[n];
    if (this.parent) return this.parent.get(n);
    throw err('未定义的变量：' + n, 0);
  };
  Scope.prototype.define = function (n, v, isConst) {
    this.vars[n] = v;
    if (isConst) this.consts[n] = true;
  };
  Scope.prototype.set = function (n, v) {
    if (n in this.consts) throw err('常量 ' + n + ' 不能重新赋值', 0);
    if (n in this.vars) { this.vars[n] = v; return v; }
    if (this.parent) return this.parent.set(n, v);
    throw err('未定义的变量：' + n + '（请先用 let 声明）', 0);
  };
  Scope.prototype.snapshot = function () {
    var out = {};
    var chain = [];
    var s = this;
    while (s) { chain.push(s); s = s.parent; }
    for (var i = chain.length - 1; i >= 0; i--) {
      for (var k in chain[i].vars) out[k] = chain[i].vars[k];
    }
    // 过滤函数内部对象，避免循环引用让面板报错
    for (var key in out) {
      var v = out[key];
      if (v && typeof v === 'object' && v.__fn) out[key] = '[Fn ' + (v.name || 'anonymous') + ']';
      else if (Array.isArray(v)) out[key] = '[' + v.join(', ') + ']';
      else if (typeof v === 'string') out[key] = JSON.stringify(v);
    }
    return out;
  };

  function isFn(v) { return v && typeof v === 'object' && v.__fn === true; }

  function truthy(v) {
    if (v === null || v === undefined || v === false) return false;
    if (v === 0 || v === '' || Number.isNaN(v)) return false;
    if (Array.isArray(v) && v.length === 0) return false; // 更像 Python
    return true;
  }

  function display(v) {
    if (v === null || v === undefined) return 'null';
    if (isFn(v)) return '[Fn ' + (v.name || 'anonymous') + ']';
    if (Array.isArray(v)) return '[' + v.map(display).join(', ') + ']';
    if (typeof v === 'number' && Object.is(v, -0)) return '0';
    return String(v);
  }

  function typeName(v) {
    if (v === null || v === undefined) return 'null';
    if (Array.isArray(v)) return 'array';
    if (isFn(v)) return 'Fn';
    if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
    return typeof v;
  }

  /* 内置函数（Python 风格，无任何游戏 API） */
  var BUILTINS = {
    len: function (x) { if (x == null) throw err('len() 参数不能为空', 0); return Array.isArray(x) || typeof x === 'string' ? x.length : 0; },
    str: function (x) { return display(x); },
    int: function (x) { var n = parseInt(x, 10); return Number.isNaN(n) ? 0 : n; },
    float: function (x) { var n = parseFloat(x); return Number.isNaN(n) ? 0 : n; },
    bool: function (x) { return truthy(x); },
    type: function (x) { return typeName(x); },
    abs: function (x) { return Math.abs(x); },
    min: function () { return Math.min.apply(null, Array.prototype.slice.call(arguments)); },
    max: function () { return Math.max.apply(null, Array.prototype.slice.call(arguments)); },
    sum: function (a) { return (Array.isArray(a) ? a : []).reduce(function (s, v) { return s + v; }, 0); },
    round: function (x, d) { var f = Math.pow(10, d || 0); return Math.round(x * f) / f; },
    range: function (a, b, step) {
      var start = 0, end = a, st = step == null ? 1 : step;
      if (b !== undefined) { start = a; end = b; }
      var out = [];
      if (st === 0) throw err('range() 的步长不能为 0', 0);
      if (st > 0) { for (var i = start; i < end; i += st) out.push(i); }
      else { for (var j = start; j > end; j += st) out.push(j); }
      return out;
    },
    append: function (arr, v) { if (!Array.isArray(arr)) throw err('append(arr, v) 第一个参数必须是数组', 0); arr.push(v); return arr; },
    pop: function (arr, i) { if (!Array.isArray(arr)) throw err('pop(arr) 参数必须是数组', 0); return i == null ? arr.pop() : arr.splice(i, 1)[0]; },
    insert: function (arr, i, v) { if (!Array.isArray(arr)) throw err('insert(arr, i, v) 第一个参数必须是数组', 0); arr.splice(i, 0, v); return arr; },
    join: function (arr, sep) { return (Array.isArray(arr) ? arr : []).map(display).join(sep == null ? '' : sep); },
    split: function (s, sep) { return String(s).split(sep == null ? ' ' : sep); },
    upper: function (s) { return String(s).toUpperCase(); },
    lower: function (s) { return String(s).toLowerCase(); },
    strip: function (s) { return String(s).trim(); },
    replace: function (s, a, b) { return String(s).split(String(a)).join(String(b)); },
    contains: function (x, v) { return Array.isArray(x) ? x.indexOf(v) !== -1 : String(x).indexOf(String(v)) !== -1; },
    sort: function (arr) { if (!Array.isArray(arr)) throw err('sort(arr) 参数必须是数组', 0); arr.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; }); return arr; },
    reverse: function (arr) { if (!Array.isArray(arr)) throw err('reverse(arr) 参数必须是数组', 0); arr.reverse(); return arr; },
    keys: function () { throw err('CWScript 2.0.1 暂不支持字典', 0); },
  };

  /* 执行器 */
  function run(code, opts) {
    opts = opts || {};
    var started = Date.now();
    var output = [];
    var trace = [];
    var maxSteps = opts.maxSteps || 200000;
    var steps = 0;
    var globalScope = new Scope(null);

    // 安装内置函数（可在脚本里被同名 let 覆盖）
    Object.keys(BUILTINS).forEach(function (k) {
      globalScope.define(k, { __fn: true, name: k, native: BUILTINS[k], params: [] }, true);
    });

    function step(node) {
      if (++steps > maxSteps) throw err('执行步数超过上限（' + maxSteps + '），可能有死循环', node && node.line);
      if (node && node.line) {
        trace.push(node.line);
        if (typeof opts.onLine === 'function') opts.onLine(node.line);
      }
    }

    function callFunction(fnVal, args, line) {
      if (fnVal.native) {
        try { return fnVal.native.apply(null, args); }
        catch (e) { throw err((e && e.message) || '内置函数出错', line); }
      }
      var scope = new Scope(fnVal.closure);
      fnVal.params.forEach(function (p, i) { scope.define(p, args[i]); });
      var r = execBlock(fnVal.body, scope);
      return r && r.__return ? r.value : null;
    }

    function execBlock(node, scope) {
      var result = null;
      for (var i = 0; i < node.body.length; i++) {
        result = exec(node.body[i], scope);
        if (result && (result.__return || result.__break || result.__continue)) return result;
      }
      return result;
    }

    function exec(node, scope) {
      if (!node) return null;
      step(node);
      switch (node.type) {
        case 'Program': return execBlock(node, scope);

        case 'Block': return execBlock(node, scope); // 注意：不新建作用域（函数级作用域）

        case 'VarDecl': {
          var val = node.init ? evalExpr(node.init, scope) : null;
          scope.define(node.name, val, node.constant);
          return null;
        }

        case 'FnDecl': {
          scope.define(node.name, { __fn: true, name: node.name, params: node.params, body: node.body, closure: scope }, true);
          return null;
        }

        case 'If': {
          if (truthy(evalExpr(node.test, scope))) return exec(node.consequent, scope);
          if (node.alternate) return exec(node.alternate, scope);
          return null;
        }

        case 'While': {
          var guard = 0;
          while (truthy(evalExpr(node.test, scope))) {
            if (++guard > 1000000) throw err('while 循环次数过多，可能有死循环', node.line);
            var r = exec(node.body, scope);
            if (r && r.__break) break;
            if (r && r.__return) return r;
          }
          return null;
        }

        case 'For': {
          if (node.init) exec(node.init, scope);
          var g = 0;
          while (true) {
            if (node.test && !truthy(evalExpr(node.test, scope))) break;
            if (++g > 1000000) throw err('for 循环次数过多，可能有死循环', node.line);
            var r2 = exec(node.body, scope);
            if (r2 && r2.__break) break;
            if (r2 && r2.__return) return r2;
            if (node.update) evalExpr(node.update, scope);
          }
          return null;
        }

        case 'Return': return { __return: true, value: node.value ? evalExpr(node.value, scope) : null };
        case 'Break': return { __break: true };
        case 'Continue': return { __continue: true };

        case 'Print': {
          var parts = node.args.map(function (a) { return display(evalExpr(a, scope)); });
          var text = parts.join(' ');
          output.push(text);
          if (typeof opts.onPrint === 'function') opts.onPrint(text);
          return null;
        }

        case 'ExprStmt': return evalExpr(node.expr, scope);

        default: throw err('未知语句类型：' + node.type, node.line);
      }
    }

    function evalExpr(node, scope) {
      if (!node) return null;
      step(node);
      switch (node.type) {
        case 'Literal': return node.value;

        case 'Identifier': {
          try { return scope.get(node.name); }
          catch (e) { throw err('未定义的变量：' + node.name, node.line); }
        }

        case 'ArrayLiteral': return node.items.map(function (it) { return evalExpr(it, scope); });

        case 'FnLiteral': return { __fn: true, name: node.name, params: node.params, body: node.body, closure: scope };

        case 'Unary': {
          var v = evalExpr(node.argument, scope);
          return node.operator === '!' ? !truthy(v) : -v;
        }

        case 'Logical': {
          var l = evalExpr(node.left, scope);
          if (node.operator === '&&') return truthy(l) ? evalExpr(node.right, scope) : l;
          return truthy(l) ? l : evalExpr(node.right, scope);
        }

        case 'Binary': {
          var a = evalExpr(node.left, scope), b = evalExpr(node.right, scope);
          switch (node.operator) {
            case '+':
              if (typeof a === 'string' || typeof b === 'string') return display(a) + display(b);
              return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/':
              if (b === 0) throw err('除数不能为 0', node.line);
              return a / b;
            case '%': return a % b;
            case '<': return a < b;
            case '>': return a > b;
            case '<=': return a <= b;
            case '>=': return a >= b;
            case '==': return a === b;
            case '!=': return a !== b;
            default: throw err('未知运算符：' + node.operator, node.line);
          }
        }

        case 'Assign': {
          var value = evalExpr(node.value, scope);
          if (node.target.type === 'Identifier') { scope.set(node.target.name, value); return value; }
          if (node.target.type === 'Index') {
            var arr = evalExpr(node.target.object, scope);
            var idx = evalExpr(node.target.index, scope);
            if (!Array.isArray(arr)) throw err('不能给非数组下标赋值', node.line);
            arr[idx] = value;
            return value;
          }
          throw err('非法的赋值目标', node.line);
        }

        case 'Update': {
          var old = scope.get(node.target.name);
          var nv = node.operator === '++' ? old + 1 : old - 1;
          scope.set(node.target.name, nv);
          return node.prefix ? nv : old;
        }

        case 'Index': {
          var o = evalExpr(node.object, scope);
          var k = evalExpr(node.index, scope);
          if (o == null) throw err('不能对 ' + display(o) + ' 取下标', node.line);
          return o[k];
        }

        case 'Member': {
          var obj = evalExpr(node.object, scope);
          if (obj == null) throw err('不能读取 ' + display(obj) + ' 的属性 ' + node.property, node.line);
          if (node.property === 'length') return obj.length;
          var mv = obj[node.property];
          return typeof mv === 'function' ? mv.bind(obj) : mv;
        }

        case 'Call': {
          var callee;
          if (node.callee.type === 'Identifier') {
            try { callee = scope.get(node.callee.name); }
            catch (e) { throw err('未定义的函数：' + node.callee.name, node.line); }
          } else if (node.callee.type === 'Member') {
            callee = evalExpr(node.callee, scope);
          } else {
            callee = evalExpr(node.callee, scope);
          }
          if (!isFn(callee) && typeof callee !== 'function') {
            throw err('不是函数，无法调用：' + (node.callee.name || '表达式'), node.line);
          }
          var args = node.args.map(function (a) { return evalExpr(a, scope); });
          if (typeof callee === 'function') return callee.apply(null, args); // 原生方法（如 s.toUpperCase 绑定后）
          return callFunction(callee, args, node.line);
        }

        default: throw err('未知表达式类型：' + node.type, node.line);
      }
    }

    try {
      var ast = parse(code);
      exec({ type: 'Program', body: ast.body, line: 1 }, globalScope);
      return { ok: true, output: output, error: null, env: globalScope.snapshot(), trace: trace, ms: Date.now() - started, version: VERSION };
    } catch (e) {
      var message = e && e.message ? e.message : String(e);
      var line = e && e.line ? e.line : 0;
      return {
        ok: false, output: output,
        error: { message: message, line: line },
        env: globalScope.snapshot(), trace: trace, ms: Date.now() - started, version: VERSION,
      };
    }
  }

  return { VERSION: VERSION, version: VERSION, tokenize: tokenize, parse: parse, run: run, display: display };
});
