// ============================================================================
// Spec Compiler Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import { compileSpec, CompiledFunctionSpec, RuntimeContext, specToString } from '../compiler.js';
import { tokenize } from '../../lexer/lexer.js';
import { parse } from '../../parser/parser.js';
import { FunctionDef } from '../../ast/nodes.js';

// Helper: parse a .vbl source and extract the first function definition
function parseFn(source: string): FunctionDef {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const fn = ast.definitions.find(d => d.kind === 'FunctionDef');
  if (!fn || fn.kind !== 'FunctionDef') throw new Error('No function found');
  return fn;
}

function makeCtx(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    fields: {},
    prior: {},
    params: {},
    journal: [],
    ...overrides,
  };
}

describe('Spec Compiler', () => {
  describe('ENSURE BEFORE — Precondition Compilation', () => {
    it('should compile EQUALS comparison', () => {
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
      expect(spec.preconditions).toHaveLength(1);

      const pre = spec.preconditions[0];
      expect(pre.label).toBe('active');
      expect(pre.kind).toBe('formal');

      // Test the predicate
      const ctx = makeCtx({ fields: { 'user.status': 'ACTIVE' }, params: { ACTIVE: 'ACTIVE' } });
      const result = pre.predicateFn(ctx);
      expect(result.passed).toBe(true);
    });

    it('should compile GREATER_OR_EQUAL comparison', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  READS:
    account.balance
  ENSURE BEFORE:
    [funds] account.balance GREATER_OR_EQUAL amount
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      const pre = spec.preconditions[0];

      // Pass: balance 500 >= amount 200
      let result = pre.predicateFn(makeCtx({
        fields: { 'account.balance': 500 },
        params: { amount: 200 },
      }));
      expect(result.passed).toBe(true);

      // Fail: balance 100 >= amount 200
      result = pre.predicateFn(makeCtx({
        fields: { 'account.balance': 100 },
        params: { amount: 200 },
      }));
      expect(result.passed).toBe(false);
    });

    it('should compile NOT_EQUALS comparison', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  ENSURE BEFORE:
    [no_self] senderId NOT_EQUALS receiverId
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      const pre = spec.preconditions[0];

      const result = pre.predicateFn(makeCtx({
        params: { senderId: 'user1', receiverId: 'user2' },
      }));
      expect(result.passed).toBe(true);

      const result2 = pre.predicateFn(makeCtx({
        params: { senderId: 'user1', receiverId: 'user1' },
      }));
      expect(result2.passed).toBe(false);
    });
  });

  describe('ENSURE AFTER — Postcondition Compilation', () => {
    it('should compile PRIOR() + arithmetic postcondition', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  WRITES:
    account.balance
  ENSURE AFTER:
    account.balance EQUALS PRIOR(account.balance) MINUS amount
  ON FAILURE:
    ROLLBACK ALL WRITES
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      expect(spec.postconditions).toHaveLength(1);
      expect(spec.priorFields).toContain('account.balance');

      const post = spec.postconditions[0];

      // Pass: balance was 500, amount 200, now 300
      const result = post.predicateFn(makeCtx({
        fields: { 'account.balance': 300 },
        prior: { 'account.balance': 500 },
        params: { amount: 200 },
      }));
      expect(result.passed).toBe(true);

      // Fail: balance was 500, amount 200, now 250 (wrong!)
      const result2 = post.predicateFn(makeCtx({
        fields: { 'account.balance': 250 },
        prior: { 'account.balance': 500 },
        params: { amount: 200 },
      }));
      expect(result2.passed).toBe(false);
    });

    it('should compile RETURN_VALUE IS NOT NOTHING', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  ENSURE AFTER:
    RETURN_VALUE IS NOT NOTHING
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT 42`);

      const spec = compileSpec(fn);
      const post = spec.postconditions[0];

      const yes = post.predicateFn(makeCtx({ returnValue: 42 }));
      expect(yes.passed).toBe(true);

      const no = post.predicateFn(makeCtx({ returnValue: null }));
      expect(no.passed).toBe(false);
    });
  });

  describe('INVARIANT Compilation', () => {
    it('should compile conservation law invariant', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  READS:
    sender.balance
    receiver.balance
  WRITES:
    sender.balance
    receiver.balance
  INVARIANT:
    sender.balance PLUS receiver.balance EQUALS PRIOR(sender.balance) PLUS PRIOR(receiver.balance)
  ON FAILURE:
    ROLLBACK ALL WRITES
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      expect(spec.invariants).toHaveLength(1);

      const inv = spec.invariants[0];

      // Pass: 300 + 700 = 500 + 500
      const result = inv.predicateFn(makeCtx({
        fields: { 'sender.balance': 300, 'receiver.balance': 700 },
        prior: { 'sender.balance': 500, 'receiver.balance': 500 },
      }));
      expect(result.passed).toBe(true);

      // Fail: 300 + 600 != 500 + 500
      const result2 = inv.predicateFn(makeCtx({
        fields: { 'sender.balance': 300, 'receiver.balance': 600 },
        prior: { 'sender.balance': 500, 'receiver.balance': 500 },
      }));
      expect(result2.passed).toBe(false);
    });
  });

  describe('Parameter Constraint Compilation', () => {
    it('should compile "must be greater than 0"', () => {
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
      expect(spec.paramConstraints).toHaveLength(1);
      expect(spec.paramConstraints[0].kind).toBe('formal');

      const pass = spec.paramConstraints[0].predicateFn(makeCtx({ params: { amount: 42 } }));
      expect(pass.passed).toBe(true);

      const fail = spec.paramConstraints[0].predicateFn(makeCtx({ params: { amount: -5 } }));
      expect(fail.passed).toBe(false);
    });

    it('should compile "length between N and M"', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  RECEIVE:
    password AS Text CONSTRAIN: "length between 8 and 128"
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      const constraint = spec.paramConstraints[0];
      expect(constraint.kind).toBe('formal');

      const pass = constraint.predicateFn(makeCtx({ params: { password: 'abcdefgh' } }));
      expect(pass.passed).toBe(true);

      const fail = constraint.predicateFn(makeCtx({ params: { password: 'abc' } }));
      expect(fail.passed).toBe(false);
    });

    it('should compile "must contain at least one uppercase letter"', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  RECEIVE:
    password AS Text CONSTRAIN: "must contain at least one uppercase letter"
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      const constraint = spec.paramConstraints[0];

      expect(constraint.predicateFn(makeCtx({ params: { password: 'Hello123' } })).passed).toBe(true);
      expect(constraint.predicateFn(makeCtx({ params: { password: 'hello123' } })).passed).toBe(false);
    });

    it('should compile "must contain at least one digit"', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  RECEIVE:
    password AS Text CONSTRAIN: "must contain at least one digit"
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      const constraint = spec.paramConstraints[0];

      expect(constraint.predicateFn(makeCtx({ params: { password: 'Hello1' } })).passed).toBe(true);
      expect(constraint.predicateFn(makeCtx({ params: { password: 'Hello' } })).passed).toBe(false);
    });

    it('should fall back to AI evaluation for unrecognized constraints', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  RECEIVE:
    content AS Text CONSTRAIN: "must be grammatically correct English"
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      const constraint = spec.paramConstraints[0];

      expect(constraint.kind).toBe('ai_evaluated');
      expect(constraint.naturalLanguage).toBe('must be grammatically correct English');
    });
  });

  describe('specToString', () => {
    it('should format spec expressions as readable strings', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  READS:
    user.balance
  ENSURE BEFORE:
    [check] user.balance GREATER_OR_EQUAL 100
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      expect(spec.preconditions[0].source).toContain('GREATER_OR_EQUAL');
    });
  });

  describe('PRIOR() Field Collection', () => {
    it('should collect all PRIOR fields from postconditions and invariants', () => {
      const fn = parseFn(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  READS:
    a.x
    b.y
  WRITES:
    a.x
    b.y
  ENSURE AFTER:
    a.x EQUALS PRIOR(a.x) PLUS 1
  INVARIANT:
    a.x PLUS b.y EQUALS PRIOR(a.x) PLUS PRIOR(b.y)
  ON FAILURE:
    ROLLBACK ALL WRITES
  BODY:
    RETURN EXPLICIT NOTHING`);

      const spec = compileSpec(fn);
      expect(spec.priorFields).toContain('a.x');
      expect(spec.priorFields).toContain('b.y');
    });
  });
});
