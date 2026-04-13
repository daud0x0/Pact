// ============================================================================
// Runtime Verification Engine Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  compileSpec, CompiledFunctionSpec, RuntimeContext,
} from '../compiler.js';
import {
  executeWithVerification, formatVerificationResult,
  ExecutionContext,
} from '../runtime.js';
import { tokenize } from '../../lexer/lexer.js';
import { parse } from '../../parser/parser.js';
import { FunctionDef } from '../../ast/nodes.js';

function parseFn(source: string): FunctionDef {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const fn = ast.definitions.find(d => d.kind === 'FunctionDef');
  if (!fn || fn.kind !== 'FunctionDef') throw new Error('No function found');
  return fn;
}

// A simple in-memory store for testing
function createStore(initial: Record<string, unknown>) {
  const store = { ...initial };
  return {
    store,
    readField: (field: string) => store[field],
    writeField: (field: string, value: unknown) => { store[field] = value; },
  };
}

describe('Runtime Verification Engine', () => {
  describe('Full Verification Loop', () => {
    it('should pass when all checks pass', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION withdraw
  INTENT: "Withdraw from account."
  READS:
    account.balance
  WRITES:
    account.balance
  RECEIVE:
    amount AS Integer CONSTRAIN: "must be greater than 0"
  ENSURE BEFORE:
    [sufficient] account.balance GREATER_OR_EQUAL amount
  ENSURE AFTER:
    account.balance EQUALS PRIOR(account.balance) MINUS amount
  INVARIANT:
    account.balance GREATER_OR_EQUAL 0
  ON FAILURE:
    ROLLBACK ALL WRITES
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      const { store, readField, writeField } = createStore({
        'account.balance': 500,
      });

      const result = executeWithVerification(
        spec,
        (ctx) => {
          // Simulate the body: deduct amount from balance
          const balance = ctx.fields['account.balance'] as number;
          const amount = ctx.params.amount as number;
          const newBalance = balance - amount;
          ctx.fields['account.balance'] = newBalance;
          return { success: true };
        },
        { readField, writeField, params: { amount: 200 } },
      );

      expect(result.success).toBe(true);
      expect(result.audit.length).toBeGreaterThan(0);
    });

    it('should fail when precondition fails', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION withdraw
  INTENT: "Withdraw."
  READS:
    account.balance
  ENSURE BEFORE:
    [sufficient] account.balance GREATER_OR_EQUAL amount
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      const { readField, writeField } = createStore({
        'account.balance': 50,
      });

      const result = executeWithVerification(
        spec,
        () => null,
        { readField, writeField, params: { amount: 200 } },
      );

      expect(result.success).toBe(false);
      expect(result.failedAt).toBe('ENSURE_BEFORE');
      expect(result.failure?.predicate?.label).toBe('sufficient');
    });

    it('should fail when parameter constraint fails', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  RECEIVE:
    amount AS Integer CONSTRAIN: "must be greater than 0"
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      const { readField, writeField } = createStore({});

      const result = executeWithVerification(
        spec,
        () => null,
        { readField, writeField, params: { amount: -5 } },
      );

      expect(result.success).toBe(false);
      expect(result.failedAt).toBe('PARAM_VALIDATE');
    });

    it('should fail when postcondition fails', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  WRITES:
    counter
  ENSURE AFTER:
    RETURN_VALUE IS NOT NOTHING
  ON FAILURE:
    ROLLBACK ALL WRITES
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      const { readField, writeField } = createStore({ counter: 0 });

      const result = executeWithVerification(
        spec,
        () => null, // returns null → NOTHING
        { readField, writeField, params: {} },
      );

      expect(result.success).toBe(false);
      expect(result.failedAt).toBe('ENSURE_AFTER');
    });
  });

  describe('Write Journaling \u0026 Rollback', () => {
    it('should journal write operations', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  WRITES:
    counter
  ENSURE AFTER:
    RETURN_VALUE IS NOT NOTHING
  ON FAILURE:
    ROLLBACK ALL WRITES
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      const { readField, writeField } = createStore({ counter: 0 });

      const result = executeWithVerification(
        spec,
        (ctx) => {
          ctx.fields['counter'] = 42;
          return { value: 42 };
        },
        { readField, writeField, params: {} },
      );

      expect(result.success).toBe(true);
      expect(result.journal.length).toBeGreaterThan(0);
      expect(result.journal[0].field).toBe('counter');
      expect(result.journal[0].priorValue).toBe(0);
      expect(result.journal[0].newValue).toBe(42);
    });
  });

  describe('Audit Trail', () => {
    it('should produce a complete audit trail', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  READS:
    user.status
  ENSURE BEFORE:
    [active] user.status EQUALS ACTIVE
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      const { readField, writeField } = createStore({
        'user.status': 'ACTIVE',
      });

      const result = executeWithVerification(
        spec,
        () => 'ok',
        { readField, writeField, params: { ACTIVE: 'ACTIVE' } },
      );

      expect(result.success).toBe(true);
      expect(result.audit).toHaveLength(3); // PRIOR_CAPTURE + ENSURE_BEFORE + ON_SUCCESS
      expect(result.audit[0].stage).toBe('PRIOR_CAPTURE');
      expect(result.audit[result.audit.length - 1].stage).toBe('ON_SUCCESS');
    });
  });

  describe('Report Formatting', () => {
    it('should produce human-readable verification reports', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  READS:
    user.status
  ENSURE BEFORE:
    [active] user.status EQUALS ACTIVE
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      const { readField, writeField } = createStore({
        'user.status': 'ACTIVE',
      });

      const result = executeWithVerification(
        spec,
        () => 'ok',
        { readField, writeField, params: { ACTIVE: 'ACTIVE' } },
      );

      const report = formatVerificationResult(result);
      expect(report).toContain('Verification Report');
      expect(report).toContain('ALL CHECKS PASSED');
    });
  });
});
