#!/usr/bin/env node
// ============================================================================
// VibeL CLI — vibelang command
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, extname } from 'path';
import { compile } from './index.js';
import { formatDiagnostics } from './errors.js';

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
  ${c.cyan}compile${c.reset}   Compile source files (coming in Phase 3)
  ${c.cyan}fmt${c.reset}       Format source files (coming in Phase 5)
  ${c.cyan}version${c.reset}   Print version information

${c.bold}EXAMPLES:${c.reset}
  vibelang check src/payments/transfers.vbl
  vibelang check src/
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

  case 'compile':
    printBanner();
    console.log(`${c.yellow}Compilation not yet implemented (Phase 3)${c.reset}`);
    process.exit(0);
    break;

  case 'fmt':
    printBanner();
    console.log(`${c.yellow}Formatter not yet implemented (Phase 5)${c.reset}`);
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
