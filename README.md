# Pact — VibeL Language Compiler

> **AI-First Programming Language** where every function is self-certifying.

```
  ╦  ╦╦╔╗ ╔═╗╦    ╔═╗╔╗╔╔═╗
  ╚╗╔╝║╠╩╗║╣ ║    ╠═╣║║║║ ╦
   ╚╝ ╩╚═╝╚═╝╩═╝  ╩ ╩╝╚╝╚═╝
```

VibeL is a programming language designed for a world where **AI writes code and humans audit it**. Every function carries its own specification — preconditions, postconditions, invariants, and effect declarations — making correctness verifiable from the definition alone.

## Key Features

- 🧠 **Self-Certifying Functions** — ENSURE BEFORE/AFTER, INVARIANT blocks built into every function
- 🎯 **Zero Ambiguity** — No implicit coercion, no operator overloading, no context-dependent behavior
- 📋 **Effect Tracking** — Every READ, WRITE, CALL, and EMIT is declared and enforced
- 🔄 **Automatic Rollback** — WRITES are journaled and can be rolled back on failure
- 🏷️ **Domain Types** — Types carry semantic meaning and built-in validation (Email, Price, UserId)
- ⏮️ **PRIOR() State** — Reference pre-execution values in postconditions
- 🤖 **AI Verification Layer** — Natural language constraints compiled to predicates or AI-evaluated

## Quick Start

```bash
# Install dependencies
npm install

# Check a .vbl file for errors
npx tsx src/cli.ts check examples/transfers.vbl

# Check all files in a directory
npx tsx src/cli.ts check examples/

# Run the test suite
npm test
```

## Example — Fund Transfer

```vibelang
EXPORT FUNCTION transferFunds
  INTENT: "Move a specific amount of money from one account to another atomically."

  READS:
    accounts.sender.balance
    accounts.receiver.balance

  WRITES:
    accounts.sender.balance
    accounts.receiver.balance

  ENSURE BEFORE:
    [sufficient_funds] accounts.sender.balance GREATER_OR_EQUAL amount
    [not_self_transfer] senderId NOT_EQUALS receiverId

  ENSURE AFTER:
    accounts.sender.balance EQUALS PRIOR(accounts.sender.balance) MINUS amount
    accounts.receiver.balance EQUALS PRIOR(accounts.receiver.balance) PLUS amount

  INVARIANT:
    accounts.sender.balance PLUS accounts.receiver.balance EQUALS
      PRIOR(accounts.sender.balance) PLUS PRIOR(accounts.receiver.balance)

  ON FAILURE:
    ROLLBACK ALL WRITES

  BODY:
    LET senderBalance = READ accounts.sender.balance
    WRITE accounts.sender.balance AS senderBalance MINUS amount
    WRITE accounts.receiver.balance AS receiverBalance PLUS amount
    RETURN EXPLICIT TransferSuccess { transactionId: transferId }
```

## Project Structure

```
Pact/
├── src/
│   ├── lexer/          # Tokenizer (indentation-sensitive)
│   ├── parser/         # Recursive descent parser (LL(1))
│   ├── ast/            # AST node type definitions
│   ├── analyzer/       # Semantic analysis & validation
│   ├── spec/           # Spec compiler & runtime verification
│   ├── codegen/        # JS-ESM code generator
│   ├── repl/           # Interactive REPL environment
│   ├── fmt/            # Canonical auto-formatter
│   ├── cli.ts          # CLI entry point
│   └── index.ts        # Public API
├── examples/
│   ├── transfers.vbl   # Fund transfer example
│   └── registration.vbl# User registration example
└── VIBE_LANG_SPEC.md   # Full language specification
```

## Compiler Pipeline

```
Source (.vbl) → Lexer → Token Stream → Parser → AST → Semantic Analyzer → Spec Compiler → Code Generator → JS-ESM
                                                                  ↓
                                                   Runtime Verification Injection
```

## Toolchain Reference

```bash
vibelang check src/                    # Parse and semantically validate
vibelang compile src/ --out dist       # Compile to JS with runtime checks
vibelang compile src/ --no-verify      # Compile to bare JS (no checks)
vibelang fmt src/                      # Format code canonically
vibelang repl                          # Interactive CLI environment
```

## Current Status

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | Lexer, Parser, AST, Analyzer | ✅ Complete |
| 2 | Spec Compiler & Runtime Verification | ✅ Complete |
| 3 | Interpreter / JS Code Generation | ✅ Complete |
| 4 | PRIOR() State & Rollbacks | ✅ Complete |
| 5 | REPL & Formatter (`fmt`) | ✅ Complete |
| 6 | Static Analysis & Proof System | 🔜 Deferred |

## License

MIT
