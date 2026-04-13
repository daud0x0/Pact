// ============================================================================
// Parser Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import { tokenize } from '../../lexer/lexer.js';
import { Parser, parse } from '../parser.js';

function quickParse(source: string) {
  const tokens = tokenize(source);
  return parse(tokens);
}

describe('Parser', () => {
  describe('Module Declaration', () => {
    it('should parse a simple module declaration', () => {
      const ast = quickParse('MODULE payments.transfers');
      expect(ast.module.path).toEqual(['payments', 'transfers']);
    });

    it('should parse a single-segment module', () => {
      const ast = quickParse('MODULE main');
      expect(ast.module.path).toEqual(['main']);
    });
  });

  describe('Import Statements', () => {
    it('should parse imports', () => {
      const ast = quickParse(`MODULE test
IMPORT payments.accounts AS accounts
IMPORT auth.sessions AS sessions`);
      expect(ast.imports).toHaveLength(2);
      expect(ast.imports[0].path).toEqual(['payments', 'accounts']);
      expect(ast.imports[0].alias).toBe('accounts');
    });
  });

  describe('Function Definitions', () => {
    it('should parse a minimal function', () => {
      const ast = quickParse(`MODULE test

DEFINE FUNCTION add
  INTENT: "Add two numbers."
  RECEIVE:
    a AS Integer
    b AS Integer
  RETURN: Integer
  ON FAILURE:
    RETURN EXPLICIT 0
  BODY:
    RETURN EXPLICIT a + b`);

      expect(ast.definitions).toHaveLength(1);
      const fn = ast.definitions[0];
      expect(fn.kind).toBe('FunctionDef');
      if (fn.kind === 'FunctionDef') {
        expect(fn.name).toBe('add');
        expect(fn.intent).toBe('Add two numbers.');
        expect(fn.parameters).toHaveLength(2);
        expect(fn.parameters[0].name).toBe('a');
        expect(fn.body).toHaveLength(1);
      }
    });

    it('should parse exported functions', () => {
      const ast = quickParse(`MODULE test

EXPORT FUNCTION doThing
  INTENT: "Does a thing."
  ON FAILURE:
    ROLLBACK ALL WRITES
  BODY:
    RETURN EXPLICIT NOTHING`);

      const fn = ast.definitions[0];
      if (fn.kind === 'FunctionDef') {
        expect(fn.exported).toBe(true);
      }
    });

    it('should parse effect declarations', () => {
      const ast = quickParse(`MODULE test

DEFINE FUNCTION transfer
  INTENT: "Transfer funds."
  READS:
    account.balance
    config.limit
  WRITES:
    account.balance
  CALLS:
    audit.log
  ON FAILURE:
    ROLLBACK ALL WRITES
  BODY:
    RETURN EXPLICIT NOTHING`);

      const fn = ast.definitions[0];
      if (fn.kind === 'FunctionDef') {
        expect(fn.effects.reads).toHaveLength(2);
        expect(fn.effects.writes).toHaveLength(1);
        expect(fn.effects.calls).toHaveLength(1);
        expect(fn.effects.reads[0]).toEqual(['account', 'balance']);
      }
    });

    it('should parse parameters with constraints', () => {
      const ast = quickParse(`MODULE test

DEFINE FUNCTION register
  INTENT: "Register a user."
  RECEIVE:
    email AS Email
    password AS Text CONSTRAIN: "length between 8 and 128" CONSTRAIN: "must contain uppercase"
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const fn = ast.definitions[0];
      if (fn.kind === 'FunctionDef') {
        expect(fn.parameters[1].constraints).toHaveLength(2);
      }
    });

    it('should parse ENSURE BEFORE with labels', () => {
      const ast = quickParse(`MODULE test

DEFINE FUNCTION transfer
  INTENT: "Transfer funds."
  ENSURE BEFORE:
    [sufficient_funds] sender.balance GREATER_OR_EQUAL amount
    [sender_active] sender.status EQUALS ACTIVE
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const fn = ast.definitions[0];
      if (fn.kind === 'FunctionDef') {
        expect(fn.ensureBefore).toHaveLength(2);
        expect(fn.ensureBefore[0].label).toBe('sufficient_funds');
      }
    });

    it('should parse ENSURE AFTER with PRIOR()', () => {
      const ast = quickParse(`MODULE test

DEFINE FUNCTION withdraw
  INTENT: "Withdraw from account."
  WRITES:
    account.balance
  ENSURE AFTER:
    account.balance EQUALS PRIOR(account.balance) MINUS amount
  ON FAILURE:
    ROLLBACK ALL WRITES
  BODY:
    RETURN EXPLICIT NOTHING`);

      const fn = ast.definitions[0];
      if (fn.kind === 'FunctionDef') {
        expect(fn.ensureAfter).toHaveLength(1);
      }
    });
  });

  describe('Type Expressions', () => {
    it('should parse OPTIONAL types', () => {
      const ast = quickParse(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  RECEIVE:
    note AS OPTIONAL Text
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    RETURN EXPLICIT NOTHING`);

      const fn = ast.definitions[0];
      if (fn.kind === 'FunctionDef') {
        expect(fn.parameters[0].paramType.kind).toBe('OptionalType');
      }
    });
  });

  describe('Statements', () => {
    it('should parse LET statements', () => {
      const ast = quickParse(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    LET x = 42
    RETURN EXPLICIT x`);

      const fn = ast.definitions[0];
      if (fn.kind === 'FunctionDef') {
        expect(fn.body[0].kind).toBe('LetStmt');
        if (fn.body[0].kind === 'LetStmt') {
          expect(fn.body[0].name).toBe('x');
        }
      }
    });

    it('should parse WRITE statements', () => {
      const ast = quickParse(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  WRITES:
    user.balance
  ON FAILURE:
    ROLLBACK ALL WRITES
  BODY:
    WRITE user.balance AS 100
    RETURN EXPLICIT NOTHING`);

      const fn = ast.definitions[0];
      if (fn.kind === 'FunctionDef') {
        expect(fn.body[0].kind).toBe('WriteStmt');
      }
    });

    it('should parse IF/ELSE statements', () => {
      const ast = quickParse(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    IF x EQUALS 1 THEN
      RETURN EXPLICIT 1
    ELSE
      RETURN EXPLICIT 2
    END IF`);

      const fn = ast.definitions[0];
      if (fn.kind === 'FunctionDef') {
        expect(fn.body[0].kind).toBe('IfStmt');
      }
    });

    it('should parse MATCH statements', () => {
      const ast = quickParse(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    MATCH result
      CASE PaymentSuccess AS success THEN
        RETURN EXPLICIT success
      CASE PaymentFailed THEN
        ABORT WITH REASON: "failed"
    END MATCH`);

      const fn = ast.definitions[0];
      if (fn.kind === 'FunctionDef') {
        expect(fn.body[0].kind).toBe('MatchStmt');
        if (fn.body[0].kind === 'MatchStmt') {
          expect(fn.body[0].cases).toHaveLength(2);
          expect(fn.body[0].cases[0].binding).toBe('success');
        }
      }
    });

    it('should parse Record literals', () => {
      const ast = quickParse(`MODULE test

DEFINE FUNCTION f
  INTENT: "Test."
  ON FAILURE:
    RETURN EXPLICIT NOTHING
  BODY:
    LET entry = {
      id: 1,
      name: "test"
    }
    RETURN EXPLICIT entry`);

      const fn = ast.definitions[0];
      if (fn.kind === 'FunctionDef') {
        const letStmt = fn.body[0];
        if (letStmt.kind === 'LetStmt') {
          expect(letStmt.value.kind).toBe('RecordLiteralExpr');
        }
      }
    });
  });

  describe('Type Definitions', () => {
    it('should parse DEFINE TYPE', () => {
      const ast = quickParse(`MODULE test

DEFINE TYPE Email
  BASE: Text
  CONSTRAIN: "must contain exactly one @ symbol"
  NORMALIZE: LOWERCASE`);

      const def = ast.definitions[0];
      expect(def.kind).toBe('TypeDef');
      if (def.kind === 'TypeDef') {
        expect(def.name).toBe('Email');
        expect(def.baseType).toBe('Text');
        expect(def.constraints).toHaveLength(1);
      }
    });
  });

  describe('Enum Definitions', () => {
    it('should parse DEFINE ENUM', () => {
      const ast = quickParse(`MODULE test

DEFINE ENUM AccountStatus
  VALUES:
    ACTIVE
    SUSPENDED
    DELETED
  DEFAULT: ACTIVE`);

      const def = ast.definitions[0];
      expect(def.kind).toBe('EnumDef');
      if (def.kind === 'EnumDef') {
        expect(def.name).toBe('AccountStatus');
        expect(def.values).toEqual(['ACTIVE', 'SUSPENDED', 'DELETED']);
        expect(def.defaultValue).toBe('ACTIVE');
      }
    });
  });

  describe('Data Definitions', () => {
    it('should parse DEFINE DATA', () => {
      const ast = quickParse(`MODULE test

DEFINE DATA UserProfile
  FIELDS:
    id AS UserId REQUIRED
    email AS Email REQUIRED
    displayName AS Text REQUIRED`);

      const def = ast.definitions[0];
      expect(def.kind).toBe('DataDef');
      if (def.kind === 'DataDef') {
        expect(def.name).toBe('UserProfile');
        expect(def.fields).toHaveLength(3);
        expect(def.fields[0].name).toBe('id');
        expect(def.fields[0].required).toBe(true);
      }
    });
  });
});
