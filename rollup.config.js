import { promises as fsPromises } from "node:fs";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "rollup-plugin-typescript2";

/** @type {import('rollup').RollupOptions} */
const options = {
  input: "src/main.ts",
  output: [
    {
      file: "dist/main.cjs",
      inlineDynamicImports: true,
      format: "cjs",
      sourcemap: true,
      banner: "#!/usr/bin/env node --enable-source-maps",
    },
  ],
  plugins: [
    typescript({
      tsconfig: "./tsconfig.json",
      check: true,
    }),
    nodeResolve({
      preferBuiltins: true,
    }),
    json(),
    commonjs(),
    terser(),
    {
      name: "make-bin",
      writeBundle: (options, _bundle) => {
        const outputFile = options.file;
        if (outputFile) {
          return fsPromises.chmod(outputFile, 0o755);
        }
      },
    },
  ],
};
export default options;
