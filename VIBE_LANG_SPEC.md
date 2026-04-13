# VibeL — AI-First Programming Language
## Complete Architecture Specification

> **Version:** 0.1.0-draft  
> **Status:** Design Specification  
> **Purpose:** Reference document for implementing the VibeL language from scratch

---

## Table of Contents

1. [Philosophy & Goals](#1-philosophy--goals)
2. [Core Design Principles](#2-core-design-principles)
3. [Lexical Structure](#3-lexical-structure)
4. [Type System](#4-type-system)
5. [Function Anatomy](#5-function-anatomy)
6. [Intent Blocks](#6-intent-blocks)
7. [Effect Declarations](#7-effect-declarations)
8. [Parameter Declarations](#8-parameter-declarations)
9. [Preconditions — ENSURE BEFORE](#9-preconditions--ensure-before)
10. [Postconditions — ENSURE AFTER](#10-postconditions--ensure-after)
11. [Invariants](#11-invariants)
12. [Constraint Language](#12-constraint-language)
13. [PRIOR() — Pre-Execution State](#13-prior--pre-execution-state)
14. [The Function Body](#14-the-function-body)
15. [Error Handling & Failure Blocks](#15-error-handling--failure-blocks)
16. [Modules & Namespaces](#16-modules--namespaces)
17. [Data Definitions](#17-data-definitions)
18. [Control Flow](#18-control-flow)
19. [Expressions & Operators](#19-expressions--operators)
20. [The Standard Library](#20-the-standard-library)
21. [Compiler Architecture](#21-compiler-architecture)
22. [Runtime Verification Engine](#22-runtime-verification-engine)
23. [Static Analysis & Proof System](#23-static-analysis--proof-system)
24. [Toolchain](#24-toolchain)
25. [File Format & Project Structure](#25-file-format--project-structure)
26. [Complete Example Programs](#26-complete-example-programs)
27. [Grammar (EBNF)](#27-grammar-ebnf)
28. [Error Reference](#28-error-reference)

---

## 1. Philosophy & Goals

### 1.1 The Problem With Existing Languages

Every programming language in common use today was designed around one constraint: **humans write code, and humans read code.** This produced languages optimized for:

- Short variable names (typing is slow)
- Implicit behavior (writing `==` to mean "loose equality" saves keystrokes)
- Syntax that mirrors natural spoken language (`if`, `while`, `return`)
- Abstraction that hides complexity from the reader
- Tests that live separately from definitions

None of these constraints apply to an AI coding agent. An AI:

- Does not get tired of verbosity
- Benefits from explicit semantics, not implicit conventions
- Does not "read" code the way humans do — it processes tokens
- Can carry rich domain context that would overwhelm a human reader
- Needs to verify its own output, so correctness must be checkable from the definition alone

**VibeL is designed for a world where AI writes the code and humans audit it.** The primary reader is the verifier, not the programmer.

### 1.2 Goals

1. **Every function is self-certifying.** A function definition must contain everything needed to verify it is correct. No external test files, no documentation, no convention.
2. **Zero ambiguity.** Every operator, keyword, and expression has exactly one meaning. No implicit coercion, no operator overloading, no context-dependent behavior.
3. **Semantic richness over syntactic brevity.** Types carry domain meaning. Variables carry intent. Declarations carry side effects.
4. **Machine-first, human-auditable.** Code should be dense with information for tools, but still legible to a careful human reviewer.
5. **Failure is explicit.** Every function must declare what it does when something goes wrong.

### 1.3 Non-Goals

- VibeL is **not** designed for humans to type by hand. It is designed for AI generation and human review.
- VibeL is **not** a systems language. It does not expose memory management.
- VibeL is **not** a scripting language. There are no one-liners or REPL loops.
- VibeL is **not** Turing-complete by default in the spec layer. The spec layer (ENSURE BEFORE/AFTER, INVARIANT) is restricted to decidable logic.

---

## 2. Core Design Principles

### 2.1 Explicit Over Implicit

Everything that can be inferred should still be stated. There are no default parameter values that silently change behavior. There is no implicit `this`. There is no implicit return of the last expression.

```vibelang
DEFINE FUNCTION add
  RECEIVE:
    a AS Integer
    b AS Integer
  RETURN: Integer
  BODY:
    RETURN EXPLICIT a + b    ← "EXPLICIT" keyword required on all returns
```

### 2.2 Declarations Before Logic

Every function must fully declare its world — what it reads, what it writes, what it calls — before any logic is written. This allows static analysis to reason about the function without executing it.

### 2.3 Types Are Domain Objects, Not Data Shapes

`String` is not a valid type in VibeL. `Email`, `PhoneNumber`, `UserName` are valid types. Each domain type defines its own validation constraints. The type system is extensible and domain-driven.

### 2.4 Correctness Is a First-Class Citizen

Preconditions, postconditions, and invariants are parsed and enforced by the runtime and can be statically analyzed by the compiler. They are not comments. They are not documentation. They are executable assertions with formal semantics.

### 2.5 The Verifier Is Always Right

If a function body violates a postcondition, the function fails — even if the logic "looks correct." The spec is the source of truth. The body is an attempt to satisfy it.

---

## 3. Lexical Structure

### 3.1 Keywords

All VibeL keywords are uppercase. This makes them visually distinct from identifiers, which are camelCase or SCREAMING_SNAKE_CASE for constants.

**Structural keywords:**
```
DEFINE  FUNCTION  MODULE  IMPORT  EXPORT  DATA  ENUM  ALIAS
```

**Declaration keywords:**
```
INTENT  RECEIVE  RETURN  READS  WRITES  CALLS  EMITS  RECEIVE
```

**Spec keywords:**
```
ENSURE  BEFORE  AFTER  INVARIANT  CONSTRAIN  PRIOR  ALWAYS
```

**Control flow keywords:**
```
BODY  IF  ELSE  MATCH  CASE  FOR  EACH  IN  WHILE  BREAK  CONTINUE
RETURN  EXPLICIT  ROLLBACK  RETRY  ABORT
```

**Error handling keywords:**
```
ON  FAILURE  SUCCESS  NOTIFY  WITH  REASON  ATTEMPT  FALLBACK
```

**Operator keywords (replacing symbols for clarity):**
```
AND  OR  NOT  EQUALS  NOT_EQUALS  GREATER_THAN  LESS_THAN
GREATER_OR_EQUAL  LESS_OR_EQUAL  PLUS  MINUS  TIMES  DIVIDED_BY  MOD
```

> **Note:** Symbolic operators (`+`, `-`, `*`, `/`, `==`, `!=`, `>=`, `<=`) ARE also permitted in BODY blocks for readability, but MUST NOT be used in ENSURE and INVARIANT blocks. Spec blocks use only keyword operators to prevent ambiguity.

### 3.2 Identifiers

| Style | Usage | Example |
|---|---|---|
| `camelCase` | Variables, parameters, function names | `senderId`, `transferFunds` |
| `PascalCase` | Type names, module names | `UserId`, `Price`, `PaymentService` |
| `SCREAMING_SNAKE` | Constants, enum values | `MAX_RETRIES`, `ACTIVE`, `CONFIRMED` |
| `snake_case` | **Not permitted** | — |

### 3.3 Comments

```vibelang
-- Single line comment (two dashes)

---
Multi-line comment
spans multiple lines
---
```

Comments in spec blocks (ENSURE BEFORE, ENSURE AFTER, INVARIANT) are **prohibited**. Spec blocks must be self-explaining through the constraint language. If you need to explain a constraint, it means the constraint is not well-written.

### 3.4 Literals

```vibelang
-- Integer
42
-7
1_000_000     ← underscores allowed as separators

-- Decimal
3.14
-0.5
1_234.567

-- String (double quotes only)
"hello world"
"user@example.com"

-- Boolean
TRUE
FALSE

-- Null
NOTHING         ← VibeL uses NOTHING instead of null/nil/None

-- List literal
[ 1, 2, 3 ]

-- Record literal
{ name: "Alice", age: 30 }
```

### 3.5 Whitespace

VibeL uses **indentation for structure**, not braces or `begin`/`end`. The standard indent is 2 spaces. Tabs are forbidden. The parser will reject mixed indentation.

---

## 4. Type System

### 4.1 Primitive Types

| Type | Description | Valid Values |
|---|---|---|
| `Integer` | 64-bit signed integer | -9223372036854775808 to 9223372036854775807 |
| `Decimal` | IEEE 754 double, explicit rounding required | Any decimal |
| `Text` | UTF-8 string, immutable | Any unicode string |
| `Boolean` | Logical value | `TRUE` or `FALSE` |
| `Nothing` | Absence of a value | Only `NOTHING` |
| `Timestamp` | UTC datetime, nanosecond precision | ISO 8601 |
| `Duration` | Time span | Positive integer of nanoseconds |
| `Bytes` | Raw byte sequence | Any byte array |

> **Important:** `Decimal` arithmetic always requires explicit rounding. You cannot write `a / b` when both are `Decimal` without specifying rounding mode. See section 19.

### 4.2 Semantic Types (Domain Types)

This is VibeL's most distinctive feature. You define domain types that carry their own validation rules. The type IS the validator.

```vibelang
DEFINE TYPE Email
  BASE: Text
  CONSTRAIN: "must match RFC 5321 format"
  CONSTRAIN: "length must be between 3 and 254 characters"
  CONSTRAIN: "must contain exactly one @ symbol"
  NORMALIZE: LOWERCASE

DEFINE TYPE Price
  BASE: Decimal
  CONSTRAIN: "must be greater than or equal to 0"
  CONSTRAIN: "must have at most 2 decimal places"
  CURRENCY: REQUIRED

DEFINE TYPE UserId
  BASE: Text
  CONSTRAIN: "must be a valid UUID v4"
  IMMUTABLE: TRUE

DEFINE TYPE PhoneNumber
  BASE: Text
  CONSTRAIN: "must conform to E.164 format"
  NORMALIZE: STRIP_WHITESPACE

DEFINE TYPE Percentage
  BASE: Decimal
  CONSTRAIN: "must be between 0.0 and 100.0 inclusive"
```

When you declare a parameter `AS Email`, the runtime automatically validates the value against every constraint on that type before the parameter even reaches the function body. Type violation = immediate rejection.

### 4.3 Composite Types

**Records:**
```vibelang
DEFINE DATA UserProfile
  FIELDS:
    id          AS UserId      REQUIRED
    email       AS Email       REQUIRED
    displayName AS Text        REQUIRED  CONSTRAIN: "length between 2 and 50"
    createdAt   AS Timestamp   REQUIRED
    deletedAt   AS Timestamp   OPTIONAL
```

**Enumerations:**
```vibelang
DEFINE ENUM AccountStatus
  VALUES:
    ACTIVE
    SUSPENDED
    PENDING_VERIFICATION
    DELETED
  DEFAULT: PENDING_VERIFICATION
```

**Lists:**
```vibelang
List OF UserProfile      ← typed list
List OF Integer          ← list of integers
List OF Email            ← list of Email domain types
```

**Optional values:**
```vibelang
OPTIONAL Text            ← either a Text value or NOTHING
OPTIONAL UserId
```

**Maps:**
```vibelang
Map OF UserId TO Price   ← key-value, both typed
Map OF Text TO Integer
```

### 4.4 Type Aliases

```vibelang
ALIAS CurrencyCode AS Text CONSTRAIN: "must be ISO 4217 3-letter code"
ALIAS OrderId AS UserId    ← structural alias, same validation
```

### 4.5 Type Coercion Rules

VibeL has **no implicit coercion**. Period. You cannot add an `Integer` to a `Decimal` without an explicit conversion. You cannot compare a `Text` to an `Email` without an explicit cast.

```vibelang
-- Explicit cast syntax
CAST value AS TargetType

-- Example
CAST userAge AS Decimal    ← Integer to Decimal, explicit
CAST "user@x.com" AS Email ← Text to Email — will run Email validators
```

Casts that would violate the target type's constraints throw a `TypeConstraintViolation` at runtime and can be caught with `ON FAILURE`.

---

## 5. Function Anatomy

A VibeL function has a strict, fixed section order. Sections cannot be reordered. Optional sections can be omitted but cannot appear out of sequence.

```
DEFINE FUNCTION functionName
  INTENT: "..."                    ← [REQUIRED] why this function exists
  
  READS:   ...                     ← [REQUIRED if reading external state]
  WRITES:  ...                     ← [REQUIRED if writing external state]
  CALLS:   ...                     ← [REQUIRED if calling other functions/services]
  EMITS:   ...                     ← [REQUIRED if emitting events]

  RECEIVE:                         ← [REQUIRED unless no parameters]
    paramName AS TypeName CONSTRAIN: "..."
    ...

  RETURN: TypeName                 ← [REQUIRED unless RETURN: NOTHING]

  ENSURE BEFORE:                   ← [OPTIONAL — preconditions]
    condition
    ...

  ENSURE AFTER:                    ← [OPTIONAL — postconditions]
    condition
    ...

  INVARIANT:                       ← [OPTIONAL — always-true properties]
    condition
    ...

  ON FAILURE:                      ← [REQUIRED]
    action
    ...

  ON SUCCESS:                      ← [OPTIONAL]
    action
    ...

  BODY:                            ← [REQUIRED — implementation]
    ...
```

This structure is enforced by the parser. A function with sections out of order is a syntax error.

---

## 6. Intent Blocks

### 6.1 Syntax

```vibelang
INTENT: "A single sentence describing WHY this function exists"
```

### 6.2 Rules

- Must be a double-quoted string literal
- Must be a complete sentence (ends with a period, question mark, or exclamation mark) — enforced by linter
- Must describe **purpose**, not **mechanism** — the linter warns on mechanism descriptions
- Maximum 200 characters
- The AI verifier uses this string to check that the function body is semantically consistent with its stated purpose

### 6.3 Good vs Bad Intents

```vibelang
-- GOOD: describes purpose
INTENT: "Charge a user's payment method for a completed order."

-- BAD: describes mechanism (linter warning)
INTENT: "Calls Stripe API with the card token and amount."

-- BAD: too vague (linter warning)
INTENT: "Does the payment thing."

-- BAD: not a complete sentence (linter error)
INTENT: "payment processing"
```

### 6.4 Intent Verification (AI Layer)

The runtime can optionally route the INTENT string to an AI verification layer that checks:

1. Does the function body do what the INTENT claims?
2. Are there side effects not mentioned in the INTENT?
3. Does the INTENT match the READS/WRITES/CALLS declarations?

This is an optional, configurable layer — see section 22.

---

## 7. Effect Declarations

Effect declarations must come before any other section except INTENT. They form the **effect signature** of the function — a machine-readable contract of everything the function touches outside its own local scope.

### 7.1 READS

Declares all external state the function reads but does not modify.

```vibelang
READS:
  user.balance
  user.status
  order.total
  config.maxTransferLimit
  session.currentUserId
```

**Rules:**
- Dot notation represents nested property access on external data sources
- Reading a property not listed here is a runtime error
- The compiler uses READS to build a dependency graph for caching and invalidation
- READS fields are automatically captured for `PRIOR()` access in postconditions

### 7.2 WRITES

Declares all external state the function may modify.

```vibelang
WRITES:
  user.balance
  order.status
  transaction.ledger
  auditLog.entries
```

**Rules:**
- Writing to a field not listed here is a compile-time error
- WRITES fields are automatically enrolled in rollback tracking
- If a function fails after any WRITES have been performed, the rollback engine (see section 22) reverts all writes unless `ON FAILURE` specifies `RETAIN WRITES`

### 7.3 CALLS

Declares all external functions, services, or APIs the function invokes.

```vibelang
CALLS:
  payment.gateway.charge
  email.service.send
  audit.log
  inventory.checkAvailability
```

**Rules:**
- Any function call not listed is a compile-time error
- CALLS creates a dependency that the static analyzer uses to detect circular dependencies
- Each called function must itself be a VibeL function (with its own spec) or declared as an EXTERNAL (see section 7.5)

### 7.4 EMITS

Declares all events the function may emit to an event bus or message queue.

```vibelang
EMITS:
  event.PaymentCompleted
  event.UserNotified
  event.OrderStatusChanged
```

### 7.5 External Declarations

For calling non-VibeL code (system libraries, third-party APIs), you must declare an EXTERNAL binding:

```vibelang
DEFINE EXTERNAL payment.gateway.charge
  INTENT: "Submits a charge request to the Stripe payment API."
  RECEIVE:
    cardToken  AS Text
    amount     AS Price
    currency   AS CurrencyCode
  RETURN: EITHER PaymentResult OR PaymentError
  SIDE_EFFECTS: "Initiates a real financial transaction. Cannot be rolled back."
  LATENCY: NETWORK
  IDEMPOTENT: FALSE
```

This makes the contract of the external boundary explicit and allows the verifier to reason about it.

---

## 8. Parameter Declarations

### 8.1 Basic Syntax

```vibelang
RECEIVE:
  parameterName AS TypeName
```

### 8.2 With Constraints

```vibelang
RECEIVE:
  userId      AS UserId     CONSTRAIN: "must belong to an active account"
  amount      AS Price      CONSTRAIN: "must not exceed daily transfer limit"
  description AS Text       CONSTRAIN: "length between 1 and 500 characters"
                            CONSTRAIN: "must not contain HTML tags"
```

Multiple `CONSTRAIN` lines are AND-ed together. All constraints must pass.

### 8.3 Optional Parameters

```vibelang
RECEIVE:
  userId     AS UserId
  note       AS OPTIONAL Text    CONSTRAIN: "if present, length must be under 200"
  retryCount AS Integer          DEFAULT: 0
                                 CONSTRAIN: "between 0 and 3"
```

`DEFAULT` values must satisfy all `CONSTRAIN` rules. A DEFAULT that violates a CONSTRAIN is a compile-time error.

### 8.4 List Parameters

```vibelang
RECEIVE:
  userIds    AS List OF UserId   CONSTRAIN: "length between 1 and 100"
  tags       AS List OF Text     CONSTRAIN: "each tag length between 1 and 50"
                                 CONSTRAIN: "no duplicate values"
```

`CONSTRAIN` on a list applies to the list as a whole. To constrain individual elements, use `EACH`:

```vibelang
RECEIVE:
  amounts AS List OF Price
    EACH CONSTRAIN: "must be greater than zero"
    CONSTRAIN: "total sum must not exceed 10000.00 USD"
```

### 8.5 Parameter Ordering Rules

- Required parameters come before optional ones
- Parameters with more constraints come before parameters with fewer (convention, not enforced)
- The compiler preserves declaration order for positional calling

---

## 9. Preconditions — ENSURE BEFORE

### 9.1 What They Are

Preconditions are assertions that must be TRUE before the function body runs. If any precondition fails, the function is rejected immediately. No partial state. No rollback needed (nothing has been written yet).

### 9.2 Syntax

```vibelang
ENSURE BEFORE:
  expression_1
  expression_2
  expression_3
```

All expressions are evaluated. All must be TRUE. Evaluation is short-circuit: the first failure stops evaluation and triggers ON FAILURE.

### 9.3 What You Can Reference

In ENSURE BEFORE blocks, you can reference:
- All declared READS fields
- All RECEIVE parameters (already validated against their types)
- Constants and ENUM values
- Standard library functions marked as PURE

You **cannot** reference:
- Local variables (BODY has not run yet)
- WRITES fields (not yet modified)
- CALLS (not yet invoked)

### 9.4 Expression Language in Spec Blocks

Spec blocks use a restricted expression language. Only these forms are permitted:

```vibelang
-- Equality
field EQUALS value
field NOT_EQUALS value

-- Comparison
field GREATER_THAN value
field LESS_THAN value
field GREATER_OR_EQUAL value
field LESS_OR_EQUAL value

-- Membership
field IN [ value1, value2, value3 ]
field NOT IN [ value1, value2 ]

-- Nullability
field IS NOTHING
field IS NOT NOTHING

-- Boolean combinators
condition_a AND condition_b
condition_a OR condition_b
NOT condition

-- Arithmetic (for threshold checks)
field PLUS value GREATER_OR_EQUAL other_field
field TIMES value LESS_OR_EQUAL limit

-- Collection checks
LENGTH OF list GREATER_OR_EQUAL 1
CONTAINS list value
ALL items IN list SATISFY condition
ANY item IN list SATISFIES condition
```

### 9.5 Full Example

```vibelang
ENSURE BEFORE:
  sender.balance GREATER_OR_EQUAL amount
  sender.status EQUALS ACTIVE
  receiver.status EQUALS ACTIVE
  sender.id NOT_EQUALS receiver.id
  amount GREATER_THAN 0.00
  amount LESS_OR_EQUAL config.maxTransferLimit
  NOT sender.isLockedForFraud
  sender.kycStatus EQUALS VERIFIED
```

### 9.6 Labeling Conditions

Long ENSURE BEFORE blocks can label conditions for clearer error messages:

```vibelang
ENSURE BEFORE:
  [sufficient_funds]     sender.balance GREATER_OR_EQUAL amount
  [sender_active]        sender.status EQUALS ACTIVE
  [receiver_active]      receiver.status EQUALS ACTIVE
  [not_self_transfer]    sender.id NOT_EQUALS receiver.id
  [within_daily_limit]   amount LESS_OR_EQUAL config.maxTransferLimit
```

Labels appear in error messages: `PreconditionFailed: [sufficient_funds] sender.balance (150.00) is not >= amount (200.00)`

---

## 10. Postconditions — ENSURE AFTER

### 10.1 What They Are

Postconditions are assertions that must be TRUE after the function body has run successfully. They describe the observable effect of the function. If any postcondition fails, the function is considered failed, all writes are rolled back, and ON FAILURE is triggered.

### 10.2 Syntax

```vibelang
ENSURE AFTER:
  expression_1
  expression_2
  expression_3
```

### 10.3 What You Can Reference

In ENSURE AFTER blocks, you can reference:
- All READS fields (their current, post-execution values)
- All WRITES fields (their current, post-execution values)
- `PRIOR(field)` — the value of any READS or WRITES field **before** execution (see section 13)
- The return value via `RETURN_VALUE`
- All RECEIVE parameters

### 10.4 RETURN_VALUE

```vibelang
RETURN: OrderId

ENSURE AFTER:
  RETURN_VALUE IS NOT NOTHING
  RETURN_VALUE EQUALS newOrder.id
```

### 10.5 Full Example

```vibelang
ENSURE AFTER:
  sender.balance EQUALS PRIOR(sender.balance) MINUS amount
  receiver.balance EQUALS PRIOR(receiver.balance) PLUS amount
  sender.balance GREATER_OR_EQUAL 0
  transaction.ledger CONTAINS RETURN_VALUE
  RETURN_VALUE IS NOT NOTHING
```

### 10.6 Conditional Postconditions

Some postconditions only apply in certain outcomes:

```vibelang
ENSURE AFTER:
  IF RETURN_VALUE IS PaymentSuccess THEN
    sender.balance EQUALS PRIOR(sender.balance) MINUS amount
    receiver.balance EQUALS PRIOR(receiver.balance) PLUS amount
  IF RETURN_VALUE IS PaymentDeclined THEN
    sender.balance EQUALS PRIOR(sender.balance)
    receiver.balance EQUALS PRIOR(receiver.balance)
```

---

## 11. Invariants

### 11.1 What They Are

Invariants are properties that must be true at ALL observable points — both before and after execution. They express structural guarantees that transcend any single operation.

The canonical example: money is conserved. No matter what the function does, the total amount of money across all accounts must not change.

### 11.2 Syntax

```vibelang
INVARIANT:
  expression
```

### 11.3 When They Are Checked

An INVARIANT is checked:
1. Before the function body runs (same as ENSURE BEFORE)
2. After the function body runs (same as ENSURE AFTER)
3. At every atomic state transition within the BODY (write to a WRITES field)

Point 3 is what makes invariants powerful: they catch mid-execution bugs, not just pre/post bugs.

### 11.4 Invariant Scope

By default, invariants are local to the function. But they can be declared at the MODULE level to apply to all functions in that module:

```vibelang
MODULE payments
  INVARIANT:
    totalSystemBalance EQUALS PRIOR(totalSystemBalance)
```

This module-level invariant is automatically checked in every function within the `payments` module that touches balance fields.

### 11.5 Full Example

```vibelang
INVARIANT:
  sender.balance PLUS receiver.balance EQUALS
    PRIOR(sender.balance) PLUS PRIOR(receiver.balance)
```

This is a conservation law: the sum of both balances must not change. It catches:
- Bugs where funds are deducted but not credited
- Floating-point drift that creates or destroys tiny fractions
- Race conditions where concurrent writes produce inconsistent totals

---

## 12. Constraint Language

### 12.1 The Two-Layer Constraint System

VibeL has constraints in two places:
1. **Type-level constraints** — defined on TYPE and DATA definitions, applied during type construction
2. **Spec-level constraints** — defined in ENSURE BEFORE/AFTER/INVARIANT/CONSTRAIN, applied at function boundaries

### 12.2 Type-Level Constraints

```vibelang
DEFINE TYPE OrderQuantity
  BASE: Integer
  CONSTRAIN: "must be greater than 0"
  CONSTRAIN: "must not exceed 10000"
```

Type constraints use natural language strings. These strings are compiled into:
1. A human-readable message for error reporting
2. A machine-executable predicate using the built-in constraint compiler

The constraint compiler recognizes these natural language patterns:

| Natural Language Pattern | Compiled Predicate |
|---|---|
| `"must be greater than N"` | `value > N` |
| `"must be at least N"` | `value >= N` |
| `"must not exceed N"` | `value <= N` |
| `"length between N and M"` | `N <= len(value) <= M` |
| `"must match RFC 5321 format"` | built-in validator `RFC5321` |
| `"must be a valid UUID v4"` | built-in validator `UUID_V4` |
| `"must contain exactly one X"` | `count(value, X) == 1` |
| `"must not be empty"` | `len(value) > 0` |
| `"must be one of [A, B, C]"` | `value in {A, B, C}` |

Unrecognized patterns fall through to the AI constraint evaluator, which interprets them semantically. The compiler issues a warning when a constraint is AI-evaluated rather than formally compiled.

### 12.3 Inline Spec Constraints (CONSTRAIN in RECEIVE)

```vibelang
RECEIVE:
  transferNote AS Text CONSTRAIN: "must not contain profanity"
                       CONSTRAIN: "must be plain text with no HTML"
```

Inline constraints on parameters are additional conditions beyond what the type already enforces. They are checked after type validation.

### 12.4 Custom Validators

You can define reusable validators:

```vibelang
DEFINE VALIDATOR NoHtmlContent
  APPLIES TO: Text
  CHECK: "must not contain HTML tags"
  MESSAGE: "Plain text only — HTML is not permitted in this field."

DEFINE VALIDATOR PositiveAmount
  APPLIES TO: Price
  CHECK: "must be greater than zero"
  MESSAGE: "Amount must be a positive, non-zero value."
```

Then reference them by name:

```vibelang
RECEIVE:
  description AS Text    VALIDATE WITH: NoHtmlContent
  amount      AS Price   VALIDATE WITH: PositiveAmount
```

---

## 13. PRIOR() — Pre-Execution State

### 13.1 What It Does

`PRIOR(expression)` evaluates to the value of `expression` as it was **before the function body began executing**. It is captured automatically by the runtime at the moment the BODY block starts.

### 13.2 What Can Be Wrapped in PRIOR()

Only READS and WRITES fields declared in the effect declarations. Not parameters, not constants, not local variables.

```vibelang
READS:  account.balance, account.transactionCount
WRITES: account.balance, account.transactionCount

ENSURE AFTER:
  account.balance EQUALS PRIOR(account.balance) MINUS withdrawalAmount
  account.transactionCount EQUALS PRIOR(account.transactionCount) PLUS 1
```

### 13.3 PRIOR() Is Not Available in ENSURE BEFORE

In ENSURE BEFORE, execution hasn't started yet, so there is no "prior" state — current state IS the prior state. Using PRIOR() in ENSURE BEFORE is a compile-time error.

### 13.4 PRIOR() on Nested Fields

```vibelang
READS: order.items, order.total

ENSURE AFTER:
  order.total EQUALS PRIOR(order.total) PLUS newItem.price
  LENGTH OF order.items EQUALS LENGTH OF PRIOR(order.items) PLUS 1
```

### 13.5 PRIOR() on List Fields

```vibelang
READS: user.roles
WRITES: user.roles

ENSURE AFTER:
  CONTAINS user.roles newRole
  ALL items IN PRIOR(user.roles) SATISFY CONTAINS user.roles item
```

This says: after execution, the user has the new role, AND all their old roles are still there (roles are only added, never removed, by this function).

---

## 14. The Function Body

### 14.1 BODY Block

The BODY block comes last in the function definition. It contains the implementation — the actual code that runs.

```vibelang
BODY:
  LET result = computeSomething(a, b)
  RETURN EXPLICIT result
```

### 14.2 Local Variables

```vibelang
BODY:
  LET taxRate      = 0.18
  LET subtotal     = price TIMES quantity
  LET taxAmount    = subtotal TIMES taxRate ROUNDED TO 2 DECIMAL_PLACES
  LET total        = subtotal PLUS taxAmount
  RETURN EXPLICIT total
```

`LET` bindings are immutable by default. To declare a mutable variable:

```vibelang
LET MUTABLE counter = 0
counter ASSIGN counter PLUS 1
```

`ASSIGN` is the mutation operator. You cannot use `=` for reassignment. `LET x = y` is always a new binding. `x ASSIGN y` is always a mutation of an existing binding.

### 14.3 Calling Functions

```vibelang
BODY:
  LET chargeResult = CALL payment.gateway.charge
    WITH cardToken: user.paymentToken
    WITH amount:    order.total
    WITH currency:  "USD"
```

All function calls use the `CALL ... WITH` syntax. There are no positional arguments in VibeL — only named arguments. Order doesn't matter. Every parameter must be named.

### 14.4 Reading and Writing External State

```vibelang
BODY:
  LET currentBalance = READ user.balance
  LET newBalance     = currentBalance MINUS withdrawalAmount
  WRITE user.balance AS newBalance
```

External state is always accessed through explicit `READ` and `WRITE` keywords in the body. You cannot use dotted access on external state without these keywords.

### 14.5 Conditional Logic

```vibelang
BODY:
  IF user.status EQUALS SUSPENDED THEN
    ABORT WITH reason: "Account is suspended."
  ELSE IF user.status EQUALS PENDING_VERIFICATION THEN
    ABORT WITH reason: "Account not yet verified."
  ELSE
    -- proceed
    LET result = processPayment(amount)
    RETURN EXPLICIT result
  END IF
```

`IF` blocks require `END IF`. There is no single-line `IF`. The `ELSE` clause is required when the `THEN` branch does not always `RETURN`, `ABORT`, or `ROLLBACK`.

### 14.6 Pattern Matching

```vibelang
BODY:
  MATCH chargeResult
    CASE PaymentSuccess AS success THEN
      WRITE order.status AS PAID
      RETURN EXPLICIT success.transactionId
    CASE PaymentDeclined AS declined THEN
      WRITE order.status AS PAYMENT_FAILED
      ABORT WITH reason: declined.message
    CASE PaymentNetworkError THEN
      RETRY AFTER 5 SECONDS MAX 3 ATTEMPTS
  END MATCH
```

MATCH must be exhaustive — every possible CASE must be handled. The compiler enforces this for sum types and enums. Unhandled cases are a compile-time error.

### 14.7 Iteration

```vibelang
-- Over a list
FOR EACH item IN order.items
  LET itemTotal = item.price TIMES item.quantity
  WRITE lineItems.totals APPEND itemTotal
END FOR

-- With index
FOR EACH item AT index IN order.items
  -- index is 0-based Integer
END FOR

-- While loop
WHILE condition
  -- body
END WHILE
```

### 14.8 RETURN EXPLICIT

Every execution path must end with exactly one of:
- `RETURN EXPLICIT value` — successful return with a value
- `RETURN EXPLICIT NOTHING` — successful return with no value
- `ABORT WITH reason: "..."` — failure with a reason string
- `ROLLBACK AND ABORT WITH reason: "..."` — rollback all writes, then fail

The `EXPLICIT` keyword is mandatory on every RETURN statement. This prevents accidental early returns from control flow structures.

---

## 15. Error Handling & Failure Blocks

### 15.1 ON FAILURE

Every function must declare what happens when something goes wrong.

```vibelang
ON FAILURE:
  ROLLBACK ALL WRITES
  NOTIFY audit.log WITH reason
  RETURN EXPLICIT PaymentFailed {
    reason: FAILURE_REASON,
    timestamp: NOW(),
    transactionId: NOTHING
  }
```

`FAILURE_REASON` is an implicit variable available in ON FAILURE blocks containing the string from the ABORT call or the name of the violated condition.

### 15.2 ON SUCCESS

Optional block that runs after the BODY completes AND all postconditions pass.

```vibelang
ON SUCCESS:
  NOTIFY audit.log WITH "Transfer completed successfully."
  EMIT event.TransferCompleted WITH {
    senderId: senderId,
    receiverId: receiverId,
    amount: amount,
    timestamp: NOW()
  }
```

### 15.3 Failure Types

```vibelang
ON FAILURE:
  MATCH FAILURE_TYPE
    CASE PreconditionFailed THEN
      RETURN EXPLICIT ValidationError { message: FAILURE_REASON }
    CASE PostconditionFailed THEN
      ROLLBACK ALL WRITES
      NOTIFY ops.alert WITH "Postcondition violated — investigate immediately."
      RETURN EXPLICIT SystemError { message: "Internal consistency error." }
    CASE TypeConstraintViolation THEN
      RETURN EXPLICIT ValidationError { message: FAILURE_REASON }
    CASE ExternalCallFailed THEN
      ROLLBACK ALL WRITES
      RETURN EXPLICIT ServiceUnavailable { retryAfter: 30 }
  END MATCH
```

### 15.4 Rollback Semantics

When `ROLLBACK ALL WRITES` is executed:
- All WRITES fields are restored to their PRIOR() values
- The restoration is atomic — either all writes are undone or none are
- EMITS that have already been sent are not recalled (they are fire-and-forget by default; use `EMITS TRANSACTIONAL` to enroll them in rollback)
- CALLS that have already executed are not reversed (unless the called function itself supports rollback via `DEFINE EXTERNAL ... REVERSIBLE: TRUE`)

---

## 16. Modules & Namespaces

### 16.1 Module Declaration

Every VibeL file begins with a MODULE declaration.

```vibelang
MODULE payments.transfers

IMPORT payments.accounts   AS accounts
IMPORT payments.audit      AS audit
IMPORT payments.config     AS config

EXPORT FUNCTION transferFunds
EXPORT FUNCTION getTransferStatus
```

### 16.2 Module-Level Invariants

```vibelang
MODULE payments.transfers

MODULE INVARIANT:
  "Total funds in system must be conserved across all operations in this module."
```

Module invariants are checked as postconditions on every EXPORTED function in the module.

### 16.3 Import Rules

- Circular imports are a compile-time error
- Importing a non-exported symbol is a compile-time error
- You can only import other VibeL modules or declared EXTERNAL bindings
- Wildcard imports (`IMPORT payments.*`) are forbidden — all imports must be explicit

### 16.4 Visibility

Symbols in a module are private by default. Only symbols marked `EXPORT` are visible to importers. There is no `PUBLIC`/`PRIVATE` modifier on individual declarations — visibility is purely export-based.

---

## 17. Data Definitions

### 17.1 DATA (Records)

```vibelang
DEFINE DATA TransferRequest
  FIELDS:
    id          AS UserId        REQUIRED
    senderId    AS UserId        REQUIRED
    receiverId  AS UserId        REQUIRED
    amount      AS Price         REQUIRED
    note        AS OPTIONAL Text CONSTRAIN: "length under 200 if present"
    createdAt   AS Timestamp     REQUIRED
    status      AS TransferStatus REQUIRED  DEFAULT: PENDING
```

### 17.2 Immutability

```vibelang
DEFINE DATA ImmutableLedgerEntry
  IMMUTABLE: TRUE
  FIELDS:
    id        AS UserId    REQUIRED
    amount    AS Price     REQUIRED
    timestamp AS Timestamp REQUIRED
```

IMMUTABLE records cannot be updated after creation. Attempting a WRITE to any field of an IMMUTABLE record is a compile-time error.

### 17.3 Derived Fields

```vibelang
DEFINE DATA OrderSummary
  FIELDS:
    items      AS List OF OrderItem REQUIRED
    subtotal   AS Price             DERIVED: "sum of item.price * item.quantity for each item in items"
    taxAmount  AS Price             DERIVED: "subtotal * taxRate ROUNDED TO 2 DECIMAL_PLACES"
    total      AS Price             DERIVED: "subtotal + taxAmount"
```

DERIVED fields are computed, not stored. They are recalculated on every access. You cannot WRITE to a DERIVED field.

### 17.4 Sum Types (Discriminated Unions)

```vibelang
DEFINE UNION PaymentResult
  VARIANT PaymentSuccess
    FIELDS:
      transactionId AS Text      REQUIRED
      processedAt   AS Timestamp REQUIRED
      amount        AS Price     REQUIRED
  VARIANT PaymentDeclined
    FIELDS:
      reason        AS Text    REQUIRED
      declineCode   AS Text    REQUIRED
  VARIANT PaymentNetworkError
    FIELDS:
      retryAfter    AS Duration REQUIRED
```

Sum types are first-class. MATCH on a sum type must be exhaustive. The compiler knows all variants.

---

## 18. Control Flow

### 18.1 IF / ELSE IF / ELSE

```vibelang
IF condition THEN
  -- block
ELSE IF other_condition THEN
  -- block
ELSE
  -- block
END IF
```

### 18.2 MATCH

```vibelang
MATCH expression
  CASE value_1 THEN
    -- block
  CASE value_2 THEN
    -- block
  CASE _ THEN           ← wildcard — matches anything not matched above
    -- block
END MATCH
```

MATCH on ENUM types does not require a wildcard if all variants are covered.

### 18.3 FOR EACH

```vibelang
FOR EACH item IN collection
  -- item is bound to the current element
  -- collection is not modified during iteration
END FOR
```

The collection being iterated is frozen for the duration of the loop. You cannot WRITE to the collection you are iterating. Write to a separate accumulator and WRITE after the loop ends.

### 18.4 WHILE

```vibelang
WHILE condition
  -- block
  -- must make progress toward terminating the loop
  -- infinite loops are a linter warning (but not an error for general Turing-completeness)
END WHILE
```

### 18.5 ABORT and ROLLBACK

```vibelang
ABORT WITH reason: "Cannot process — account suspended."

ROLLBACK AND ABORT WITH reason: "Postcondition would be violated."
```

ABORT without ROLLBACK leaves any writes in place. Use only when partial state is intentional and documented.

---

## 19. Expressions & Operators

### 19.1 Arithmetic

```vibelang
a PLUS b
a MINUS b
a TIMES b
a DIVIDED_BY b ROUNDED TO 2 DECIMAL_PLACES   ← rounding is REQUIRED for Decimal division
a DIVIDED_BY b AS INTEGER                     ← integer division, truncates
a MOD b
```

Decimal division without a rounding directive is a compile-time error. This eliminates an entire class of floating-point bugs.

### 19.2 String Operations

```vibelang
CONCATENATE textA WITH textB
LENGTH OF text
SUBSTRING OF text FROM 0 TO 5
CONTAINS text "substring"
STARTS_WITH text "prefix"
ENDS_WITH text "suffix"
LOWERCASE text
UPPERCASE text
TRIM text
```

### 19.3 Collection Operations

```vibelang
LENGTH OF list
FIRST OF list
LAST OF list
CONTAINS list item
APPEND list WITH item      ← returns a new list (immutable by default)
REMOVE FROM list WHERE condition
FILTER list WHERE condition
MAP list USING expression
SORT list BY field ASCENDING
SORT list BY field DESCENDING
SUM OF list
MIN OF list
MAX OF list
```

### 19.4 Comparison

```vibelang
a EQUALS b
a NOT_EQUALS b
a GREATER_THAN b
a LESS_THAN b
a GREATER_OR_EQUAL b
a LESS_OR_EQUAL b
```

### 19.5 Boolean Logic

```vibelang
condition_a AND condition_b
condition_a OR condition_b
NOT condition
```

Short-circuit evaluation: AND stops at first FALSE, OR stops at first TRUE.

### 19.6 Null Handling

```vibelang
value IS NOTHING
value IS NOT NOTHING

-- Safe access — returns NOTHING if value is NOTHING
value?.field

-- Null coalescing — use the fallback if value is NOTHING
value OTHERWISE fallback

-- Assert not null — ABORT if value is NOTHING
ASSERT value IS NOT NOTHING WITH reason: "Expected a value but got NOTHING."
```

---

## 20. The Standard Library

### 20.1 Built-in Functions (PURE — no side effects)

```vibelang
NOW()                  → Timestamp   -- current UTC timestamp
TODAY()                → Timestamp   -- current UTC date at midnight
UUID()                 → UserId      -- generate a new UUID v4
HASH(value)            → Text        -- SHA-256 hex digest
ENCRYPT(value, key)    → Bytes       -- AES-256-GCM encryption
DECRYPT(bytes, key)    → Text        -- AES-256-GCM decryption
ROUND(decimal, places) → Decimal     -- round to N decimal places
ABS(number)            → number      -- absolute value
FLOOR(decimal)         → Integer     -- floor
CEILING(decimal)       → Integer     -- ceiling
MIN(a, b)              → same type   -- minimum of two values
MAX(a, b)              → same type   -- maximum of two values
FORMAT(value, pattern) → Text        -- format a value as text
PARSE_INTEGER(text)    → OPTIONAL Integer
PARSE_DECIMAL(text)    → OPTIONAL Decimal
```

### 20.2 Built-in Validators

```vibelang
IS_VALID_EMAIL(text)     → Boolean
IS_VALID_URL(text)       → Boolean
IS_VALID_UUID(text)      → Boolean
IS_VALID_PHONE(text)     → Boolean   -- E.164 format
IS_VALID_ISO_DATE(text)  → Boolean
IS_VALID_CURRENCY(text)  → Boolean   -- ISO 4217
```

### 20.3 Built-in Type Constructors

```vibelang
MAKE Email FROM "user@example.com"
MAKE UserId FROM UUID()
MAKE Price FROM 19.99 IN "USD"
MAKE Timestamp FROM "2024-01-15T10:30:00Z"
```

`MAKE TypeName FROM value` runs the type's full validation chain. Returns the typed value or throws a TypeConstraintViolation.

---

## 21. Compiler Architecture

### 21.1 Overview

The VibeL compiler is a multi-stage pipeline:

```
Source (.vbl) 
    ↓ Lexer
Token Stream
    ↓ Parser
Abstract Syntax Tree (AST)
    ↓ Semantic Analyzer
Typed AST + Effect Graph + Dependency Graph
    ↓ Spec Compiler
Typed AST + Compiled Predicates
    ↓ Code Generator
Target IR (e.g., WASM / JVM bytecode / native)
    ↓ Runtime Injector
Final Binary with embedded verification engine
```

### 21.2 The Lexer

The lexer tokenizes the source file into:
- KEYWORD tokens (all uppercase reserved words)
- IDENTIFIER tokens (camelCase, PascalCase, SCREAMING_SNAKE)
- LITERAL tokens (integers, decimals, strings, booleans)
- OPERATOR tokens (PLUS, MINUS, EQUALS, etc.)
- INDENT / DEDENT tokens (generated by tracking indentation changes)
- NEWLINE tokens
- COMMENT tokens (discarded)

Indentation rules:
- 2 spaces per level
- INDENT token emitted when indent level increases by 1
- DEDENT token emitted when indent level decreases by any amount
- Mixed tabs/spaces = lexer error

### 21.3 The Parser

The parser produces a typed AST. The grammar is defined in section 27 (EBNF). Key properties:
- LL(1) grammar — one token of lookahead is sufficient for all parsing decisions
- No operator precedence ambiguity — all operators must be written in a way that makes grouping explicit or use parentheses
- Section-order enforcement — the parser validates that INTENT, READS/WRITES/CALLS, RECEIVE, ENSURE BEFORE, etc. appear in the correct order

### 21.4 The Semantic Analyzer

Checks:
1. **Type checking** — every expression has a valid type, no implicit coercions
2. **Effect checking** — every READ, WRITE, and CALL in the BODY corresponds to a declaration
3. **Completeness checking** — MATCH expressions are exhaustive, all paths return or abort
4. **PRIOR() validity** — PRIOR() references only declared READS/WRITES fields
5. **Circular dependency detection** — CALLS graph has no cycles
6. **CONSTRAIN consistency** — DEFAULT values satisfy their CONSTRAIN rules

### 21.5 The Spec Compiler

Translates ENSURE BEFORE, ENSURE AFTER, and INVARIANT blocks from the spec expression language into:
1. **Formal predicates** — for recognized patterns, compiled into executable logic
2. **AI-evaluated predicates** — for natural language constraints, wrapped in an AI evaluator call at runtime
3. **Test case generators** — property-based test cases derived from the spec, used for static proofs where possible

### 21.6 Code Generation Targets

| Target | Use Case |
|---|---|
| `wasm32` | Portable, embeddable, serverless |
| `jvm` | JVM ecosystem integration |
| `native-arm64` | Apple Silicon native |
| `native-x86_64` | Linux/Windows native |
| `js-esm` | Browser/Node.js (with reduced verification) |
| `ir` | VibeL IR — for debugging and cross-compilation |

### 21.7 The Runtime Injector

After code generation, the runtime injector wraps every compiled function with:
1. PRIOR() capture at function entry
2. Precondition evaluation before BODY execution
3. Postcondition evaluation after BODY execution
4. Invariant checkpoints at each WRITE operation
5. Automatic rollback wiring for WRITES fields
6. ON FAILURE / ON SUCCESS dispatch

---

## 22. Runtime Verification Engine

### 22.1 The Verification Loop

For every function call, the runtime executes this loop:

```
1. RECEIVE: validate all parameters against their types and CONSTRAIN rules
   → if any fail: dispatch ON FAILURE with TypeConstraintViolation

2. READS capture: snapshot all declared READS fields for PRIOR() access

3. ENSURE BEFORE: evaluate all precondition expressions
   → if any fail: dispatch ON FAILURE with PreconditionFailed(condition, actual_value)

4. INVARIANT check (pre): evaluate all invariants against pre-execution state
   → if any fail: this is a system integrity error — dispatch ON FAILURE with SystemInvariantViolated

5. BODY: execute the function body
   → at each WRITE operation: evaluate INVARIANT against current state
   → if any invariant fails: ROLLBACK ALL WRITES, dispatch ON FAILURE

6. ENSURE AFTER: evaluate all postcondition expressions
   → if any fail: ROLLBACK ALL WRITES, dispatch ON FAILURE with PostconditionFailed

7. INVARIANT check (post): final invariant evaluation
   → if any fail: ROLLBACK ALL WRITES, dispatch SystemInvariantViolated

8. ON SUCCESS: execute success actions

9. Return value to caller
```

### 22.2 PRIOR() Capture Details

The runtime captures PRIOR() values by performing deep copies of all declared READS and WRITES fields immediately after step 2. Deep copy semantics:
- Primitive types: value copy
- Records: field-by-field deep copy
- Lists: element-by-element copy
- Maps: key-value pair copy

The PRIOR() capture is stored in a stack-allocated frame that is freed after ON FAILURE or ON SUCCESS completes.

### 22.3 The Rollback Engine

Every WRITE operation is journaled before execution:

```
JOURNAL ENTRY:
  field: "sender.balance"
  prior_value: 500.00
  new_value: 300.00
  timestamp: 1704067200000000000
```

On ROLLBACK ALL WRITES:
1. Process journal entries in reverse order
2. Restore each field to its prior_value
3. Clear the journal
4. Mark the transaction as rolled back

### 22.4 The AI Verification Layer (Optional)

When CONSTRAIN strings or INTENT strings cannot be compiled to formal predicates, they are evaluated by the AI verification layer at runtime:

```
AI_VERIFY:
  constraint: "description must not contain profanity"
  value: "what a wonderful service"
  result: PASS
```

The AI verification layer can be:
- **Inline** — calls a local model at function entry (low latency, local)
- **Remote** — calls a verification API (higher latency, cloud)
- **Lazy** — only evaluated during development/testing, not in production
- **Strict** — evaluated on every call, production enforcement

Configure via the module declaration:
```vibelang
MODULE payments.transfers
  AI_VERIFICATION: LAZY
```

---

## 23. Static Analysis & Proof System

### 23.1 What Can Be Proven Statically

The spec compiler attempts to prove the following properties without execution:

| Property | How |
|---|---|
| Type safety | Type inference + constraint propagation |
| Exhaustive matching | Enum variant enumeration |
| No null dereference | `OPTIONAL` tracking through call graph |
| Termination (loops) | Decreasing measure detection (best-effort) |
| Conservation laws | Invariant + postcondition algebraic simplification |
| No unhandled failures | MATCH completeness on UNION types |

### 23.2 Property-Based Test Generation

From every ENSURE BEFORE + ENSURE AFTER block, the spec compiler generates:
- Boundary value tests (at and around constraint thresholds)
- Negation tests (inputs that violate each precondition)
- Random valid inputs (values satisfying all preconditions)

These are available via the `vibelang test --generated` CLI command.

### 23.3 Proof Annotations

Functions that have been formally proven correct can be annotated:

```vibelang
DEFINE FUNCTION add
  PROVED BY: "algebraic identity — no proof needed beyond type checking"
  ...
```

The PROVED BY annotation suppresses the runtime postcondition check for that function in production builds (with `--trust-proofs` compiler flag). This is an optimization for functions where formal proof is complete.

---

## 24. Toolchain

### 24.1 `vibelang compile`

```bash
vibelang compile src/payments.vbl --target wasm32 --out dist/
vibelang compile src/ --target native-arm64 --out dist/
vibelang compile src/ --target jvm --out dist/ --optimize
```

Flags:
- `--target` — compilation target (required)
- `--out` — output directory
- `--optimize` — enable dead code elimination and inlining
- `--trust-proofs` — skip runtime checks for PROVED BY functions
- `--strict-ai` — require all CONSTRAIN strings to compile to formal predicates (no AI evaluator)
- `--emit-ir` — also emit VibeL IR alongside the target output

### 24.2 `vibelang check`

Static analysis only — no compilation. Runs the semantic analyzer and spec compiler.

```bash
vibelang check src/
```

Reports:
- Type errors
- Missing effect declarations
- Unhandled MATCH cases
- CONSTRAIN strings that require AI evaluation (warnings)
- Unreachable code

### 24.3 `vibelang test`

```bash
vibelang test src/
vibelang test src/payments.vbl --function transferFunds
vibelang test src/ --generated           -- include auto-generated test cases
vibelang test src/ --fuzz --seconds 60   -- fuzz test for 60 seconds
```

### 24.4 `vibelang repl`

Interactive evaluation environment for experimenting with expressions, types, and function calls.

```bash
vibelang repl
> MAKE Email FROM "test@example.com"
Email("test@example.com")
> MAKE Price FROM -5.00 IN "USD"
TypeConstraintViolation: Price must be >= 0 (got -5.00)
```

### 24.5 `vibelang fmt`

Auto-formatter. VibeL code has exactly one valid formatting — the formatter enforces it.

```bash
vibelang fmt src/          -- format in place
vibelang fmt src/ --check  -- fail if any file is not already formatted
```

### 24.6 `vibelang prove`

Attempts to formally prove ENSURE AFTER conditions using the built-in symbolic execution engine.

```bash
vibelang prove src/payments.vbl --function transferFunds
```

---

## 25. File Format & Project Structure

### 25.1 File Extension

VibeL source files use the `.vbl` extension.

### 25.2 File Encoding

All `.vbl` files must be UTF-8 with no BOM. The first line of every file must be the MODULE declaration.

### 25.3 One Module Per File

Each file declares exactly one module. The file name must match the last segment of the module name:

```
payments/transfers.vbl     → MODULE payments.transfers
payments/accounts.vbl      → MODULE payments.accounts
auth/sessions.vbl          → MODULE auth.sessions
```

### 25.4 Project Structure

```
project-root/
├── vibelang.project            ← project configuration
├── src/
│   ├── payments/
│   │   ├── transfers.vbl
│   │   ├── accounts.vbl
│   │   └── audit.vbl
│   ├── auth/
│   │   ├── sessions.vbl
│   │   └── tokens.vbl
│   └── main.vbl
├── tests/
│   └── payments/
│       └── transfers.test.vbl  ← manual test files (generated tests are inline)
├── dist/                       ← compiler output
└── externals/
    └── stripe.vbl              ← EXTERNAL declarations for third-party APIs
```

### 25.5 vibelang.project File

```toml
[project]
name = "my-payment-service"
version = "1.0.0"
entry = "src/main.vbl"

[compiler]
target = "native-arm64"
optimize = true
ai_verification = "lazy"

[runtime]
rollback_backend = "postgres"    # where rollback journals are stored
verification_log = "stdout"

[externals]
stripe = "externals/stripe.vbl"
```

---

## 26. Complete Example Programs

### 26.1 Fund Transfer

```vibelang
MODULE payments.transfers

IMPORT payments.accounts AS accounts
IMPORT payments.audit    AS audit
IMPORT payments.config   AS config

EXPORT FUNCTION transferFunds
  INTENT: "Move a specific amount of money from one account to another atomically."

  READS:
    accounts.sender.balance
    accounts.sender.status
    accounts.sender.kycStatus
    accounts.receiver.balance
    accounts.receiver.status
    config.maxSingleTransferAmount
    config.systemMaintenanceMode

  WRITES:
    accounts.sender.balance
    accounts.receiver.balance
    accounts.transactionLedger

  CALLS:
    audit.log

  RECEIVE:
    senderId    AS UserId   CONSTRAIN: "must refer to an existing, active account"
    receiverId  AS UserId   CONSTRAIN: "must refer to an existing account"
                            CONSTRAIN: "must not equal senderId"
    amount      AS Price    CONSTRAIN: "must be greater than zero"
    note        AS OPTIONAL Text   CONSTRAIN: "length under 250 if present"

  RETURN: TransferResult

  ENSURE BEFORE:
    [no_maintenance]      config.systemMaintenanceMode EQUALS FALSE
    [sender_active]       accounts.sender.status EQUALS ACTIVE
    [sender_kyc_verified] accounts.sender.kycStatus EQUALS VERIFIED
    [receiver_active]     accounts.receiver.status EQUALS ACTIVE
    [sufficient_funds]    accounts.sender.balance GREATER_OR_EQUAL amount
    [within_limit]        amount LESS_OR_EQUAL config.maxSingleTransferAmount
    [not_self_transfer]   senderId NOT_EQUALS receiverId

  ENSURE AFTER:
    accounts.sender.balance EQUALS
      PRIOR(accounts.sender.balance) MINUS amount
    accounts.receiver.balance EQUALS
      PRIOR(accounts.receiver.balance) PLUS amount
    accounts.sender.balance GREATER_OR_EQUAL 0
    RETURN_VALUE IS NOT NOTHING

  INVARIANT:
    accounts.sender.balance PLUS accounts.receiver.balance EQUALS
      PRIOR(accounts.sender.balance) PLUS PRIOR(accounts.receiver.balance)

  ON FAILURE:
    ROLLBACK ALL WRITES
    CALL audit.log WITH
      event: "transfer_failed"
      senderId: senderId
      receiverId: receiverId
      amount: amount
      reason: FAILURE_REASON
    RETURN EXPLICIT TransferFailed {
      reason: FAILURE_REASON,
      timestamp: NOW()
    }

  ON SUCCESS:
    CALL audit.log WITH
      event: "transfer_succeeded"
      senderId: senderId
      receiverId: receiverId
      amount: amount

  BODY:
    LET senderBalance   = READ accounts.sender.balance
    LET receiverBalance = READ accounts.receiver.balance
    LET transferId      = MAKE UserId FROM UUID()

    WRITE accounts.sender.balance   AS senderBalance MINUS amount
    WRITE accounts.receiver.balance AS receiverBalance PLUS amount

    LET ledgerEntry = {
      id:         transferId,
      senderId:   senderId,
      receiverId: receiverId,
      amount:     amount,
      note:       note,
      timestamp:  NOW()
    }

    WRITE accounts.transactionLedger APPEND ledgerEntry

    RETURN EXPLICIT TransferSuccess {
      transactionId: transferId,
      newSenderBalance: senderBalance MINUS amount,
      timestamp: NOW()
    }
```

### 26.2 User Registration

```vibelang
MODULE auth.registration

IMPORT auth.users   AS users
IMPORT auth.email   AS emailService
IMPORT auth.config  AS config

EXPORT FUNCTION registerUser
  INTENT: "Create a new user account and send a verification email."

  READS:
    users.existingEmails
    config.registrationEnabled

  WRITES:
    users.accounts
    users.verificationTokens

  CALLS:
    emailService.sendVerification

  RECEIVE:
    email       AS Email
    password    AS Text       CONSTRAIN: "length between 8 and 128"
                              CONSTRAIN: "must contain at least one uppercase letter"
                              CONSTRAIN: "must contain at least one digit"
    displayName AS Text       CONSTRAIN: "length between 2 and 50"
                              CONSTRAIN: "must not contain special characters except hyphen and underscore"

  RETURN: RegistrationResult

  ENSURE BEFORE:
    [registration_open]  config.registrationEnabled EQUALS TRUE
    [email_not_taken]    NOT CONTAINS users.existingEmails email

  ENSURE AFTER:
    CONTAINS users.existingEmails email
    LENGTH OF users.accounts EQUALS LENGTH OF PRIOR(users.accounts) PLUS 1
    RETURN_VALUE IS NOT NOTHING

  ON FAILURE:
    ROLLBACK ALL WRITES
    RETURN EXPLICIT RegistrationFailed {
      reason: FAILURE_REASON
    }

  BODY:
    LET newUserId    = MAKE UserId FROM UUID()
    LET passwordHash = HASH(password)
    LET verifyToken  = HASH(CONCATENATE newUserId WITH NOW())

    LET newUser = {
      id:          newUserId,
      email:       email,
      passwordHash: passwordHash,
      displayName: displayName,
      status:      PENDING_VERIFICATION,
      createdAt:   NOW()
    }

    WRITE users.accounts APPEND newUser
    WRITE users.verificationTokens APPEND {
      userId:    newUserId,
      token:     verifyToken,
      expiresAt: NOW() PLUS Duration 86400000000000
    }

    CALL emailService.sendVerification WITH
      toEmail:  email
      name:     displayName
      token:    verifyToken

    RETURN EXPLICIT RegistrationSuccess {
      userId:  newUserId,
      message: "Account created. Please check your email to verify your account."
    }
```

---

## 27. Grammar (EBNF)

```ebnf
program          ::= module_decl import_list? function_def*

module_decl      ::= "MODULE" module_path NEWLINE
                     (module_invariant)*

module_path      ::= IDENTIFIER ("." IDENTIFIER)*

import_list      ::= import_stmt+
import_stmt      ::= "IMPORT" module_path "AS" IDENTIFIER NEWLINE

function_def     ::= "DEFINE" "FUNCTION" IDENTIFIER NEWLINE
                     intent_block
                     effect_block?
                     receive_block?
                     return_decl?
                     ensure_before?
                     ensure_after?
                     invariant_block?
                     failure_block
                     success_block?
                     body_block

intent_block     ::= INDENT "INTENT" ":" STRING_LITERAL NEWLINE DEDENT

effect_block     ::= INDENT
                     ("READS" ":" NEWLINE field_list)*
                     ("WRITES" ":" NEWLINE field_list)*
                     ("CALLS" ":" NEWLINE call_list)*
                     ("EMITS" ":" NEWLINE event_list)*
                     DEDENT

field_list       ::= (INDENT field_path NEWLINE)+ DEDENT
field_path       ::= IDENTIFIER ("." IDENTIFIER)*

receive_block    ::= INDENT "RECEIVE" ":" NEWLINE param_list DEDENT
param_list       ::= param_decl+
param_decl       ::= INDENT IDENTIFIER "AS" type_expr
                     ("CONSTRAIN" ":" STRING_LITERAL)*
                     ("DEFAULT" ":" literal)*
                     NEWLINE DEDENT

return_decl      ::= INDENT "RETURN" ":" type_expr NEWLINE DEDENT

ensure_before    ::= INDENT "ENSURE" "BEFORE" ":" NEWLINE spec_expr_list DEDENT
ensure_after     ::= INDENT "ENSURE" "AFTER" ":" NEWLINE spec_expr_list DEDENT
invariant_block  ::= INDENT "INVARIANT" ":" NEWLINE spec_expr_list DEDENT

spec_expr_list   ::= spec_expr+
spec_expr        ::= INDENT (label)? spec_expression NEWLINE DEDENT
label            ::= "[" IDENTIFIER "]"

spec_expression  ::= spec_atom (spec_binop spec_atom)*
                   | "NOT" spec_expression
                   | "IF" spec_expression "THEN" spec_expression
spec_atom        ::= field_path spec_relop value_expr
                   | field_path "IS" "NOTHING"
                   | field_path "IS" "NOT" "NOTHING"
                   | field_path "IN" "[" value_list "]"
                   | "PRIOR" "(" field_path ")" spec_relop value_expr
                   | "LENGTH" "OF" field_path spec_relop value_expr
                   | "CONTAINS" field_path value_expr

spec_binop       ::= "AND" | "OR"
spec_relop       ::= "EQUALS" | "NOT_EQUALS" | "GREATER_THAN" | "LESS_THAN"
                   | "GREATER_OR_EQUAL" | "LESS_OR_EQUAL"

failure_block    ::= INDENT "ON" "FAILURE" ":" NEWLINE statement_list DEDENT
success_block    ::= INDENT "ON" "SUCCESS" ":" NEWLINE statement_list DEDENT

body_block       ::= INDENT "BODY" ":" NEWLINE statement_list DEDENT

statement_list   ::= statement+
statement        ::= let_stmt | assign_stmt | write_stmt | call_stmt
                   | return_stmt | abort_stmt | rollback_stmt
                   | if_stmt | match_stmt | for_stmt | while_stmt
                   | notify_stmt | emit_stmt

let_stmt         ::= "LET" ("MUTABLE")? IDENTIFIER "=" expression NEWLINE
assign_stmt      ::= IDENTIFIER "ASSIGN" expression NEWLINE
write_stmt       ::= "WRITE" field_path "AS" expression NEWLINE
                   | "WRITE" field_path "APPEND" expression NEWLINE
call_stmt        ::= ("LET" IDENTIFIER "=")? "CALL" module_path
                     ("WITH" NEWLINE arg_list)?

return_stmt      ::= "RETURN" "EXPLICIT" expression NEWLINE
abort_stmt       ::= "ABORT" "WITH" "reason" ":" expression NEWLINE
rollback_stmt    ::= "ROLLBACK" "ALL" "WRITES" NEWLINE
                   | "ROLLBACK" "AND" "ABORT" "WITH" "reason" ":" expression

if_stmt          ::= "IF" expression "THEN" NEWLINE statement_list
                     ("ELSE" "IF" expression "THEN" NEWLINE statement_list)*
                     ("ELSE" NEWLINE statement_list)?
                     "END" "IF" NEWLINE

match_stmt       ::= "MATCH" expression NEWLINE
                     case_clause+
                     wildcard_clause?
                     "END" "MATCH" NEWLINE

case_clause      ::= "CASE" pattern ("AS" IDENTIFIER)? "THEN" NEWLINE statement_list
wildcard_clause  ::= "CASE" "_" "THEN" NEWLINE statement_list

for_stmt         ::= "FOR" "EACH" IDENTIFIER ("AT" IDENTIFIER)? "IN" expression NEWLINE
                     statement_list
                     "END" "FOR" NEWLINE

while_stmt       ::= "WHILE" expression NEWLINE
                     statement_list
                     "END" "WHILE" NEWLINE

type_expr        ::= IDENTIFIER
                   | "OPTIONAL" type_expr
                   | "List" "OF" type_expr
                   | "Map" "OF" type_expr "TO" type_expr
                   | "EITHER" type_expr "OR" type_expr

expression       ::= atom (binop atom)*
                   | unary_op atom
atom             ::= literal | field_path | IDENTIFIER | function_call
                   | "PRIOR" "(" field_path ")"
                   | "(" expression ")"

binop            ::= "PLUS" | "MINUS" | "TIMES" | "DIVIDED_BY" rounded_by?
                   | "MOD" | "AND" | "OR" | "EQUALS" | "NOT_EQUALS"
                   | "GREATER_THAN" | "LESS_THAN" | "GREATER_OR_EQUAL"
                   | "LESS_OR_EQUAL" | "CONCATENATE" | "OTHERWISE"
rounded_by       ::= "ROUNDED" "TO" INTEGER_LITERAL "DECIMAL_PLACES"
                   | "AS" "INTEGER"

unary_op         ::= "NOT" | "MINUS"

literal          ::= INTEGER_LITERAL | DECIMAL_LITERAL | STRING_LITERAL
                   | "TRUE" | "FALSE" | "NOTHING"

function_call    ::= IDENTIFIER "(" ")"
                   | IDENTIFIER "(" arg_list ")"

arg_list         ::= arg ("," arg)*
arg              ::= IDENTIFIER ":" expression
```

---

## 28. Error Reference

### Compile-Time Errors

| Code | Name | Description |
|---|---|---|
| `E001` | `MissingIntentBlock` | Function is missing the INTENT section |
| `E002` | `SectionOutOfOrder` | A section appears in the wrong position |
| `E003` | `UndeclaredEffect` | BODY reads/writes/calls something not declared |
| `E004` | `TypeMismatch` | Expression type does not match expected type |
| `E005` | `ImplicitCoercion` | Attempt to use a value of wrong type without explicit CAST |
| `E006` | `UnhandledMatchCase` | MATCH on ENUM/UNION is missing a variant |
| `E007` | `CircularDependency` | CALLS graph contains a cycle |
| `E008` | `InvalidPriorUsage` | PRIOR() used in ENSURE BEFORE or on an undeclared field |
| `E009` | `DefaultViolatesConstraint` | DEFAULT value fails the parameter's CONSTRAIN rule |
| `E010` | `WritesToImmutableField` | Attempt to WRITE to a field on an IMMUTABLE data type |
| `E011` | `MissingReturnPath` | Not all execution paths end in RETURN, ABORT, or ROLLBACK |
| `E012` | `MissingOnFailure` | Function has no ON FAILURE block |
| `E013` | `UnknownImport` | IMPORT references a module that does not exist |
| `E014` | `InvalidModuleFilename` | File name does not match MODULE declaration |
| `E015` | `DivisionWithoutRounding` | Decimal DIVIDED_BY without rounding directive |

### Runtime Errors

| Code | Name | Description |
|---|---|---|
| `R001` | `TypeConstraintViolation` | A value failed its type's CONSTRAIN rules |
| `R002` | `PreconditionFailed` | An ENSURE BEFORE condition was not satisfied |
| `R003` | `PostconditionFailed` | An ENSURE AFTER condition was not satisfied |
| `R004` | `InvariantViolated` | An INVARIANT was broken during or after execution |
| `R005` | `SystemInvariantViolated` | A MODULE-level INVARIANT was broken |
| `R006` | `RollbackFailed` | The rollback engine could not restore a WRITES field |
| `R007` | `ExternalCallFailed` | A CALL to an EXTERNAL function failed |
| `R008` | `NothingDereference` | Safe access (`?.`) reached NOTHING on a required field |

### Linter Warnings

| Code | Name | Description |
|---|---|---|
| `W001` | `MechanisticIntent` | INTENT string describes mechanism rather than purpose |
| `W002` | `AIEvaluatedConstraint` | CONSTRAIN string required AI evaluation — consider formalizing |
| `W003` | `UnprovenInvariant` | INVARIANT could not be statically proven — runtime check only |
| `W004` | `PossibleInfiniteLoop` | WHILE loop could not be proven to terminate |
| `W005` | `UnusedParameter` | A RECEIVE parameter is never referenced in BODY |
| `W006` | `EmptyConstrainString` | A CONSTRAIN string is empty or trivially true |

---

*End of VibeL Language Specification v0.1.0-draft*

---

> **Next steps for implementation:**
> 1. Start with the Lexer (section 3) — tokenize a simple function definition
> 2. Build the Parser (section 21.3) using the EBNF in section 27
> 3. Implement the Semantic Analyzer — type checking and effect validation first
> 4. Build the Spec Compiler — start with the formal predicate patterns, defer AI evaluation
> 5. Implement the Runtime Verification Engine — preconditions, then postconditions, then invariants
> 6. Add the Rollback Engine last — it requires the full WRITES tracking infrastructure
