// ============================================================================
// VibeL Semantic Analyzer
// Spec Reference: Section 21.4, Section 28 — Error Reference
// ============================================================================

import {
  Program, FunctionDef, Definition, Statement, Expression,
  SpecExpression, LabeledSpecExpr,
  EffectBlock, TypeExpr,
} from '../ast/nodes.js';
import { Diagnostic, makeError, makeWarning } from '../errors.js';

/**
 * VibeL Semantic Analyzer
 *
 * Performs the following checks:
 * 1. Function structure validation (INTENT required, ON FAILURE required, etc.)
 * 2. Effect checking (BODY reads/writes/calls must match declarations)
 * 3. PRIOR() validity (only in ENSURE AFTER, only on declared fields)
 * 4. Completeness checking (all paths return/abort)
 * 5. INTENT quality (warns on mechanistic intents)
 * 6. Identifier style validation
 */
export class SemanticAnalyzer {
  private diagnostics: Diagnostic[] = [];
  private source?: string;

  constructor(source?: string) {
    this.source = source;
  }

  analyze(program: Program): Diagnostic[] {
    this.diagnostics = [];

    // Check module declaration
    this.checkModuleDecl(program);

    // Check all definitions
    for (const def of program.definitions) {
      switch (def.kind) {
        case 'FunctionDef':
          this.checkFunctionDef(def);
          break;
        case 'TypeDef':
          this.checkTypeDef(def);
          break;
        case 'DataDef':
          this.checkDataDef(def);
          break;
        case 'EnumDef':
          this.checkEnumDef(def);
          break;
        // Other definitions have minimal validation at this stage
      }
    }

    return this.diagnostics;
  }

  // ==========================================================================
  // Module Checks
  // ==========================================================================

  private checkModuleDecl(program: Program): void {
    if (!program.module.path.length) {
      this.diagnostics.push(
        makeError('E014', 'Module declaration must have a module path', program.module.location.start),
      );
    }
  }

  // ==========================================================================
  // Function Definition Checks
  // ==========================================================================

  private checkFunctionDef(fn: FunctionDef): void {
    // E001: Missing INTENT block
    if (!fn.intent || fn.intent.trim() === '') {
      this.diagnostics.push(
        makeError('E001', `Function '${fn.name}' is missing an INTENT block`, fn.location.start,
          'Every function must have an INTENT: "..." block that describes its purpose.'),
      );
    }

    // INTENT quality checks
    if (fn.intent) {
      this.checkIntentQuality(fn.name, fn.intent, fn.location.start);
    }

    // E012: Missing ON FAILURE
    if (fn.onFailure.length === 0) {
      this.diagnostics.push(
        makeError('E012', `Function '${fn.name}' has no ON FAILURE block`, fn.location.start,
          'Every function must declare what happens on failure.'),
      );
    }

    // Check effects — every READ/WRITE/CALL in BODY must be declared
    this.checkEffects(fn);

    // Check PRIOR() usage
    this.checkPriorUsage(fn);

    // E011: Check that all execution paths return or abort
    if (fn.body.length > 0) {
      this.checkReturnPaths(fn);
    }

    // W005: Check for unused parameters
    this.checkUnusedParams(fn);

    // Check ENSURE BEFORE doesn't reference PRIOR()
    for (const expr of fn.ensureBefore) {
      this.checkNoPriorInEnsureBefore(expr.expression, fn.name);
    }
  }

  // ==========================================================================
  // Intent Quality (§6)
  // ==========================================================================

  private checkIntentQuality(funcName: string, intent: string, loc: { line: number; column: number }): void {
    // W001: Check for mechanistic descriptions
    const mechanismWords = ['calls', 'invokes', 'sends request', 'queries', 'loops', 'iterates'];
    const lowerIntent = intent.toLowerCase();
    for (const word of mechanismWords) {
      if (lowerIntent.includes(word)) {
        this.diagnostics.push(
          makeWarning('W001',
            `INTENT for '${funcName}' appears to describe mechanism ("${word}") rather than purpose`,
            loc,
            'INTENT should describe WHY the function exists, not HOW it works.'),
        );
        break;
      }
    }

    // Check that intent ends with punctuation
    const trimmed = intent.trim();
    if (trimmed && !/[.!?]$/.test(trimmed)) {
      this.diagnostics.push(
        makeWarning('W001',
          `INTENT for '${funcName}' does not end with punctuation (., !, or ?)`,
          loc,
          'INTENT must be a complete sentence.'),
      );
    }

    // Check length
    if (trimmed.length > 200) {
      this.diagnostics.push(
        makeWarning('W001',
          `INTENT for '${funcName}' exceeds 200 characters (${trimmed.length})`,
          loc,
          'Keep INTENT descriptions concise — maximum 200 characters.'),
      );
    }
  }

  // ==========================================================================
  // Effect Checking (E003)
  // ==========================================================================

  private checkEffects(fn: FunctionDef): void {
    const declaredReads = new Set(fn.effects.reads.map(p => p.join('.')));
    const declaredWrites = new Set(fn.effects.writes.map(p => p.join('.')));
    const declaredCalls = new Set(fn.effects.calls.map(p => p.join('.')));

    // Walk the BODY to find all READ, WRITE, CALL operations
    const usedReads = new Set<string>();
    const usedWrites = new Set<string>();
    const usedCalls = new Set<string>();

    this.collectEffectsFromStatements(fn.body, usedReads, usedWrites, usedCalls);

    // Also check ON FAILURE and ON SUCCESS
    this.collectEffectsFromStatements(fn.onFailure, usedReads, usedWrites, usedCalls);
    this.collectEffectsFromStatements(fn.onSuccess, usedReads, usedWrites, usedCalls);

    // Check: every used read is declared
    for (const read of usedReads) {
      if (!declaredReads.has(read)) {
        this.diagnostics.push(
          makeError('E003',
            `Function '${fn.name}' reads '${read}' but does not declare it in READS`,
            fn.location.start,
            `Add '${read}' to the READS section.`),
        );
      }
    }

    // Check: every used write is declared
    for (const write of usedWrites) {
      if (!declaredWrites.has(write)) {
        this.diagnostics.push(
          makeError('E003',
            `Function '${fn.name}' writes '${write}' but does not declare it in WRITES`,
            fn.location.start,
            `Add '${write}' to the WRITES section.`),
        );
      }
    }

    // Check: every used call is declared
    for (const call of usedCalls) {
      // Skip internal/builtin calls
      if (call.startsWith('__') || isBuiltinFunction(call)) continue;
      if (!declaredCalls.has(call)) {
        this.diagnostics.push(
          makeError('E003',
            `Function '${fn.name}' calls '${call}' but does not declare it in CALLS`,
            fn.location.start,
            `Add '${call}' to the CALLS section.`),
        );
      }
    }
  }

  private collectEffectsFromStatements(
    stmts: Statement[],
    reads: Set<string>,
    writes: Set<string>,
    calls: Set<string>,
  ): void {
    for (const stmt of stmts) {
      this.collectEffectsFromStatement(stmt, reads, writes, calls);
    }
  }

  private collectEffectsFromStatement(
    stmt: Statement,
    reads: Set<string>,
    writes: Set<string>,
    calls: Set<string>,
  ): void {
    switch (stmt.kind) {
      case 'WriteStmt':
        writes.add(stmt.target.join('.'));
        this.collectEffectsFromExpression(stmt.value, reads, writes, calls);
        break;
      case 'CallStmt':
        calls.add(stmt.target.join('.'));
        for (const arg of stmt.args) {
          this.collectEffectsFromExpression(arg.value, reads, writes, calls);
        }
        break;
      case 'LetStmt':
        this.collectEffectsFromExpression(stmt.value, reads, writes, calls);
        break;
      case 'AssignStmt':
        this.collectEffectsFromExpression(stmt.value, reads, writes, calls);
        break;
      case 'ReturnStmt':
        this.collectEffectsFromExpression(stmt.value, reads, writes, calls);
        break;
      case 'AbortStmt':
        this.collectEffectsFromExpression(stmt.reason, reads, writes, calls);
        break;
      case 'IfStmt':
        this.collectEffectsFromExpression(stmt.condition, reads, writes, calls);
        this.collectEffectsFromStatements(stmt.thenBlock, reads, writes, calls);
        for (const elif of stmt.elseIfClauses) {
          this.collectEffectsFromExpression(elif.condition, reads, writes, calls);
          this.collectEffectsFromStatements(elif.body, reads, writes, calls);
        }
        this.collectEffectsFromStatements(stmt.elseBlock, reads, writes, calls);
        break;
      case 'MatchStmt':
        this.collectEffectsFromExpression(stmt.subject, reads, writes, calls);
        for (const c of stmt.cases) {
          this.collectEffectsFromStatements(c.body, reads, writes, calls);
        }
        if (stmt.wildcard) {
          this.collectEffectsFromStatements(stmt.wildcard, reads, writes, calls);
        }
        break;
      case 'ForStmt':
        this.collectEffectsFromExpression(stmt.collection, reads, writes, calls);
        this.collectEffectsFromStatements(stmt.body, reads, writes, calls);
        break;
      case 'WhileStmt':
        this.collectEffectsFromExpression(stmt.condition, reads, writes, calls);
        this.collectEffectsFromStatements(stmt.body, reads, writes, calls);
        break;
      case 'NotifyStmt':
        this.collectEffectsFromExpression(stmt.message, reads, writes, calls);
        break;
      case 'EmitStmt':
        this.collectEffectsFromExpression(stmt.data, reads, writes, calls);
        break;
    }
  }

  private collectEffectsFromExpression(
    expr: Expression,
    reads: Set<string>,
    writes: Set<string>,
    calls: Set<string>,
  ): void {
    switch (expr.kind) {
      case 'ReadExpr':
        reads.add(expr.field.join('.'));
        break;
      case 'FunctionCallExpr':
        if (!isBuiltinFunction(expr.name)) {
          calls.add(expr.name);
        }
        for (const arg of expr.args) {
          this.collectEffectsFromExpression(arg.value, reads, writes, calls);
        }
        break;
      case 'BinaryExpr':
        this.collectEffectsFromExpression(expr.left, reads, writes, calls);
        this.collectEffectsFromExpression(expr.right, reads, writes, calls);
        break;
      case 'UnaryExpr':
        this.collectEffectsFromExpression(expr.operand, reads, writes, calls);
        break;
      case 'MakeExpr':
        this.collectEffectsFromExpression(expr.source, reads, writes, calls);
        break;
      case 'CastExpr':
        this.collectEffectsFromExpression(expr.value, reads, writes, calls);
        break;
      case 'ListLiteralExpr':
        for (const el of expr.elements) {
          this.collectEffectsFromExpression(el, reads, writes, calls);
        }
        break;
      case 'RecordLiteralExpr':
        for (const f of expr.fields) {
          this.collectEffectsFromExpression(f.value, reads, writes, calls);
        }
        break;
    }
  }

  // ==========================================================================
  // PRIOR() Checking (E008)
  // ==========================================================================

  private checkPriorUsage(fn: FunctionDef): void {
    const declaredFields = new Set([
      ...fn.effects.reads.map(p => p.join('.')),
      ...fn.effects.writes.map(p => p.join('.')),
    ]);

    // Check ENSURE AFTER and INVARIANT for valid PRIOR() references
    for (const expr of fn.ensureAfter) {
      this.checkPriorFields(expr, declaredFields, fn.name);
    }
    for (const expr of fn.invariants) {
      this.checkPriorFields(expr, declaredFields, fn.name);
    }
  }

  private checkPriorFields(expr: SpecExpression, declaredFields: Set<string>, funcName: string): void {
    switch (expr.kind) {
      case 'SpecPrior': {
        const field = expr.field.join('.');
        if (!declaredFields.has(field)) {
          this.diagnostics.push(
            makeError('E008',
              `PRIOR(${field}) references a field not declared in READS or WRITES of '${funcName}'`,
              expr.location.start,
              `Declare '${field}' in READS or WRITES.`),
          );
        }
        break;
      }
      case 'SpecComparison':
        this.checkPriorFields(expr.left, declaredFields, funcName);
        this.checkPriorFields(expr.right, declaredFields, funcName);
        break;
      case 'SpecBinary':
        this.checkPriorFields(expr.left, declaredFields, funcName);
        this.checkPriorFields(expr.right, declaredFields, funcName);
        break;
      case 'SpecArithmetic':
        this.checkPriorFields(expr.left, declaredFields, funcName);
        this.checkPriorFields(expr.right, declaredFields, funcName);
        break;
      case 'SpecNot':
        this.checkPriorFields(expr.operand, declaredFields, funcName);
        break;
      case 'SpecIsNothing':
        this.checkPriorFields(expr.field, declaredFields, funcName);
        break;
      case 'SpecContains':
        this.checkPriorFields(expr.collection, declaredFields, funcName);
        this.checkPriorFields(expr.value, declaredFields, funcName);
        break;
      case 'SpecLength':
        this.checkPriorFields(expr.collection, declaredFields, funcName);
        break;
    }
  }

  private checkNoPriorInEnsureBefore(expr: SpecExpression, funcName: string): void {
    switch (expr.kind) {
      case 'SpecPrior':
        this.diagnostics.push(
          makeError('E008',
            `PRIOR() cannot be used in ENSURE BEFORE of '${funcName}' — execution hasn't started yet`,
            expr.location.start,
            'PRIOR() is only available in ENSURE AFTER and INVARIANT blocks.'),
        );
        break;
      case 'SpecComparison':
        this.checkNoPriorInEnsureBefore(expr.left, funcName);
        this.checkNoPriorInEnsureBefore(expr.right, funcName);
        break;
      case 'SpecBinary':
        this.checkNoPriorInEnsureBefore(expr.left, funcName);
        this.checkNoPriorInEnsureBefore(expr.right, funcName);
        break;
      case 'SpecArithmetic':
        this.checkNoPriorInEnsureBefore(expr.left, funcName);
        this.checkNoPriorInEnsureBefore(expr.right, funcName);
        break;
      case 'SpecNot':
        this.checkNoPriorInEnsureBefore(expr.operand, funcName);
        break;
    }
  }

  // ==========================================================================
  // Return Path Completeness (E011)
  // ==========================================================================

  private checkReturnPaths(fn: FunctionDef): void {
    if (!this.statementsAlwaysTerminate(fn.body)) {
      this.diagnostics.push(
        makeError('E011',
          `Not all execution paths in '${fn.name}' end with RETURN EXPLICIT, ABORT, or ROLLBACK`,
          fn.location.start,
          'Ensure every code path returns a value, aborts, or rolls back.'),
      );
    }
  }

  private statementsAlwaysTerminate(stmts: Statement[]): boolean {
    if (stmts.length === 0) return false;

    for (const stmt of stmts) {
      if (stmt.kind === 'ReturnStmt' || stmt.kind === 'AbortStmt') return true;
      if (stmt.kind === 'RollbackStmt' && stmt.andAbort) return true;

      if (stmt.kind === 'IfStmt') {
        const thenTerminates = this.statementsAlwaysTerminate(stmt.thenBlock);
        const elseTerminates = stmt.elseBlock.length > 0 && this.statementsAlwaysTerminate(stmt.elseBlock);
        const allElseIfsTerminate = stmt.elseIfClauses.every(c => this.statementsAlwaysTerminate(c.body));

        if (thenTerminates && elseTerminates && allElseIfsTerminate) return true;
      }

      if (stmt.kind === 'MatchStmt') {
        const allCasesTerminate = stmt.cases.every(c => this.statementsAlwaysTerminate(c.body));
        const wildcardTerminates = !stmt.wildcard || this.statementsAlwaysTerminate(stmt.wildcard);
        if (allCasesTerminate && wildcardTerminates) return true;
      }
    }

    return false;
  }

  // ==========================================================================
  // Unused Parameter Check (W005)
  // ==========================================================================

  private checkUnusedParams(fn: FunctionDef): void {
    const paramNames = new Set(fn.parameters.map(p => p.name));
    const usedNames = new Set<string>();

    // Collect all identifier references in the BODY
    for (const stmt of fn.body) {
      this.collectIdentifiers(stmt, usedNames);
    }

    // Also check ensures, on failure, on success
    for (const expr of fn.ensureBefore) {
      this.collectSpecIdentifiers(expr.expression, usedNames);
    }
    for (const expr of fn.ensureAfter) {
      this.collectSpecIdentifiers(expr, usedNames);
    }

    for (const name of paramNames) {
      if (!usedNames.has(name)) {
        this.diagnostics.push(
          makeWarning('W005',
            `Parameter '${name}' in function '${fn.name}' is never referenced`,
            fn.location.start),
        );
      }
    }
  }

  private collectIdentifiers(stmt: Statement, names: Set<string>): void {
    switch (stmt.kind) {
      case 'LetStmt':
        this.collectExprIdentifiers(stmt.value, names);
        break;
      case 'AssignStmt':
        names.add(stmt.target);
        this.collectExprIdentifiers(stmt.value, names);
        break;
      case 'WriteStmt':
        this.collectExprIdentifiers(stmt.value, names);
        break;
      case 'CallStmt':
        for (const arg of stmt.args) {
          this.collectExprIdentifiers(arg.value, names);
        }
        break;
      case 'ReturnStmt':
        this.collectExprIdentifiers(stmt.value, names);
        break;
      case 'AbortStmt':
        this.collectExprIdentifiers(stmt.reason, names);
        break;
      case 'IfStmt':
        this.collectExprIdentifiers(stmt.condition, names);
        for (const s of stmt.thenBlock) this.collectIdentifiers(s, names);
        for (const c of stmt.elseIfClauses) {
          this.collectExprIdentifiers(c.condition, names);
          for (const s of c.body) this.collectIdentifiers(s, names);
        }
        for (const s of stmt.elseBlock) this.collectIdentifiers(s, names);
        break;
      case 'MatchStmt':
        this.collectExprIdentifiers(stmt.subject, names);
        for (const c of stmt.cases) {
          for (const s of c.body) this.collectIdentifiers(s, names);
        }
        break;
      case 'ForStmt':
        this.collectExprIdentifiers(stmt.collection, names);
        for (const s of stmt.body) this.collectIdentifiers(s, names);
        break;
      case 'WhileStmt':
        this.collectExprIdentifiers(stmt.condition, names);
        for (const s of stmt.body) this.collectIdentifiers(s, names);
        break;
    }
  }

  private collectExprIdentifiers(expr: Expression, names: Set<string>): void {
    switch (expr.kind) {
      case 'IdentifierExpr':
        names.add(expr.name);
        break;
      case 'FieldAccessExpr':
        if (expr.path.length > 0) names.add(expr.path[0]);
        break;
      case 'BinaryExpr':
        this.collectExprIdentifiers(expr.left, names);
        this.collectExprIdentifiers(expr.right, names);
        break;
      case 'UnaryExpr':
        this.collectExprIdentifiers(expr.operand, names);
        break;
      case 'FunctionCallExpr':
        for (const arg of expr.args) {
          this.collectExprIdentifiers(arg.value, names);
        }
        break;
      case 'ReadExpr':
        // Read fields don't count as parameter usage
        break;
      case 'MakeExpr':
        this.collectExprIdentifiers(expr.source, names);
        break;
      case 'RecordLiteralExpr':
        for (const f of expr.fields) {
          this.collectExprIdentifiers(f.value, names);
        }
        break;
      case 'ListLiteralExpr':
        for (const el of expr.elements) {
          this.collectExprIdentifiers(el, names);
        }
        break;
    }
  }

  private collectSpecIdentifiers(expr: SpecExpression, names: Set<string>): void {
    switch (expr.kind) {
      case 'SpecFieldRef':
        if (expr.path.length > 0) names.add(expr.path[0]);
        break;
      case 'SpecComparison':
        this.collectSpecIdentifiers(expr.left, names);
        this.collectSpecIdentifiers(expr.right, names);
        break;
      case 'SpecBinary':
        this.collectSpecIdentifiers(expr.left, names);
        this.collectSpecIdentifiers(expr.right, names);
        break;
      case 'SpecArithmetic':
        this.collectSpecIdentifiers(expr.left, names);
        this.collectSpecIdentifiers(expr.right, names);
        break;
      case 'SpecNot':
        this.collectSpecIdentifiers(expr.operand, names);
        break;
    }
  }

  // ==========================================================================
  // Type & Data Definition Checks
  // ==========================================================================

  private checkTypeDef(def: { kind: 'TypeDef'; name: string; baseType: string; constraints: string[]; location: any }): void {
    if (!def.baseType) {
      this.diagnostics.push(
        makeError('E004',
          `Type '${def.name}' is missing a BASE type declaration`,
          def.location.start),
      );
    }

    // W006: Empty constraints
    for (const c of def.constraints) {
      if (!c || c.trim() === '') {
        this.diagnostics.push(
          makeWarning('W006',
            `Type '${def.name}' has an empty CONSTRAIN string`,
            def.location.start),
        );
      }
    }
  }

  private checkDataDef(def: { kind: 'DataDef'; name: string; fields: any[]; location: any }): void {
    if (def.fields.length === 0) {
      this.diagnostics.push(
        makeWarning('W006',
          `Data definition '${def.name}' has no fields`,
          def.location.start),
      );
    }
  }

  private checkEnumDef(def: { kind: 'EnumDef'; name: string; values: string[]; defaultValue?: string; location: any }): void {
    if (def.values.length === 0) {
      this.diagnostics.push(
        makeError('E004',
          `Enum '${def.name}' has no values`,
          def.location.start),
      );
    }

    // E009: Check that default value is in the values list
    if (def.defaultValue && !def.values.includes(def.defaultValue)) {
      this.diagnostics.push(
        makeError('E009',
          `Enum '${def.name}' default value '${def.defaultValue}' is not in the values list`,
          def.location.start),
      );
    }
  }
}

// ==========================================================================
// Helpers
// ==========================================================================

const BUILTIN_FUNCTIONS = new Set([
  'NOW', 'TODAY', 'UUID', 'HASH', 'ENCRYPT', 'DECRYPT',
  'ROUND', 'ABS', 'FLOOR', 'CEILING', 'MIN', 'MAX',
  'FORMAT', 'PARSE_INTEGER', 'PARSE_DECIMAL',
  'IS_VALID_EMAIL', 'IS_VALID_URL', 'IS_VALID_UUID',
  'IS_VALID_PHONE', 'IS_VALID_ISO_DATE', 'IS_VALID_CURRENCY',
]);

function isBuiltinFunction(name: string): boolean {
  return BUILTIN_FUNCTIONS.has(name);
}

/**
 * Convenience function to analyze a VibeL program.
 */
export function analyze(program: Program, source?: string): Diagnostic[] {
  return new SemanticAnalyzer(source).analyze(program);
}
