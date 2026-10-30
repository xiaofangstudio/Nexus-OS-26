# CWScript 2.0.1 语言参考

> 小方工作室 · Nexus OS 26 内置脚本语言
> 引擎：`apps/cwscript-engine.js`（独立、可单测）｜ IDE：`apps/naveide.html`

CWScript 2.0.1 是在原 CWScript 上做**修复 + 收敛**的版本：语法仍是 C 系（分号、花括号），
但作用域语义改成**函数级**（像 Python），并**彻底移除游戏制作相关能力**，让它更像一门通用脚本语言。

---

## 一、相比旧版改了什么

| 变化 | 说明 |
| --- | --- |
| ✅ **变量可以在任何地方声明** | 采用**函数级作用域**：`let` 写在 `for`/`while`/`if` 的块里也有效，循环结束后仍可访问（旧版块作用域会把变量吞掉） |
| ✅ **`function` → `Fn`** | 用 `Fn` 定义函数；写 `function` 会得到明确的迁移提示 |
| ✅ **支持 `i++ / i-- / += -= *= /= %=`** | 不用再写 `i = i + 1` |
| ✅ **支持数组与下标** | `let a = [1,2,3]; a[0] = 9;` |
| ✅ **Python 风格内置函数** | `len / range / str / int / float / sum / min / max / append / join / split / upper / lower / strip …` |
| ❌ **移除游戏 API** | 没有画布、精灵、帧循环、键盘事件等；这门语言不做游戏 |
| ✅ 更友好的报错 | 错误带行号；缺分号、字符串未闭合、`function` 误用都有明确提示 |

---

## 二、基本语法

### 变量

```cw
let name = "小方";
let count = 0;
count += 1;          // 也可以 count++
const PI = 3.14159;  // 常量不可重新赋值
let empty;           // 允许先声明后赋值，默认 null
```

### 条件

```cw
if (count > 10) {
  print("大");
} else if (count > 0) {
  print("中");
} else {
  print("小");
}
```

### 循环

```cw
// C 风格 for（循环体里声明的变量，循环外仍可用）
for (let i = 0; i < 5; i++) {
  let square = i * i;
  print(square);
}
print(square);        // ✅ 20 —— 函数级作用域，不再报"未定义"

while (count < 100) {
  count *= 2;
  if (count == 64) { break; }
}
```

### 函数

```cw
Fn add(a, b) {
  return a + b;
}

Fn fib(n) {
  if (n < 2) { return n; }
  return fib(n - 1) + fib(n - 2);
}

print(fib(10));       // 55

// 匿名函数（可当值传递）
let double = Fn (x) { return x * 2; };
print(double(21));    // 42
```

> 注意：`function` 关键字已废弃，请用 `Fn`。

### 输出

```cw
print("hello");
print("a =", 1, true);   // 多参数用空格连接
```

### 数组

```cw
let a = [3, 1, 2];
a[0] = 9;
append(a, 4);           // 也可以 a.push(4)
sort(a);
print(a, len(a));       // [1, 2, 3, 4] 4
print(a[1..]);          // 不支持切片，请用循环
```

### 字符串

```cw
let s = "Hello";
print(len(s), upper(s), lower(s), strip("  x  "));
print(join(["a", "b"], "-"));   // a-b
print(split("a,b,c", ","));     // [a, b, c]
```

### 运算符

| 类别 | 运算符 |
| --- | --- |
| 算术 | `+ - * / %` |
| 比较 | `== != < > <= >=` |
| 逻辑 | `&& \|\| !`（也接受 `and` / `or` / `not`） |
| 赋值 | `= += -= *= /= %=` |
| 自增 | `++ --`（前缀/后缀均可） |

> `+` 遇字符串会做拼接：`"n=" + 42` → `n=42`。

---

## 三、内置函数

| 函数 | 说明 |
| --- | --- |
| `len(x)` | 字符串/数组长度 |
| `str(x)` `int(x)` `float(x)` `bool(x)` `type(x)` | 类型转换与查询（`type` 返回 `int/float/string/array/bool/null/Fn`） |
| `abs(x)` `min(...)` `max(...)` `sum(arr)` `round(x, 位数)` | 数值 |
| `range(a)` `range(a, b)` `range(a, b, step)` | 生成数组 |
| `append(arr, v)` `pop(arr[, i])` `insert(arr, i, v)` | 数组增删 |
| `sort(arr)` `reverse(arr)` | 排序/反转（原地修改并返回） |
| `join(arr, sep)` `split(s, sep)` | 数组↔字符串 |
| `upper(s)` `lower(s)` `strip(s)` `replace(s, a, b)` `contains(x, v)` | 字符串 |

**没有** `print` 以外的 I/O、没有网络、没有定时器、没有游戏 API。

---

## 四、作用域规则（重点）

- 只有**函数调用**会创建新作用域；`{}` 代码块**不创建**作用域。
- 这意味着：`if` / `for` / `while` 里声明的变量，在同一个函数（或顶层）里到处可用。
- 函数内部的变量不会泄漏到外部。
- 同名 `let` 会覆盖当前作用域里的旧值（Python 风格），`const` 不允许再赋值。

```cw
let x = 1;
{
  let x = 2;   // 没有块作用域，这就是覆盖
}
print(x);      // 2
```

---

## 五、错误信息

```
第 3 行：未定义的变量：total（请先用 let 声明）
第 7 行：语句末尾缺少分号 ;
第 9 行：CWScript 2.0.1 已把 `function` 改成 `Fn`，请改写为：Fn 函数名(...) { ... }
```

---

## 六、版本

- **2.0.1**（2026-10-25）：函数级作用域、`Fn`、复合赋值/自增、数组、Python 风格内置函数、移除游戏能力。
- 兼容性：旧代码里 `function` 需改为 `Fn`；块作用域不再隔离变量（原本依赖"块内变量外部不可见"的代码需注意）。
