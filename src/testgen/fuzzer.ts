import { ParamDecl, TypeExpr } from '../ast/nodes.js';

export class Fuzzer {
  generateRandomValue(type: TypeExpr): unknown {
    if (type.kind === 'SimpleType') {
      switch (type.name) {
        case 'Integer':
          return Math.floor(Math.random() * 200000) - 100000;
        case 'Decimal':
          return (Math.random() * 200000) - 100000;
        case 'Text':
          return Math.random().toString(36).substring(2, 15);
        case 'Boolean':
          return Math.random() > 0.5;
        case 'UserId':
        case 'Email':
        case 'Timestamp':
          return `fuzz_${Math.random().toString(36).substring(2, 8)}`;
        default:
          return {}; // Mock objects / aliases
      }
    }
    
    if (type.kind === 'OptionalType') {
      return Math.random() > 0.5 ? null : this.generateRandomValue(type.inner);
    }
    
    if (type.kind === 'ListType') {
      const len = Math.floor(Math.random() * 5);
      const arr = [];
      for (let i=0; i<len; i++) arr.push(this.generateRandomValue(type.elementType));
      return arr;
    }

    return null; // Fallback
  }

  generateFuzzParams(params: ParamDecl[]): Record<string, unknown> {
    const fuzzParams: Record<string, unknown> = {};
    for (const p of params) {
      fuzzParams[p.name] = this.generateRandomValue(p.paramType);
    }
    return fuzzParams;
  }
}
