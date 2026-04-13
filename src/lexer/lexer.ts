// ============================================================================
// VibeL Lexer
// Spec Reference: Section 3 — Lexical Structure, Section 21.2 — The Lexer
// ============================================================================

import {
  Token,
  TokenType,
  isKeyword,
  isBooleanLiteral,
} from './tokens.js';

/** Error thrown when the lexer encounters invalid input */
export class LexerError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
  ) {
    super(`[L${line}:${column}] Lexer Error: ${message}`);
    this.name = 'LexerError';
  }
}

/**
 * VibeL Lexer — tokenizes .vbl source files into a token stream.
 *
 * Key responsibilities:
 * - Tracks indentation levels and emits INDENT/DEDENT tokens (2-space indent)
 * - Rejects tabs and mixed indentation
 * - Parses all literal types (int, decimal, string, bool, NOTHING)
 * - Handles comments (-- single-line, --- multi-line)
 * - Validates identifier naming conventions
 */
export class Lexer {
  private source: string;
  private tokens: Token[] = [];
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private indentStack: number[] = [0];
  private atLineStart: boolean = true;

  constructor(source: string) {
    this.source = source;
  }

  /** Tokenize the full source and return the token array */
  tokenize(): Token[] {
    this.tokens = [];
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.indentStack = [0];
    this.atLineStart = true;

    while (this.pos < this.source.length) {
      if (this.atLineStart) {
        this.handleIndentation();
        this.atLineStart = false;
      }

      const ch = this.current();
      if (ch === undefined) break;

      // Skip carriage return
      if (ch === '\r') {
        this.advance();
        continue;
      }

      // Newline
      if (ch === '\n') {
        this.emitNewline();
        continue;
      }

      // Skip spaces (not at line start — those are handled by indentation)
      if (ch === ' ') {
        this.advance();
        continue;
      }

      // Tab — forbidden
      if (ch === '\t') {
        throw new LexerError(
          'Tabs are not allowed in VibeL. Use 2 spaces for indentation.',
          this.line,
          this.column,
        );
      }

      // Comments
      if (ch === '-' && this.peek(1) === '-') {
        this.handleComment();
        continue;
      }

      // String literal
      if (ch === '"') {
        this.readString();
        continue;
      }

      // Number literal
      if (ch >= '0' && ch <= '9') {
        this.readNumber();
        continue;
      }

      // Negative number (only if followed by digit and preceded by operator context)
      // We handle negative numbers as MINUS_SYM + number in the parser instead

      // Symbolic operators and punctuation
      if (this.readSymbol()) continue;

      // Identifiers and keywords
      if (this.isIdentStart(ch)) {
        this.readWord();
        continue;
      }

      throw new LexerError(
        `Unexpected character: '${ch}' (U+${ch.charCodeAt(0).toString(16).padStart(4, '0')})`,
        this.line,
        this.column,
      );
    }

    // Emit remaining DEDENTs to close all open blocks
    while (this.indentStack.length > 1) {
      this.indentStack.pop();
      this.tokens.push(this.makeToken(TokenType.DEDENT, '', ''));
    }

    // Final EOF
    this.tokens.push(this.makeToken(TokenType.EOF, '', ''));

    return this.tokens;
  }

  // ==========================================================================
  // Character Utilities
  // ==========================================================================

  private current(): string | undefined {
    return this.source[this.pos];
  }

  private peek(offset: number = 1): string | undefined {
    return this.source[this.pos + offset];
  }

  private advance(): string {
    const ch = this.source[this.pos];
    this.pos++;
    this.column++;
    return ch;
  }

  private isIdentStart(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  private isIdentPart(ch: string): boolean {
    return this.isIdentStart(ch) || (ch >= '0' && ch <= '9');
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  // ==========================================================================
  // Token Construction
  // ==========================================================================

  private makeToken(type: TokenType, value: string, raw: string): Token {
    return {
      type,
      value,
      location: { line: this.line, column: this.column },
      raw,
    };
  }

  private emit(type: TokenType, value: string, raw: string, line: number, column: number): void {
    this.tokens.push({
      type,
      value,
      location: { line, column },
      raw,
    });
  }

  // ==========================================================================
  // Indentation Handling (Spec §3.5, §21.2)
  // ==========================================================================

  private handleIndentation(): void {
    let spaces = 0;
    while (this.pos < this.source.length && this.source[this.pos] === ' ') {
      spaces++;
      this.pos++;
      this.column++;
    }

    // Skip blank lines and comment-only lines
    const ch = this.source[this.pos];
    if (ch === '\n' || ch === '\r' || ch === undefined) return;
    if (ch === '-' && this.source[this.pos + 1] === '-') return;

    const currentIndent = this.indentStack[this.indentStack.length - 1];

    if (spaces > currentIndent) {
      // Must increase by exactly 2
      if (spaces !== currentIndent + 2) {
        throw new LexerError(
          `Invalid indentation: expected ${currentIndent + 2} spaces but found ${spaces}. VibeL uses 2-space indentation.`,
          this.line,
          this.column,
        );
      }
      this.indentStack.push(spaces);
      this.emit(TokenType.INDENT, '', '  ', this.line, 1);
    } else if (spaces < currentIndent) {
      // Emit DEDENT tokens for each closed indent level
      while (this.indentStack.length > 1 && this.indentStack[this.indentStack.length - 1] > spaces) {
        this.indentStack.pop();
        this.emit(TokenType.DEDENT, '', '', this.line, 1);
      }
      // Verify we landed on a valid indent level
      if (this.indentStack[this.indentStack.length - 1] !== spaces) {
        throw new LexerError(
          `Invalid dedent: indent level ${spaces} does not match any outer block. Valid levels: ${this.indentStack.join(', ')}`,
          this.line,
          this.column,
        );
      }
    }
  }

  // ==========================================================================
  // Newlines
  // ==========================================================================

  private emitNewline(): void {
    // Don't emit consecutive newlines or newline right after INDENT
    const lastToken = this.tokens[this.tokens.length - 1];
    if (!lastToken || lastToken.type === TokenType.NEWLINE || lastToken.type === TokenType.INDENT) {
      // Skip duplicate newlines
    } else {
      this.emit(TokenType.NEWLINE, '\n', '\n', this.line, this.column);
    }
    this.advance();
    this.line++;
    this.column = 1;
    this.atLineStart = true;
  }

  // ==========================================================================
  // Comments (Spec §3.3)
  // ==========================================================================

  private handleComment(): void {
    // Check for multi-line comment: ---
    if (this.peek(2) === '-') {
      this.handleMultiLineComment();
    } else {
      this.handleSingleLineComment();
    }
  }

  private handleSingleLineComment(): void {
    // Skip everything until end of line
    while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
      this.pos++;
      this.column++;
    }
  }

  private handleMultiLineComment(): void {
    // Skip the opening ---
    this.pos += 3;
    this.column += 3;

    // Read until we find another ---
    while (this.pos < this.source.length) {
      if (
        this.source[this.pos] === '-' &&
        this.source[this.pos + 1] === '-' &&
        this.source[this.pos + 2] === '-'
      ) {
        this.pos += 3;
        this.column += 3;
        return;
      }
      if (this.source[this.pos] === '\n') {
        this.line++;
        this.column = 0;
      }
      this.pos++;
      this.column++;
    }

    throw new LexerError(
      'Unterminated multi-line comment (expected closing ---)',
      this.line,
      this.column,
    );
  }

  // ==========================================================================
  // String Literals (Spec §3.4)
  // ==========================================================================

  private readString(): void {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // skip opening "

    let value = '';
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];

      if (ch === '"') {
        this.advance(); // skip closing "
        this.emit(TokenType.LITERAL_STRING, value, `"${value}"`, startLine, startCol);
        return;
      }

      if (ch === '\n') {
        throw new LexerError(
          'Unterminated string literal (strings cannot span multiple lines)',
          startLine,
          startCol,
        );
      }

      // Basic escape sequences
      if (ch === '\\') {
        this.advance();
        const escaped = this.source[this.pos];
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case '"': value += '"'; break;
          case '\\': value += '\\'; break;
          default:
            throw new LexerError(
              `Invalid escape sequence: \\${escaped}`,
              this.line,
              this.column,
            );
        }
        this.advance();
        continue;
      }

      value += ch;
      this.advance();
    }

    throw new LexerError(
      'Unterminated string literal (reached end of file)',
      startLine,
      startCol,
    );
  }

  // ==========================================================================
  // Number Literals (Spec §3.4)
  // ==========================================================================

  private readNumber(): void {
    const startLine = this.line;
    const startCol = this.column;
    let raw = '';
    let value = '';

    // Read integer part
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (this.isDigit(ch)) {
        raw += ch;
        value += ch;
        this.advance();
      } else if (ch === '_') {
        raw += ch;
        // Separator — skip but don't add to value
        this.advance();
      } else {
        break;
      }
    }

    // Check for decimal point
    if (this.current() === '.' && this.peek(1) !== undefined && this.isDigit(this.peek(1)!)) {
      raw += '.';
      value += '.';
      this.advance(); // skip the dot

      // Read fractional part
      while (this.pos < this.source.length) {
        const ch = this.source[this.pos];
        if (this.isDigit(ch)) {
          raw += ch;
          value += ch;
          this.advance();
        } else if (ch === '_') {
          raw += ch;
          this.advance();
        } else {
          break;
        }
      }

      this.emit(TokenType.LITERAL_DECIMAL, value, raw, startLine, startCol);
    } else {
      this.emit(TokenType.LITERAL_INT, value, raw, startLine, startCol);
    }
  }

  // ==========================================================================
  // Symbolic Operators & Punctuation
  // ==========================================================================

  private readSymbol(): boolean {
    const startLine = this.line;
    const startCol = this.column;
    const ch = this.current()!;
    const next = this.peek(1);

    switch (ch) {
      case ':':
        this.advance();
        this.emit(TokenType.COLON, ':', ':', startLine, startCol);
        return true;

      case ',':
        this.advance();
        this.emit(TokenType.COMMA, ',', ',', startLine, startCol);
        return true;

      case '.':
        this.advance();
        this.emit(TokenType.DOT, '.', '.', startLine, startCol);
        return true;

      case '[':
        this.advance();
        this.emit(TokenType.OPEN_BRACKET, '[', '[', startLine, startCol);
        return true;

      case ']':
        this.advance();
        this.emit(TokenType.CLOSE_BRACKET, ']', ']', startLine, startCol);
        return true;

      case '(':
        this.advance();
        this.emit(TokenType.OPEN_PAREN, '(', '(', startLine, startCol);
        return true;

      case ')':
        this.advance();
        this.emit(TokenType.CLOSE_PAREN, ')', ')', startLine, startCol);
        return true;

      case '{':
        this.advance();
        this.emit(TokenType.OPEN_BRACE, '{', '{', startLine, startCol);
        return true;

      case '}':
        this.advance();
        this.emit(TokenType.CLOSE_BRACE, '}', '}', startLine, startCol);
        return true;

      case '+':
        this.advance();
        this.emit(TokenType.PLUS_SYM, '+', '+', startLine, startCol);
        return true;

      case '*':
        this.advance();
        this.emit(TokenType.STAR_SYM, '*', '*', startLine, startCol);
        return true;

      case '/':
        this.advance();
        this.emit(TokenType.SLASH_SYM, '/', '/', startLine, startCol);
        return true;

      case '%':
        this.advance();
        this.emit(TokenType.PERCENT_SYM, '%', '%', startLine, startCol);
        return true;

      case '?':
        if (next === '.') {
          this.advance();
          this.advance();
          this.emit(TokenType.QUESTION_DOT, '?.', '?.', startLine, startCol);
          return true;
        }
        return false;

      case '!':
        if (next === '=') {
          this.advance();
          this.advance();
          this.emit(TokenType.NOT_EQUALS_SYM, '!=', '!=', startLine, startCol);
          return true;
        }
        return false;

      case '=':
        if (next === '=') {
          this.advance();
          this.advance();
          this.emit(TokenType.DOUBLE_EQUALS, '==', '==', startLine, startCol);
          return true;
        }
        this.advance();
        this.emit(TokenType.EQUALS_SYM, '=', '=', startLine, startCol);
        return true;

      case '>':
        if (next === '=') {
          this.advance();
          this.advance();
          this.emit(TokenType.GTE_SYM, '>=', '>=', startLine, startCol);
          return true;
        }
        this.advance();
        this.emit(TokenType.GT_SYM, '>', '>', startLine, startCol);
        return true;

      case '<':
        if (next === '=') {
          this.advance();
          this.advance();
          this.emit(TokenType.LTE_SYM, '<=', '<=', startLine, startCol);
          return true;
        }
        this.advance();
        this.emit(TokenType.LT_SYM, '<', '<', startLine, startCol);
        return true;

      case '-':
        // Not a comment (handled earlier), treat as minus
        this.advance();
        this.emit(TokenType.MINUS_SYM, '-', '-', startLine, startCol);
        return true;

      default:
        return false;
    }
  }

  // ==========================================================================
  // Words (Keywords, Identifiers, Booleans, NOTHING)
  // ==========================================================================

  private readWord(): void {
    const startLine = this.line;
    const startCol = this.column;
    let word = '';

    while (this.pos < this.source.length && this.isIdentPart(this.source[this.pos])) {
      word += this.source[this.pos];
      this.advance();
    }

    // Check for underscore-connected keywords like NOT_EQUALS
    while (this.pos < this.source.length && this.source[this.pos] === '_' &&
           this.pos + 1 < this.source.length && this.isIdentPart(this.source[this.pos + 1])) {
      word += this.source[this.pos]; // underscore
      this.advance();
      while (this.pos < this.source.length && this.isIdentPart(this.source[this.pos])) {
        word += this.source[this.pos];
        this.advance();
      }
    }

    // Classify
    if (word === 'NOTHING') {
      this.emit(TokenType.LITERAL_NOTHING, word, word, startLine, startCol);
    } else if (isBooleanLiteral(word)) {
      this.emit(TokenType.LITERAL_BOOL, word, word, startLine, startCol);
    } else if (isKeyword(word)) {
      this.emit(TokenType.KEYWORD, word, word, startLine, startCol);
    } else {
      this.emit(TokenType.IDENTIFIER, word, word, startLine, startCol);
    }
  }
}

/**
 * Convenience function to tokenize VibeL source code.
 */
export function tokenize(source: string): Token[] {
  return new Lexer(source).tokenize();
}
