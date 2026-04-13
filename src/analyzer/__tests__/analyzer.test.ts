// ============================================================================
// Semantic Analyzer Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import { compile } from '../../index.js';

describe('Semantic Analyzer', () => {
  describe('E001 — Missing INTENT', () => {
    it('should error on missing INTENT', () => {
      const result = compile(`MODULE test

DEFINE FUNCTION broken
  INTENT: ""
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const e001 = result.diagnostics.find(d => d.code === 'E001');
      expect(e001).toBeDefined();
    });
  });

  describe('E012 — Missing ON FAILURE', () => {
    it('should error when ON FAILURE is missing', () => {
      const result = compile(`MODULE test

DEFINE FUNCTION noFailure
  INTENT: "Does something."
  BODY:
    RETURN EXPLICIT NOTHING`);

      const e012 = result.diagnostics.find(d => d.code === 'E012');
      expect(e012).toBeDefined();
    });
  });

  describe('W001 — Mechanistic Intent', () => {
    it('should warn on mechanical INTENT descriptions', () => {
      const result = compile(`MODULE test

DEFINE FUNCTION doThing
  INTENT: "Calls the payment API to charge the user."
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const w001 = result.diagnostics.find(d => d.code === 'W001');
      expect(w001).toBeDefined();
    });

    it('should warn on INTENT without punctuation', () => {
      const result = compile(`MODULE test

DEFINE FUNCTION doThing
  INTENT: "Process the payment"
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const w001 = result.diagnostics.find(d => d.code === 'W001');
      expect(w001).toBeDefined();
    });
  });

  describe('E003 — Undeclared Effects', () => {
    it('should error on undeclared WRITE', () => {
      const result = compile(`MODULE test

DEFINE FUNCTION f
  INTENT: "Write without declaration."
  ON FAILURE:
    ROLLBACK ALL WRITES
  BODY:
    WRITE user.balance AS 100
    RETURN EXPLICIT NOTHING`);

      const e003 = result.diagnostics.find(d => d.code === 'E003');
      expect(e003).toBeDefined();
    });

    it('should pass when effects are properly declared', () => {
      const result = compile(`MODULE test

DEFINE FUNCTION f
  INTENT: "Write with declaration."
  WRITES:
    user.balance
  ON FAILURE:
    ROLLBACK ALL WRITES
  BODY:
    WRITE user.balance AS 100
    RETURN EXPLICIT NOTHING`);

      const e003 = result.diagnostics.filter(d => d.code === 'E003');
      expect(e003).toHaveLength(0);
    });
  });

  describe('E011 — Missing Return Path', () => {
    it('should error when not all paths return', () => {
      const result = compile(`MODULE test

DEFINE FUNCTION f
  INTENT: "Incomplete paths."
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    LET x = 42`);

      const e011 = result.diagnostics.find(d => d.code === 'E011');
      expect(e011).toBeDefined();
    });

    it('should pass when all paths return', () => {
      const result = compile(`MODULE test

DEFINE FUNCTION f
  INTENT: "Complete paths."
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT 42`);

      const e011 = result.diagnostics.filter(d => d.code === 'E011');
      expect(e011).toHaveLength(0);
    });
  });

  describe('Full Program Validation', () => {
    it('should validate a well-formed function with minimal issues', () => {
      const result = compile(`MODULE test

DEFINE FUNCTION add
  INTENT: "Add two numbers together."
  RECEIVE:
    a AS Integer
    b AS Integer
  RETURN: Integer
  ON FAILURE:
    RETURN EXPLICIT 0
  BODY:
    RETURN EXPLICIT a + b`);

      const errors = result.diagnostics.filter(d => d.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });
});
