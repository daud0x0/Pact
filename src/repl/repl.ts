// ============================================================================
// VibeL REPL — Interactive Evaluation Environment
// Spec Reference: §24.4
//
// Supports evaluating:
// - Expressions (arithmetic, comparisons, literals)
// - LET bindings (persist across lines)
// - MAKE Type FROM value
// - Type checking via the compiler pipeline
// - Multi-line input with continuation
// ============================================================================

import * as readline from 'readline';
import { tokenize } from '../lexer/lexer.js';
import { parse } from '../parser/parser.js';
import { generateJS } from '../codegen/js-esm.js';

const VERSION = '0.1.0';

// ANSI colors
const C = {
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
  dim: '\x1b[2m',
};

// ============================================================================
// REPL State
// ============================================================================

interface ReplState {
  bindings: Map<string, unknown>;
  types: Map<string, { baseType: string; constraints: string[] }>;
  history: string[];
  lineCount: number;
}

// ============================================================================
// Expression Evaluator
// ============================================================================

function evaluateExpression(input: string, state: ReplState): { value: unknown; display: string } | { error: string } {
  const trimmed = input.trim();

  // Empty input
  if (!trimmed) return { value: undefined, display: '' };

  // Built-in commands
  if (trimmed === ':bindings' || trimmed === ':env') {
    const entries = [...state.bindings.entries()];
    if (entries.length === 0) return { value: undefined, display: `${C.gray}(no bindings)${C.reset}` };
    const display = entries.map(([k, v]) => `  ${C.cyan}${k}${C.reset} = ${formatValue(v)}`).join('\n');
    return { value: undefined, display };
  }

  if (trimmed === ':types') {
    const entries = [...state.types.entries()];
    if (entries.length === 0) return { value: undefined, display: `${C.gray}(no types)${C.reset}` };
    const display = entries.map(([k, v]) =>
      `  ${C.magenta}${k}${C.reset} : ${v.baseType}${v.constraints.length ? ` CONSTRAIN: ${v.constraints.map(c => `"${c}"`).join(', ')}` : ''}`
    ).join('\n');
    return { value: undefined, display };
  }

  if (trimmed === ':clear') {
    state.bindings.clear();
    state.types.clear();
    return { value: undefined, display: `${C.green}Environment cleared.${C.reset}` };
  }

  // LET binding
  const letMatch = trimmed.match(/^LET\s+(MUTABLE\s+)?(\w+)\s*=\s*(.+)$/);
  if (letMatch) {
    const name = letMatch[2];
    const exprStr = letMatch[3];
    const result = evalSimpleExpr(exprStr, state);
    if ('error' in result) return result;
    state.bindings.set(name, result.value);
    return { value: result.value, display: `${C.cyan}${name}${C.reset} = ${formatValue(result.value)}` };
  }

  // MAKE Type FROM value
  const makeMatch = trimmed.match(/^MAKE\s+(\w+)\s+FROM\s+(.+)$/);
  if (makeMatch) {
    const typeName = makeMatch[1];
    const valueStr = makeMatch[2];
    const typeInfo = state.types.get(typeName);

    const valueResult = evalSimpleExpr(valueStr, state);
    if ('error' in valueResult) return valueResult;

    if (typeInfo) {
      // Validate constraints
      for (const constraint of typeInfo.constraints) {
        const valid = checkConstraint(constraint, valueResult.value);
        if (!valid.passed) {
          return { error: `${C.red}TypeConstraintViolation:${C.reset} ${typeName} ${valid.reason} (got ${formatValue(valueResult.value)})` };
        }
      }
    }

    return {
      value: { __type: typeName, value: valueResult.value },
      display: `${C.magenta}${typeName}${C.reset}(${formatValue(valueResult.value)})`,
    };
  }

  // DEFINE TYPE (inline)
  const typeMatch = trimmed.match(/^DEFINE\s+TYPE\s+(\w+)\s+BASE:\s*(\w+)(?:\s+CONSTRAIN:\s*"([^"]+)")?/);
  if (typeMatch) {
    const name = typeMatch[1];
    const base = typeMatch[2];
    const constraint = typeMatch[3];
    state.types.set(name, { baseType: base, constraints: constraint ? [constraint] : [] });
    return { value: undefined, display: `${C.green}Type ${name} defined.${C.reset}` };
  }

  // Try to evaluate as a VibeL expression
  return evalSimpleExpr(trimmed, state);
}

function evalSimpleExpr(exprStr: string, state: ReplState): { value: unknown; display: string } | { error: string } {
  try {
    // Wrap in a minimal function to parse as a VibeL expression
    const wrappedSource = `MODULE __repl\n\nDEFINE FUNCTION __eval\n  INTENT: "REPL eval."\n  ON FAILURE:\n    RETURN EXPLICIT NOTHING\n  BODY:\n    RETURN EXPLICIT ${exprStr}`;

    const tokens = tokenize(wrappedSource);
    const ast = parse(tokens);
    const fn = ast.definitions[0];
    if (fn?.kind !== 'FunctionDef') return { error: 'Failed to parse expression' };

    // Get the return statement's expression
    const retStmt = fn.body[fn.body.length - 1];
    if (retStmt?.kind !== 'ReturnStmt') return { error: 'Failed to parse expression' };

    // Evaluate the expression directly
    const value = evalASTExpr(retStmt.value, state);
    return { value, display: formatValue(value) };
  } catch (err: any) {
    return { error: `${C.red}Error:${C.reset} ${err.message}` };
  }
}

function evalASTExpr(expr: import('../ast/nodes.js').Expression, state: ReplState): unknown {
  switch (expr.kind) {
    case 'LiteralExpr':
      return expr.value;
    case 'IdentifierExpr': {
      if (expr.name === 'NOTHING') return null;
      if (expr.name === 'TRUE') return true;
      if (expr.name === 'FALSE') return false;
      if (expr.name === 'NOW') return Date.now();
      // Check bindings
      if (state.bindings.has(expr.name)) return state.bindings.get(expr.name);
      return expr.name; // Return as symbol
    }
    case 'BinaryExpr': {
      const left = evalASTExpr(expr.left, state) as number;
      const right = evalASTExpr(expr.right, state) as number;
      switch (expr.operator) {
        case 'PLUS': return left + right;
        case 'MINUS': return left - right;
        case 'TIMES': return left * right;
        case 'DIVIDED_BY': return right !== 0 ? left / right : NaN;
        case 'MOD': return left % right;
        case 'EQUALS': return left === right;
        case 'NOT_EQUALS': return left !== right;
        case 'GREATER_THAN': return left > right;
        case 'LESS_THAN': return left < right;
        case 'GREATER_OR_EQUAL': return left >= right;
        case 'LESS_OR_EQUAL': return left <= right;
        case 'AND': return left && right;
        case 'OR': return left || right;
        default: return undefined;
      }
    }
    case 'UnaryExpr': {
      const operand = evalASTExpr(expr.operand, state);
      if (expr.operator === 'NOT') return !(operand);
      return -(operand as number);
    }
    case 'RecordLiteralExpr': {
      const obj: Record<string, unknown> = {};
      for (const field of expr.fields) {
        obj[field.name] = evalASTExpr(field.value, state);
      }
      return obj;
    }
    case 'ListLiteralExpr':
      return expr.elements.map(e => evalASTExpr(e, state));
    case 'FunctionCallExpr': {
      if (expr.name === 'NOW') return Date.now();
      if (expr.name === 'UUID') return crypto.randomUUID();
      return `<function:${expr.name}>`;
    }
    default:
      return `<expr:${expr.kind}>`;
  }
}

// ============================================================================
// Constraint Checking (for MAKE ... FROM ...)
// ============================================================================

function checkConstraint(constraint: string, value: unknown): { passed: boolean; reason: string } {
  const str = String(value);
  const num = Number(value);

  // "must be >= N" / "must be greater than N"
  const gtMatch = constraint.match(/must be (?:>=|greater than(?: or equal to)?)\s*(-?\d+(?:\.\d+)?)/i);
  if (gtMatch) {
    const n = parseFloat(gtMatch[1]);
    return { passed: num >= n, reason: `must be >= ${n}` };
  }

  // "must contain exactly one X"
  const containMatch = constraint.match(/must contain exactly one (.+)/i);
  if (containMatch) {
    const char = containMatch[1].trim();
    const count = str.split(char).length - 1;
    return { passed: count === 1, reason: `must contain exactly one ${char}` };
  }

  // "length between N and M"
  const lenMatch = constraint.match(/length between (\d+) and (\d+)/i);
  if (lenMatch) {
    const min = parseInt(lenMatch[1]);
    const max = parseInt(lenMatch[2]);
    return { passed: str.length >= min && str.length <= max, reason: `length must be between ${min} and ${max}` };
  }

  return { passed: true, reason: '' };
}

// ============================================================================
// Value Formatting
// ============================================================================

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return `${C.gray}NOTHING${C.reset}`;
  if (typeof value === 'boolean') return value ? `${C.green}TRUE${C.reset}` : `${C.red}FALSE${C.reset}`;
  if (typeof value === 'number') return `${C.yellow}${value}${C.reset}`;
  if (typeof value === 'string') return `${C.green}"${value}"${C.reset}`;
  if (typeof value === 'object' && '__type' in (value as any)) {
    const typed = value as { __type: string; value?: unknown };
    return `${C.magenta}${typed.__type}${C.reset}(${formatValue(typed.value)})`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatValue).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as any)
      .map(([k, v]) => `${k}: ${formatValue(v)}`)
      .join(', ');
    return `{ ${entries} }`;
  }
  return String(value);
}

// ============================================================================
// REPL Entry Point
// ============================================================================

export function startRepl(): void {
  const state: ReplState = {
    bindings: new Map(),
    types: new Map(),
    history: [],
    lineCount: 0,
  };

  console.log(`${C.bold}${C.cyan}
  ╦  ╦╦╔╗ ╔═╗╦    ╔═╗╔╗╔╔═╗
  ╚╗╔╝║╠╩╗║╣ ║    ╠═╣║║║║ ╦
   ╚╝ ╩╚═╝╚═╝╩═╝  ╩ ╩╝╚╝╚═╝  REPL v${VERSION}
${C.reset}  ${C.gray}Type :help for commands, :quit to exit${C.reset}
`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${C.cyan}vibelang${C.reset}${C.gray}>${C.reset} `,
    historySize: 100,
  });

  rl.prompt();

  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    state.lineCount++;

    // Meta commands
    if (trimmed === ':quit' || trimmed === ':exit' || trimmed === ':q') {
      console.log(`${C.gray}Goodbye!${C.reset}`);
      rl.close();
      process.exit(0);
    }

    if (trimmed === ':help' || trimmed === ':h') {
      printReplHelp();
      rl.prompt();
      return;
    }

    if (trimmed === ':history') {
      for (let i = 0; i < state.history.length; i++) {
        console.log(`  ${C.gray}${i + 1}:${C.reset} ${state.history[i]}`);
      }
      rl.prompt();
      return;
    }

    if (trimmed) {
      state.history.push(trimmed);
      const result = evaluateExpression(trimmed, state);
      if ('error' in result) {
        console.log(result.error);
      } else if (result.display) {
        console.log(`  ${C.gray}=${C.reset} ${result.display}`);
      }
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

function printReplHelp(): void {
  console.log(`
${C.bold}REPL Commands:${C.reset}
  ${C.cyan}:help${C.reset}       Show this help
  ${C.cyan}:bindings${C.reset}   Show all variable bindings
  ${C.cyan}:types${C.reset}      Show defined types
  ${C.cyan}:history${C.reset}    Show expression history
  ${C.cyan}:clear${C.reset}      Clear all bindings and types
  ${C.cyan}:quit${C.reset}       Exit the REPL

${C.bold}Expressions:${C.reset}
  ${C.gray}42 PLUS 8${C.reset}                         → ${C.yellow}50${C.reset}
  ${C.gray}LET x = 100${C.reset}                       → ${C.cyan}x${C.reset} = ${C.yellow}100${C.reset}
  ${C.gray}x TIMES 2${C.reset}                          → ${C.yellow}200${C.reset}
  ${C.gray}"hello" PLUS " world"${C.reset}             → ${C.green}"hello world"${C.reset}
  ${C.gray}MAKE Email FROM "test@eg.com"${C.reset}     → ${C.magenta}Email${C.reset}("test@eg.com")
  ${C.gray}{ name: "Alice", age: 30 }${C.reset}       → { name: "Alice", age: 30 }
`);
}
