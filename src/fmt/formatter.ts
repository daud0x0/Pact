// ============================================================================
// VibeL Formatter — vibelang fmt
// Spec Reference: §24.5
//
// VibeL has exactly one valid formatting. The formatter enforces it:
// - 2-space indentation
// - Blank lines between top-level definitions
// - Consistent keyword casing (SCREAMING_SNAKE)
// - Aligned colons in section headers
// - Trailing newline
// ============================================================================

import {
  Program, Definition, FunctionDef, TypeDef, DataDef, EnumDef,
  UnionDef, AliasDef, ExternalDef, ValidatorDef,
  Statement, Expression, TypeExpr, SpecExpression,
  LabeledSpecExpr,
} from '../ast/nodes.js';

// ============================================================================
// Formatter Entry Point
// ============================================================================

export function formatVbl(ast: Program): string {
  const fmt = new VblFormatter();
  return fmt.format(ast);
}

/**
 * Check if source is already formatted. Returns null if formatted,
 * or the correctly formatted version if not.
 */
export function checkFormatting(ast: Program, source: string): string | null {
  const formatted = formatVbl(ast);
  // Normalize trailing whitespace for comparison
  const normalizedSource = source.replace(/[ \t]+$/gm, '').replace(/\n+$/, '\n');
  const normalizedFormatted = formatted.replace(/[ \t]+$/gm, '').replace(/\n+$/, '\n');

  if (normalizedSource === normalizedFormatted) return null;
  return formatted;
}

// ============================================================================
// Internal Formatter
// ============================================================================

class VblFormatter {
  private indent: number = 0;
  private lines: string[] = [];

  format(ast: Program): string {
    this.lines = [];

    // MODULE declaration
    this.emit(`MODULE ${ast.module.path.join('.')}`);

    // IMPORT statements
    if (ast.imports.length > 0) {
      this.emit('');
      for (const imp of ast.imports) {
        this.emit(`IMPORT ${imp.path.join('.')} AS ${imp.alias}`);
      }
    }

    // Definitions
    for (const def of ast.definitions) {
      this.emit('');
      this.emitDefinition(def);
    }

    // Ensure trailing newline
    this.emit('');

    return this.lines.join('\n');
  }

  // ==========================================================================
  // Definitions
  // ==========================================================================

  private emitDefinition(def: Definition): void {
    switch (def.kind) {
      case 'FunctionDef': this.emitFunction(def); break;
      case 'TypeDef': this.emitType(def); break;
      case 'DataDef': this.emitData(def); break;
      case 'EnumDef': this.emitEnum(def); break;
      case 'UnionDef': this.emitUnion(def); break;
      case 'AliasDef': this.emitAlias(def); break;
      case 'ExternalDef': this.emitExternal(def); break;
      case 'ValidatorDef': this.emitValidator(def); break;
    }
  }

  // ==========================================================================
  // Function Definition
  // ==========================================================================

  private emitFunction(fn: FunctionDef): void {
    const prefix = fn.exported ? 'EXPORT FUNCTION' : 'DEFINE FUNCTION';
    this.emit(`${prefix} ${fn.name}`);
    this.indent++;

    // INTENT
    this.emit(`INTENT: "${fn.intent}"`);

    // READS
    if (fn.effects.reads.length > 0) {
      this.emit('');
      this.emit('READS:');
      this.indent++;
      for (const path of fn.effects.reads) {
        this.emit(path.join('.'));
      }
      this.indent--;
    }

    // WRITES
    if (fn.effects.writes.length > 0) {
      this.emit('');
      this.emit('WRITES:');
      this.indent++;
      for (const path of fn.effects.writes) {
        this.emit(path.join('.'));
      }
      this.indent--;
    }

    // CALLS
    if (fn.effects.calls.length > 0) {
      this.emit('');
      this.emit('CALLS:');
      this.indent++;
      for (const path of fn.effects.calls) {
        this.emit(path.join('.'));
      }
      this.indent--;
    }

    // RECEIVE
    if (fn.parameters.length > 0) {
      this.emit('');
      this.emit('RECEIVE:');
      this.indent++;
      for (const param of fn.parameters) {
        let line = `${param.name} AS ${this.formatType(param.paramType)}`;
        for (const c of param.constraints) {
          line += ` CONSTRAIN: "${c}"`;
        }
        this.emit(line);
      }
      this.indent--;
    }

    // RETURN
    if (fn.returnType.kind !== 'SimpleType' || fn.returnType.name !== 'Nothing') {
      this.emit('');
      this.emit(`RETURN: ${this.formatType(fn.returnType)}`);
    }

    // ENSURE BEFORE
    if (fn.ensureBefore.length > 0) {
      this.emit('');
      this.emit('ENSURE BEFORE:');
      this.indent++;
      for (const spec of fn.ensureBefore) {
        if (spec.label) {
          this.emit(`[${spec.label}] ${this.formatSpec(spec.expression)}`);
        } else {
          this.emit(this.formatSpec(spec.expression));
        }
      }
      this.indent--;
    }

    // ENSURE AFTER
    if (fn.ensureAfter.length > 0) {
      this.emit('');
      this.emit('ENSURE AFTER:');
      this.indent++;
      for (const spec of fn.ensureAfter) {
        this.emit(this.formatSpec(spec));
      }
      this.indent--;
    }

    // INVARIANT
    if (fn.invariants.length > 0) {
      this.emit('');
      this.emit('INVARIANT:');
      this.indent++;
      for (const spec of fn.invariants) {
        this.emit(this.formatSpec(spec));
      }
      this.indent--;
    }

    // ON FAILURE
    this.emit('');
    this.emit('ON FAILURE:');
    this.indent++;
    for (const stmt of fn.onFailure) {
      this.emitStatement(stmt);
    }
    this.indent--;

    // ON SUCCESS
    if (fn.onSuccess.length > 0) {
      this.emit('');
      this.emit('ON SUCCESS:');
      this.indent++;
      for (const stmt of fn.onSuccess) {
        this.emitStatement(stmt);
      }
      this.indent--;
    }

    // BODY
    this.emit('');
    this.emit('BODY:');
    this.indent++;
    for (const stmt of fn.body) {
      this.emitStatement(stmt);
    }
    this.indent--;

    this.indent--;
  }

  // ==========================================================================
  // Statements
  // ==========================================================================

  private emitStatement(stmt: Statement): void {
    switch (stmt.kind) {
      case 'LetStmt': {
        const kw = stmt.mutable ? 'LET MUTABLE' : 'LET';
        this.emit(`${kw} ${stmt.name} = ${this.formatExpr(stmt.value)}`);
        break;
      }
      case 'AssignStmt':
        this.emit(`${stmt.target} ASSIGN ${this.formatExpr(stmt.value)}`);
        break;
      case 'WriteStmt': {
        const target = stmt.target.join('.');
        if (stmt.mode === 'APPEND') {
          this.emit(`WRITE ${target} APPEND ${this.formatExpr(stmt.value)}`);
        } else {
          this.emit(`WRITE ${target} AS ${this.formatExpr(stmt.value)}`);
        }
        break;
      }
      case 'CallStmt': {
        const target = stmt.target.join('.');
        if (stmt.args.length === 0) {
          if (stmt.resultBinding) {
            this.emit(`LET ${stmt.resultBinding} = CALL ${target}`);
          } else {
            this.emit(`CALL ${target}`);
          }
        } else {
          if (stmt.resultBinding) {
            this.emit(`LET ${stmt.resultBinding} = CALL ${target}`);
          } else {
            this.emit(`CALL ${target}`);
          }
          this.indent++;
          for (const arg of stmt.args) {
            this.emit(`WITH ${arg.name}: ${this.formatExpr(arg.value)}`);
          }
          this.indent--;
        }
        break;
      }
      case 'ReturnStmt':
        this.emit(`RETURN EXPLICIT ${this.formatExpr(stmt.value)}`);
        break;
      case 'AbortStmt':
        this.emit(`ABORT WITH REASON: ${this.formatExpr(stmt.reason)}`);
        break;
      case 'RollbackStmt':
        if (stmt.andAbort && stmt.reason) {
          this.emit(`ROLLBACK AND ABORT WITH REASON: ${this.formatExpr(stmt.reason)}`);
        } else {
          this.emit('ROLLBACK ALL WRITES');
        }
        break;
      case 'IfStmt': {
        this.emit(`IF ${this.formatExpr(stmt.condition)} THEN`);
        this.indent++;
        for (const s of stmt.thenBlock) this.emitStatement(s);
        this.indent--;
        for (const clause of stmt.elseIfClauses) {
          this.emit(`ELSE IF ${this.formatExpr(clause.condition)} THEN`);
          this.indent++;
          for (const s of clause.body) this.emitStatement(s);
          this.indent--;
        }
        if (stmt.elseBlock.length > 0) {
          this.emit('ELSE');
          this.indent++;
          for (const s of stmt.elseBlock) this.emitStatement(s);
          this.indent--;
        }
        this.emit('END IF');
        break;
      }
      case 'MatchStmt': {
        this.emit(`MATCH ${this.formatExpr(stmt.subject)}`);
        this.indent++;
        for (const c of stmt.cases) {
          const binding = c.binding ? ` AS ${c.binding}` : '';
          this.emit(`CASE ${c.pattern}${binding} THEN`);
          this.indent++;
          for (const s of c.body) this.emitStatement(s);
          this.indent--;
        }
        this.indent--;
        this.emit('END MATCH');
        break;
      }
      case 'ForStmt': {
        const collection = this.formatExpr(stmt.collection);
        if (stmt.indexVariable) {
          this.emit(`FOR EACH ${stmt.variable} AT ${stmt.indexVariable} IN ${collection}`);
        } else {
          this.emit(`FOR EACH ${stmt.variable} IN ${collection}`);
        }
        this.indent++;
        for (const s of stmt.body) this.emitStatement(s);
        this.indent--;
        this.emit('END FOR');
        break;
      }
      case 'WhileStmt':
        this.emit(`WHILE ${this.formatExpr(stmt.condition)}`);
        this.indent++;
        for (const s of stmt.body) this.emitStatement(s);
        this.indent--;
        this.emit('END WHILE');
        break;
      case 'NotifyStmt':
        this.emit(`NOTIFY ${stmt.target.join('.')} WITH ${this.formatExpr(stmt.message)}`);
        break;
      case 'EmitStmt':
        this.emit(`EMIT ${stmt.event.join('.')} WITH ${this.formatExpr(stmt.data)}`);
        break;
      case 'AssertStmt':
        this.emit(`ASSERT ${this.formatExpr(stmt.condition)} OTHERWISE ${this.formatExpr(stmt.reason)}`);
        break;
    }
  }

  // ==========================================================================
  // Expressions
  // ==========================================================================

  private formatExpr(expr: Expression): string {
    switch (expr.kind) {
      case 'LiteralExpr':
        if (expr.literalType === 'Text') return `"${expr.value}"`;
        if (expr.literalType === 'Nothing') return 'NOTHING';
        if (expr.literalType === 'Boolean') return expr.value ? 'TRUE' : 'FALSE';
        return String(expr.value);
      case 'IdentifierExpr':
        return expr.name;
      case 'FieldAccessExpr':
        return expr.path.join('.');
      case 'BinaryExpr':
        return `${this.formatExpr(expr.left)} ${expr.operator} ${this.formatExpr(expr.right)}`;
      case 'UnaryExpr':
        return `${expr.operator} ${this.formatExpr(expr.operand)}`;
      case 'ReadExpr':
        return `READ ${expr.field.join('.')}`;
      case 'RecordLiteralExpr': {
        const fields = expr.fields.map(f => `${f.name}: ${this.formatExpr(f.value)}`).join(',\n' + '  '.repeat(this.indent + 1));
        return `{\n${'  '.repeat(this.indent + 1)}${fields}\n${'  '.repeat(this.indent)}}`;
      }
      case 'ListLiteralExpr':
        return `[${expr.elements.map(e => this.formatExpr(e)).join(', ')}]`;
      case 'MakeExpr':
        return `MAKE ${expr.typeName} FROM ${this.formatExpr(expr.source)}`;
      case 'FunctionCallExpr': {
        if (expr.args.length === 0) return `${expr.name}()`;
        const args = expr.args.map(a => `${a.name}: ${this.formatExpr(a.value)}`).join(', ');
        return `${expr.name}(${args})`;
      }
      case 'PriorExpr':
        return `PRIOR(${expr.field.join('.')})`;
      case 'SafeAccessExpr':
        return `${this.formatExpr(expr.base)}?.${expr.field}`;
      case 'OtherwiseExpr':
        return `${this.formatExpr(expr.value)} OTHERWISE ${this.formatExpr(expr.fallback)}`;
      case 'CastExpr':
        return `${this.formatExpr(expr.value)} AS ${expr.targetType}`;
      default:
        return `<${(expr as any).kind}>`;
    }
  }

  // ==========================================================================
  // Spec Expressions
  // ==========================================================================

  private formatSpec(expr: SpecExpression): string {
    switch (expr.kind) {
      case 'SpecComparison':
        return `${this.formatSpec(expr.left)} ${expr.operator} ${this.formatSpec(expr.right)}`;
      case 'SpecBinary':
        return `${this.formatSpec(expr.left)} ${expr.operator} ${this.formatSpec(expr.right)}`;
      case 'SpecNot':
        return `NOT ${this.formatSpec(expr.operand)}`;
      case 'SpecIsNothing': {
        const field = this.formatSpec(expr.field);
        return expr.negated ? `${field} IS NOT NOTHING` : `${field} IS NOTHING`;
      }
      case 'SpecContains':
        return `${this.formatSpec(expr.collection)} CONTAINS ${this.formatSpec(expr.value)}`;
      case 'SpecLength':
        return `LENGTH OF ${this.formatSpec(expr.collection)}`;
      case 'SpecIn': {
        const field = this.formatSpec(expr.field);
        const vals = expr.values.map(v => this.formatExpr(v)).join(', ');
        return expr.negated ? `${field} NOT IN [${vals}]` : `${field} IN [${vals}]`;
      }
      case 'SpecFieldRef':
        return expr.path.join('.');
      case 'SpecReturnValue':
        return 'RETURN_VALUE';
      case 'SpecPrior':
        return `PRIOR(${expr.field.join('.')})`;
      case 'SpecArithmetic': {
        return `${this.formatSpec(expr.left)} ${expr.operator} ${this.formatSpec(expr.right)}`;
      }
      case 'SpecConditional': {
        const cond = this.formatSpec(expr.condition);
        const body = expr.body.map(b => this.formatSpec(b)).join('\n' + '  '.repeat(this.indent + 1));
        return `IF ${cond} THEN\n${'  '.repeat(this.indent + 1)}${body}`;
      }
      case 'SpecQuantifier': {
        return `${expr.quantifier} ${expr.variable} IN ${this.formatSpec(expr.collection)} SATISFIES ${this.formatSpec(expr.condition)}`;
      }
      default:
        return `<${(expr as any).kind}>`;
    }
  }

  // ==========================================================================
  // Type Expressions
  // ==========================================================================

  private formatType(type: TypeExpr): string {
    switch (type.kind) {
      case 'SimpleType': return type.name;
      case 'OptionalType': return `OPTIONAL ${this.formatType(type.inner)}`;
      case 'ListType': return `List OF ${this.formatType(type.elementType)}`;
      case 'MapType': return `Map OF ${this.formatType(type.keyType)} TO ${this.formatType(type.valueType)}`;
      case 'EitherType': return `EITHER ${this.formatType(type.left)} OR ${this.formatType(type.right)}`;
      default: return 'Unknown';
    }
  }

  // ==========================================================================
  // Type Definitions
  // ==========================================================================

  private emitType(def: TypeDef): void {
    this.emit(`DEFINE TYPE ${def.name}`);
    this.indent++;
    this.emit(`BASE: ${def.baseType}`);
    for (const c of def.constraints) {
      this.emit(`CONSTRAIN: "${c}"`);
    }
    if (def.normalize) {
      this.emit(`NORMALIZE: ${def.normalize}`);
    }
    this.indent--;
  }

  private emitData(def: DataDef): void {
    this.emit(`DEFINE DATA ${def.name}`);
    this.indent++;
    this.emit('FIELDS:');
    this.indent++;
    for (const f of def.fields) {
      const req = f.required ? ' REQUIRED' : '';
      this.emit(`${f.name} AS ${this.formatType(f.fieldType)}${req}`);
    }
    this.indent--;
    this.indent--;
  }

  private emitEnum(def: EnumDef): void {
    this.emit(`DEFINE ENUM ${def.name}`);
    this.indent++;
    this.emit('VALUES:');
    this.indent++;
    for (const v of def.values) {
      this.emit(v);
    }
    this.indent--;
    if (def.defaultValue) {
      this.emit(`DEFAULT: ${def.defaultValue}`);
    }
    this.indent--;
  }

  private emitUnion(def: UnionDef): void {
    this.emit(`DEFINE UNION ${def.name}`);
    this.indent++;
    for (const variant of def.variants) {
      if (variant.fields.length === 0) {
        this.emit(variant.name);
      } else {
        this.emit(`${variant.name}:`);
        this.indent++;
        for (const f of variant.fields) {
          this.emit(`${f.name} AS ${this.formatType(f.fieldType)}`);
        }
        this.indent--;
      }
    }
    this.indent--;
  }

  private emitAlias(def: AliasDef): void {
    this.emit(`DEFINE ALIAS ${def.name} = ${def.targetType}`);
  }

  private emitExternal(def: ExternalDef): void {
    this.emit(`DEFINE EXTERNAL ${def.name}`);
    this.indent++;
    this.emit(`INTENT: "${def.intent}"`);
    if (def.parameters.length > 0) {
      this.emit('RECEIVE:');
      this.indent++;
      for (const p of def.parameters) {
        this.emit(`${p.name} AS ${this.formatType(p.paramType)}`);
      }
      this.indent--;
    }
    this.indent--;
  }

  private emitValidator(def: ValidatorDef): void {
    this.emit(`DEFINE VALIDATOR ${def.name}`);
    this.indent++;
    this.emit(`APPLIES TO: ${def.appliesTo}`);
    this.emit(`CHECK: ${def.check}`);
    this.emit(`MESSAGE: "${def.message}"`);
    this.indent--;
  }

  // ==========================================================================
  // Output
  // ==========================================================================

  private emit(line: string): void {
    if (line === '') {
      this.lines.push('');
      return;
    }
    this.lines.push('  '.repeat(this.indent) + line);
  }
}
