// ============================================================================
// JS-ESM Code Generator Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import { generateJS } from '../js-esm.js';
import { tokenize } from '../../lexer/lexer.js';
import { parse } from '../../parser/parser.js';

function gen(source: string, opts = {}): string {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  return generateJS(ast, opts);
}

describe('JS-ESM Code Generator', () => {
  describe('Basic Function Generation', () => {
    it('should generate a simple function', () => {
      const js = gen(`MODULE test

DEFINE FUNCTION add
  INTENT: "Add two numbers."
  RECEIVE:
    a AS Integer
    b AS Integer
  RETURN: Integer
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT a PLUS b`);

      expect(js).toContain('async function add');
      expect(js).toContain('return (a + b)');
      expect(js).toContain('@intent Add two numbers');
    });

    it('should export functions with EXPORT', () => {
      const js = gen(`MODULE test

EXPORT FUNCTION hello
  INTENT: "Say hello."
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT "hello"`);

      expect(js).toContain('export async function hello');
    });
  });

  describe('Statement Generation', () => {
    it('should generate LET bindings', () => {
      const js = gen(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    LET x = 42
    LET y = "hello"
    RETURN EXPLICIT x`);

      expect(js).toContain('const x = 42');
      expect(js).toContain('const y = "hello"');
    });

    it('should generate IF/ELSE', () => {
      const js = gen(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  RECEIVE:
    x AS Integer
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    IF x GREATER_THAN 0 THEN
      RETURN EXPLICIT x
    ELSE
      RETURN EXPLICIT 0
    END IF`);

      expect(js).toContain('if ((x > 0))');
      expect(js).toContain('} else {');
    });

    it('should generate FOR EACH loops', () => {
      const js = gen(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  RECEIVE:
    items AS List OF Integer
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    FOR EACH item IN items
      LET x = item PLUS 1
    END FOR
    RETURN EXPLICIT NOTHING`);

      expect(js).toContain('for (const item of (items))');
    });

    it('should generate WRITE statements with journaling', () => {
      const js = gen(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  WRITES:
    user.balance
  ON FAILURE:
    ROLLBACK ALL WRITES
  BODY:
    WRITE user.balance AS 100
    RETURN EXPLICIT NOTHING`);

      expect(js).toContain('__journal.push');
      expect(js).toContain("__ctx.writeField?.('user.balance'");
    });

    it('should generate CALL statements', () => {
      const js = gen(`MODULE test

IMPORT payments.audit AS audit

DEFINE FUNCTION f
  INTENT: "Test."
  CALLS:
    audit.log
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    CALL audit.log
      WITH event: "test"
    RETURN EXPLICIT NOTHING`);

      expect(js).toContain('await audit.log');
    });
  });

  describe('Expression Generation', () => {
    it('should generate arithmetic expressions', () => {
      const js = gen(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  RECEIVE:
    a AS Integer
    b AS Integer
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    LET sum = a PLUS b
    LET diff = a MINUS b
    LET prod = a TIMES b
    RETURN EXPLICIT sum`);

      expect(js).toContain('(a + b)');
      expect(js).toContain('(a - b)');
      expect(js).toContain('(a * b)');
    });

    it('should generate record literals', () => {
      const js = gen(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    LET r = {
      name: "test",
      value: 42
    }
    RETURN EXPLICIT r`);

      expect(js).toContain('name: "test"');
      expect(js).toContain('value: 42');
    });

    it('should generate READ expressions', () => {
      const js = gen(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  READS:
    user.balance
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    LET bal = READ user.balance
    RETURN EXPLICIT bal`);

      expect(js).toContain("__ctx.readField?.('user.balance')");
    });

    it('should generate built-in function calls', () => {
      const js = gen(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    LET id = UUID()
    LET ts = NOW()
    RETURN EXPLICIT NOTHING`);

      expect(js).toContain('crypto.randomUUID()');
      expect(js).toContain('Date.now()');
    });
  });

  describe('Verification Wrapper', () => {
    it('should emit ENSURE BEFORE checks', () => {
      const js = gen(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  READS:
    account.balance
  ENSURE BEFORE:
    [funds] account.balance GREATER_OR_EQUAL 100
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      expect(js).toContain('ENSURE BEFORE');
      expect(js).toContain('PreconditionFailed');
      expect(js).toContain('>= 100');
    });

    it('should emit PRIOR() capture', () => {
      const js = gen(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  WRITES:
    counter
  ENSURE AFTER:
    RETURN_VALUE IS NOT NOTHING
  ON FAILURE:
    ROLLBACK ALL WRITES
  BODY:
    RETURN EXPLICIT 42`);

      expect(js).toContain('__prior');
      expect(js).toContain('structuredClone');
      expect(js).toContain('ENSURE AFTER');
    });

    it('should emit INVARIANT checks pre and post', () => {
      const js = gen(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  READS:
    a
    b
  WRITES:
    a
    b
  INVARIANT:
    a PLUS b EQUALS PRIOR(a) PLUS PRIOR(b)
  ON FAILURE:
    ROLLBACK ALL WRITES
  BODY:
    RETURN EXPLICIT NOTHING`);

      expect(js).toContain('INVARIANT (pre)');
      expect(js).toContain('INVARIANT (post)');
      expect(js).toContain('InvariantViolated');
    });
  });

  describe('Type Definitions', () => {
    it('should generate enum as frozen object', () => {
      const js = gen(`MODULE test

DEFINE ENUM AccountStatus
  VALUES:
    ACTIVE
    SUSPENDED
    CLOSED`);

      expect(js).toContain('Object.freeze');
      expect(js).toContain("ACTIVE: 'ACTIVE'");
      expect(js).toContain("SUSPENDED: 'SUSPENDED'");
    });

    it('should generate data as constructor function', () => {
      const js = gen(`MODULE test

DEFINE DATA UserProfile
  FIELDS:
    name AS Text REQUIRED
    email AS Email REQUIRED`);

      expect(js).toContain('function UserProfile');
      expect(js).toContain("__type: 'UserProfile'");
    });
  });

  describe('No Verification Mode', () => {
    it('should skip verification when disabled', () => {
      const js = gen(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  ENSURE BEFORE:
    [check] 1 EQUALS 1
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT 42`, { verification: false });

      expect(js).not.toContain('ENSURE BEFORE');
      expect(js).not.toContain('__prior');
      expect(js).toContain('return 42');
    });
  });

  describe('Full Example', () => {
    it('should compile transfers.vbl without errors', () => {
      const { readFileSync } = require('fs');
      const src = readFileSync('examples/transfers.vbl', 'utf8');
      const js = gen(src);

      expect(js).toContain('export async function transferFunds');
      expect(js).toContain('ENSURE BEFORE');
      expect(js).toContain('ENSURE AFTER');
      expect(js).toContain('INVARIANT');
      expect(js).toContain('__prior');
      expect(js).toContain('__journal');
    });
  });
});
