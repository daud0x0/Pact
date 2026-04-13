// ============================================================================
// VibeL Token Definitions
// Spec Reference: Section 3 — Lexical Structure
// ============================================================================

/** All token types emitted by the VibeL lexer */
export enum TokenType {
  // --- Structural ---
  KEYWORD = 'KEYWORD',
  IDENTIFIER = 'IDENTIFIER',

  // --- Literals ---
  LITERAL_INT = 'LITERAL_INT',
  LITERAL_DECIMAL = 'LITERAL_DECIMAL',
  LITERAL_STRING = 'LITERAL_STRING',
  LITERAL_BOOL = 'LITERAL_BOOL',
  LITERAL_NOTHING = 'LITERAL_NOTHING',

  // --- Indentation ---
  INDENT = 'INDENT',
  DEDENT = 'DEDENT',
  NEWLINE = 'NEWLINE',

  // --- Punctuation ---
  COLON = 'COLON',
  DOT = 'DOT',
  COMMA = 'COMMA',
  OPEN_BRACKET = 'OPEN_BRACKET',
  CLOSE_BRACKET = 'CLOSE_BRACKET',
  OPEN_PAREN = 'OPEN_PAREN',
  CLOSE_PAREN = 'CLOSE_PAREN',
  OPEN_BRACE = 'OPEN_BRACE',
  CLOSE_BRACE = 'CLOSE_BRACE',
  QUESTION_DOT = 'QUESTION_DOT',

  // --- Operators (symbolic, allowed in BODY blocks) ---
  PLUS_SYM = 'PLUS_SYM',          // +
  MINUS_SYM = 'MINUS_SYM',        // -
  STAR_SYM = 'STAR_SYM',          // *
  SLASH_SYM = 'SLASH_SYM',        // /
  PERCENT_SYM = 'PERCENT_SYM',    // %
  EQUALS_SYM = 'EQUALS_SYM',      // =
  DOUBLE_EQUALS = 'DOUBLE_EQUALS', // ==
  NOT_EQUALS_SYM = 'NOT_EQUALS_SYM', // !=
  GT_SYM = 'GT_SYM',              // >
  LT_SYM = 'LT_SYM',             // <
  GTE_SYM = 'GTE_SYM',            // >=
  LTE_SYM = 'LTE_SYM',            // <=

  // --- Special ---
  EOF = 'EOF',
}

/** Position in source file */
export interface SourceLocation {
  line: number;
  column: number;
}

/** A single token produced by the lexer */
export interface Token {
  type: TokenType;
  value: string;
  location: SourceLocation;
  /** The raw source text that produced this token */
  raw: string;
}

// ============================================================================
// Keyword Sets (Spec §3.1)
// ============================================================================

/** Structural keywords */
export const STRUCTURAL_KEYWORDS = new Set([
  'DEFINE', 'FUNCTION', 'MODULE', 'IMPORT', 'EXPORT', 'DATA', 'ENUM',
  'ALIAS', 'UNION', 'VARIANT', 'EXTERNAL', 'VALIDATOR', 'TYPE',
]);

/** Declaration keywords */
export const DECLARATION_KEYWORDS = new Set([
  'INTENT', 'RECEIVE', 'RETURN', 'READS', 'WRITES', 'CALLS', 'EMITS',
  'FIELDS', 'BASE', 'CONSTRAIN', 'NORMALIZE', 'CURRENCY', 'IMMUTABLE',
  'REQUIRED', 'OPTIONAL', 'DEFAULT', 'DERIVED', 'VALUES', 'SIDE_EFFECTS',
  'LATENCY', 'IDEMPOTENT', 'VALIDATE', 'APPLIES', 'CHECK', 'MESSAGE',
  'AI_VERIFICATION', 'PROVED',
]);

/** Spec keywords */
export const SPEC_KEYWORDS = new Set([
  'ENSURE', 'BEFORE', 'AFTER', 'INVARIANT', 'PRIOR', 'ALWAYS',
  'RETURN_VALUE', 'FAILURE_REASON', 'FAILURE_TYPE', 'SATISFY', 'SATISFIES',
]);

/** Control flow keywords */
export const CONTROL_FLOW_KEYWORDS = new Set([
  'BODY', 'IF', 'THEN', 'ELSE', 'END', 'MATCH', 'CASE', 'FOR', 'EACH',
  'IN', 'WHILE', 'BREAK', 'CONTINUE', 'RETURN', 'EXPLICIT', 'ROLLBACK',
  'RETRY', 'ABORT', 'LET', 'MUTABLE', 'ASSIGN', 'READ', 'WRITE',
  'APPEND', 'AS', 'AT', 'WITH', 'FROM', 'TO',
]);

/** Error handling keywords */
export const ERROR_HANDLING_KEYWORDS = new Set([
  'ON', 'FAILURE', 'SUCCESS', 'NOTIFY', 'REASON', 'ATTEMPT', 'FALLBACK',
  'RETAIN', 'ALL', 'AND', 'TRANSACTIONAL', 'REVERSIBLE',
]);

/** Operator keywords (used in spec blocks, also valid in BODY) */
export const OPERATOR_KEYWORDS = new Set([
  'AND', 'OR', 'NOT',
  'EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN',
  'GREATER_OR_EQUAL', 'LESS_OR_EQUAL',
  'PLUS', 'MINUS', 'TIMES', 'DIVIDED_BY', 'MOD',
  'IS', 'NOTHING', 'OTHERWISE',
  'CONTAINS', 'STARTS_WITH', 'ENDS_WITH',
  'LENGTH', 'OF', 'FIRST', 'LAST',
  'FILTER', 'MAP', 'SORT', 'SUM', 'MIN', 'MAX',
  'USING', 'WHERE', 'BY', 'ASCENDING', 'DESCENDING',
  'REMOVE',
]);

/** Built-in type names */
export const BUILTIN_TYPES = new Set([
  'Integer', 'Decimal', 'Text', 'Boolean', 'Nothing', 'Timestamp',
  'Duration', 'Bytes', 'List', 'Map', 'EITHER',
]);

/** Boolean literal keywords */
export const BOOLEAN_LITERALS = new Set(['TRUE', 'FALSE']);

/** Collection operations keywords */
export const COLLECTION_KEYWORDS = new Set([
  'CONCATENATE', 'SUBSTRING', 'LOWERCASE', 'UPPERCASE', 'TRIM',
  'ROUNDED', 'DECIMAL_PLACES', 'INTEGER',
  'CALL', 'MAKE', 'CAST', 'ASSERT', 'EMIT',
]);

/** All keywords combined for fast lookup */
export const ALL_KEYWORDS = new Set([
  ...STRUCTURAL_KEYWORDS,
  ...DECLARATION_KEYWORDS,
  ...SPEC_KEYWORDS,
  ...CONTROL_FLOW_KEYWORDS,
  ...ERROR_HANDLING_KEYWORDS,
  ...OPERATOR_KEYWORDS,
  ...COLLECTION_KEYWORDS,
  ...BOOLEAN_LITERALS,
  'NOTHING',
  'MODULE',
]);

/**
 * Check if a word is a VibeL keyword
 */
export function isKeyword(word: string): boolean {
  return ALL_KEYWORDS.has(word);
}

/**
 * Check if a word is a boolean literal
 */
export function isBooleanLiteral(word: string): boolean {
  return BOOLEAN_LITERALS.has(word);
}

/**
 * Identifier naming style (Spec §3.2)
 */
export enum IdentifierStyle {
  CAMEL_CASE = 'camelCase',       // variables, parameters, function names
  PASCAL_CASE = 'PascalCase',     // type names, module names
  SCREAMING_SNAKE = 'SCREAMING_SNAKE', // constants, enum values
}

/**
 * Detect the naming style of an identifier
 */
export function detectIdentifierStyle(name: string): IdentifierStyle | null {
  if (/^[A-Z][A-Z0-9_]*$/.test(name)) return IdentifierStyle.SCREAMING_SNAKE;
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return IdentifierStyle.PASCAL_CASE;
  if (/^[a-z][a-zA-Z0-9]*$/.test(name)) return IdentifierStyle.CAMEL_CASE;
  return null; // invalid style (e.g. snake_case)
}
