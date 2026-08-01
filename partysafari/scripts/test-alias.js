// Resolves the `@/*` path alias for the compiled test build. tsc emits the
// alias verbatim, and Node has no tsconfig `paths` support, so the require
// resolver is taught the same mapping the bundler already uses.
const path = require("node:path");
const Module = require("node:module");

const buildRoot = path.join(__dirname, "..", ".test-build");
const resolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) {
    return resolveFilename.call(this, path.join(buildRoot, request.slice(2)), ...rest);
  }
  return resolveFilename.call(this, request, ...rest);
};
