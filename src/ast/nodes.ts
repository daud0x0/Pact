// ============================================================================
// VibeL Abstract Syntax Tree Node Definitions
// Spec Reference: Sections 4-19, EBNF Grammar §27
// ============================================================================

import { SourceLocation } from '../lexer/tokens.js';

// ============================================================================
// Base
// ============================================================================

/** Source range for error reporting */
export interface SourceRange {
  start: SourceLocation;
  end: SourceLocation;
}

/** Base interface for all AST nodes */
export interface BaseNode {
  kind: string;
  location: SourceRange;
}

// ============================================================================
// Program (top-level)
// ============================================================================

export interface Program extends BaseNode {
  kind: 'Program';
  module: ModuleDecl;
  imports: ImportStmt[];
  definitions: Definition[];
}

export type Definition =
  | FunctionDef
  | TypeDef
  | DataDef
  | EnumDef
  | UnionDef
  | AliasDef
  | ExternalDef
  | ValidatorDef;

// ============================================================================
// Module & Imports (§16)
// ============================================================================

export interface ModuleDecl extends BaseNode {
  kind: 'ModuleDecl';
  path: string[];  // e.g. ['payments', 'transfers']
  invariants: SpecExpression[];
  aiVerification?: string;
}

export interface ImportStmt extends BaseNode {
  kind: 'ImportStmt';
  path: string[];       // e.g. ['payments', 'accounts']
  alias: string;        // e.g. 'accounts'
}

// ============================================================================
// Type Expressions (§4)
// ============================================================================

export type TypeExpr =
  | SimpleType
  | OptionalType
  | ListType
  | MapType
  | EitherType;

export interface SimpleType extends BaseNode {
  kind: 'SimpleType';
  name: string;
}

export interface OptionalType extends BaseNode {
  kind: 'OptionalType';
  inner: TypeExpr;
}

export interface ListType extends BaseNode {
  kind: 'ListType';
  elementType: TypeExpr;
}

export interface MapType extends BaseNode {
  kind: 'MapType';
  keyType: TypeExpr;
  valueType: TypeExpr;
}

export interface EitherType extends BaseNode {
  kind: 'EitherType';
  left: TypeExpr;
  right: TypeExpr;
}

// ============================================================================
// Type Definitions (§4.2)
// ============================================================================

export interface TypeDef extends BaseNode {
  kind: 'TypeDef';
  name: string;
  baseType: string;
  constraints: string[];
  normalize?: string;
  currency?: string;
  immutable?: boolean;
}

// ============================================================================
// Data Definitions (§17)
// ============================================================================

export interface DataDef extends BaseNode {
  kind: 'DataDef';
  name: string;
  immutable: boolean;
  fields: FieldDef[];
}

export interface FieldDef extends BaseNode {
  kind: 'FieldDef';
  name: string;
  fieldType: TypeExpr;
  required: boolean;
  constraints: string[];
  defaultValue?: Expression;
  derived?: string;
}

// ============================================================================
// Enum Definitions (§4.3)
// ============================================================================

export interface EnumDef extends BaseNode {
  kind: 'EnumDef';
  name: string;
  values: string[];
  defaultValue?: string;
}

// ============================================================================
// Union Definitions (§17.4)
// ============================================================================

export interface UnionDef extends BaseNode {
  kind: 'UnionDef';
  name: string;
  variants: VariantDef[];
}

export interface VariantDef extends BaseNode {
  kind: 'VariantDef';
  name: string;
  fields: FieldDef[];
}

// ============================================================================
// Alias Definitions (§4.4)
// ============================================================================

export interface AliasDef extends BaseNode {
  kind: 'AliasDef';
  name: string;
  targetType: string;
  constraints: string[];
}

// ============================================================================
// External Definitions (§7.5)
// ============================================================================

export interface ExternalDef extends BaseNode {
  kind: 'ExternalDef';
  name: string;
  intent: string;
  parameters: ParamDecl[];
  returnType: TypeExpr;
  sideEffects?: string;
  latency?: string;
  idempotent?: boolean;
  reversible?: boolean;
}

// ============================================================================
// Validator Definitions (§12.4)
// ============================================================================

export interface ValidatorDef extends BaseNode {
  kind: 'ValidatorDef';
  name: string;
  appliesTo: string;
  check: string;
  message: string;
}

// ============================================================================
// Function Definitions (§5)
// ============================================================================

export interface FunctionDef extends BaseNode {
  kind: 'FunctionDef';
  name: string;
  exported: boolean;
  intent: string;
  effects: EffectBlock;
  parameters: ParamDecl[];
  returnType: TypeExpr;
  ensureBefore: LabeledSpecExpr[];
  ensureAfter: SpecExpression[];
  invariants: SpecExpression[];
  onFailure: Statement[];
  onSuccess: Statement[];
  body: Statement[];
}

export interface EffectBlock {
  reads: string[][];    // each is a dotted path e.g. ['user', 'balance']
  writes: string[][];
  calls: string[][];
  emits: string[][];
}

// ============================================================================
// Parameter Declarations (§8)
// ============================================================================

export interface ParamDecl extends BaseNode {
  kind: 'ParamDecl';
  name: string;
  paramType: TypeExpr;
  constraints: string[];
  defaultValue?: Expression;
  validators: string[];
  eachConstraints: string[];
}

// ============================================================================
// Spec Expressions (§9-12)
// ============================================================================

export interface LabeledSpecExpr extends BaseNode {
  kind: 'LabeledSpecExpr';
  label?: string;
  expression: SpecExpression;
}

export type SpecExpression =
  | SpecComparison
  | SpecBinary
  | SpecNot
  | SpecIsNothing
  | SpecIn
  | SpecContains
  | SpecLength
  | SpecPrior
  | SpecConditional
  | SpecQuantifier
  | SpecFieldRef
  | SpecReturnValue
  | SpecArithmetic;

export interface SpecComparison extends BaseNode {
  kind: 'SpecComparison';
  left: SpecExpression;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'GREATER_OR_EQUAL' | 'LESS_OR_EQUAL';
  right: SpecExpression;
}

export interface SpecBinary extends BaseNode {
  kind: 'SpecBinary';
  left: SpecExpression;
  operator: 'AND' | 'OR';
  right: SpecExpression;
}

export interface SpecNot extends BaseNode {
  kind: 'SpecNot';
  operand: SpecExpression;
}

export interface SpecIsNothing extends BaseNode {
  kind: 'SpecIsNothing';
  field: SpecExpression;
  negated: boolean; // true = IS NOT NOTHING
}

export interface SpecIn extends BaseNode {
  kind: 'SpecIn';
  field: SpecExpression;
  values: Expression[];
  negated: boolean; // true = NOT IN
}

export interface SpecContains extends BaseNode {
  kind: 'SpecContains';
  collection: SpecExpression;
  value: SpecExpression;
}

export interface SpecLength extends BaseNode {
  kind: 'SpecLength';
  collection: SpecExpression;
}

export interface SpecPrior extends BaseNode {
  kind: 'SpecPrior';
  field: string[];  // dotted path
}

export interface SpecConditional extends BaseNode {
  kind: 'SpecConditional';
  condition: SpecExpression;
  body: SpecExpression[];
}

export interface SpecQuantifier extends BaseNode {
  kind: 'SpecQuantifier';
  quantifier: 'ALL' | 'ANY';
  variable: string;
  collection: SpecExpression;
  condition: SpecExpression;
}

export interface SpecFieldRef extends BaseNode {
  kind: 'SpecFieldRef';
  path: string[];
}

export interface SpecReturnValue extends BaseNode {
  kind: 'SpecReturnValue';
}

export interface SpecArithmetic extends BaseNode {
  kind: 'SpecArithmetic';
  left: SpecExpression;
  operator: 'PLUS' | 'MINUS' | 'TIMES' | 'DIVIDED_BY' | 'MOD';
  right: SpecExpression;
}

// ============================================================================
// Statements (§14)
// ============================================================================

export type Statement =
  | LetStmt
  | AssignStmt
  | WriteStmt
  | CallStmt
  | ReturnStmt
  | AbortStmt
  | RollbackStmt
  | IfStmt
  | MatchStmt
  | ForStmt
  | WhileStmt
  | NotifyStmt
  | EmitStmt
  | AssertStmt;

export interface LetStmt extends BaseNode {
  kind: 'LetStmt';
  name: string;
  mutable: boolean;
  value: Expression;
}

export interface AssignStmt extends BaseNode {
  kind: 'AssignStmt';
  target: string;
  value: Expression;
}

export interface WriteStmt extends BaseNode {
  kind: 'WriteStmt';
  target: string[];     // dotted path
  mode: 'AS' | 'APPEND';
  value: Expression;
}

export interface CallStmt extends BaseNode {
  kind: 'CallStmt';
  target: string[];     // dotted path
  args: CallArg[];
  resultBinding?: string;
}

export interface CallArg {
  name: string;
  value: Expression;
}

export interface ReturnStmt extends BaseNode {
  kind: 'ReturnStmt';
  value: Expression;
}

export interface AbortStmt extends BaseNode {
  kind: 'AbortStmt';
  reason: Expression;
}

export interface RollbackStmt extends BaseNode {
  kind: 'RollbackStmt';
  andAbort: boolean;
  reason?: Expression;
}

export interface IfStmt extends BaseNode {
  kind: 'IfStmt';
  condition: Expression;
  thenBlock: Statement[];
  elseIfClauses: ElseIfClause[];
  elseBlock: Statement[];
}

export interface ElseIfClause {
  condition: Expression;
  body: Statement[];
}

export interface MatchStmt extends BaseNode {
  kind: 'MatchStmt';
  subject: Expression;
  cases: MatchCase[];
  wildcard?: Statement[];
}

export interface MatchCase {
  pattern: string;
  binding?: string;
  body: Statement[];
}

export interface ForStmt extends BaseNode {
  kind: 'ForStmt';
  variable: string;
  indexVariable?: string;
  collection: Expression;
  body: Statement[];
}

export interface WhileStmt extends BaseNode {
  kind: 'WhileStmt';
  condition: Expression;
  body: Statement[];
}

export interface NotifyStmt extends BaseNode {
  kind: 'NotifyStmt';
  target: string[];
  message: Expression;
}

export interface EmitStmt extends BaseNode {
  kind: 'EmitStmt';
  event: string[];
  data: Expression;
}

export interface AssertStmt extends BaseNode {
  kind: 'AssertStmt';
  condition: Expression;
  reason: Expression;
}

// ============================================================================
// Expressions (§19)
// ============================================================================

export type Expression =
  | BinaryExpr
  | UnaryExpr
  | LiteralExpr
  | IdentifierExpr
  | FieldAccessExpr
  | FunctionCallExpr
  | PriorExpr
  | CastExpr
  | MakeExpr
  | SafeAccessExpr
  | OtherwiseExpr
  | ListLiteralExpr
  | RecordLiteralExpr
  | ReadExpr;

export interface BinaryExpr extends BaseNode {
  kind: 'BinaryExpr';
  left: Expression;
  operator: string;
  right: Expression;
  rounding?: RoundingDirective;
}

export interface RoundingDirective {
  mode: 'DECIMAL_PLACES' | 'INTEGER';
  places?: number;
}

export interface UnaryExpr extends BaseNode {
  kind: 'UnaryExpr';
  operator: 'NOT' | 'MINUS';
  operand: Expression;
}

export interface LiteralExpr extends BaseNode {
  kind: 'LiteralExpr';
  literalType: 'Integer' | 'Decimal' | 'Text' | 'Boolean' | 'Nothing';
  value: string | number | boolean | null;
}

export interface IdentifierExpr extends BaseNode {
  kind: 'IdentifierExpr';
  name: string;
}

export interface FieldAccessExpr extends BaseNode {
  kind: 'FieldAccessExpr';
  path: string[];
}

export interface FunctionCallExpr extends BaseNode {
  kind: 'FunctionCallExpr';
  name: string;
  args: CallArg[];
}

export interface PriorExpr extends BaseNode {
  kind: 'PriorExpr';
  field: string[];
}

export interface CastExpr extends BaseNode {
  kind: 'CastExpr';
  value: Expression;
  targetType: string;
}

export interface MakeExpr extends BaseNode {
  kind: 'MakeExpr';
  typeName: string;
  source: Expression;
  currency?: string;
}

export interface SafeAccessExpr extends BaseNode {
  kind: 'SafeAccessExpr';
  base: Expression;
  field: string;
}

export interface OtherwiseExpr extends BaseNode {
  kind: 'OtherwiseExpr';
  value: Expression;
  fallback: Expression;
}

export interface ListLiteralExpr extends BaseNode {
  kind: 'ListLiteralExpr';
  elements: Expression[];
}

export interface RecordLiteralExpr extends BaseNode {
  kind: 'RecordLiteralExpr';
  fields: RecordField[];
}

export interface RecordField {
  name: string;
  value: Expression;
}

export interface ReadExpr extends BaseNode {
  kind: 'ReadExpr';
  field: string[];
}
