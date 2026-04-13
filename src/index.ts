// ============================================================================
// VibeL Public API
// ============================================================================

export { Lexer, tokenize, LexerError } from './lexer/lexer.js';
export { TokenType } from './lexer/tokens.js';
export type { Token, SourceLocation } from './lexer/tokens.js';
export { Parser, parse, ParseError } from './parser/parser.js';
export { SemanticAnalyzer, analyze } from './analyzer/analyzer.js';
export { compileSpec, specToString } from './spec/compiler.js';
export type { CompiledFunctionSpec, CompiledPredicate, RuntimeContext, PredicateResult } from './spec/compiler.js';
export { executeWithVerification, formatVerificationResult } from './spec/runtime.js';
export type { VerificationResult, ExecutionContext } from './spec/runtime.js';
export { formatDiagnostics, CompilerError, ErrorCodes } from './errors.js';
export type { Diagnostic } from './errors.js';
export * from './ast/nodes.js';

import { tokenize } from './lexer/lexer.js';
import { parse } from './parser/parser.js';
import { analyze } from './analyzer/analyzer.js';
import { compileSpec as compileSpecFn } from './spec/compiler.js';
import { Diagnostic, formatDiagnostics } from './errors.js';
import { Program, FunctionDef } from './ast/nodes.js';
import type { CompiledFunctionSpec } from './spec/compiler.js';

/** Result of compiling VibeL source */
export interface CompileResult {
  ast: Program;
  diagnostics: Diagnostic[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
  hasErrors: boolean;
  /** Compiled specs for each function (Phase 2) */
  specs: CompiledFunctionSpec[];
}

/**
 * Full pipeline: source → tokens → AST → diagnostics → compiled specs
 */
export function compile(source: string): CompileResult {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const diagnostics = analyze(ast, source);

  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');

  // Phase 2: Compile specs for all function definitions
  const specs: CompiledFunctionSpec[] = [];
  for (const def of ast.definitions) {
    if (def.kind === 'FunctionDef') {
      specs.push(compileSpecFn(def));
    }
  }

  return { ast, diagnostics, errors, warnings, hasErrors: errors.length > 0, specs };
}
