// ============================================================================
// Lexer Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import { Lexer, tokenize, LexerError } from '../lexer.js';
import { TokenType } from '../tokens.js';

describe('Lexer', () => {
  describe('Basic Tokens', () => {
    it('should tokenize keywords', () => {
      const tokens = tokenize('DEFINE FUNCTION MODULE');
      expect(tokens.filter(t => t.type === TokenType.KEYWORD)).toHaveLength(3);
      expect(tokens[0].value).toBe('DEFINE');
      expect(tokens[1].value).toBe('FUNCTION');
      expect(tokens[2].value).toBe('MODULE');
    });

    it('should tokenize identifiers', () => {
      const tokens = tokenize('senderId receiverBalance');
      const idents = tokens.filter(t => t.type === TokenType.IDENTIFIER);
      expect(idents).toHaveLength(2);
      expect(idents[0].value).toBe('senderId');
      expect(idents[1].value).toBe('receiverBalance');
    });

    it('should tokenize PascalCase identifiers', () => {
      const tokens = tokenize('UserId Email TransferResult');
      const idents = tokens.filter(t => t.type === TokenType.IDENTIFIER);
      expect(idents).toHaveLength(3);
    });

    it('should tokenize integer literals', () => {
      const tokens = tokenize('42 -7 1_000_000');
      const ints = tokens.filter(t => t.type === TokenType.LITERAL_INT);
      expect(ints).toHaveLength(3); // -7 is MINUS_SYM + LITERAL_INT(7)
      expect(ints[0].value).toBe('42');
      expect(ints[1].value).toBe('7');
      expect(ints[2].value).toBe('1000000');
    });

    it('should tokenize decimal literals', () => {
      const tokens = tokenize('3.14 0.5 1_234.567');
      const decs = tokens.filter(t => t.type === TokenType.LITERAL_DECIMAL);
      expect(decs).toHaveLength(3);
      expect(decs[0].value).toBe('3.14');
    });

    it('should tokenize string literals', () => {
      const tokens = tokenize('"hello world" "user@example.com"');
      const strs = tokens.filter(t => t.type === TokenType.LITERAL_STRING);
      expect(strs).toHaveLength(2);
      expect(strs[0].value).toBe('hello world');
      expect(strs[1].value).toBe('user@example.com');
    });

    it('should tokenize boolean literals', () => {
      const tokens = tokenize('TRUE FALSE');
      const bools = tokens.filter(t => t.type === TokenType.LITERAL_BOOL);
      expect(bools).toHaveLength(2);
      expect(bools[0].value).toBe('TRUE');
      expect(bools[1].value).toBe('FALSE');
    });

    it('should tokenize NOTHING', () => {
      const tokens = tokenize('NOTHING');
      expect(tokens[0].type).toBe(TokenType.LITERAL_NOTHING);
    });
  });

  describe('Punctuation & Operators', () => {
    it('should tokenize punctuation', () => {
      const tokens = tokenize(': , . [ ] ( ) { }');
      const types = tokens.filter(t => t.type !== TokenType.EOF).map(t => t.type);
      expect(types).toContain(TokenType.COLON);
      expect(types).toContain(TokenType.COMMA);
      expect(types).toContain(TokenType.DOT);
      expect(types).toContain(TokenType.OPEN_BRACKET);
      expect(types).toContain(TokenType.CLOSE_BRACKET);
    });

    it('should tokenize symbolic operators', () => {
      const tokens = tokenize('+ - * / %');
      const ops = tokens.filter(t =>
        t.type === TokenType.PLUS_SYM || t.type === TokenType.MINUS_SYM ||
        t.type === TokenType.STAR_SYM || t.type === TokenType.SLASH_SYM ||
        t.type === TokenType.PERCENT_SYM
      );
      expect(ops).toHaveLength(5);
    });

    it('should tokenize comparison operators', () => {
      const tokens = tokenize('== != >= <= > <');
      expect(tokens.filter(t => t.type === TokenType.DOUBLE_EQUALS)).toHaveLength(1);
      expect(tokens.filter(t => t.type === TokenType.NOT_EQUALS_SYM)).toHaveLength(1);
      expect(tokens.filter(t => t.type === TokenType.GTE_SYM)).toHaveLength(1);
      expect(tokens.filter(t => t.type === TokenType.LTE_SYM)).toHaveLength(1);
    });

    it('should tokenize safe access operator', () => {
      const tokens = tokenize('value?.field');
      expect(tokens.filter(t => t.type === TokenType.QUESTION_DOT)).toHaveLength(1);
    });

    it('should tokenize keyword operators like NOT_EQUALS', () => {
      const tokens = tokenize('NOT_EQUALS GREATER_OR_EQUAL');
      expect(tokens[0].type).toBe(TokenType.KEYWORD);
      expect(tokens[0].value).toBe('NOT_EQUALS');
    });
  });

  describe('Comments', () => {
    it('should skip single-line comments', () => {
      const tokens = tokenize('DEFINE -- this is a comment\nFUNCTION');
      const kws = tokens.filter(t => t.type === TokenType.KEYWORD);
      expect(kws.map(k => k.value)).toEqual(['DEFINE', 'FUNCTION']);
    });

    it('should skip multi-line comments', () => {
      const tokens = tokenize('DEFINE ---\nthis is\na multi-line comment\n--- FUNCTION');
      const kws = tokens.filter(t => t.type === TokenType.KEYWORD);
      expect(kws.map(k => k.value)).toEqual(['DEFINE', 'FUNCTION']);
    });

    it('should throw on unterminated multi-line comments', () => {
      expect(() => tokenize('---\nunclosed comment')).toThrow(LexerError);
    });
  });

  describe('Indentation', () => {
    it('should emit INDENT and DEDENT tokens', () => {
      const tokens = tokenize('DEFINE\n  FUNCTION\nMODULE');
      const indents = tokens.filter(t => t.type === TokenType.INDENT);
      const dedents = tokens.filter(t => t.type === TokenType.DEDENT);
      expect(indents).toHaveLength(1);
      expect(dedents).toHaveLength(1);
    });

    it('should handle nested indentation', () => {
      const tokens = tokenize('A\n  B\n    C\nD');
      const indents = tokens.filter(t => t.type === TokenType.INDENT);
      const dedents = tokens.filter(t => t.type === TokenType.DEDENT);
      expect(indents).toHaveLength(2);
      expect(dedents).toHaveLength(2);
    });

    it('should reject tabs', () => {
      expect(() => tokenize('\tFUNCTION')).toThrow(LexerError);
    });

    it('should reject odd indentation', () => {
      expect(() => tokenize('A\n   B')).toThrow(LexerError);
    });
  });

  describe('String Escapes', () => {
    it('should handle escape sequences', () => {
      const tokens = tokenize('"hello\\nworld"');
      const str = tokens.find(t => t.type === TokenType.LITERAL_STRING);
      expect(str?.value).toBe('hello\nworld');
    });

    it('should handle escaped quotes', () => {
      const tokens = tokenize('"say \\"hello\\""');
      const str = tokens.find(t => t.type === TokenType.LITERAL_STRING);
      expect(str?.value).toBe('say "hello"');
    });

    it('should throw on unterminated strings', () => {
      expect(() => tokenize('"unterminated')).toThrow(LexerError);
    });
  });

  describe('Line/Column Tracking', () => {
    it('should track line numbers', () => {
      const tokens = tokenize('A\nB\nC');
      const ids = tokens.filter(t => t.type === TokenType.KEYWORD || t.type === TokenType.IDENTIFIER);
      expect(ids[0].location.line).toBe(1);
      expect(ids[1].location.line).toBe(2);
      expect(ids[2].location.line).toBe(3);
    });
  });

  describe('Full Program Tokenization', () => {
    it('should tokenize a minimal function', () => {
      const source = `MODULE test

DEFINE FUNCTION add
  INTENT: "Add two numbers together."
  RECEIVE:
    a AS Integer
    b AS Integer
  RETURN: Integer
  ON FAILURE:
    RETURN EXPLICIT 0
  BODY:
    RETURN EXPLICIT a + b`;

      const tokens = tokenize(source);
      expect(tokens.filter(t => t.type === TokenType.EOF)).toHaveLength(1);

      // Check key tokens are present
      const values = tokens.map(t => t.value);
      expect(values).toContain('MODULE');
      expect(values).toContain('DEFINE');
      expect(values).toContain('FUNCTION');
      expect(values).toContain('INTENT');
      expect(values).toContain('RECEIVE');
      expect(values).toContain('RETURN');
      expect(values).toContain('BODY');
      expect(values).toContain('Add two numbers together.');
    });
  });
});
