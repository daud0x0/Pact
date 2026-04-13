// ============================================================================
// VibeL Runtime Verification Engine
// Spec Reference: §22.1 — The Verification Loop
//
// Wraps compiled functions with:
// 1. Parameter constraint validation
// 2. PRIOR() capture (deep copy of READS/WRITES fields)
// 3. ENSURE BEFORE evaluation
// 4. INVARIANT pre-check
// 5. BODY execution with write journaling
// 6. ENSURE AFTER evaluation
// 7. INVARIANT post-check
// 8. Automatic ROLLBACK on failure
// ============================================================================

import {
  CompiledFunctionSpec, CompiledPredicate,
  RuntimeContext, JournalEntry, PredicateResult,
} from './compiler.js';

// ============================================================================
// Verification Results
// ============================================================================

export type VerificationStage =
  | 'PARAM_VALIDATE'
  | 'PRIOR_CAPTURE'
  | 'ENSURE_BEFORE'
  | 'INVARIANT_PRE'
  | 'BODY'
  | 'ENSURE_AFTER'
  | 'INVARIANT_POST'
  | 'ON_SUCCESS';

export interface VerificationResult {
  /** Whether the function executed successfully */
  success: boolean;
  /** The return value (if success) */
  returnValue?: unknown;
  /** Stage where failure occurred */
  failedAt?: VerificationStage;
  /** Failure details */
  failure?: VerificationFailure;
  /** Full audit trail of all checks */
  audit: AuditEntry[];
  /** Write journal (for debugging) */
  journal: JournalEntry[];
}

export interface VerificationFailure {
  stage: VerificationStage;
  predicate?: CompiledPredicate;
  result?: PredicateResult;
  error?: Error;
  reason: string;
}

export interface AuditEntry {
  stage: VerificationStage;
  timestamp: number;
  predicateId?: string;
  passed: boolean;
  message?: string;
  durationMs: number;
}

// ============================================================================
// Verified Function Wrapper
// ============================================================================

export type BodyFn = (ctx: RuntimeContext) => unknown;
export type FieldReader = (field: string) => unknown;
export type FieldWriter = (field: string, value: unknown) => void;

export interface ExecutionContext {
  /** Function to read a field value at runtime */
  readField: FieldReader;
  /** Function to write a field value at runtime */
  writeField: FieldWriter;
  /** Parameters passed to the function */
  params: Record<string, unknown>;
}

/**
 * Execute a function with full runtime verification.
 * Implements the verification loop from §22.1.
 */
export function executeWithVerification(
  spec: CompiledFunctionSpec,
  body: BodyFn,
  execCtx: ExecutionContext,
): VerificationResult {
  const audit: AuditEntry[] = [];
  const journal: JournalEntry[] = [];
  const startTime = Date.now();

  // Build runtime context
  const fields: Record<string, unknown> = {};
  const prior: Record<string, unknown> = {};

  // ================================================================
  // Step 1: PARAM_VALIDATE — check parameter constraints
  // ================================================================
  for (const predicate of spec.paramConstraints) {
    const ctx: RuntimeContext = { fields, prior, params: execCtx.params, journal };
    const result = runPredicate(predicate, ctx, 'PARAM_VALIDATE', audit);
    if (!result.passed) {
      return fail('PARAM_VALIDATE', predicate, result, audit, journal);
    }
  }

  // ================================================================
  // Step 2: PRIOR_CAPTURE — snapshot READS and WRITES fields
  // ================================================================
  const allFields = [...spec.readFields, ...spec.writeFields];
  for (const field of allFields) {
    const value = execCtx.readField(field);
    fields[field] = value;
  }

  // Deep copy for PRIOR()
  for (const field of spec.priorFields) {
    prior[field] = deepCopy(fields[field]);
  }
  // Also capture all reads/writes for general PRIOR access
  for (const field of allFields) {
    if (!(field in prior)) {
      prior[field] = deepCopy(fields[field]);
    }
  }

  audit.push({
    stage: 'PRIOR_CAPTURE',
    timestamp: Date.now(),
    passed: true,
    message: `Captured PRIOR() for ${spec.priorFields.length} fields`,
    durationMs: Date.now() - startTime,
  });

  // ================================================================
  // Step 3: ENSURE BEFORE — evaluate preconditions
  // ================================================================
  const preCtx: RuntimeContext = { fields, prior, params: execCtx.params, journal };

  for (const predicate of spec.preconditions) {
    const result = runPredicate(predicate, preCtx, 'ENSURE_BEFORE', audit);
    if (!result.passed) {
      return fail('ENSURE_BEFORE', predicate, result, audit, journal);
    }
  }

  // ================================================================
  // Step 4: INVARIANT PRE — check invariants before execution
  // ================================================================
  for (const predicate of spec.invariants) {
    const result = runPredicate(predicate, preCtx, 'INVARIANT_PRE', audit);
    if (!result.passed) {
      return fail('INVARIANT_PRE', predicate, result, audit, journal);
    }
  }

  // ================================================================
  // Step 5: BODY — execute with write journaling
  // ================================================================
  const journaledCtx = createJournaledContext(
    fields, prior, execCtx.params, journal, execCtx.writeField, spec.invariants, audit
  );

  let returnValue: unknown;
  try {
    returnValue = body(journaledCtx);
  } catch (err) {
    // Rollback on body failure
    rollbackWrites(journal, execCtx.writeField);
    return {
      success: false,
      failedAt: 'BODY',
      failure: {
        stage: 'BODY',
        error: err instanceof Error ? err : new Error(String(err)),
        reason: `Body execution failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      audit,
      journal,
    };
  }

  // ================================================================
  // Step 6: ENSURE AFTER — evaluate postconditions
  // ================================================================
  // Re-read all fields to get post-execution values
  for (const field of allFields) {
    fields[field] = execCtx.readField(field);
  }

  const postCtx: RuntimeContext = { fields, prior, params: execCtx.params, returnValue, journal };

  for (const predicate of spec.postconditions) {
    const result = runPredicate(predicate, postCtx, 'ENSURE_AFTER', audit);
    if (!result.passed) {
      rollbackWrites(journal, execCtx.writeField);
      return fail('ENSURE_AFTER', predicate, result, audit, journal);
    }
  }

  // ================================================================
  // Step 7: INVARIANT POST — final invariant check
  // ================================================================
  for (const predicate of spec.invariants) {
    const result = runPredicate(predicate, postCtx, 'INVARIANT_POST', audit);
    if (!result.passed) {
      rollbackWrites(journal, execCtx.writeField);
      return fail('INVARIANT_POST', predicate, result, audit, journal);
    }
  }

  // ================================================================
  // Step 8: ON_SUCCESS
  // ================================================================
  audit.push({
    stage: 'ON_SUCCESS',
    timestamp: Date.now(),
    passed: true,
    message: 'All verification checks passed',
    durationMs: Date.now() - startTime,
  });

  return {
    success: true,
    returnValue,
    audit,
    journal,
  };
}

// ============================================================================
// Write Journaling — intercepts WRITE operations
// ============================================================================

function createJournaledContext(
  fields: Record<string, unknown>,
  prior: Record<string, unknown>,
  params: Record<string, unknown>,
  journal: JournalEntry[],
  writeField: FieldWriter,
  invariants: CompiledPredicate[],
  audit: AuditEntry[],
): RuntimeContext {
  // Create a proxy that journals writes
  const journaledFields = new Proxy(fields, {
    set(target, prop, value) {
      const key = String(prop);
      const priorValue = deepCopy(target[key]);

      // Journal the write
      journal.push({
        field: key,
        priorValue,
        newValue: deepCopy(value),
        timestamp: Date.now(),
      });

      // Perform the actual write
      target[key] = value;
      writeField(key, value);

      // Check invariants at every write (§11.3 point 3)
      const ctx: RuntimeContext = { fields: target, prior, params, journal };
      for (const inv of invariants) {
        const result = inv.predicateFn(ctx);
        audit.push({
          stage: 'BODY',
          timestamp: Date.now(),
          predicateId: inv.id,
          passed: result.passed,
          message: result.message,
          durationMs: 0,
        });
        if (!result.passed) {
          // Rollback this write immediately
          target[key] = priorValue;
          writeField(key, priorValue);
          throw new InvariantViolationError(inv, result);
        }
      }

      return true;
    },
  });

  return {
    fields: journaledFields,
    prior,
    params,
    journal,
  };
}

// ============================================================================
// Rollback Engine (§22.3)
// ============================================================================

function rollbackWrites(journal: JournalEntry[], writeField: FieldWriter): void {
  // Process in reverse order
  for (let i = journal.length - 1; i >= 0; i--) {
    const entry = journal[i];
    writeField(entry.field, entry.priorValue);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function runPredicate(
  predicate: CompiledPredicate,
  ctx: RuntimeContext,
  stage: VerificationStage,
  audit: AuditEntry[],
): PredicateResult {
  const start = Date.now();
  const result = predicate.predicateFn(ctx);
  const duration = Date.now() - start;

  audit.push({
    stage,
    timestamp: start,
    predicateId: predicate.id,
    passed: result.passed,
    message: result.message,
    durationMs: duration,
  });

  return result;
}

function fail(
  stage: VerificationStage,
  predicate: CompiledPredicate,
  result: PredicateResult,
  audit: AuditEntry[],
  journal: JournalEntry[],
): VerificationResult {
  return {
    success: false,
    failedAt: stage,
    failure: {
      stage,
      predicate,
      result,
      reason: result.message || `${stage} check failed: ${predicate.label}`,
    },
    audit,
    journal,
  };
}

function deepCopy<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object') {
    return JSON.parse(JSON.stringify(value));
  }
  return value;
}

// ============================================================================
// Errors
// ============================================================================

export class InvariantViolationError extends Error {
  constructor(
    public readonly invariant: CompiledPredicate,
    public readonly result: PredicateResult,
  ) {
    super(`Invariant violated: ${invariant.label} — ${result.message}`);
    this.name = 'InvariantViolationError';
  }
}

// ============================================================================
// Formatting — human-readable verification reports
// ============================================================================

const C = {
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
};

export function formatVerificationResult(result: VerificationResult): string {
  const lines: string[] = [];

  lines.push(`${C.bold}Verification Report${C.reset}`);
  lines.push(`${C.gray}${'─'.repeat(50)}${C.reset}`);

  for (const entry of result.audit) {
    const icon = entry.passed ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
    const stage = entry.stage.padEnd(16);
    const id = entry.predicateId ?? '';
    lines.push(`  ${icon} ${C.cyan}${stage}${C.reset} ${id}${entry.message ? ` — ${entry.message}` : ''}`);
  }

  lines.push(`${C.gray}${'─'.repeat(50)}${C.reset}`);

  if (result.success) {
    lines.push(`  ${C.green}${C.bold}✓ ALL CHECKS PASSED${C.reset}`);
  } else {
    lines.push(`  ${C.red}${C.bold}✗ FAILED at ${result.failedAt}${C.reset}`);
    if (result.failure) {
      lines.push(`    ${C.red}Reason:${C.reset} ${result.failure.reason}`);
    }
  }

  if (result.journal.length > 0) {
    lines.push('');
    lines.push(`  ${C.bold}Write Journal (${result.journal.length} entries):${C.reset}`);
    for (const entry of result.journal) {
      lines.push(`    ${C.gray}→${C.reset} ${entry.field}: ${JSON.stringify(entry.priorValue)} → ${JSON.stringify(entry.newValue)}`);
    }
  }

  return lines.join('\n');
}
