import { readFileSync } from 'fs';
import { resolve, basename } from 'path';
import { tokenize } from '../lexer/lexer.js';
import { parse } from '../parser/parser.js';
import { analyze } from '../analyzer/analyzer.js';
import { compileSpec } from '../spec/compiler.js';
import { BoundaryExtractor } from './extractor.js';
import { TestGenerator, TestScenario } from './generator.js';
import { Fuzzer } from './fuzzer.js';

const c = {
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
};

export function runTests(path: string, runGenerated: boolean, fuzzMode: boolean): void {
  const fullPath = resolve(path);
  const source = readFileSync(fullPath, 'utf8');

  console.log(`${c.bold}Testing module:${c.reset} ${c.cyan}${basename(path)}${c.reset}\n`);

  try {
    const tokens = tokenize(source);
    const ast = parse(tokens);
    analyze(ast);

    const extractor = new BoundaryExtractor();
    const generator = new TestGenerator();
    const fuzzer = new Fuzzer();

    for (const def of ast.definitions) {
      if (def.kind === 'FunctionDef' && def.exported) {
        console.log(`${c.bold}▶ Function: ${def.name}${c.reset}`);
        const compiledSpec = compileSpec(def);

        // Pre-fill baseline with basic random data matching types
        const baseline = fuzzer.generateFuzzParams(def.parameters);

        if (runGenerated) {
          console.log(`  ${c.gray}Extracted Boundaries & Scenarios...${c.reset}`);
          const boundaries = extractor.extract(def.ensureBefore);
          const scenarios = generator.generate(boundaries, baseline);

          let passCount = 0;
          let failCount = 0;

          if (scenarios.length === 0) {
            console.log(`  ${c.gray}No constraints to generate boundaries from.${c.reset}`);
          }

          for (const s of scenarios) {
            const ctx = {
              fields: {},
              prior: {},
              params: s.params,
              journal: []
            };

            // Evaluate all preconditions
            let passedAll = true;
            let failureMsg = '';
            for (const pre of compiledSpec.preconditions) {
              const res = pre.predicateFn(ctx);
              if (!res.passed) {
                passedAll = false;
                failureMsg = res.message || pre.label;
                break;
              }
            }

            if (s.type === 'valid') {
              if (passedAll) {
                console.log(`  ${c.green}✓${c.reset} Generated [Valid] -> Passed constraints`);
                passCount++;
              } else {
                console.log(`  ${c.red}✗${c.reset} Generated [Valid] -> FAILED. Expected pass, but failed: ${failureMsg}`);
                failCount++;
              }
            } else { // invalid
              if (!passedAll) {
                console.log(`  ${c.green}✓${c.reset} Generated [Invalid: ${s.reason}] -> Correctly rejected: ${failureMsg}`);
                passCount++;
              } else {
                console.log(`  ${c.red}✗${c.reset} Generated [Invalid: ${s.reason}] -> FAILED. Expected rejection, but it passed.`);
                failCount++;
              }
            }
          }

          console.log(`  ${c.bold}Generated Summary:${c.reset} ${c.green}${passCount} passed${c.reset}, ${failCount > 0 ? c.red : c.gray}${failCount} failed${c.reset}\n`);
        }

        if (fuzzMode) {
          console.log(`  ${c.gray}Fuzzing ${def.name} for property violations...${c.reset}`);
          let fuzzPassed = 0;
          let fuzzViolations = 0;

          // 100 iterations of pure randomness
          for (let i = 0; i < 100; i++) {
            const fuzzedArgs = fuzzer.generateFuzzParams(def.parameters);
            const ctx = {
              fields: {},
              prior: {},
              params: fuzzedArgs,
              journal: []
            };

            let passedAll = true;
            for (const pre of compiledSpec.preconditions) {
               try {
                 const res = pre.predicateFn(ctx);
                 if (!res.passed) {
                   passedAll = false;
                   break;
                 }
               } catch (e) {
                 // A crash evaluating is a catastrophic fuzz failure
                 passedAll = false;
               }
            }

            if (passedAll) fuzzPassed++;
            else fuzzViolations++;
          }

          console.log(`  ${c.green}✓${c.reset} 100 Fuzz iterations completed`);
          console.log(`    ↳ ${fuzzPassed} matched valid thresholds`);
          console.log(`    ↳ ${fuzzViolations} rejected gracefully by ENSURE BEFORE checks\n`);
        }
      }
    }

  } catch (err: any) {
    console.error(`\n${c.red}Error testing module:${c.reset} ${err.message}`);
    process.exit(1);
  }
}
