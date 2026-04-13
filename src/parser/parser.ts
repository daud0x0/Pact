// ============================================================================
// VibeL Parser — Recursive Descent
// Spec Reference: Section 21.3 — The Parser, Section 27 — Grammar (EBNF)
// ============================================================================

import { Token, TokenType } from '../lexer/tokens.js';
import {
  Program, ModuleDecl, ImportStmt, Definition, FunctionDef,
  TypeDef, DataDef, EnumDef, UnionDef, AliasDef, ExternalDef, ValidatorDef,
  TypeExpr, SimpleType, OptionalType, ListType, MapType, EitherType,
  ParamDecl, FieldDef, VariantDef,
  EffectBlock, Statement, Expression,
  LetStmt, AssignStmt, WriteStmt, CallStmt, ReturnStmt,
  AbortStmt, RollbackStmt, IfStmt, MatchStmt, ForStmt, WhileStmt,
  NotifyStmt, EmitStmt, AssertStmt,
  BinaryExpr, UnaryExpr, LiteralExpr, IdentifierExpr, FieldAccessExpr,
  FunctionCallExpr, ReadExpr, MakeExpr, CastExpr,
  ListLiteralExpr, RecordLiteralExpr,
  SpecExpression, LabeledSpecExpr,
  SpecComparison, SpecBinary, SpecNot, SpecIsNothing, SpecContains,
  SpecFieldRef, SpecReturnValue, SpecArithmetic, SpecPrior, SpecLength,
  SpecIn, SpecConditional, SpecQuantifier,
  SourceRange, CallArg,
} from '../ast/nodes.js';

/** Error thrown by the parser */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
  ) {
    super(`[L${line}:${column}] Parse Error: ${message}`);
    this.name = 'ParseError';
  }
}

/**
 * VibeL Recursive Descent Parser
 *
 * Converts a token stream (from the Lexer) into an AST.
 * Enforces section ordering in function definitions.
 * LL(1) — one token of lookahead.
 */
export class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    // Filter out NEWLINEs between sections for easier parsing
    // We keep them to detect line boundaries but skip them in most contexts
    this.tokens = tokens;
  }

  // ==========================================================================
  // Token Navigation
  // ==========================================================================

  private current(): Token {
    return this.tokens[this.pos] ?? this.makeEOF();
  }

  private peek(offset: number = 1): Token {
    return this.tokens[this.pos + offset] ?? this.makeEOF();
  }

  private makeEOF(): Token {
    return { type: TokenType.EOF, value: '', location: { line: 0, column: 0 }, raw: '' };
  }

  private advance(): Token {
    const token = this.current();
    this.pos++;
    return token;
  }

  private isAtEnd(): boolean {
    return this.current().type === TokenType.EOF;
  }

  private check(type: TokenType, value?: string): boolean {
    const tok = this.current();
    if (tok.type !== type) return false;
    if (value !== undefined && tok.value !== value) return false;
    return true;
  }

  private match(type: TokenType, value?: string): Token | null {
    if (this.check(type, value)) return this.advance();
    return null;
  }

  private expect(type: TokenType, value?: string): Token {
    const tok = this.current();
    if (tok.type !== type || (value !== undefined && tok.value !== value)) {
      const expected = value ? `${type}(${value})` : type;
      throw new ParseError(
        `Expected ${expected} but found ${tok.type}(${tok.value})`,
        tok.location.line,
        tok.location.column,
      );
    }
    return this.advance();
  }

  private expectKeyword(value: string): Token {
    return this.expect(TokenType.KEYWORD, value);
  }

  private skipNewlines(): void {
    while (this.check(TokenType.NEWLINE)) this.advance();
  }

  private skipNewlinesAndDedents(): void {
    while (this.check(TokenType.NEWLINE) || this.check(TokenType.DEDENT)) this.advance();
  }

  private loc(start: Token, end?: Token): SourceRange {
    const e = end ?? start;
    return {
      start: { line: start.location.line, column: start.location.column },
      end: { line: e.location.line, column: e.location.column },
    };
  }

  // ==========================================================================
  // Program
  // ==========================================================================

  parse(): Program {
    this.skipNewlines();
    const module = this.parseModuleDecl();
    this.skipNewlines();

    const imports: ImportStmt[] = [];
    while (this.check(TokenType.KEYWORD, 'IMPORT')) {
      imports.push(this.parseImportStmt());
      this.skipNewlines();
    }

    const definitions: Definition[] = [];
    while (!this.isAtEnd()) {
      this.skipNewlinesAndDedents();
      if (this.isAtEnd()) break;

      if (this.check(TokenType.KEYWORD, 'DEFINE') || this.check(TokenType.KEYWORD, 'EXPORT')) {
        definitions.push(this.parseDefinition());
      } else if (this.check(TokenType.KEYWORD, 'MODULE')) {
        // Module-level invariant
        // Skip for now, will handle in later pass
        break;
      } else {
        const tok = this.current();
        throw new ParseError(
          `Expected a definition (DEFINE/EXPORT) but found ${tok.type}(${tok.value})`,
          tok.location.line,
          tok.location.column,
        );
      }
      this.skipNewlines();
    }

    return {
      kind: 'Program',
      module,
      imports,
      definitions,
      location: module.location,
    };
  }

  // ==========================================================================
  // Module Declaration (§16.1)
  // ==========================================================================

  private parseModuleDecl(): ModuleDecl {
    const start = this.expectKeyword('MODULE');
    const path = this.parseDottedPath();
    this.skipNewlines();

    return {
      kind: 'ModuleDecl',
      path,
      invariants: [],
      location: this.loc(start),
    };
  }

  // ==========================================================================
  // Import Statement (§16.1)
  // ==========================================================================

  private parseImportStmt(): ImportStmt {
    const start = this.expectKeyword('IMPORT');
    const path = this.parseDottedPath();
    this.expectKeyword('AS');
    const alias = this.expect(TokenType.IDENTIFIER).value;
    this.skipNewlines();

    return {
      kind: 'ImportStmt',
      path,
      alias,
      location: this.loc(start),
    };
  }

  // ==========================================================================
  // Definition Dispatch
  // ==========================================================================

  private parseDefinition(): Definition {
    let exported = false;
    if (this.check(TokenType.KEYWORD, 'EXPORT')) {
      this.advance();
      exported = true;
      this.skipNewlines();
    }

    if (this.check(TokenType.KEYWORD, 'DEFINE')) {
      this.advance();

      const next = this.current();
      switch (next.value) {
        case 'FUNCTION': return this.parseFunctionDef(exported);
        case 'TYPE': return this.parseTypeDef();
        case 'DATA': return this.parseDataDef();
        case 'ENUM': return this.parseEnumDef();
        case 'UNION': return this.parseUnionDef();
        case 'ALIAS': return this.parseAliasDef();
        case 'EXTERNAL': return this.parseExternalDef();
        case 'VALIDATOR': return this.parseValidatorDef();
        default:
          throw new ParseError(
            `Expected FUNCTION, TYPE, DATA, ENUM, UNION, ALIAS, EXTERNAL, or VALIDATOR after DEFINE, found '${next.value}'`,
            next.location.line,
            next.location.column,
          );
      }
    }

    // EXPORT FUNCTION shorthand
    if (exported && this.check(TokenType.KEYWORD, 'FUNCTION')) {
      return this.parseFunctionDef(true);
    }

    const tok = this.current();
    throw new ParseError(
      `Expected DEFINE or FUNCTION after EXPORT, found '${tok.value}'`,
      tok.location.line,
      tok.location.column,
    );
  }

  // ==========================================================================
  // Function Definition (§5 — strict section order)
  // ==========================================================================

  private parseFunctionDef(exported: boolean): FunctionDef {
    const start = this.expectKeyword('FUNCTION');
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.skipNewlines();

    // Consume the INDENT for the function body
    this.match(TokenType.INDENT);
    this.skipNewlines();

    // INTENT (required)
    const intent = this.parseIntentBlock();
    this.skipNewlines();

    // Effects (optional sections, but must be in order)
    const effects: EffectBlock = { reads: [], writes: [], calls: [], emits: [] };
    if (this.check(TokenType.KEYWORD, 'READS')) {
      effects.reads = this.parseEffectList('READS');
      this.skipNewlines();
    }
    if (this.check(TokenType.KEYWORD, 'WRITES')) {
      effects.writes = this.parseEffectList('WRITES');
      this.skipNewlines();
    }
    if (this.check(TokenType.KEYWORD, 'CALLS')) {
      effects.calls = this.parseEffectList('CALLS');
      this.skipNewlines();
    }
    if (this.check(TokenType.KEYWORD, 'EMITS')) {
      effects.emits = this.parseEffectList('EMITS');
      this.skipNewlines();
    }

    // RECEIVE (optional)
    let parameters: ParamDecl[] = [];
    if (this.check(TokenType.KEYWORD, 'RECEIVE')) {
      parameters = this.parseReceiveBlock();
      this.skipNewlines();
    }

    // RETURN (optional)
    let returnType: TypeExpr = { kind: 'SimpleType', name: 'Nothing', location: this.loc(start) };
    if (this.check(TokenType.KEYWORD, 'RETURN')) {
      returnType = this.parseReturnDecl();
      this.skipNewlines();
    }

    // ENSURE BEFORE (optional)
    let ensureBefore: LabeledSpecExpr[] = [];
    if (this.check(TokenType.KEYWORD, 'ENSURE') && this.peek().value === 'BEFORE') {
      ensureBefore = this.parseEnsureBefore();
      this.skipNewlines();
    }

    // ENSURE AFTER (optional)
    let ensureAfter: SpecExpression[] = [];
    if (this.check(TokenType.KEYWORD, 'ENSURE') && this.peek().value === 'AFTER') {
      ensureAfter = this.parseEnsureAfter();
      this.skipNewlines();
    }

    // INVARIANT (optional)
    let invariants: SpecExpression[] = [];
    if (this.check(TokenType.KEYWORD, 'INVARIANT')) {
      invariants = this.parseInvariantBlock();
      this.skipNewlines();
    }

    // ON FAILURE (required)
    let onFailure: Statement[] = [];
    if (this.check(TokenType.KEYWORD, 'ON') && this.peek().value === 'FAILURE') {
      onFailure = this.parseOnFailure();
      this.skipNewlines();
    }

    // ON SUCCESS (optional)
    let onSuccess: Statement[] = [];
    if (this.check(TokenType.KEYWORD, 'ON') && this.peek().value === 'SUCCESS') {
      onSuccess = this.parseOnSuccess();
      this.skipNewlines();
    }

    // BODY (required)
    let body: Statement[] = [];
    if (this.check(TokenType.KEYWORD, 'BODY')) {
      body = this.parseBodyBlock();
      this.skipNewlines();
    }

    // Consume closing DEDENT
    this.match(TokenType.DEDENT);

    return {
      kind: 'FunctionDef',
      name,
      exported,
      intent,
      effects,
      parameters,
      returnType,
      ensureBefore,
      ensureAfter,
      invariants,
      onFailure,
      onSuccess,
      body,
      location: this.loc(start),
    };
  }

  // ==========================================================================
  // Intent Block (§6)
  // ==========================================================================

  private parseIntentBlock(): string {
    this.expectKeyword('INTENT');
    this.expect(TokenType.COLON);
    const value = this.expect(TokenType.LITERAL_STRING).value;
    return value;
  }

  // ==========================================================================
  // Effect Lists (§7)
  // ==========================================================================

  private parseEffectList(keyword: string): string[][] {
    this.expectKeyword(keyword);
    this.expect(TokenType.COLON);
    this.skipNewlines();

    const paths: string[][] = [];
    this.match(TokenType.INDENT);
    this.skipNewlines();

    while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
      if (this.check(TokenType.KEYWORD) || this.check(TokenType.IDENTIFIER)) {
        const path = this.parseDottedPath();
        paths.push(path);
      } else {
        break;
      }
      this.skipNewlines();
    }

    this.match(TokenType.DEDENT);
    return paths;
  }

  // ==========================================================================
  // Receive Block (§8)
  // ==========================================================================

  private parseReceiveBlock(): ParamDecl[] {
    this.expectKeyword('RECEIVE');
    this.expect(TokenType.COLON);
    this.skipNewlines();

    const params: ParamDecl[] = [];
    this.match(TokenType.INDENT);
    this.skipNewlines();

    while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
      if (this.check(TokenType.IDENTIFIER)) {
        params.push(this.parseParamDecl());
      } else {
        break;
      }
      this.skipNewlines();
    }

    this.match(TokenType.DEDENT);
    return params;
  }

  private parseParamDecl(): ParamDecl {
    const start = this.current();
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expectKeyword('AS');
    const paramType = this.parseTypeExpr();

    const constraints: string[] = [];
    const validators: string[] = [];
    const eachConstraints: string[] = [];
    let defaultValue: Expression | undefined;

    // Parse constraints, defaults, validators
    while (true) {
      this.skipNewlines();
      if (this.check(TokenType.KEYWORD, 'CONSTRAIN')) {
        this.advance();
        this.expect(TokenType.COLON);
        constraints.push(this.expect(TokenType.LITERAL_STRING).value);
      } else if (this.check(TokenType.KEYWORD, 'DEFAULT')) {
        this.advance();
        this.expect(TokenType.COLON);
        defaultValue = this.parseExpression();
      } else if (this.check(TokenType.KEYWORD, 'VALIDATE')) {
        this.advance();
        this.expectKeyword('WITH');
        this.expect(TokenType.COLON);
        validators.push(this.expect(TokenType.IDENTIFIER).value);
      } else if (this.check(TokenType.KEYWORD, 'EACH')) {
        this.advance();
        this.expectKeyword('CONSTRAIN');
        this.expect(TokenType.COLON);
        eachConstraints.push(this.expect(TokenType.LITERAL_STRING).value);
      } else {
        break;
      }
    }

    return {
      kind: 'ParamDecl',
      name,
      paramType,
      constraints,
      defaultValue,
      validators,
      eachConstraints,
      location: this.loc(start),
    };
  }

  // ==========================================================================
  // Return Declaration
  // ==========================================================================

  private parseReturnDecl(): TypeExpr {
    this.expectKeyword('RETURN');
    this.expect(TokenType.COLON);
    return this.parseTypeExpr();
  }

  // ==========================================================================
  // Type Expressions (§4)
  // ==========================================================================

  private parseTypeExpr(): TypeExpr {
    const start = this.current();

    // OPTIONAL Type
    if (this.check(TokenType.KEYWORD, 'OPTIONAL')) {
      this.advance();
      const inner = this.parseTypeExpr();
      return { kind: 'OptionalType', inner, location: this.loc(start) };
    }

    // EITHER Type OR Type
    if (this.check(TokenType.KEYWORD, 'EITHER')) {
      this.advance();
      const left = this.parseTypeExpr();
      this.expectKeyword('OR');
      const right = this.parseTypeExpr();
      return { kind: 'EitherType', left, right, location: this.loc(start) };
    }

    // List OF Type
    if (this.check(TokenType.IDENTIFIER, 'List') || this.check(TokenType.KEYWORD, 'List')) {
      this.advance();
      this.expectKeyword('OF');
      const elementType = this.parseTypeExpr();
      return { kind: 'ListType', elementType, location: this.loc(start) };
    }

    // Map OF Type TO Type
    if (this.check(TokenType.IDENTIFIER, 'Map') || this.check(TokenType.KEYWORD, 'Map')) {
      this.advance();
      this.expectKeyword('OF');
      const keyType = this.parseTypeExpr();
      this.expectKeyword('TO');
      const valueType = this.parseTypeExpr();
      return { kind: 'MapType', keyType, valueType, location: this.loc(start) };
    }

    // Simple type name
    const tok = this.current();
    if (tok.type === TokenType.IDENTIFIER || tok.type === TokenType.KEYWORD) {
      this.advance();
      return { kind: 'SimpleType', name: tok.value, location: this.loc(start) };
    }

    throw new ParseError(
      `Expected type expression, found ${tok.type}(${tok.value})`,
      tok.location.line,
      tok.location.column,
    );
  }

  // ==========================================================================
  // Spec Blocks (§9-11)
  // ==========================================================================

  private parseEnsureBefore(): LabeledSpecExpr[] {
    this.expectKeyword('ENSURE');
    this.expectKeyword('BEFORE');
    this.expect(TokenType.COLON);
    this.skipNewlines();
    this.match(TokenType.INDENT);
    this.skipNewlines();

    const exprs: LabeledSpecExpr[] = [];
    while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
      exprs.push(this.parseLabeledSpecExpr());
      this.skipNewlines();
    }

    this.match(TokenType.DEDENT);
    return exprs;
  }

  private parseEnsureAfter(): SpecExpression[] {
    this.expectKeyword('ENSURE');
    this.expectKeyword('AFTER');
    this.expect(TokenType.COLON);
    this.skipNewlines();
    this.match(TokenType.INDENT);
    this.skipNewlines();

    const exprs: SpecExpression[] = [];
    while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
      if (this.check(TokenType.KEYWORD, 'IF')) {
        exprs.push(this.parseSpecConditional());
      } else {
        exprs.push(this.parseSpecExpression());
      }
      this.skipNewlines();
    }

    this.match(TokenType.DEDENT);
    return exprs;
  }

  private parseInvariantBlock(): SpecExpression[] {
    this.expectKeyword('INVARIANT');
    this.expect(TokenType.COLON);
    this.skipNewlines();
    this.match(TokenType.INDENT);
    this.skipNewlines();

    const exprs: SpecExpression[] = [];
    while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
      exprs.push(this.parseSpecExpression());
      this.skipNewlines();
    }

    this.match(TokenType.DEDENT);
    return exprs;
  }

  private parseLabeledSpecExpr(): LabeledSpecExpr {
    const start = this.current();
    let label: string | undefined;

    // Check for [label]
    if (this.check(TokenType.OPEN_BRACKET)) {
      this.advance();
      label = this.expect(TokenType.IDENTIFIER).value;
      this.expect(TokenType.CLOSE_BRACKET);
    }

    const expression = this.parseSpecExpression();

    return {
      kind: 'LabeledSpecExpr',
      label,
      expression,
      location: this.loc(start),
    };
  }

  private parseSpecConditional(): SpecConditional {
    const start = this.expectKeyword('IF');
    const condition = this.parseSpecExpression();
    this.expectKeyword('THEN');
    this.skipNewlines();
    this.match(TokenType.INDENT);
    this.skipNewlines();

    const body: SpecExpression[] = [];
    while (!this.check(TokenType.DEDENT) && !this.check(TokenType.KEYWORD, 'IF') && !this.isAtEnd()) {
      body.push(this.parseSpecExpression());
      this.skipNewlines();
    }

    this.match(TokenType.DEDENT);

    return {
      kind: 'SpecConditional',
      condition,
      body,
      location: this.loc(start),
    };
  }

  // ==========================================================================
  // Spec Expression Parser (restricted language, §9.4)
  // ==========================================================================

  private parseSpecExpression(): SpecExpression {
    return this.parseSpecOr();
  }

  private parseSpecOr(): SpecExpression {
    let left = this.parseSpecAnd();

    while (this.check(TokenType.KEYWORD, 'OR')) {
      this.advance();
      const right = this.parseSpecAnd();
      left = {
        kind: 'SpecBinary',
        left,
        operator: 'OR',
        right,
        location: left.location,
      };
    }

    return left;
  }

  private parseSpecAnd(): SpecExpression {
    let left = this.parseSpecUnary();

    while (this.check(TokenType.KEYWORD, 'AND')) {
      this.advance();
      const right = this.parseSpecUnary();
      left = {
        kind: 'SpecBinary',
        left,
        operator: 'AND',
        right,
        location: left.location,
      };
    }

    return left;
  }

  private parseSpecUnary(): SpecExpression {
    if (this.check(TokenType.KEYWORD, 'NOT')) {
      const start = this.advance();
      const operand = this.parseSpecComparison();
      return { kind: 'SpecNot', operand, location: this.loc(start) };
    }
    return this.parseSpecComparison();
  }

  private parseSpecComparison(): SpecExpression {
    let left = this.parseSpecArithmetic();

    // Check for comparison operators
    const ops = ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'GREATER_OR_EQUAL', 'LESS_OR_EQUAL'];
    if (this.check(TokenType.KEYWORD) && ops.includes(this.current().value)) {
      const op = this.advance().value as 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'GREATER_OR_EQUAL' | 'LESS_OR_EQUAL';
      const right = this.parseSpecArithmetic();
      return {
        kind: 'SpecComparison',
        left,
        operator: op,
        right,
        location: left.location,
      };
    }

    // IS NOTHING / IS NOT NOTHING
    if (this.check(TokenType.KEYWORD, 'IS')) {
      this.advance();
      if (this.check(TokenType.KEYWORD, 'NOT')) {
        this.advance();
        this.expect(TokenType.LITERAL_NOTHING);
        return { kind: 'SpecIsNothing', field: left, negated: true, location: left.location };
      }
      this.expect(TokenType.LITERAL_NOTHING);
      return { kind: 'SpecIsNothing', field: left, negated: false, location: left.location };
    }

    // IN [...]
    if (this.check(TokenType.KEYWORD, 'IN')) {
      this.advance();
      this.expect(TokenType.OPEN_BRACKET);
      const values: Expression[] = [];
      while (!this.check(TokenType.CLOSE_BRACKET)) {
        values.push(this.parseExpression());
        this.match(TokenType.COMMA);
      }
      this.expect(TokenType.CLOSE_BRACKET);
      return { kind: 'SpecIn', field: left, values, negated: false, location: left.location };
    }

    return left;
  }

  private parseSpecArithmetic(): SpecExpression {
    let left = this.parseSpecAtom();

    const arithOps = ['PLUS', 'MINUS', 'TIMES', 'DIVIDED_BY', 'MOD'];
    while (this.check(TokenType.KEYWORD) && arithOps.includes(this.current().value)) {
      const op = this.advance().value as 'PLUS' | 'MINUS' | 'TIMES' | 'DIVIDED_BY' | 'MOD';
      const right = this.parseSpecAtom();
      left = {
        kind: 'SpecArithmetic',
        left,
        operator: op,
        right,
        location: left.location,
      };
    }

    return left;
  }

  private parseSpecAtom(): SpecExpression {
    const start = this.current();

    // RETURN_VALUE
    if (this.check(TokenType.KEYWORD, 'RETURN_VALUE')) {
      this.advance();
      return { kind: 'SpecReturnValue', location: this.loc(start) };
    }

    // PRIOR(field)
    if (this.check(TokenType.KEYWORD, 'PRIOR')) {
      this.advance();
      this.expect(TokenType.OPEN_PAREN);
      const field = this.parseDottedPath();
      this.expect(TokenType.CLOSE_PAREN);
      return { kind: 'SpecPrior', field, location: this.loc(start) };
    }

    // LENGTH OF collection
    if (this.check(TokenType.KEYWORD, 'LENGTH')) {
      this.advance();
      this.expectKeyword('OF');
      const collection = this.parseSpecAtom();
      return { kind: 'SpecLength', collection, location: this.loc(start) };
    }

    // CONTAINS collection value
    if (this.check(TokenType.KEYWORD, 'CONTAINS')) {
      this.advance();
      const collection = this.parseSpecAtom();
      const value = this.parseSpecAtom();
      return { kind: 'SpecContains', collection, value, location: this.loc(start) };
    }

    // ALL items IN list SATISFY condition
    if (this.check(TokenType.KEYWORD, 'ALL')) {
      this.advance();
      const variable = this.expect(TokenType.IDENTIFIER).value;
      this.expectKeyword('IN');
      const collection = this.parseSpecAtom();
      this.expectKeyword('SATISFY');
      const condition = this.parseSpecExpression();
      return {
        kind: 'SpecQuantifier',
        quantifier: 'ALL',
        variable,
        collection,
        condition,
        location: this.loc(start),
      };
    }

    // ANY item IN list SATISFIES condition
    if (this.check(TokenType.KEYWORD, 'ANY')) {
      this.advance();
      const variable = this.expect(TokenType.IDENTIFIER).value;
      this.expectKeyword('IN');
      const collection = this.parseSpecAtom();
      this.expectKeyword('SATISFIES');
      const condition = this.parseSpecExpression();
      return {
        kind: 'SpecQuantifier',
        quantifier: 'ANY',
        variable,
        collection,
        condition,
        location: this.loc(start),
      };
    }

    // Literals
    if (this.check(TokenType.LITERAL_INT) || this.check(TokenType.LITERAL_DECIMAL) ||
        this.check(TokenType.LITERAL_STRING) || this.check(TokenType.LITERAL_BOOL) ||
        this.check(TokenType.LITERAL_NOTHING)) {
      const litExpr = this.parseLiteral();
      // Wrap in SpecFieldRef-like encoding for consistency
      return { kind: 'SpecFieldRef', path: [String(litExpr.value)], location: this.loc(start) };
    }

    // Integer literal as negative
    if (this.check(TokenType.MINUS_SYM)) {
      this.advance();
      const num = this.expect(TokenType.LITERAL_INT);
      return { kind: 'SpecFieldRef', path: ['-' + num.value], location: this.loc(start) };
    }

    // Field reference (dotted path)
    if (this.check(TokenType.IDENTIFIER) || this.check(TokenType.KEYWORD)) {
      const path = this.parseDottedPath();
      return { kind: 'SpecFieldRef', path, location: this.loc(start) };
    }

    // Parenthesized
    if (this.check(TokenType.OPEN_PAREN)) {
      this.advance();
      const inner = this.parseSpecExpression();
      this.expect(TokenType.CLOSE_PAREN);
      return inner;
    }

    throw new ParseError(
      `Expected spec expression but found ${start.type}(${start.value})`,
      start.location.line,
      start.location.column,
    );
  }

  // ==========================================================================
  // ON FAILURE / ON SUCCESS (§15)
  // ==========================================================================

  private parseOnFailure(): Statement[] {
    this.expectKeyword('ON');
    this.expectKeyword('FAILURE');
    this.expect(TokenType.COLON);
    this.skipNewlines();

    return this.parseStatementBlock();
  }

  private parseOnSuccess(): Statement[] {
    this.expectKeyword('ON');
    this.expectKeyword('SUCCESS');
    this.expect(TokenType.COLON);
    this.skipNewlines();

    return this.parseStatementBlock();
  }

  // ==========================================================================
  // Body Block (§14)
  // ==========================================================================

  private parseBodyBlock(): Statement[] {
    this.expectKeyword('BODY');
    this.expect(TokenType.COLON);
    this.skipNewlines();

    return this.parseStatementBlock();
  }

  // ==========================================================================
  // Statement Block
  // ==========================================================================

  private parseStatementBlock(): Statement[] {
    this.match(TokenType.INDENT);
    this.skipNewlines();

    const stmts: Statement[] = [];
    while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) stmts.push(stmt);
      this.skipNewlines();
    }

    this.match(TokenType.DEDENT);
    return stmts;
  }

  // ==========================================================================
  // Statements (§14)
  // ==========================================================================

  private parseStatement(): Statement | null {
    const tok = this.current();

    // LET (including LET x = CALL ...)
    if (tok.type === TokenType.KEYWORD && tok.value === 'LET') {
      return this.parseLetStmt();
    }

    // WRITE
    if (tok.type === TokenType.KEYWORD && tok.value === 'WRITE') {
      return this.parseWriteStmt();
    }

    // CALL (standalone or LET x = CALL)
    if (tok.type === TokenType.KEYWORD && tok.value === 'CALL') {
      return this.parseCallStmt();
    }

    // RETURN EXPLICIT
    if (tok.type === TokenType.KEYWORD && tok.value === 'RETURN') {
      return this.parseReturnStmt();
    }

    // ABORT
    if (tok.type === TokenType.KEYWORD && tok.value === 'ABORT') {
      return this.parseAbortStmt();
    }

    // ROLLBACK
    if (tok.type === TokenType.KEYWORD && tok.value === 'ROLLBACK') {
      return this.parseRollbackStmt();
    }

    // IF
    if (tok.type === TokenType.KEYWORD && tok.value === 'IF') {
      return this.parseIfStmt();
    }

    // MATCH
    if (tok.type === TokenType.KEYWORD && tok.value === 'MATCH') {
      return this.parseMatchStmt();
    }

    // FOR EACH
    if (tok.type === TokenType.KEYWORD && tok.value === 'FOR') {
      return this.parseForStmt();
    }

    // WHILE
    if (tok.type === TokenType.KEYWORD && tok.value === 'WHILE') {
      return this.parseWhileStmt();
    }

    // NOTIFY
    if (tok.type === TokenType.KEYWORD && tok.value === 'NOTIFY') {
      return this.parseNotifyStmt();
    }

    // EMIT
    if (tok.type === TokenType.KEYWORD && tok.value === 'EMIT') {
      return this.parseEmitStmt();
    }

    // ASSERT
    if (tok.type === TokenType.KEYWORD && tok.value === 'ASSERT') {
      return this.parseAssertStmt();
    }

    // RETRY
    if (tok.type === TokenType.KEYWORD && tok.value === 'RETRY') {
      // RETRY AFTER N SECONDS MAX M ATTEMPTS — treat as a special call
      return this.parseRetryStmt();
    }

    // Identifier ASSIGN expression
    if (tok.type === TokenType.IDENTIFIER) {
      // Look ahead for ASSIGN
      const next = this.peek();
      if (next.type === TokenType.KEYWORD && next.value === 'ASSIGN') {
        return this.parseAssignStmt();
      }
    }

    // Skip unknown tokens with a warning
    this.advance();
    return null;
  }

  // --- Individual Statement Parsers ---

  private parseLetStmt(): LetStmt {
    const start = this.expectKeyword('LET');
    const mutable = !!this.match(TokenType.KEYWORD, 'MUTABLE');
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.EQUALS_SYM);
    const value = this.parseExpression();

    return {
      kind: 'LetStmt',
      name,
      mutable,
      value,
      location: this.loc(start),
    };
  }

  private parseAssignStmt(): AssignStmt {
    const start = this.current();
    const target = this.expect(TokenType.IDENTIFIER).value;
    this.expectKeyword('ASSIGN');
    const value = this.parseExpression();

    return {
      kind: 'AssignStmt',
      target,
      value,
      location: this.loc(start),
    };
  }

  private parseWriteStmt(): WriteStmt {
    const start = this.expectKeyword('WRITE');
    const target = this.parseDottedPath();

    let mode: 'AS' | 'APPEND' = 'AS';
    if (this.check(TokenType.KEYWORD, 'APPEND')) {
      this.advance();
      mode = 'APPEND';
    } else {
      this.expectKeyword('AS');
    }

    const value = this.parseExpression();

    return {
      kind: 'WriteStmt',
      target,
      mode,
      value,
      location: this.loc(start),
    };
  }

  private parseCallStmt(resultBinding?: string): CallStmt {
    const start = this.expectKeyword('CALL');
    const target = this.parseDottedPath();

    const args: CallArg[] = [];
    // WITH keyword args — can be inline or indented block
    this.skipNewlines();

    // The WITH block may be indented (INDENT before first WITH)
    const hasIndent = this.match(TokenType.INDENT);
    this.skipNewlines();

    while (this.check(TokenType.KEYWORD, 'WITH')) {
      this.advance();
      const argName = this.current().value;
      this.advance();
      this.expect(TokenType.COLON);
      const argValue = this.parseExpression();
      args.push({ name: argName, value: argValue });
      this.skipNewlines();
    }

    // Consume closing DEDENT if we consumed an INDENT
    if (hasIndent) {
      this.match(TokenType.DEDENT);
    }

    return {
      kind: 'CallStmt',
      target,
      args,
      resultBinding,
      location: this.loc(start),
    };
  }

  private parseReturnStmt(): ReturnStmt {
    const start = this.expectKeyword('RETURN');
    this.expectKeyword('EXPLICIT');
    const value = this.parseExpression();

    return {
      kind: 'ReturnStmt',
      value,
      location: this.loc(start),
    };
  }

  private parseAbortStmt(): AbortStmt {
    const start = this.expectKeyword('ABORT');
    this.expectKeyword('WITH');
    this.expectKeyword('REASON');
    this.expect(TokenType.COLON);
    const reason = this.parseExpression();

    return {
      kind: 'AbortStmt',
      reason,
      location: this.loc(start),
    };
  }

  private parseRollbackStmt(): RollbackStmt {
    const start = this.expectKeyword('ROLLBACK');

    if (this.check(TokenType.KEYWORD, 'ALL')) {
      this.advance();
      this.expectKeyword('WRITES');
      return {
        kind: 'RollbackStmt',
        andAbort: false,
        location: this.loc(start),
      };
    }

    if (this.check(TokenType.KEYWORD, 'AND')) {
      this.advance();
      this.expectKeyword('ABORT');
      this.expectKeyword('WITH');
      this.expectKeyword('REASON');
      this.expect(TokenType.COLON);
      const reason = this.parseExpression();
      return {
        kind: 'RollbackStmt',
        andAbort: true,
        reason,
        location: this.loc(start),
      };
    }

    throw new ParseError(
      `Expected ALL or AND after ROLLBACK`,
      start.location.line,
      start.location.column,
    );
  }

  private parseIfStmt(): IfStmt {
    const start = this.expectKeyword('IF');
    const condition = this.parseExpression();
    this.expectKeyword('THEN');
    this.skipNewlines();

    const thenBlock = this.parseStatementBlock();
    this.skipNewlines();

    const elseIfClauses: { condition: Expression; body: Statement[] }[] = [];
    let elseBlock: Statement[] = [];

    while (this.check(TokenType.KEYWORD, 'ELSE')) {
      this.advance();
      if (this.check(TokenType.KEYWORD, 'IF')) {
        this.advance();
        const eifCondition = this.parseExpression();
        this.expectKeyword('THEN');
        this.skipNewlines();
        const eifBody = this.parseStatementBlock();
        elseIfClauses.push({ condition: eifCondition, body: eifBody });
        this.skipNewlines();
      } else {
        this.skipNewlines();
        elseBlock = this.parseStatementBlock();
        break;
      }
    }

    // END IF
    if (this.check(TokenType.KEYWORD, 'END')) {
      this.advance();
      this.expectKeyword('IF');
    }

    return {
      kind: 'IfStmt',
      condition,
      thenBlock,
      elseIfClauses,
      elseBlock,
      location: this.loc(start),
    };
  }

  private parseMatchStmt(): MatchStmt {
    const start = this.expectKeyword('MATCH');
    const subject = this.parseExpression();
    this.skipNewlines();
    this.match(TokenType.INDENT);
    this.skipNewlines();

    const cases: { pattern: string; binding?: string; body: Statement[] }[] = [];
    let wildcard: Statement[] | undefined;

    while (this.check(TokenType.KEYWORD, 'CASE')) {
      this.advance();
      this.skipNewlines();

      // Wildcard _
      if (this.check(TokenType.IDENTIFIER, '_')) {
        this.advance();
        this.expectKeyword('THEN');
        this.skipNewlines();
        wildcard = this.parseStatementBlock();
        this.skipNewlines();
        continue;
      }

      const pattern = this.current().value;
      this.advance();

      let binding: string | undefined;
      if (this.check(TokenType.KEYWORD, 'AS')) {
        this.advance();
        binding = this.expect(TokenType.IDENTIFIER).value;
      }

      this.expectKeyword('THEN');
      this.skipNewlines();
      const body = this.parseStatementBlock();
      cases.push({ pattern, binding, body });
      this.skipNewlines();
    }

    this.match(TokenType.DEDENT);
    if (this.check(TokenType.KEYWORD, 'END')) {
      this.advance();
      this.expectKeyword('MATCH');
    }

    return {
      kind: 'MatchStmt',
      subject,
      cases,
      wildcard,
      location: this.loc(start),
    };
  }

  private parseForStmt(): ForStmt {
    const start = this.expectKeyword('FOR');
    this.expectKeyword('EACH');
    const variable = this.expect(TokenType.IDENTIFIER).value;

    let indexVariable: string | undefined;
    if (this.check(TokenType.KEYWORD, 'AT')) {
      this.advance();
      indexVariable = this.expect(TokenType.IDENTIFIER).value;
    }

    this.expectKeyword('IN');
    const collection = this.parseExpression();
    this.skipNewlines();
    const body = this.parseStatementBlock();

    if (this.check(TokenType.KEYWORD, 'END')) {
      this.advance();
      this.expectKeyword('FOR');
    }

    return {
      kind: 'ForStmt',
      variable,
      indexVariable,
      collection,
      body,
      location: this.loc(start),
    };
  }

  private parseWhileStmt(): WhileStmt {
    const start = this.expectKeyword('WHILE');
    const condition = this.parseExpression();
    this.skipNewlines();
    const body = this.parseStatementBlock();

    if (this.check(TokenType.KEYWORD, 'END')) {
      this.advance();
      this.expectKeyword('WHILE');
    }

    return {
      kind: 'WhileStmt',
      condition,
      body,
      location: this.loc(start),
    };
  }

  private parseNotifyStmt(): NotifyStmt {
    const start = this.expectKeyword('NOTIFY');
    const target = this.parseDottedPath();
    this.expectKeyword('WITH');
    const message = this.parseExpression();

    return {
      kind: 'NotifyStmt',
      target,
      message,
      location: this.loc(start),
    };
  }

  private parseEmitStmt(): EmitStmt {
    const start = this.expectKeyword('EMIT');
    const event = this.parseDottedPath();
    this.expectKeyword('WITH');
    const data = this.parseExpression();

    return {
      kind: 'EmitStmt',
      event,
      data,
      location: this.loc(start),
    };
  }

  private parseAssertStmt(): AssertStmt {
    const start = this.expectKeyword('ASSERT');
    const condition = this.parseExpression();
    this.expectKeyword('WITH');
    this.expectKeyword('REASON');
    this.expect(TokenType.COLON);
    const reason = this.parseExpression();

    return {
      kind: 'AssertStmt',
      condition,
      reason,
      location: this.loc(start),
    };
  }

  private parseRetryStmt(): Statement {
    const start = this.expectKeyword('RETRY');
    // RETRY AFTER N SECONDS MAX M ATTEMPTS
    // Simplified: treat as a call-like statement
    this.expectKeyword('AFTER');
    const delay = this.parseExpression();
    // Skip SECONDS, MAX, N, ATTEMPTS keywords
    while (this.check(TokenType.KEYWORD) || this.check(TokenType.LITERAL_INT)) {
      this.advance();
    }

    return {
      kind: 'CallStmt',
      target: ['__retry'],
      args: [{ name: 'delay', value: delay }],
      location: this.loc(start),
    };
  }

  // ==========================================================================
  // Expressions (§19)
  // ==========================================================================

  private parseExpression(): Expression {
    return this.parseOr();
  }

  private parseOr(): Expression {
    let left = this.parseAnd();

    while (this.check(TokenType.KEYWORD, 'OR')) {
      this.advance();
      const right = this.parseAnd();
      left = { kind: 'BinaryExpr', left, operator: 'OR', right, location: left.location };
    }

    return left;
  }

  private parseAnd(): Expression {
    let left = this.parseComparison();

    while (this.check(TokenType.KEYWORD, 'AND')) {
      this.advance();
      const right = this.parseComparison();
      left = { kind: 'BinaryExpr', left, operator: 'AND', right, location: left.location };
    }

    return left;
  }

  private parseComparison(): Expression {
    let left = this.parseAddSub();

    // Keyword operators
    const compOps = ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'GREATER_OR_EQUAL', 'LESS_OR_EQUAL'];
    if (this.check(TokenType.KEYWORD) && compOps.includes(this.current().value)) {
      const op = this.advance().value;
      const right = this.parseAddSub();
      left = { kind: 'BinaryExpr', left, operator: op, right, location: left.location };
    }

    // Symbolic operators
    if (this.check(TokenType.DOUBLE_EQUALS)) {
      this.advance();
      const right = this.parseAddSub();
      left = { kind: 'BinaryExpr', left, operator: 'EQUALS', right, location: left.location };
    }
    if (this.check(TokenType.NOT_EQUALS_SYM)) {
      this.advance();
      const right = this.parseAddSub();
      left = { kind: 'BinaryExpr', left, operator: 'NOT_EQUALS', right, location: left.location };
    }
    if (this.check(TokenType.GT_SYM)) {
      this.advance();
      const right = this.parseAddSub();
      left = { kind: 'BinaryExpr', left, operator: 'GREATER_THAN', right, location: left.location };
    }
    if (this.check(TokenType.LT_SYM)) {
      this.advance();
      const right = this.parseAddSub();
      left = { kind: 'BinaryExpr', left, operator: 'LESS_THAN', right, location: left.location };
    }
    if (this.check(TokenType.GTE_SYM)) {
      this.advance();
      const right = this.parseAddSub();
      left = { kind: 'BinaryExpr', left, operator: 'GREATER_OR_EQUAL', right, location: left.location };
    }
    if (this.check(TokenType.LTE_SYM)) {
      this.advance();
      const right = this.parseAddSub();
      left = { kind: 'BinaryExpr', left, operator: 'LESS_OR_EQUAL', right, location: left.location };
    }

    // IS NOTHING / IS NOT NOTHING
    if (this.check(TokenType.KEYWORD, 'IS')) {
      this.advance();
      if (this.check(TokenType.KEYWORD, 'NOT')) {
        this.advance();
        this.expect(TokenType.LITERAL_NOTHING);
        left = {
          kind: 'BinaryExpr', left, operator: 'IS_NOT_NOTHING',
          right: { kind: 'LiteralExpr', literalType: 'Nothing', value: null, location: left.location },
          location: left.location,
        };
      } else {
        this.expect(TokenType.LITERAL_NOTHING);
        left = {
          kind: 'BinaryExpr', left, operator: 'IS_NOTHING',
          right: { kind: 'LiteralExpr', literalType: 'Nothing', value: null, location: left.location },
          location: left.location,
        };
      }
    }

    // OTHERWISE
    if (this.check(TokenType.KEYWORD, 'OTHERWISE')) {
      this.advance();
      const fallback = this.parseAddSub();
      left = { kind: 'BinaryExpr', left, operator: 'OTHERWISE', right: fallback, location: left.location };
    }

    return left;
  }

  private parseAddSub(): Expression {
    let left = this.parseMulDiv();

    while (true) {
      if (this.check(TokenType.KEYWORD, 'PLUS') || this.check(TokenType.PLUS_SYM)) {
        this.advance();
        const right = this.parseMulDiv();
        left = { kind: 'BinaryExpr', left, operator: 'PLUS', right, location: left.location };
      } else if (this.check(TokenType.KEYWORD, 'MINUS') || this.check(TokenType.MINUS_SYM)) {
        this.advance();
        const right = this.parseMulDiv();
        left = { kind: 'BinaryExpr', left, operator: 'MINUS', right, location: left.location };
      } else if (this.check(TokenType.KEYWORD, 'CONCATENATE')) {
        this.advance();
        // WITH is optional
        this.match(TokenType.KEYWORD, 'WITH');
        const right = this.parseMulDiv();
        left = { kind: 'BinaryExpr', left, operator: 'CONCATENATE', right, location: left.location };
      } else {
        break;
      }
    }

    return left;
  }

  private parseMulDiv(): Expression {
    let left = this.parseUnary();

    while (true) {
      if (this.check(TokenType.KEYWORD, 'TIMES') || this.check(TokenType.STAR_SYM)) {
        this.advance();
        const right = this.parseUnary();
        left = { kind: 'BinaryExpr', left, operator: 'TIMES', right, location: left.location };
      } else if (this.check(TokenType.KEYWORD, 'DIVIDED_BY') || this.check(TokenType.SLASH_SYM)) {
        this.advance();
        const right = this.parseUnary();
        // Check for rounding directive
        let rounding;
        if (this.check(TokenType.KEYWORD, 'ROUNDED')) {
          this.advance();
          this.expectKeyword('TO');
          const places = parseInt(this.expect(TokenType.LITERAL_INT).value, 10);
          this.expectKeyword('DECIMAL_PLACES');
          rounding = { mode: 'DECIMAL_PLACES' as const, places };
        } else if (this.check(TokenType.KEYWORD, 'AS') && this.peek().value === 'INTEGER') {
          this.advance();
          this.advance();
          rounding = { mode: 'INTEGER' as const };
        }
        left = { kind: 'BinaryExpr', left, operator: 'DIVIDED_BY', right, rounding, location: left.location };
      } else if (this.check(TokenType.KEYWORD, 'MOD') || this.check(TokenType.PERCENT_SYM)) {
        this.advance();
        const right = this.parseUnary();
        left = { kind: 'BinaryExpr', left, operator: 'MOD', right, location: left.location };
      } else {
        break;
      }
    }

    return left;
  }

  private parseUnary(): Expression {
    if (this.check(TokenType.KEYWORD, 'NOT')) {
      const start = this.advance();
      const operand = this.parseUnary();
      return { kind: 'UnaryExpr', operator: 'NOT', operand, location: this.loc(start) };
    }

    if (this.check(TokenType.MINUS_SYM)) {
      const start = this.advance();
      const operand = this.parseUnary();
      return { kind: 'UnaryExpr', operator: 'MINUS', operand, location: this.loc(start) };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): Expression {
    const start = this.current();

    // READ field
    if (this.check(TokenType.KEYWORD, 'READ')) {
      this.advance();
      const field = this.parseDottedPath();
      return { kind: 'ReadExpr', field, location: this.loc(start) };
    }

    // CALL expression (LET x = CALL ...)
    if (this.check(TokenType.KEYWORD, 'CALL')) {
      this.advance();
      const target = this.parseDottedPath();
      const args: CallArg[] = [];
      this.skipNewlines();
      const hasCallIndent = this.match(TokenType.INDENT);
      this.skipNewlines();
      while (this.check(TokenType.KEYWORD, 'WITH')) {
        this.advance();
        const argName = this.current().value;
        this.advance();
        this.expect(TokenType.COLON);
        const argValue = this.parseExpression();
        args.push({ name: argName, value: argValue });
        this.skipNewlines();
      }
      if (hasCallIndent) this.match(TokenType.DEDENT);
      return { kind: 'FunctionCallExpr', name: target.join('.'), args, location: this.loc(start) };
    }

    // MAKE Type FROM value
    if (this.check(TokenType.KEYWORD, 'MAKE')) {
      this.advance();
      const typeName = this.current().value;
      this.advance();
      this.expectKeyword('FROM');
      const source = this.parseExpression();
      let currency: string | undefined;
      if (this.check(TokenType.KEYWORD, 'IN')) {
        this.advance();
        currency = this.expect(TokenType.LITERAL_STRING).value;
      }
      return { kind: 'MakeExpr', typeName, source, currency, location: this.loc(start) };
    }

    // CAST value AS Type
    if (this.check(TokenType.KEYWORD, 'CAST')) {
      this.advance();
      const value = this.parsePrimary();
      this.expectKeyword('AS');
      const targetType = this.current().value;
      this.advance();
      return { kind: 'CastExpr', value, targetType, location: this.loc(start) };
    }

    // CONCATENATE
    if (this.check(TokenType.KEYWORD, 'CONCATENATE')) {
      this.advance();
      const left = this.parsePrimary();
      this.expectKeyword('WITH');
      const right = this.parsePrimary();
      return { kind: 'BinaryExpr', left, operator: 'CONCATENATE', right, location: this.loc(start) };
    }

    // Built-in function calls: NOW(), UUID(), HASH(...)
    if (this.check(TokenType.KEYWORD) && this.peek().type === TokenType.OPEN_PAREN) {
      const funcName = this.advance().value;
      return this.parseFunctionCallArgs(funcName, start);
    }

    // Literals
    if (this.check(TokenType.LITERAL_INT) || this.check(TokenType.LITERAL_DECIMAL) ||
        this.check(TokenType.LITERAL_STRING) || this.check(TokenType.LITERAL_BOOL) ||
        this.check(TokenType.LITERAL_NOTHING)) {
      return this.parseLiteral();
    }

    // List literal [...]
    if (this.check(TokenType.OPEN_BRACKET)) {
      return this.parseListLiteral();
    }

    // Record literal {...}
    if (this.check(TokenType.OPEN_BRACE)) {
      return this.parseRecordLiteral();
    }

    // Parenthesized expression
    if (this.check(TokenType.OPEN_PAREN)) {
      this.advance();
      const expr = this.parseExpression();
      this.expect(TokenType.CLOSE_PAREN);
      return expr;
    }

    // Identifier or function call or field access
    if (this.check(TokenType.IDENTIFIER)) {
      // Check if it's a function call (identifier followed by '(')
      if (this.peek().type === TokenType.OPEN_PAREN) {
        const name = this.advance().value;
        return this.parseFunctionCallArgs(name, start);
      }

      // Check if it's a typed record constructor: TypeName { field: value, ... }
      if (this.peek().type === TokenType.OPEN_BRACE) {
        const typeName = this.advance().value;
        const record = this.parseRecordLiteral();
        // Return as a record literal — the type name is embedded in the record
        return {
          kind: 'RecordLiteralExpr',
          fields: [{ name: '__type', value: { kind: 'LiteralExpr', literalType: 'Text' as const, value: typeName, location: this.loc(start) } }, ...record.fields],
          location: this.loc(start),
        };
      }

      // Check for type constructor: TypeName literal (e.g., Duration 86400000000000)
      if (this.peek().type === TokenType.LITERAL_INT || this.peek().type === TokenType.LITERAL_DECIMAL ||
          this.peek().type === TokenType.LITERAL_STRING) {
        // Only if the identifier looks PascalCase (type name)
        const name = this.current().value;
        if (/^[A-Z]/.test(name)) {
          this.advance(); // consume type name
          const source = this.parseLiteral();
          return { kind: 'MakeExpr', typeName: name, source, location: this.loc(start) };
        }
      }

      // Dotted path / field access
      const path = this.parseDottedPath();
      if (path.length === 1) {
        return { kind: 'IdentifierExpr', name: path[0], location: this.loc(start) };
      }
      return { kind: 'FieldAccessExpr', path, location: this.loc(start) };
    }

    // Keyword used as identifier in expression context (e.g., FAILURE_REASON)
    if (this.check(TokenType.KEYWORD)) {
      const kw = this.advance();
      if (this.check(TokenType.DOT)) {
        // Dotted path starting with keyword
        const path = [kw.value];
        while (this.match(TokenType.DOT)) {
          path.push(this.advance().value);
        }
        return { kind: 'FieldAccessExpr', path, location: this.loc(start) };
      }
      return { kind: 'IdentifierExpr', name: kw.value, location: this.loc(start) };
    }

    throw new ParseError(
      `Expected expression but found ${start.type}(${start.value})`,
      start.location.line,
      start.location.column,
    );
  }

  private parseFunctionCallArgs(name: string, start: Token): FunctionCallExpr {
    this.expect(TokenType.OPEN_PAREN);
    const args: CallArg[] = [];

    if (!this.check(TokenType.CLOSE_PAREN)) {
      // Check if args are named (key: value) or positional
      // VibeL uses named args, but builtins like HASH(value) are positional
      do {
        if (this.peek().type === TokenType.COLON) {
          // Named arg
          const argName = this.current().value;
          this.advance();
          this.expect(TokenType.COLON);
          const argValue = this.parseExpression();
          args.push({ name: argName, value: argValue });
        } else {
          // Positional arg — use index as name
          const argValue = this.parseExpression();
          args.push({ name: String(args.length), value: argValue });
        }
      } while (this.match(TokenType.COMMA));
    }

    this.expect(TokenType.CLOSE_PAREN);
    return { kind: 'FunctionCallExpr', name, args, location: this.loc(start) };
  }

  private parseLiteral(): LiteralExpr {
    const tok = this.advance();
    const start = tok;

    switch (tok.type) {
      case TokenType.LITERAL_INT:
        return { kind: 'LiteralExpr', literalType: 'Integer', value: parseInt(tok.value, 10), location: this.loc(start) };
      case TokenType.LITERAL_DECIMAL:
        return { kind: 'LiteralExpr', literalType: 'Decimal', value: parseFloat(tok.value), location: this.loc(start) };
      case TokenType.LITERAL_STRING:
        return { kind: 'LiteralExpr', literalType: 'Text', value: tok.value, location: this.loc(start) };
      case TokenType.LITERAL_BOOL:
        return { kind: 'LiteralExpr', literalType: 'Boolean', value: tok.value === 'TRUE', location: this.loc(start) };
      case TokenType.LITERAL_NOTHING:
        return { kind: 'LiteralExpr', literalType: 'Nothing', value: null, location: this.loc(start) };
      default:
        throw new ParseError(`Unexpected literal type: ${tok.type}`, tok.location.line, tok.location.column);
    }
  }

  private parseListLiteral(): ListLiteralExpr {
    const start = this.expect(TokenType.OPEN_BRACKET);
    const elements: Expression[] = [];

    while (!this.check(TokenType.CLOSE_BRACKET) && !this.isAtEnd()) {
      elements.push(this.parseExpression());
      this.match(TokenType.COMMA);
    }

    this.expect(TokenType.CLOSE_BRACKET);
    return { kind: 'ListLiteralExpr', elements, location: this.loc(start) };
  }

  private parseRecordLiteral(): RecordLiteralExpr {
    const start = this.expect(TokenType.OPEN_BRACE);
    const fields: { name: string; value: Expression }[] = [];
    this.skipNewlines();
    this.match(TokenType.INDENT); // consume indent inside braces
    this.skipNewlines();

    while (!this.check(TokenType.CLOSE_BRACE) && !this.check(TokenType.DEDENT) && !this.isAtEnd()) {
      const name = this.current().value;
      this.advance();
      this.expect(TokenType.COLON);
      const value = this.parseExpression();
      fields.push({ name, value });
      this.match(TokenType.COMMA);
      this.skipNewlines();
    }

    this.match(TokenType.DEDENT); // consume dedent before closing brace
    this.skipNewlines();
    this.expect(TokenType.CLOSE_BRACE);
    return { kind: 'RecordLiteralExpr', fields, location: this.loc(start) };
  }

  // ==========================================================================
  // Type Definitions (§4.2)
  // ==========================================================================

  private parseTypeDef(): TypeDef {
    const start = this.expectKeyword('TYPE');
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.skipNewlines();
    this.match(TokenType.INDENT);
    this.skipNewlines();

    let baseType = '';
    const constraints: string[] = [];
    let normalize: string | undefined;
    let currency: string | undefined;
    let immutable: boolean | undefined;

    while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
      if (this.check(TokenType.KEYWORD, 'BASE')) {
        this.advance();
        this.expect(TokenType.COLON);
        baseType = this.current().value;
        this.advance();
      } else if (this.check(TokenType.KEYWORD, 'CONSTRAIN')) {
        this.advance();
        this.expect(TokenType.COLON);
        constraints.push(this.expect(TokenType.LITERAL_STRING).value);
      } else if (this.check(TokenType.KEYWORD, 'NORMALIZE')) {
        this.advance();
        this.expect(TokenType.COLON);
        normalize = this.current().value;
        this.advance();
      } else if (this.check(TokenType.KEYWORD, 'CURRENCY')) {
        this.advance();
        this.expect(TokenType.COLON);
        currency = this.current().value;
        this.advance();
      } else if (this.check(TokenType.KEYWORD, 'IMMUTABLE')) {
        this.advance();
        this.expect(TokenType.COLON);
        immutable = this.current().value === 'TRUE';
        this.advance();
      } else {
        break;
      }
      this.skipNewlines();
    }

    this.match(TokenType.DEDENT);

    return {
      kind: 'TypeDef',
      name,
      baseType,
      constraints,
      normalize,
      currency,
      immutable,
      location: this.loc(start),
    };
  }

  // ==========================================================================
  // Data Definition (§17)
  // ==========================================================================

  private parseDataDef(): DataDef {
    const start = this.expectKeyword('DATA');
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.skipNewlines();
    this.match(TokenType.INDENT);
    this.skipNewlines();

    let immutable = false;
    if (this.check(TokenType.KEYWORD, 'IMMUTABLE')) {
      this.advance();
      this.expect(TokenType.COLON);
      immutable = this.current().value === 'TRUE';
      this.advance();
      this.skipNewlines();
    }

    const fields: FieldDef[] = [];
    if (this.check(TokenType.KEYWORD, 'FIELDS')) {
      this.advance();
      this.expect(TokenType.COLON);
      this.skipNewlines();
      this.match(TokenType.INDENT);
      this.skipNewlines();

      while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
        fields.push(this.parseFieldDef());
        this.skipNewlines();
      }

      this.match(TokenType.DEDENT);
    }

    this.match(TokenType.DEDENT);

    return {
      kind: 'DataDef',
      name,
      immutable,
      fields,
      location: this.loc(start),
    };
  }

  private parseFieldDef(): FieldDef {
    const start = this.current();
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expectKeyword('AS');
    const fieldType = this.parseTypeExpr();

    let required = false;
    const constraints: string[] = [];
    let defaultValue: Expression | undefined;
    let derived: string | undefined;

    while (true) {
      if (this.check(TokenType.KEYWORD, 'REQUIRED')) {
        this.advance();
        required = true;
      } else if (this.check(TokenType.KEYWORD, 'OPTIONAL')) {
        // OPTIONAL already encoded in type
        this.advance();
      } else if (this.check(TokenType.KEYWORD, 'CONSTRAIN')) {
        this.advance();
        this.expect(TokenType.COLON);
        constraints.push(this.expect(TokenType.LITERAL_STRING).value);
      } else if (this.check(TokenType.KEYWORD, 'DEFAULT')) {
        this.advance();
        this.expect(TokenType.COLON);
        defaultValue = this.parseExpression();
      } else if (this.check(TokenType.KEYWORD, 'DERIVED')) {
        this.advance();
        this.expect(TokenType.COLON);
        derived = this.expect(TokenType.LITERAL_STRING).value;
      } else {
        break;
      }
    }

    return {
      kind: 'FieldDef',
      name,
      fieldType,
      required,
      constraints,
      defaultValue,
      derived,
      location: this.loc(start),
    };
  }

  // ==========================================================================
  // Enum Definition (§4.3)
  // ==========================================================================

  private parseEnumDef(): EnumDef {
    const start = this.expectKeyword('ENUM');
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.skipNewlines();
    this.match(TokenType.INDENT);
    this.skipNewlines();

    const values: string[] = [];
    let defaultValue: string | undefined;

    if (this.check(TokenType.KEYWORD, 'VALUES')) {
      this.advance();
      this.expect(TokenType.COLON);
      this.skipNewlines();
      this.match(TokenType.INDENT);
      this.skipNewlines();

      while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
        values.push(this.current().value);
        this.advance();
        this.skipNewlines();
      }
      this.match(TokenType.DEDENT);
    }

    this.skipNewlines();
    if (this.check(TokenType.KEYWORD, 'DEFAULT')) {
      this.advance();
      this.expect(TokenType.COLON);
      defaultValue = this.current().value;
      this.advance();
      this.skipNewlines();
    }

    this.match(TokenType.DEDENT);

    return {
      kind: 'EnumDef',
      name,
      values,
      defaultValue,
      location: this.loc(start),
    };
  }

  // ==========================================================================
  // Union Definition (§17.4)
  // ==========================================================================

  private parseUnionDef(): UnionDef {
    const start = this.expectKeyword('UNION');
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.skipNewlines();
    this.match(TokenType.INDENT);
    this.skipNewlines();

    const variants: VariantDef[] = [];
    while (this.check(TokenType.KEYWORD, 'VARIANT')) {
      variants.push(this.parseVariantDef());
      this.skipNewlines();
    }

    this.match(TokenType.DEDENT);

    return {
      kind: 'UnionDef',
      name,
      variants,
      location: this.loc(start),
    };
  }

  private parseVariantDef(): VariantDef {
    const start = this.expectKeyword('VARIANT');
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.skipNewlines();
    this.match(TokenType.INDENT);
    this.skipNewlines();

    const fields: FieldDef[] = [];
    if (this.check(TokenType.KEYWORD, 'FIELDS')) {
      this.advance();
      this.expect(TokenType.COLON);
      this.skipNewlines();
      this.match(TokenType.INDENT);
      this.skipNewlines();

      while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
        fields.push(this.parseFieldDef());
        this.skipNewlines();
      }
      this.match(TokenType.DEDENT);
    }

    this.match(TokenType.DEDENT);

    return {
      kind: 'VariantDef',
      name,
      fields,
      location: this.loc(start),
    };
  }

  // ==========================================================================
  // Alias Definition (§4.4)
  // ==========================================================================

  private parseAliasDef(): AliasDef {
    const start = this.expectKeyword('ALIAS');
    const name = this.current().value;
    this.advance();
    this.expectKeyword('AS');
    const targetType = this.current().value;
    this.advance();

    const constraints: string[] = [];
    while (this.check(TokenType.KEYWORD, 'CONSTRAIN')) {
      this.advance();
      this.expect(TokenType.COLON);
      constraints.push(this.expect(TokenType.LITERAL_STRING).value);
    }

    return {
      kind: 'AliasDef',
      name,
      targetType,
      constraints,
      location: this.loc(start),
    };
  }

  // ==========================================================================
  // External Definition (§7.5)
  // ==========================================================================

  private parseExternalDef(): ExternalDef {
    const start = this.expectKeyword('EXTERNAL');
    const namePath = this.parseDottedPath();
    this.skipNewlines();
    this.match(TokenType.INDENT);
    this.skipNewlines();

    let intent = '';
    const parameters: ParamDecl[] = [];
    let returnType: TypeExpr = { kind: 'SimpleType', name: 'Nothing', location: this.loc(start) };
    let sideEffects: string | undefined;
    let latency: string | undefined;
    let idempotent: boolean | undefined;
    let reversible: boolean | undefined;

    while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
      if (this.check(TokenType.KEYWORD, 'INTENT')) {
        intent = this.parseIntentBlock();
      } else if (this.check(TokenType.KEYWORD, 'RECEIVE')) {
        const params = this.parseReceiveBlock();
        parameters.push(...params);
      } else if (this.check(TokenType.KEYWORD, 'RETURN')) {
        returnType = this.parseReturnDecl();
      } else if (this.check(TokenType.KEYWORD, 'SIDE_EFFECTS')) {
        this.advance();
        this.expect(TokenType.COLON);
        sideEffects = this.expect(TokenType.LITERAL_STRING).value;
      } else if (this.check(TokenType.KEYWORD, 'LATENCY')) {
        this.advance();
        this.expect(TokenType.COLON);
        latency = this.current().value;
        this.advance();
      } else if (this.check(TokenType.KEYWORD, 'IDEMPOTENT')) {
        this.advance();
        this.expect(TokenType.COLON);
        idempotent = this.current().value === 'TRUE';
        this.advance();
      } else if (this.check(TokenType.KEYWORD, 'REVERSIBLE')) {
        this.advance();
        this.expect(TokenType.COLON);
        reversible = this.current().value === 'TRUE';
        this.advance();
      } else {
        break;
      }
      this.skipNewlines();
    }

    this.match(TokenType.DEDENT);

    return {
      kind: 'ExternalDef',
      name: namePath.join('.'),
      intent,
      parameters,
      returnType,
      sideEffects,
      latency,
      idempotent,
      reversible,
      location: this.loc(start),
    };
  }

  // ==========================================================================
  // Validator Definition (§12.4)
  // ==========================================================================

  private parseValidatorDef(): ValidatorDef {
    const start = this.expectKeyword('VALIDATOR');
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.skipNewlines();
    this.match(TokenType.INDENT);
    this.skipNewlines();

    let appliesTo = '';
    let check = '';
    let message = '';

    while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
      if (this.check(TokenType.KEYWORD, 'APPLIES')) {
        this.advance();
        this.expectKeyword('TO');
        this.expect(TokenType.COLON);
        appliesTo = this.current().value;
        this.advance();
      } else if (this.check(TokenType.KEYWORD, 'CHECK')) {
        this.advance();
        this.expect(TokenType.COLON);
        check = this.expect(TokenType.LITERAL_STRING).value;
      } else if (this.check(TokenType.KEYWORD, 'MESSAGE')) {
        this.advance();
        this.expect(TokenType.COLON);
        message = this.expect(TokenType.LITERAL_STRING).value;
      } else {
        break;
      }
      this.skipNewlines();
    }

    this.match(TokenType.DEDENT);

    return {
      kind: 'ValidatorDef',
      name,
      appliesTo,
      check,
      message,
      location: this.loc(start),
    };
  }

  // ==========================================================================
  // Dotted Path Helper
  // ==========================================================================

  private parseDottedPath(): string[] {
    const parts: string[] = [];
    // Accept both identifiers and keywords as path segments
    const tok = this.current();
    if (tok.type === TokenType.IDENTIFIER || tok.type === TokenType.KEYWORD) {
      parts.push(this.advance().value);
    } else {
      throw new ParseError(
        `Expected identifier but found ${tok.type}(${tok.value})`,
        tok.location.line,
        tok.location.column,
      );
    }

    while (this.check(TokenType.DOT)) {
      this.advance(); // skip dot
      const next = this.current();
      if (next.type === TokenType.IDENTIFIER || next.type === TokenType.KEYWORD) {
        parts.push(this.advance().value);
      } else {
        throw new ParseError(
          `Expected identifier after '.' but found ${next.type}(${next.value})`,
          next.location.line,
          next.location.column,
        );
      }
    }

    return parts;
  }
}

/**
 * Convenience function to parse VibeL tokens into an AST.
 */
export function parse(tokens: Token[]): Program {
  return new Parser(tokens).parse();
}
