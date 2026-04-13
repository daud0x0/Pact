// ============================================================================
// VibeL Spec Compiler — Phase 2
// Spec Reference: §21.5, §22.1
//
// Translates ENSURE BEFORE/AFTER, INVARIANT, and CONSTRAIN expressions
// into executable JavaScript predicates that can be evaluated at runtime.
// ============================================================================

import {
  SpecExpression, SpecComparison, SpecBinary, SpecNot, SpecIsNothing,
  SpecIn, SpecContains, SpecLength, SpecPrior, SpecConditional,
  SpecQuantifier, SpecFieldRef, SpecReturnValue, SpecArithmetic,
  LabeledSpecExpr, FunctionDef, Expression,
} from '../ast/nodes.js';

// ============================================================================
// Compiled Predicate Types
// ============================================================================

/** Classification of how a predicate was compiled */
export type PredicateKind = 'formal' | 'ai_evaluated';

/** A compiled predicate — executable at runtime */
export interface CompiledPredicate {
  /** Unique identifier for diagnostic traces */
  id: string;
  /** The human-readable label (from [label] syntax, or auto-generated) */
  label: string;
  /** The original source expression as a string for error messages */
  source: string;
  /** Whether this was formally compiled or needs AI evaluation */
  kind: PredicateKind;
  /** Executable JavaScript function body (when kind === 'formal') */
  predicateFn: PredicateFn;
  /** For AI-evaluated constraints, the natural language string */
  naturalLanguage?: string;
}

/**
 * A predicate function takes a context (runtime state) and returns
 * a PredicateResult with pass/fail and diagnostic info.
 */
export type PredicateFn = (ctx: RuntimeContext) => PredicateResult;

/** Runtime context passed to predicates during evaluation */
export interface RuntimeContext {
  /** Current values of all fields (reads + writes) */
  fields: Record<string, unknown>;
  /** PRIOR() values — pre-execution snapshots */
  prior: Record<string, unknown>;
  /** Function parameters */
  params: Record<string, unknown>;
  /** The return value of the function (only available in ENSURE AFTER) */
  returnValue?: unknown;
  /** Write journal for rollback */
  journal: JournalEntry[];
}

/** A single write operation in the journal */
export interface JournalEntry {
  field: string;
  priorValue: unknown;
  newValue: unknown;
  timestamp: number;
}

/** Result of evaluating a predicate */
export interface PredicateResult {
  passed: boolean;
  /** The source label for error reporting */
  label: string;
  /** Human-readable explanation on failure */
  message?: string;
  /** Actual value found */
  actual?: unknown;
  /** Expected value */
  expected?: unknown;
}

// ============================================================================
// Compiled Function Spec — everything needed for runtime verification
// ============================================================================

export interface CompiledFunctionSpec {
  /** Function name */
  functionName: string;
  /** Compiled ENSURE BEFORE predicates (evaluated before BODY) */
  preconditions: CompiledPredicate[];
  /** Compiled ENSURE AFTER predicates (evaluated after BODY) */
  postconditions: CompiledPredicate[];
  /** Compiled INVARIANT predicates (evaluated before, after, and at writes) */
  invariants: CompiledPredicate[];
  /** Compiled parameter CONSTRAIN predicates */
  paramConstraints: CompiledPredicate[];
  /** Fields that need PRIOR() capture */
  priorFields: string[];
  /** Declared WRITES fields (for rollback journal) */
  writeFields: string[];
  /** Declared READS fields (for PRIOR capture) */
  readFields: string[];
}

// ============================================================================
// Spec Compile — Main Entry Point
// ============================================================================

/**
 * Compile all spec expressions from a FunctionDef into executable predicates.
 */
export function compileSpec(fn: FunctionDef): CompiledFunctionSpec {
  const compiler = new SpecCompiler(fn.name);

  // ENSURE BEFORE
  const preconditions = fn.ensureBefore.map((labeled, i) =>
    compiler.compileLabeledSpec(labeled, `pre_${i}`, 'ENSURE BEFORE')
  );

  // ENSURE AFTER
  const postconditions = fn.ensureAfter.map((expr, i) =>
    compiler.compileSpec(expr, `post_${i}`, `postcondition_${i}`, 'ENSURE AFTER')
  );

  // INVARIANT
  const invariants = fn.invariants.map((expr, i) =>
    compiler.compileSpec(expr, `inv_${i}`, `invariant_${i}`, 'INVARIANT')
  );

  // Parameter CONSTRAINts
  const paramConstraints: CompiledPredicate[] = [];
  for (const param of fn.parameters) {
    for (let ci = 0; ci < param.constraints.length; ci++) {
      paramConstraints.push(
        compiler.compileNaturalLanguageConstraint(
          param.constraints[ci],
          param.name,
          `param_${param.name}_${ci}`,
        )
      );
    }
  }

  // Collect all fields referenced by PRIOR()
  const priorFields = new Set<string>();
  for (const expr of fn.ensureAfter) {
    collectPriorFields(expr, priorFields);
  }
  for (const expr of fn.invariants) {
    collectPriorFields(expr, priorFields);
  }

  return {
    functionName: fn.name,
    preconditions,
    postconditions,
    invariants,
    paramConstraints,
    priorFields: [...priorFields],
    writeFields: fn.effects.writes.map(p => p.join('.')),
    readFields: fn.effects.reads.map(p => p.join('.')),
  };
}

// ============================================================================
// Spec Compiler Class
// ============================================================================

class SpecCompiler {
  private functionName: string;

  constructor(functionName: string) {
    this.functionName = functionName;
  }

  compileLabeledSpec(
    labeled: LabeledSpecExpr,
    id: string,
    context: string
  ): CompiledPredicate {
    const label = labeled.label || id;
    return this.compileSpec(labeled.expression, id, label, context);
  }

  compileSpec(
    expr: SpecExpression,
    id: string,
    label: string,
    context: string,
  ): CompiledPredicate {
    const source = specToString(expr);
    const predicateFn = this.compileExpression(expr, label);

    return {
      id: `${this.functionName}.${id}`,
      label,
      source,
      kind: 'formal',
      predicateFn,
    };
  }

  // ==========================================================================
  // Expression Compilation — SpecExpression → PredicateFn
  // ==========================================================================

  compileExpression(expr: SpecExpression, label: string): PredicateFn {
    switch (expr.kind) {
      case 'SpecComparison':
        return this.compileComparison(expr, label);
      case 'SpecBinary':
        return this.compileBinary(expr, label);
      case 'SpecNot':
        return this.compileNot(expr, label);
      case 'SpecIsNothing':
        return this.compileIsNothing(expr, label);
      case 'SpecContains':
        return this.compileContains(expr, label);
      case 'SpecLength':
        return this.compileLength(expr, label);
      case 'SpecIn':
        return this.compileIn(expr, label);
      case 'SpecPrior':
        return this.compilePrior(expr, label);
      case 'SpecFieldRef':
        return this.compileFieldRef(expr, label);
      case 'SpecReturnValue':
        return this.compileReturnValue(label);
      case 'SpecArithmetic':
        return this.compileArithmetic(expr, label);
      case 'SpecConditional':
        return this.compileConditional(expr, label);
      case 'SpecQuantifier':
        return this.compileQuantifier(expr, label);
      default:
        // Fallback — always passes but emits a warning
        return (_ctx) => ({ passed: true, label, message: `Uncompiled spec expression: ${(expr as any).kind}` });
    }
  }

  // ==========================================================================
  // Comparison: field EQUALS value, field GREATER_THAN value, etc.
  // ==========================================================================

  private compileComparison(expr: SpecComparison, label: string): PredicateFn {
    const leftFn = this.compileValue(expr.left);
    const rightFn = this.compileValue(expr.right);

    return (ctx) => {
      const left = leftFn(ctx);
      const right = rightFn(ctx);
      let passed: boolean;

      switch (expr.operator) {
        case 'EQUALS':           passed = deepEquals(left, right); break;
        case 'NOT_EQUALS':       passed = !deepEquals(left, right); break;
        case 'GREATER_THAN':     passed = (left as number) > (right as number); break;
        case 'LESS_THAN':        passed = (left as number) < (right as number); break;
        case 'GREATER_OR_EQUAL': passed = (left as number) >= (right as number); break;
        case 'LESS_OR_EQUAL':    passed = (left as number) <= (right as number); break;
        default:                 passed = false;
      }

      return {
        passed,
        label,
        message: passed ? undefined : `[${label}] Expected ${formatValue(left)} ${expr.operator} ${formatValue(right)}`,
        actual: left,
        expected: right,
      };
    };
  }

  // ==========================================================================
  // Binary: AND / OR
  // ==========================================================================

  private compileBinary(expr: SpecBinary, label: string): PredicateFn {
    const leftFn = this.compileExpression(expr.left, label);
    const rightFn = this.compileExpression(expr.right, label);

    if (expr.operator === 'AND') {
      return (ctx) => {
        const leftResult = leftFn(ctx);
        if (!leftResult.passed) return leftResult; // Short-circuit
        return rightFn(ctx);
      };
    } else {
      // OR
      return (ctx) => {
        const leftResult = leftFn(ctx);
        if (leftResult.passed) return leftResult; // Short-circuit
        return rightFn(ctx);
      };
    }
  }

  // ==========================================================================
  // NOT
  // ==========================================================================

  private compileNot(expr: SpecNot, label: string): PredicateFn {
    const operandFn = this.compileExpression(expr.operand, label);
    return (ctx) => {
      const result = operandFn(ctx);
      return {
        passed: !result.passed,
        label,
        message: result.passed ? `[${label}] Expected NOT to fail but it passed` : undefined,
      };
    };
  }

  // ==========================================================================
  // IS NOTHING / IS NOT NOTHING
  // ==========================================================================

  private compileIsNothing(expr: SpecIsNothing, label: string): PredicateFn {
    const fieldFn = this.compileValue(expr.field);

    return (ctx) => {
      const value = fieldFn(ctx);
      const isNothing = value === null || value === undefined;
      const passed = expr.negated ? !isNothing : isNothing;

      return {
        passed,
        label,
        message: passed ? undefined :
          expr.negated
            ? `[${label}] Expected value to be NOT NOTHING but got ${formatValue(value)}`
            : `[${label}] Expected NOTHING but got ${formatValue(value)}`,
        actual: value,
      };
    };
  }

  // ==========================================================================
  // CONTAINS
  // ==========================================================================

  private compileContains(expr: SpecContains, label: string): PredicateFn {
    const collectionFn = this.compileValue(expr.collection);
    const valueFn = this.compileValue(expr.value);

    return (ctx) => {
      const collection = collectionFn(ctx);
      const value = valueFn(ctx);

      let passed = false;
      if (Array.isArray(collection)) {
        passed = collection.some(item => deepEquals(item, value));
      } else if (typeof collection === 'string') {
        passed = collection.includes(value as string);
      }

      return {
        passed,
        label,
        message: passed ? undefined : `[${label}] Collection does not contain ${formatValue(value)}`,
        actual: collection,
        expected: value,
      };
    };
  }

  // ==========================================================================
  // LENGTH OF
  // ==========================================================================

  private compileLength(expr: SpecLength, label: string): PredicateFn {
    const collectionFn = this.compileValue(expr.collection);

    return (ctx) => {
      const collection = collectionFn(ctx);
      let length: number;

      if (Array.isArray(collection)) {
        length = collection.length;
      } else if (typeof collection === 'string') {
        length = collection.length;
      } else {
        length = 0;
      }

      return { passed: true, label, actual: length };
    };
  }

  // ==========================================================================
  // IN / NOT IN
  // ==========================================================================

  private compileIn(expr: SpecIn, label: string): PredicateFn {
    const fieldFn = this.compileValue(expr.field);

    return (ctx) => {
      const value = fieldFn(ctx);
      // Expression-level values are evaluated at compile time if they're literals
      const values = expr.values.map(v => evalExpressionLiteral(v));
      const found = values.some(v => deepEquals(value, v));
      const passed = expr.negated ? !found : found;

      return {
        passed,
        label,
        message: passed ? undefined :
          `[${label}] Value ${formatValue(value)} ${expr.negated ? 'should not be' : 'is not'} in [${values.map(formatValue).join(', ')}]`,
        actual: value,
      };
    };
  }

  // ==========================================================================
  // PRIOR()
  // ==========================================================================

  private compilePrior(expr: SpecPrior, label: string): PredicateFn {
    const key = expr.field.join('.');

    return (ctx) => {
      const value = ctx.prior[key];
      return { passed: true, label, actual: value };
    };
  }

  // ==========================================================================
  // Field Reference
  // ==========================================================================

  private compileFieldRef(expr: SpecFieldRef, label: string): PredicateFn {
    const key = expr.path.join('.');

    // If this is a literal encoded as a SpecFieldRef, return it directly
    if (expr.path.length === 1) {
      const val = expr.path[0];
      if (/^-?\d+(\.\d+)?$/.test(val)) {
        const num = parseFloat(val);
        return () => ({ passed: true, label, actual: num });
      }
      if (val === 'true' || val === 'TRUE') return () => ({ passed: true, label, actual: true });
      if (val === 'false' || val === 'FALSE') return () => ({ passed: true, label, actual: false });
      if (val === 'null' || val === 'NOTHING') return () => ({ passed: true, label, actual: null });
    }

    return (ctx) => {
      // Try fields first, then params
      const value = key in ctx.fields ? ctx.fields[key]
        : key in ctx.params ? ctx.params[key]
        : resolveNestedField(ctx.fields, expr.path)
          ?? resolveNestedField(ctx.params, expr.path);

      return { passed: true, label, actual: value };
    };
  }

  // ==========================================================================
  // RETURN_VALUE
  // ==========================================================================

  private compileReturnValue(label: string): PredicateFn {
    return (ctx) => {
      return { passed: true, label, actual: ctx.returnValue };
    };
  }

  // ==========================================================================
  // Arithmetic: PLUS, MINUS, TIMES, DIVIDED_BY, MOD
  // ==========================================================================

  private compileArithmetic(expr: SpecArithmetic, label: string): PredicateFn {
    const leftFn = this.compileValue(expr.left);
    const rightFn = this.compileValue(expr.right);

    return (ctx) => {
      const left = leftFn(ctx) as number;
      const right = rightFn(ctx) as number;
      let result: number;

      switch (expr.operator) {
        case 'PLUS':       result = left + right; break;
        case 'MINUS':      result = left - right; break;
        case 'TIMES':      result = left * right; break;
        case 'DIVIDED_BY': result = right !== 0 ? left / right : NaN; break;
        case 'MOD':        result = left % right; break;
        default:           result = NaN;
      }

      return { passed: true, label, actual: result };
    };
  }

  // ==========================================================================
  // Conditional: IF ... THEN
  // ==========================================================================

  private compileConditional(expr: SpecConditional, label: string): PredicateFn {
    const condFn = this.compileExpression(expr.condition, label);
    const bodyFns = expr.body.map((b, i) => this.compileExpression(b, `${label}_${i}`));

    return (ctx) => {
      const condResult = condFn(ctx);
      // If condition doesn't hold, the conditional is vacuously true
      if (!condResult.passed) {
        return { passed: true, label };
      }

      // All body expressions must hold
      for (const fn of bodyFns) {
        const result = fn(ctx);
        if (!result.passed) return result;
      }
      return { passed: true, label };
    };
  }

  // ==========================================================================
  // Quantifier: ALL / ANY
  // ==========================================================================

  private compileQuantifier(expr: SpecQuantifier, label: string): PredicateFn {
    const collectionFn = this.compileValue(expr.collection);

    return (ctx) => {
      const collection = collectionFn(ctx);
      if (!Array.isArray(collection)) {
        return { passed: false, label, message: `[${label}] Expected collection but got ${typeof collection}` };
      }

      for (let i = 0; i < collection.length; i++) {
        // Inject the quantifier variable into params context
        const extendedCtx = {
          ...ctx,
          params: { ...ctx.params, [expr.variable]: collection[i] },
        };
        const condFn = this.compileExpression(expr.condition, `${label}[${i}]`);
        const result = condFn(extendedCtx);

        if (expr.quantifier === 'ALL' && !result.passed) {
          return {
            passed: false,
            label,
            message: `[${label}] ALL check failed at index ${i}: ${result.message}`,
            actual: collection[i],
          };
        }
        if (expr.quantifier === 'ANY' && result.passed) {
          return { passed: true, label };
        }
      }

      // ALL passed, or ANY failed
      if (expr.quantifier === 'ALL') return { passed: true, label };
      return { passed: false, label, message: `[${label}] No items satisfied the ANY condition` };
    };
  }

  // ==========================================================================
  // Value Resolution — SpecExpression → RuntimeContext → value
  // ==========================================================================

  compileValue(expr: SpecExpression): (ctx: RuntimeContext) => unknown {
    switch (expr.kind) {
      case 'SpecFieldRef': {
        const key = expr.path.join('.');
        // Check if this is actually a literal encoded as a SpecFieldRef by the parser
        // (the parser wraps literals, booleans, and NOTHING as SpecFieldRef with path=[value])
        if (expr.path.length === 1) {
          const val = expr.path[0];
          // Numeric literal (including negative)
          if (/^-?\d+(\.\d+)?$/.test(val)) {
            const num = parseFloat(val);
            return () => num;
          }
          // Boolean literal
          if (val === 'true' || val === 'TRUE') return () => true;
          if (val === 'false' || val === 'FALSE') return () => false;
          // NOTHING / null
          if (val === 'null' || val === 'NOTHING') return () => null;
        }
        return (ctx) =>
          key in ctx.fields ? ctx.fields[key]
          : key in ctx.params ? ctx.params[key]
          : resolveNestedField(ctx.fields, expr.path)
            ?? resolveNestedField(ctx.params, expr.path);
      }
      case 'SpecReturnValue':
        return (ctx) => ctx.returnValue;
      case 'SpecPrior': {
        const key = expr.field.join('.');
        return (ctx) => ctx.prior[key];
      }
      case 'SpecArithmetic': {
        const leftFn = this.compileValue(expr.left);
        const rightFn = this.compileValue(expr.right);
        return (ctx) => {
          const l = leftFn(ctx) as number;
          const r = rightFn(ctx) as number;
          switch (expr.operator) {
            case 'PLUS': return l + r;
            case 'MINUS': return l - r;
            case 'TIMES': return l * r;
            case 'DIVIDED_BY': return r !== 0 ? l / r : NaN;
            case 'MOD': return l % r;
            default: return NaN;
          }
        };
      }
      case 'SpecLength': {
        const collFn = this.compileValue(expr.collection);
        return (ctx) => {
          const coll = collFn(ctx);
          if (Array.isArray(coll)) return coll.length;
          if (typeof coll === 'string') return coll.length;
          return 0;
        };
      }
      case 'SpecComparison':
      case 'SpecBinary':
      case 'SpecNot':
      case 'SpecIsNothing':
      case 'SpecContains':
      case 'SpecIn':
      case 'SpecConditional':
      case 'SpecQuantifier': {
        // These return boolean values from predicate evaluation
        const fn = this.compileExpression(expr, '__value');
        return (ctx) => fn(ctx).passed;
      }
      default:
        return () => undefined;
    }
  }

  // ==========================================================================
  // Natural Language Constraint Compilation (§12.2)
  // ==========================================================================

  compileNaturalLanguageConstraint(
    constraint: string,
    paramName: string,
    id: string,
  ): CompiledPredicate {
    const compiledFn = compileConstraintString(constraint, paramName);

    if (compiledFn) {
      return {
        id: `${this.functionName}.${id}`,
        label: `${paramName}: ${constraint}`,
        source: constraint,
        kind: 'formal',
        predicateFn: compiledFn,
      };
    }

    // Falls through to AI evaluation
    return {
      id: `${this.functionName}.${id}`,
      label: `${paramName}: ${constraint}`,
      source: constraint,
      kind: 'ai_evaluated',
      naturalLanguage: constraint,
      predicateFn: (_ctx) => ({
        passed: true, // AI evaluation deferred
        label: `${paramName}: ${constraint}`,
        message: `AI-evaluated constraint (not formally compiled): "${constraint}"`,
      }),
    };
  }
}

// ============================================================================
// Natural Language Constraint Compiler (§12.2)
// Recognizes common patterns and compiles to predicates
// ============================================================================

const CONSTRAINT_PATTERNS: Array<{
  pattern: RegExp;
  compile: (match: RegExpMatchArray, paramName: string) => PredicateFn;
}> = [
  // "must be greater than N"
  {
    pattern: /must be greater than (\d+(?:\.\d+)?)/i,
    compile: (m, paramName) => {
      const n = parseFloat(m[1]);
      return (ctx) => {
        const val = ctx.params[paramName] as number;
        return {
          passed: val > n,
          label: `${paramName} > ${n}`,
          message: val > n ? undefined : `Expected ${paramName} to be greater than ${n}, got ${val}`,
          actual: val,
          expected: n,
        };
      };
    },
  },
  // "must be at least N"
  {
    pattern: /must be at least (\d+(?:\.\d+)?)/i,
    compile: (m, paramName) => {
      const n = parseFloat(m[1]);
      return (ctx) => {
        const val = ctx.params[paramName] as number;
        return {
          passed: val >= n,
          label: `${paramName} >= ${n}`,
          actual: val,
          expected: n,
        };
      };
    },
  },
  // "must not exceed N"
  {
    pattern: /must not exceed (\d+(?:\.\d+)?)/i,
    compile: (m, paramName) => {
      const n = parseFloat(m[1]);
      return (ctx) => {
        const val = ctx.params[paramName] as number;
        return {
          passed: val <= n,
          label: `${paramName} <= ${n}`,
          actual: val,
          expected: n,
        };
      };
    },
  },
  // "length between N and M"
  {
    pattern: /length between (\d+) and (\d+)/i,
    compile: (m, paramName) => {
      const min = parseInt(m[1], 10);
      const max = parseInt(m[2], 10);
      return (ctx) => {
        const val = ctx.params[paramName] as string;
        const len = val?.length ?? 0;
        return {
          passed: len >= min && len <= max,
          label: `${min} <= len(${paramName}) <= ${max}`,
          message: (len >= min && len <= max) ? undefined :
            `Expected ${paramName} length between ${min} and ${max}, got ${len}`,
          actual: len,
        };
      };
    },
  },
  // "length under N" / "length less than N"
  {
    pattern: /length (?:under|less than) (\d+)/i,
    compile: (m, paramName) => {
      const max = parseInt(m[1], 10);
      return (ctx) => {
        const val = ctx.params[paramName] as string;
        const len = val?.length ?? 0;
        return {
          passed: len < max,
          label: `len(${paramName}) < ${max}`,
          actual: len,
        };
      };
    },
  },
  // "must not be empty"
  {
    pattern: /must not be empty/i,
    compile: (_m, paramName) => {
      return (ctx) => {
        const val = ctx.params[paramName];
        const empty = val === null || val === undefined || val === '' ||
          (Array.isArray(val) && val.length === 0);
        return {
          passed: !empty,
          label: `${paramName} is not empty`,
          actual: val,
        };
      };
    },
  },
  // "must be one of [A, B, C]"
  {
    pattern: /must be one of \[([^\]]+)\]/i,
    compile: (m, paramName) => {
      const values = m[1].split(',').map(s => s.trim());
      return (ctx) => {
        const val = ctx.params[paramName] as string;
        const found = values.includes(val);
        return {
          passed: found,
          label: `${paramName} in [${values.join(', ')}]`,
          actual: val,
        };
      };
    },
  },
  // "must contain at least one ..."
  {
    pattern: /must contain at least one (uppercase letter|lowercase letter|digit|special character)/i,
    compile: (m, paramName) => {
      const what = m[1].toLowerCase();
      let regex: RegExp;
      switch (what) {
        case 'uppercase letter': regex = /[A-Z]/; break;
        case 'lowercase letter': regex = /[a-z]/; break;
        case 'digit':            regex = /\d/; break;
        case 'special character': regex = /[^a-zA-Z0-9]/; break;
        default:                 regex = /./;
      }
      return (ctx) => {
        const val = ctx.params[paramName] as string;
        const passed = regex.test(val ?? '');
        return {
          passed,
          label: `${paramName} contains ${what}`,
          message: passed ? undefined : `${paramName} must contain at least one ${what}`,
          actual: val,
        };
      };
    },
  },
  // "must contain exactly one X"
  {
    pattern: /must contain exactly one (.+)/i,
    compile: (m, paramName) => {
      const char = m[1].trim();
      return (ctx) => {
        const val = ctx.params[paramName] as string;
        const count = (val ?? '').split(char).length - 1;
        return {
          passed: count === 1,
          label: `count(${paramName}, "${char}") == 1`,
          actual: count,
        };
      };
    },
  },
  // "must not contain ..."
  {
    pattern: /must not contain (.+)/i,
    compile: (m, paramName) => {
      const forbidden = m[1].trim();
      return (ctx) => {
        const val = ctx.params[paramName] as string;
        const contains = (val ?? '').toLowerCase().includes(forbidden.toLowerCase());
        return {
          passed: !contains,
          label: `${paramName} does not contain "${forbidden}"`,
          actual: val,
        };
      };
    },
  },
  // "must refer to an existing..." / "must not equal ..."
  {
    pattern: /must not equal (\w+)/i,
    compile: (m, paramName) => {
      const otherParam = m[1];
      return (ctx) => {
        const val = ctx.params[paramName];
        const other = ctx.params[otherParam];
        return {
          passed: !deepEquals(val, other),
          label: `${paramName} != ${otherParam}`,
          actual: val,
          expected: other,
        };
      };
    },
  },
];

function compileConstraintString(constraint: string, paramName: string): PredicateFn | null {
  for (const { pattern, compile } of CONSTRAINT_PATTERNS) {
    const match = constraint.match(pattern);
    if (match) {
      return compile(match, paramName);
    }
  }
  return null;
}

// ============================================================================
// Spec Expression → Human Readable String
// ============================================================================

export function specToString(expr: SpecExpression): string {
  switch (expr.kind) {
    case 'SpecFieldRef':
      return expr.path.join('.');
    case 'SpecReturnValue':
      return 'RETURN_VALUE';
    case 'SpecPrior':
      return `PRIOR(${expr.field.join('.')})`;
    case 'SpecComparison':
      return `${specToString(expr.left)} ${expr.operator} ${specToString(expr.right)}`;
    case 'SpecBinary':
      return `${specToString(expr.left)} ${expr.operator} ${specToString(expr.right)}`;
    case 'SpecArithmetic':
      return `${specToString(expr.left)} ${expr.operator} ${specToString(expr.right)}`;
    case 'SpecNot':
      return `NOT ${specToString(expr.operand)}`;
    case 'SpecIsNothing':
      return expr.negated
        ? `${specToString(expr.field)} IS NOT NOTHING`
        : `${specToString(expr.field)} IS NOTHING`;
    case 'SpecContains':
      return `CONTAINS ${specToString(expr.collection)} ${specToString(expr.value)}`;
    case 'SpecLength':
      return `LENGTH OF ${specToString(expr.collection)}`;
    case 'SpecIn':
      return `${specToString(expr.field)} ${expr.negated ? 'NOT IN' : 'IN'} [...]`;
    case 'SpecConditional':
      return `IF ${specToString(expr.condition)} THEN ...`;
    case 'SpecQuantifier':
      return `${expr.quantifier} ${expr.variable} IN ${specToString(expr.collection)} SATISFY ${specToString(expr.condition)}`;
    default:
      return '<?>';
  }
}

// ============================================================================
// Helpers
// ============================================================================

function collectPriorFields(expr: SpecExpression, fields: Set<string>): void {
  switch (expr.kind) {
    case 'SpecPrior':
      fields.add(expr.field.join('.'));
      break;
    case 'SpecComparison':
      collectPriorFields(expr.left, fields);
      collectPriorFields(expr.right, fields);
      break;
    case 'SpecBinary':
      collectPriorFields(expr.left, fields);
      collectPriorFields(expr.right, fields);
      break;
    case 'SpecArithmetic':
      collectPriorFields(expr.left, fields);
      collectPriorFields(expr.right, fields);
      break;
    case 'SpecNot':
      collectPriorFields(expr.operand, fields);
      break;
    case 'SpecIsNothing':
      collectPriorFields(expr.field, fields);
      break;
    case 'SpecContains':
      collectPriorFields(expr.collection, fields);
      collectPriorFields(expr.value, fields);
      break;
    case 'SpecLength':
      collectPriorFields(expr.collection, fields);
      break;
    case 'SpecConditional':
      collectPriorFields(expr.condition, fields);
      for (const b of expr.body) collectPriorFields(b, fields);
      break;
    case 'SpecQuantifier':
      collectPriorFields(expr.collection, fields);
      collectPriorFields(expr.condition, fields);
      break;
  }
}

function resolveNestedField(obj: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'number' && typeof b === 'number') {
    // Handle floating point comparison with epsilon
    return Math.abs(a - b) < Number.EPSILON * 100;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEquals(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => deepEquals((a as any)[k], (b as any)[k]));
  }
  return false;
}

function formatValue(v: unknown): string {
  if (v === null) return 'NOTHING';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return `"${v}"`;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`;
  return JSON.stringify(v);
}

function evalExpressionLiteral(expr: Expression): unknown {
  switch (expr.kind) {
    case 'LiteralExpr': return expr.value;
    case 'IdentifierExpr': return expr.name;
    default: return undefined;
  }
}
