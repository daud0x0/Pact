import { ExtractedBoundary } from './extractor.js';

export interface TestScenario {
  type: 'valid' | 'invalid';
  reason?: string;
  params: Record<string, unknown>;
}

export class TestGenerator {
  generate(boundaries: ExtractedBoundary[], baseParams: Record<string, unknown>): TestScenario[] {
    const scenarios: TestScenario[] = [];

    // Always start with a baseline that passes everything conceptually,
    // though in reality we just generate variations for each boundary.
    const baseline = { ...baseParams };

    for (const b of boundaries) {
      if (b.type === 'numeric') {
        const fieldName = b.field;
        const val = b.value;

        switch (b.operator) {
          case 'GREATER_THAN':
            scenarios.push({ type: 'valid', params: { ...baseline, [fieldName]: val + 1 } });
            scenarios.push({ type: 'invalid', reason: `${fieldName} > ${val}`, params: { ...baseline, [fieldName]: val } });
            break;
          case 'GREATER_OR_EQUAL':
            scenarios.push({ type: 'valid', params: { ...baseline, [fieldName]: val } });
            scenarios.push({ type: 'valid', params: { ...baseline, [fieldName]: val + 1 } });
            scenarios.push({ type: 'invalid', reason: `${fieldName} >= ${val}`, params: { ...baseline, [fieldName]: val - 1 } });
            break;
          case 'LESS_THAN':
            scenarios.push({ type: 'valid', params: { ...baseline, [fieldName]: val - 1 } });
            scenarios.push({ type: 'invalid', reason: `${fieldName} < ${val}`, params: { ...baseline, [fieldName]: val } });
            break;
          case 'LESS_OR_EQUAL':
            scenarios.push({ type: 'valid', params: { ...baseline, [fieldName]: val } });
            scenarios.push({ type: 'invalid', reason: `${fieldName} <= ${val}`, params: { ...baseline, [fieldName]: val + 1 } });
            break;
          case 'EQUALS':
            scenarios.push({ type: 'valid', params: { ...baseline, [fieldName]: val } });
            scenarios.push({ type: 'invalid', reason: `${fieldName} == ${val}`, params: { ...baseline, [fieldName]: val + 1 } });
            break;
          case 'NOT_EQUALS':
            scenarios.push({ type: 'valid', params: { ...baseline, [fieldName]: val + 1 } });
            scenarios.push({ type: 'invalid', reason: `${fieldName} != ${val}`, params: { ...baseline, [fieldName]: val } });
            break;
        }
      } else if (b.type === 'in') {
        if (!b.negated && b.values.length > 0) {
          scenarios.push({ type: 'valid', params: { ...baseline, [b.field]: b.values[0] } });
        } else if (b.negated && b.values.length > 0) {
          scenarios.push({ type: 'invalid', reason: `not in [${b.values.join(',')}]`, params: { ...baseline, [b.field]: b.values[0] } });
        }
      } else if (b.type === 'null') {
        if (b.negated) {
          // IS NOT NOTHING
          scenarios.push({ type: 'valid', params: { ...baseline, [b.field]: "SomeValue" } });
          scenarios.push({ type: 'invalid', reason: `${b.field} IS NOT NOTHING`, params: { ...baseline, [b.field]: null } });
        } else {
          // IS NOTHING
          scenarios.push({ type: 'valid', params: { ...baseline, [b.field]: null } });
          scenarios.push({ type: 'invalid', reason: `${b.field} IS NOTHING`, params: { ...baseline, [b.field]: "SomeValue" } });
        }
      }
    }

    return scenarios;
  }
}
