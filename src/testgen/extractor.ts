import { LabeledSpecExpr, SpecExpression, SpecComparison, SpecArithmetic } from '../ast/nodes.js';

export type ExtractedBoundary = 
  | NumericBoundary 
  | InBoundary
  | ContainsBoundary
  | NullBoundary;

export interface NumericBoundary {
  type: 'numeric';
  field: string;
  value: number;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'GREATER_OR_EQUAL' | 'LESS_OR_EQUAL';
}

export interface InBoundary {
  type: 'in';
  field: string;
  values: unknown[];
  negated: boolean;
}

export interface ContainsBoundary {
  type: 'contains';
  field: string;
  value: unknown;
}

export interface NullBoundary {
  type: 'null';
  field: string;
  negated: boolean;
}

/**
 * Extracts testable properties and heuristics from ENSURE BEFORE specifications.
 */
export class BoundaryExtractor {
  extract(specs: LabeledSpecExpr[]): ExtractedBoundary[] {
    const boundaries: ExtractedBoundary[] = [];
    
    for (const spec of specs) {
      this.extractFromExpr(spec.expression, boundaries);
    }
    
    return boundaries;
  }

  private extractFromExpr(expr: SpecExpression, boundaries: ExtractedBoundary[]): void {
    switch (expr.kind) {
      case 'SpecBinary':
        // Try to evaluate both sides
        this.extractFromExpr(expr.left, boundaries);
        this.extractFromExpr(expr.right, boundaries);
        break;

      case 'SpecComparison':
        this.extractComparison(expr, boundaries);
        break;

      case 'SpecIn': {
        if (expr.field.kind === 'SpecFieldRef') {
          const field = expr.field.path.join('.');
          const values = expr.values.map(v => {
            if (v.kind === 'LiteralExpr') return v.value;
            return undefined; // Too complex for simple heuristics
          }).filter(v => v !== undefined);
          boundaries.push({ type: 'in', field, values, negated: expr.negated });
        }
        break;
      }

      case 'SpecContains': {
        if (expr.collection.kind === 'SpecFieldRef' && expr.value.kind === 'SpecFieldRef' && expr.value.path[0].match(/^[A-Z"/0-9]/)) {
          // If the value looks like a literal passed through fields
          boundaries.push({ type: 'contains', field: expr.collection.path.join('.'), value: expr.value.path[0] });
        }
        break;
      }

      case 'SpecIsNothing': {
        if (expr.field.kind === 'SpecFieldRef') {
          boundaries.push({ type: 'null', field: expr.field.path.join('.'), negated: expr.negated });
        }
        break;
      }
    }
  }

  private extractComparison(expr: SpecComparison, boundaries: ExtractedBoundary[]): void {
    let field: string | null = null;
    let value: number | null = null;

    if (expr.left.kind === 'SpecFieldRef') {
      field = expr.left.path.join('.');
    }
    
    if (expr.right.kind === 'SpecFieldRef') {
      const rhs = parseFloat(expr.right.path[0]);
      if (!isNaN(rhs)) {
        value = rhs;
      }
    }

    if (field && value !== null) {
      boundaries.push({ type: 'numeric', field, value, operator: expr.operator });
    } else if (expr.right.kind === 'SpecFieldRef') {
      // Invert 100 < x
      const lhs = parseFloat(expr.left.kind === 'SpecFieldRef' ? expr.left.path[0] : '');
      const varField = expr.right.path.join('.');
      if (!isNaN(lhs)) {
        let op: NumericBoundary['operator'] = 'EQUALS';
        if (expr.operator === 'LESS_THAN') op = 'GREATER_THAN';
        if (expr.operator === 'GREATER_THAN') op = 'LESS_THAN';
        if (expr.operator === 'LESS_OR_EQUAL') op = 'GREATER_OR_EQUAL';
        if (expr.operator === 'GREATER_OR_EQUAL') op = 'LESS_OR_EQUAL';
        if (expr.operator === 'NOT_EQUALS') op = 'NOT_EQUALS';
        
        boundaries.push({ type: 'numeric', field: varField, value: lhs, operator: op });
      }
    }
  }
}
