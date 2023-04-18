import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import terser from '@rollup/plugin-terser';
import dts from "rollup-plugin-dts";

export default [
  {
    input: "src/main.ts",
    output: [
      {
        file: "dist/libavjs-webcodecs-polyfill.min.js",
        format: "umd",
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
      terser(),
    ],
  },
  {
    input: "src/main.ts",
    output: [
      {
        file: "dist/libavjs-webcodecs-polyfill.min.mjs",
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
      terser(),
    ],
  },
  {
    input: 'src/main.ts',
    output: {
      file: 'dist/main.d.ts',
      format: 'es'
    },
    plugins: [dts()],
  },
];
