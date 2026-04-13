import { describe, it, expect } from 'vitest';
import { BoundaryExtractor } from '../extractor.js';
import { TestGenerator } from '../generator.js';
import { Fuzzer } from '../fuzzer.js';
import { LabeledSpecExpr } from '../../ast/nodes.js';

describe('TestGen: Boundary Extractor & Generator', () => {
  it('extracts numeric boundaries', () => {
    const extractor = new BoundaryExtractor();
    const specs: LabeledSpecExpr[] = [
      {
        kind: 'LabeledSpecExpr',
        expression: {
          kind: 'SpecComparison',
          left: { kind: 'SpecFieldRef', path: ['amount'], location: {} as any },
          operator: 'GREATER_OR_EQUAL',
          right: { kind: 'SpecFieldRef', path: ['100'], location: {} as any },
          location: {} as any
        },
        location: {} as any
      }
    ];

    const boundaries = extractor.extract(specs);
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0]).toEqual({
      type: 'numeric',
      field: 'amount',
      value: 100,
      operator: 'GREATER_OR_EQUAL'
    });
  });

  it('generates test scenarios across boundaries', () => {
    const generator = new TestGenerator();
    const scenarios = generator.generate([
      { type: 'numeric', field: 'amount', value: 100, operator: 'GREATER_OR_EQUAL' }
    ], { otherParam: true });

    // Expecting 3 scenarios for >= (exact, above, below)
    expect(scenarios).toHaveLength(3);
    
    // Check below boundary
    const invalid = scenarios.find(s => s.type === 'invalid');
    expect(invalid?.params['amount']).toBe(99);
    
    // Check valid boundaries
    const valids = scenarios.filter(s => s.type === 'valid');
    expect(valids.map(v => v.params['amount'])).toContain(100);
    expect(valids.map(v => v.params['amount'])).toContain(101);
  });
});

describe('TestGen: Fuzzer', () => {
  it('generates valid base types', () => {
    const fuzzer = new Fuzzer();
    const boolVal = fuzzer.generateRandomValue({ kind: 'SimpleType', name: 'Boolean', location: {} as any });
    expect(typeof boolVal).toBe('boolean');

    const intVal = fuzzer.generateRandomValue({ kind: 'SimpleType', name: 'Integer', location: {} as any });
    expect(typeof intVal).toBe('number');
  });
});
