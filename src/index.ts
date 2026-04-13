// ============================================================================
// VibeL Public API
// ============================================================================

export { Lexer, tokenize, LexerError } from './lexer/lexer.js';
export { TokenType } from './lexer/tokens.js';
export type { Token, SourceLocation } from './lexer/tokens.js';
export { Parser, parse, ParseError } from './parser/parser.js';
export { SemanticAnalyzer, analyze } from './analyzer/analyzer.js';
export { formatDiagnostics, CompilerError, ErrorCodes } from './errors.js';
export type { Diagnostic } from './errors.js';
export * from './ast/nodes.js';

import { tokenize } from './lexer/lexer.js';
import { parse } from './parser/parser.js';
import { analyze } from './analyzer/analyzer.js';
import { Diagnostic, formatDiagnostics } from './errors.js';
import { Program } from './ast/nodes.js';

/** Result of compiling VibeL source */
export interface CompileResult {
  ast: Program;
  diagnostics: Diagnostic[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
  hasErrors: boolean;
}

/**
 * Full pipeline: source → tokens → AST → diagnostics
 */
export function compile(source: string): CompileResult {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const diagnostics = analyze(ast, source);

  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');

  return { ast, diagnostics, errors, warnings, hasErrors: errors.length > 0 };
}
