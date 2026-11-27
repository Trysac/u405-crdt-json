// Security gate configuration: ESLint runs ONLY eslint-plugin-security; Biome stays the linter and formatter.
// Run by scripts/check.mjs with `--no-inline-config`, so `eslint-disable` comments cannot silence a finding.
// Factory-owned file: agents must not edit it.
//
// TypeScript is parsed without typescript-eslint (it does not support TypeScript 7): Node's built-in
// `stripTypeScriptTypes` blanks the type annotations with spaces, so espree parses plain JavaScript at the
// same lines and columns. Syntax that strip mode cannot erase is first rewritten at the same length: parameter-
// property modifiers (`constructor(private readonly x: T)`) become spaces, and `enum E { A = 1 }` becomes
// `let  E={ A : 1 }`, an object literal the security rules can read. Anything else (namespace) falls back to
// Node's transform mode, whose positions are close but not exact; Node 26 removed that mode, so such files
// fail there with an explicit message instead of a cryptic option error.

import { createRequire, stripTypeScriptTypes } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import security from "eslint-plugin-security";

// espree is ESLint's own parser; resolve it next to the installed ESLint.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const espree = createRequire(join(root, "node_modules", "eslint", "package.json"))("espree");

const PARAMETER_MODIFIER = /\b(?:public|private|protected|readonly|override)\b(?=\s+[\w$[{])/g;

// Replaces parameter-property modifiers inside constructor parameter lists with spaces of the same length.
function blankParameterProperties(code) {
  let out = code;
  const constructorCall = /\bconstructor\s*\(/g;
  for (let match = constructorCall.exec(code); match; match = constructorCall.exec(code)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    while (end < code.length && depth > 0) {
      if (code[end] === "(") depth++;
      else if (code[end] === ")") depth--;
      end++;
    }
    const params = code
      .slice(start, end - 1)
      .replace(PARAMETER_MODIFIER, (word) => " ".repeat(word.length));
    out = out.slice(0, start) + params + out.slice(end - 1);
  }
  return out;
}

const ENUM_HEADER = /\b(const\s+)?enum(\s+[A-Za-z_$][\w$]*)(\s*)\{/g;
const ENUM_INITIALIZER = /([\w$"'\]]\s*)=(?![=>])/g;

// Rewrites each enum declaration into an object literal of the same length, keeping every position.
function rewriteEnums(code) {
  let out = code;
  for (let match = ENUM_HEADER.exec(code); match; match = ENUM_HEADER.exec(code)) {
    const [header, constPrefix = "", name, gap] = match;
    const assign = gap.length > 0 ? `${gap.slice(1)}=` : "=";
    const replacement = `${" ".repeat(constPrefix.length)}let ${name}${assign}{`;
    const bodyStart = match.index + header.length;
    let depth = 1;
    let end = bodyStart;
    while (end < code.length && depth > 0) {
      if (code[end] === "{") depth++;
      else if (code[end] === "}") depth--;
      end++;
    }
    const body = code.slice(bodyStart, end - 1).replace(ENUM_INITIALIZER, "$1:");
    const shift = out.length - code.length;
    out = out.slice(0, match.index + shift) + replacement + body + out.slice(end - 1 + shift);
  }
  return out;
}

function stripTypes(code) {
  const erasable = rewriteEnums(blankParameterProperties(code));
  try {
    return stripTypeScriptTypes(erasable, { mode: "strip" });
  } catch (error) {
    if (error?.code !== "ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX") throw error;
    try {
      return stripTypeScriptTypes(code, { mode: "transform" });
    } catch (transformError) {
      if (transformError?.code !== "ERR_INVALID_ARG_VALUE") throw transformError;
      throw new Error(
        `${error.message} (this Node version has no transform mode; avoid enum and namespace)`,
      );
    }
  }
}

const stripTypesParser = {
  meta: { name: "fabrica-strip-types" },
  parse(code, options) {
    return espree.parse(stripTypes(code), {
      ...options,
      ecmaVersion: "latest",
      sourceType: "module",
      range: true,
      loc: true,
      comment: true,
      tokens: true,
    });
  },
};

// Errors are the high-severity rules: findings that are real vulnerabilities in a library, and they fail the
// gate. Warnings are printed for review but do not fail: detect-unsafe-regex (safe-regex star height) flags
// harmless optional groups such as /^3[.][01][.][0-9]+(?:-[0-9A-Za-z.-]+)?$/. The noisiest heuristics
// (object injection, non-literal fs paths) are off: they flag ordinary code and would train the generator to
// rewrite safe code.
export default [
  {
    files: ["src/**/*.ts", "src/**/*.mts", "src/**/*.tsx"],
    languageOptions: { parser: stripTypesParser },
    plugins: { security },
    rules: {
      "security/detect-bidi-characters": "error",
      "security/detect-buffer-noassert": "error",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-invisible-characters": "error",
      "security/detect-new-buffer": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-non-literal-require": "error",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-child-process": "warn",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-possible-timing-attacks": "warn",
      "security/detect-unsafe-regex": "warn",
    },
  },
];
