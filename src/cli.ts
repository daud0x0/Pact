#!/usr/bin/env node
// ============================================================================
// VibeL CLI — vibelang command
// ============================================================================

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, extname, basename, dirname, join } from 'path';
import { compile } from './index.js';
import { formatDiagnostics } from './errors.js';
import { generateJS } from './codegen/js-esm.js';
import { formatVbl, checkFormatting } from './fmt/formatter.js';
import { tokenize } from './lexer/lexer.js';
import { parse } from './parser/parser.js';

const VERSION = '0.1.0';

// ANSI colors
const c = {
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
};

function printBanner(): void {
  console.log(`${c.bold}${c.cyan}
  ╦  ╦╦╔╗ ╔═╗╦    ╔═╗╔╗╔╔═╗
  ╚╗╔╝║╠╩╗║╣ ║    ╠═╣║║║║ ╦
   ╚╝ ╩╚═╝╚═╝╩═╝  ╩ ╩╝╚╝╚═╝ v${VERSION}
${c.reset}  ${c.gray}AI-First Programming Language Compiler${c.reset}
`);
}

function printUsage(): void {
  printBanner();
  console.log(`${c.bold}USAGE:${c.reset}
  vibelang <command> [options] <path>

${c.bold}COMMANDS:${c.reset}
  ${c.cyan}check${c.reset}     Analyze source files for errors and warnings
  ${c.cyan}compile${c.reset}   Compile .vbl → JavaScript ES Modules
  ${c.cyan}fmt${c.reset}       Format source files (in-place or check mode)
  ${c.cyan}repl${c.reset}      Interactive evaluation environment
  ${c.cyan}test${c.reset}      Run property-based and fuzzer tests
  ${c.cyan}prove${c.reset}     Formally verify postconditions and invariants
  ${c.cyan}version${c.reset}   Print version information

${c.bold}COMPILE OPTIONS:${c.reset}
  ${c.gray}--out <dir>${c.reset}     Output directory (default: dist/)
  ${c.gray}--target${c.reset}       Compilation target (default: js-esm)
  ${c.gray}--no-verify${c.reset}    Skip runtime verification injection

${c.bold}FMT OPTIONS:${c.reset}
  ${c.gray}--check${c.reset}        Check formatting without modifying files

${c.bold}EXAMPLES:${c.reset}
  vibelang check src/payments/transfers.vbl
  vibelang compile examples/ --out dist
  vibelang fmt src/ --check
  vibelang repl
`);
}

function collectVblFiles(path: string): string[] {
  const resolved = resolve(path);
  const stat = statSync(resolved);

  if (stat.isFile()) {
    if (extname(resolved) === '.vbl') return [resolved];
    console.error(`${c.red}Error:${c.reset} Not a .vbl file: ${path}`);
    process.exit(1);
  }

  if (stat.isDirectory()) {
    const files: string[] = [];
    const entries = readdirSync(resolved, { recursive: true, encoding: 'utf8' }) as string[];
    for (const entry of entries) {
      if (extname(entry) === '.vbl') {
        files.push(resolve(resolved, entry));
      }
    }
    return files;
  }

  return [];
}

function checkCommand(path: string): void {
  const files = collectVblFiles(path);

  if (files.length === 0) {
    console.log(`${c.yellow}No .vbl files found in ${path}${c.reset}`);
    process.exit(0);
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalFiles = 0;

  for (const file of files) {
    totalFiles++;
    const source = readFileSync(file, 'utf8');

    try {
      const result = compile(source);

      // Attach file path to diagnostics
      for (const d of result.diagnostics) {
        d.source = file;
      }

      if (result.diagnostics.length > 0) {
        console.log(formatDiagnostics(result.diagnostics, source));
        console.log();
      }

      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;
    } catch (err: any) {
      totalErrors++;
      console.error(`${c.red}${c.bold}error${c.reset}: ${err.message}`);
      console.error(`  ${c.gray}-->${c.reset} ${c.cyan}${file}${c.reset}`);
      console.log();
    }
  }

  // Summary
  console.log(`${c.gray}───────────────────────────────────────${c.reset}`);
  console.log(`  ${c.bold}Files checked:${c.reset}  ${totalFiles}`);

  if (totalErrors > 0) {
    console.log(`  ${c.red}${c.bold}Errors:${c.reset}         ${totalErrors}`);
  } else {
    console.log(`  ${c.green}${c.bold}Errors:${c.reset}         0`);
  }

  if (totalWarnings > 0) {
    console.log(`  ${c.yellow}${c.bold}Warnings:${c.reset}       ${totalWarnings}`);
  } else {
    console.log(`  ${c.bold}Warnings:${c.reset}       0`);
  }

  if (totalErrors === 0) {
    console.log(`\n  ${c.green}${c.bold}✓ All checks passed!${c.reset}`);
  }

  console.log();
  process.exit(totalErrors > 0 ? 1 : 0);
}

function compileCommand(path: string, outDir: string, verification: boolean): void {
  const files = collectVblFiles(path);

  if (files.length === 0) {
    console.log(`${c.yellow}No .vbl files found in ${path}${c.reset}`);
    process.exit(0);
  }

  let totalErrors = 0;
  let totalFiles = 0;
  let totalGenerated = 0;

  // Ensure output directory exists
  mkdirSync(outDir, { recursive: true });

  for (const file of files) {
    totalFiles++;
    const source = readFileSync(file, 'utf8');

    try {
      const result = compile(source);

      if (result.errors.length > 0) {
        totalErrors += result.errors.length;
        for (const d of result.diagnostics) {
          d.source = file;
        }
        console.log(formatDiagnostics(result.diagnostics, source));
        continue;
      }

      // Generate JS
      const js = generateJS(result.ast, { verification });

      // Output filename: same name, .js extension
      const outFile = join(outDir, basename(file, '.vbl') + '.js');
      writeFileSync(outFile, js, 'utf8');
      totalGenerated++;

      console.log(`  ${c.green}✓${c.reset} ${c.cyan}${basename(file)}${c.reset} → ${c.gray}${outFile}${c.reset}`);

    } catch (err: any) {
      totalErrors++;
      console.error(`${c.red}${c.bold}error${c.reset}: ${err.message}`);
      console.error(`  ${c.gray}-->${c.reset} ${c.cyan}${file}${c.reset}`);
    }
  }

  // Summary
  console.log();
  console.log(`${c.gray}───────────────────────────────────────${c.reset}`);
  console.log(`  ${c.bold}Files processed:${c.reset}  ${totalFiles}`);
  console.log(`  ${c.bold}Generated:${c.reset}        ${totalGenerated}`);
  console.log(`  ${c.bold}Output:${c.reset}           ${outDir}`);
  console.log(`  ${c.bold}Verification:${c.reset}     ${verification ? `${c.green}enabled${c.reset}` : `${c.yellow}disabled${c.reset}`}`);

  if (totalErrors > 0) {
    console.log(`  ${c.red}${c.bold}Errors:${c.reset}           ${totalErrors}`);
  } else {
    console.log(`\n  ${c.green}${c.bold}✓ Compilation complete!${c.reset}`);
  }

  console.log();
  process.exit(totalErrors > 0 ? 1 : 0);
}

function fmtCommand(path: string, checkOnly: boolean): void {
  const files = collectVblFiles(path);

  if (files.length === 0) {
    console.log(`${c.yellow}No .vbl files found in ${path}${c.reset}`);
    process.exit(0);
  }

  let totalFiles = 0;
  let totalChanged = 0;
  let totalErrors = 0;

  for (const file of files) {
    totalFiles++;
    const source = readFileSync(file, 'utf8');

    try {
      const tokens = tokenize(source);
      const ast = parse(tokens);
      const formatted = formatVbl(ast);

      // Normalize for comparison
      const normalizedSource = source.replace(/[ \t]+$/gm, '').replace(/\n+$/, '\n');
      const normalizedFormatted = formatted.replace(/[ \t]+$/gm, '').replace(/\n+$/, '\n');

      if (normalizedSource !== normalizedFormatted) {
        totalChanged++;
        if (checkOnly) {
          console.log(`  ${c.yellow}✗${c.reset} ${c.cyan}${basename(file)}${c.reset} ${c.gray}— needs formatting${c.reset}`);
        } else {
          writeFileSync(file, formatted, 'utf8');
          console.log(`  ${c.green}✓${c.reset} ${c.cyan}${basename(file)}${c.reset} ${c.gray}— formatted${c.reset}`);
        }
      } else {
        console.log(`  ${c.green}✓${c.reset} ${c.cyan}${basename(file)}${c.reset} ${c.gray}— already formatted${c.reset}`);
      }
    } catch (err: any) {
      totalErrors++;
      console.error(`  ${c.red}✗${c.reset} ${c.cyan}${basename(file)}${c.reset} — ${c.red}${err.message}${c.reset}`);
    }
  }

  console.log();
  console.log(`${c.gray}───────────────────────────────────────${c.reset}`);
  console.log(`  ${c.bold}Files checked:${c.reset}  ${totalFiles}`);

  if (checkOnly) {
    if (totalChanged > 0) {
      console.log(`  ${c.yellow}${c.bold}Unformatted:${c.reset}    ${totalChanged}`);
      console.log(`\n  ${c.yellow}Run \`vibelang fmt ${path}\` to format.${c.reset}`);
      process.exit(1);
    } else {
      console.log(`\n  ${c.green}${c.bold}✓ All files properly formatted!${c.reset}`);
    }
  } else {
    if (totalChanged > 0) {
      console.log(`  ${c.bold}Formatted:${c.reset}      ${totalChanged}`);
    }
    console.log(`\n  ${c.green}${c.bold}✓ Formatting complete!${c.reset}`);
  }

  if (totalErrors > 0) {
    console.log(`  ${c.red}${c.bold}Errors:${c.reset}         ${totalErrors}`);
  }

  console.log();
  process.exit((checkOnly && totalChanged > 0) || totalErrors > 0 ? 1 : 0);
}

// ==========================================================================
// Main
// ==========================================================================

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'check': {
    const path = args[1];
    if (!path) {
      console.error(`${c.red}Error:${c.reset} Missing path argument`);
      console.log(`Usage: vibelang check <path>`);
      process.exit(1);
    }
    printBanner();
    checkCommand(path);
    break;
  }

  case 'compile': {
    const compilePath = args[1];
    if (!compilePath) {
      console.error(`${c.red}Error:${c.reset} Missing path argument`);
      console.log(`Usage: vibelang compile <path> [--out <dir>] [--no-verify]`);
      process.exit(1);
    }
    // Parse compile flags
    const outIdx = args.indexOf('--out');
    const outDir = outIdx !== -1 && args[outIdx + 1] ? resolve(args[outIdx + 1]) : resolve('dist');
    const noVerify = args.includes('--no-verify');
    printBanner();
    compileCommand(compilePath, outDir, !noVerify);
    break;
  }

  case 'fmt': {
    const fmtPath = args[1];
    if (!fmtPath) {
      console.error(`${c.red}Error:${c.reset} Missing path argument`);
      console.log(`Usage: vibelang fmt <path> [--check]`);
      process.exit(1);
    }
    const checkOnly = args.includes('--check');
    printBanner();
    fmtCommand(fmtPath, checkOnly);
    break;
  }

  case 'repl': {
    // Dynamic import to avoid loading readline at startup
    import('./repl/repl.js').then(m => m.startRepl());
    break;
  }

  case 'test': {
    const testPath = args[1];
    if (!testPath) {
      console.error(`${c.red}Error:${c.reset} Missing path argument`);
      console.log(`Usage: vibelang test <path> [--generated] [--fuzz]`);
      process.exit(1);
    }
    const runGenerated = args.includes('--generated');
    const fuzzMode = args.includes('--fuzz');
    printBanner();
    import('./testgen/runner.js').then(m => m.runTests(testPath, runGenerated, fuzzMode));
    break;
  }

  case 'prove':
    printBanner();
    console.log(`${c.yellow}The Formal Proof System (Phase 6) requires external SMT bindings (e.g. Z3).\nThis research is ongoing and deferred to future releases.${c.reset}`);
    process.exit(0);
    break;

  case 'version':
  case '--version':
  case '-v':
    console.log(`vibelang v${VERSION}`);
    break;

  case 'help':
  case '--help':
  case '-h':
  case undefined:
    printUsage();
    break;

  default:
    console.error(`${c.red}Unknown command:${c.reset} ${command}`);
    printUsage();
    process.exit(1);
}
