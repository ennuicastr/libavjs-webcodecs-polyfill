import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

export default [
  {
    input: "src/main.ts",
    output: [
      {
        file: "dist/index.js",
        format: "iife",
        name: "LibAVWebCodecs",
      },
    ],
    plugins: [
      resolve({
        extensions: [".js", ".ts"],
      }),
      typescript({
        tsconfig: "./tsconfig.json",
      }),
    ],
  },
  {
    input: "src/main.ts",
    output: [
      {
        file: "dist/index.mjs",
        format: "es",
      },
    ],
    plugins: [
      resolve({
        extensions: [".js", ".ts"],
      }),
      typescript({
        tsconfig: "./tsconfig.json",
      }),
    ],
  },
  {
    input: "src/main.ts",
    output: {
      file: "dist/index.d.ts",
      format: "es",
    },
    plugins: [dts()],
  },
];
