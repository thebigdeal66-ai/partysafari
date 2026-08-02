#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const buildRoot = path.join(appRoot, ".test-build");

function collectCompiledTests(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let tests = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      tests = tests.concat(collectCompiledTests(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
      tests.push(fullPath);
    }
  }

  return tests;
}

const compiledTests = collectCompiledTests(buildRoot)
  .sort()
  .map((filePath) => path.relative(appRoot, filePath).split(path.sep).join("/"));

if (compiledTests.length === 0) {
  console.error("No compiled test files found under .test-build");
  process.exit(1);
}

const child = spawnSync(
  process.execPath,
  ["--require", path.join(appRoot, "scripts/test-alias.js"), "--test", ...compiledTests],
  {
    cwd: appRoot,
    stdio: "inherit",
    env: process.env,
  }
);

process.exit(child.status ?? 1);
