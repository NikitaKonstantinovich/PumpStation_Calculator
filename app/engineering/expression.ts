/** Bounded expression language. No eval, JS globals, assignments, loops or dynamic calls. */
export type Expr = {
  literal: number | string | boolean | null;
} | {
  input: string;
} | {
  op: string;
  args: Expr[];
};
const precedence: Record<string, number> = {
  "??": 1,
  "||": 2,
  "&&": 3,
  "==": 4,
  "!=": 4,
  "<": 5,
  ">": 5,
  "<=": 5,
  ">=": 5,
  "+": 6,
  "-": 6,
  "*": 7,
  "/": 7,
  "%": 7
};
const functions: Record<string, [number, number]> = {
  min: [1, 12],
  max: [1, 12],
  abs: [1, 1],
  round: [1, 1],
  sqrt: [1, 1],
  if: [3, 3],
  get: [2, 2],
  set: [3, 3],
  len: [1, 1]
};
export function compileExpression(source: string, names: Set<string>): Expr {
  if (typeof source !== "string" || !source.trim() || source.length > 2000) throw Error("Формула пуста или длиннее 2000 символов");
  const pattern = /\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?|"(?:[^"\\]|\\.)*"|[A-Za-z_]\w*|\?\?|\|\||&&|==|!=|<=|>=|[<>+\-*/%!(),])/giy;
  const tokens: string[] = [];
  let offset = 0;
  const text = source.trim();
  while (offset < text.length) {
    const match = pattern.exec(text);
    if (!match || tokens.length >= 180) throw Error("Недопустимый символ или слишком длинное выражение, позиция " + (offset + 1));
    tokens.push(match[1]);
    offset = pattern.lastIndex;
  }
  let index = 0;
  function expect(token: string) {
    if (tokens[index++] !== token) throw Error("Ожидалось «" + token + "» у токена " + index);
  }
  function read(min: number, depth: number): Expr {
    if (depth > 32) throw Error("Слишком большая вложенность формулы");
    const token = tokens[index++];
    let expr: Expr;
    if (token === "(") {
      expr = read(1, depth + 1);
      expect(")");
    } else if (token === "-" || token === "!") expr = {
      op: token === "-" ? "neg" : "not",
      args: [read(8, depth + 1)]
    };else if (token === "true" || token === "false" || token === "null" || token?.startsWith('"') || /^\d/.test(token ?? "")) {
      const value = JSON.parse(token);
      if (typeof value === "number" && !Number.isFinite(value)) throw Error("Число вне диапазона");
      expr = {
        literal: value
      };
    } else if (tokens[index] === "(" && Object.hasOwn(functions, token)) {
      index++;
      const args: Expr[] = [];
      if (tokens[index] !== ")") {
        args.push(read(1, depth + 1));
        while (tokens[index] === ",") {
          index++;
          args.push(read(1, depth + 1));
        }
      }
      expect(")");
      const [lo, hi] = functions[token];
      if (args.length < lo || args.length > hi) throw Error("Неверное количество аргументов " + token);
      expr = {
        op: token,
        args
      };
    } else if (names.has(token)) expr = {
      input: token
    };else throw Error("Неизвестный вход или операция «" + (token ?? "конец") + "»");
    while (Object.hasOwn(precedence, tokens[index]) && precedence[tokens[index]] >= min) {
      const op = tokens[index++];
      expr = {
        op,
        args: [expr, read(precedence[op] + 1, depth + 1)]
      };
    }
    return expr;
  }
  const result = read(1, 0);
  if (index !== tokens.length) throw Error("Лишний токен «" + tokens[index] + "»");
  return result;
}
const numeric = (v: unknown) => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw Error("Ожидается конечное число");
  return v;
};
const safeKey = (v: unknown): v is string => typeof v === "string" && !["__proto__", "constructor", "prototype"].includes(v);
export function evaluate(root: Expr, values: Record<string, unknown>): unknown {
  const deadline = performance.now() + 50;
  let remaining = 512;
  function visit(expr: Expr): unknown {
    if (--remaining < 0 || performance.now() > deadline) throw Error("Превышен лимит выполнения формулы");
    if ("literal" in expr) return expr.literal;
    if ("input" in expr) return Object.hasOwn(values, expr.input) ? values[expr.input] : undefined;
    if (["min", "max"].includes(expr.op)) {
      const args = expr.args.map(arg => numeric(visit(arg)));
      return expr.op === "min" ? Math.min(...args) : Math.max(...args);
    }
    const [a, b, c] = expr.args;
    const left = visit(a);
    if (expr.op === "if") return visit(left ? b : c);
    if (expr.op === "??") return left ?? visit(b);
    if (expr.op === "&&") return left && visit(b);
    if (expr.op === "||") return left || visit(b);
    if (expr.op === "not") return !left;
    if (expr.op === "len") return Array.isArray(left) || typeof left === "string" ? left.length : null;
    const right = b ? visit(b) : undefined;
    if (expr.op === "get" || expr.op === "set") {
      if (left == null) return null;
      if (typeof left !== "object" || !safeKey(right)) throw Error("Некорректное поле объекта");
      if (expr.op === "get") return Object.hasOwn(left, right) ? (left as Record<string, unknown>)[right] : null;
      return {
        ...left,
        [right]: visit(c)
      };
    }
    if (expr.op === "==") return left === right;
    if (expr.op === "!=") return left !== right;
    const x = numeric(left);
    if (expr.op === "abs") return Math.abs(x);
    if (expr.op === "round") return Math.round(x);
    if (expr.op === "neg") return -x;
    if (expr.op === "sqrt") return numeric(Math.sqrt(x));
    const y = numeric(right);
    switch (expr.op) {
      case "<":
        return x < y;
      case ">":
        return x > y;
      case "<=":
        return x <= y;
      case ">=":
        return x >= y;
      case "+":
        return numeric(x + y);
      case "-":
        return numeric(x - y);
      case "*":
        return numeric(x * y);
      case "/":
        return numeric(x / y);
      case "%":
        return numeric(x % y);
      default:
        throw Error("Неизвестная операция");
    }
  }
  const result = visit(root);
  if (performance.now() > deadline) throw Error("Превышен лимит выполнения формулы");
  return result;
}
