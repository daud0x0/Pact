// ============================================================================
// VibeL Error Types & Formatting
// Spec Reference: Section 28 — Error Reference
// ============================================================================

import { SourceLocation } from './lexer/tokens.js';

/** Error severity */
export type Severity = 'error' | 'warning';

/** A diagnostic produced by any compiler stage */
export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  location: SourceLocation;
  source?: string;     // source file path
  hint?: string;       // suggestion for fixing
}

// ============================================================================
// Error classes for each compiler stage
// ============================================================================

export class CompilerError extends Error {
  public readonly diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic[]) {
    const msg = diagnostics.map(d => formatDiagnostic(d)).join('\n');
    super(msg);
    this.name = 'CompilerError';
    this.diagnostics = diagnostics;
  }
}

// ============================================================================
// Compile-Time Error Codes (§28)
// ============================================================================

export const ErrorCodes = {
  // Compile-time
  E001: 'MissingIntentBlock',
  E002: 'SectionOutOfOrder',
  E003: 'UndeclaredEffect',
  E004: 'TypeMismatch',
  E005: 'ImplicitCoercion',
  E006: 'UnhandledMatchCase',
  E007: 'CircularDependency',
  E008: 'InvalidPriorUsage',
  E009: 'DefaultViolatesConstraint',
  E010: 'WritesToImmutableField',
  E011: 'MissingReturnPath',
  E012: 'MissingOnFailure',
  E013: 'UnknownImport',
  E014: 'InvalidModuleFilename',
  E015: 'DivisionWithoutRounding',

  // Runtime
  R001: 'TypeConstraintViolation',
  R002: 'PreconditionFailed',
  R003: 'PostconditionFailed',
  R004: 'InvariantViolated',
  R005: 'SystemInvariantViolated',
  R006: 'RollbackFailed',
  R007: 'ExternalCallFailed',
  R008: 'NothingDereference',

  // Warnings
  W001: 'MechanisticIntent',
  W002: 'AIEvaluatedConstraint',
  W003: 'UnprovenInvariant',
  W004: 'PossibleInfiniteLoop',
  W005: 'UnusedParameter',
  W006: 'EmptyConstrainString',
} as const;

// ============================================================================
// Formatting
// ============================================================================

/** ANSI color codes for terminal output */
const colors = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

/** Format a single diagnostic for terminal display */
export function formatDiagnostic(d: Diagnostic, sourceLines?: string[]): string {
  const severity = d.severity === 'error'
    ? `${colors.red}${colors.bold}error${colors.reset}`
    : `${colors.yellow}${colors.bold}warning${colors.reset}`;

  const location = `${colors.cyan}${d.source ?? '<input>'}:${d.location.line}:${d.location.column}${colors.reset}`;
  const code = `${colors.gray}[${d.code}]${colors.reset}`;

  let output = `${severity}${code}: ${d.message}\n  ${colors.gray}-->${colors.reset} ${location}`;

  // Show source line if available
  if (sourceLines && d.location.line <= sourceLines.length) {
    const lineNum = d.location.line;
    const line = sourceLines[lineNum - 1];
    const padding = String(lineNum).length;

    output += `\n${colors.gray}${' '.repeat(padding)} |${colors.reset}`;
    output += `\n${colors.gray}${lineNum} |${colors.reset} ${line}`;
    output += `\n${colors.gray}${' '.repeat(padding)} |${colors.reset} ${' '.repeat(d.location.column - 1)}${colors.red}^${colors.reset}`;
  }

  if (d.hint) {
    output += `\n  ${colors.cyan}hint${colors.reset}: ${d.hint}`;
  }

  return output;
}

/** Format all diagnostics */
export function formatDiagnostics(diagnostics: Diagnostic[], source?: string): string {
  const lines = source?.split('\n');
  return diagnostics.map(d => formatDiagnostic(d, lines)).join('\n\n');
}

/** Create an error diagnostic */
export function makeError(code: string, message: string, location: SourceLocation, hint?: string): Diagnostic {
  return { severity: 'error', code, message, location, hint };
}

/** Create a warning diagnostic */
export function makeWarning(code: string, message: string, location: SourceLocation, hint?: string): Diagnostic {
  return { severity: 'warning', code, message, location, hint };
}
