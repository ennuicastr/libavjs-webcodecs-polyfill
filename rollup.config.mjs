import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

export default {
    input: "src/main.js",
    output: [
        {
            file: "dist/libavjs-webcodecs-polyfill.js",
            format: "iife",
            name: "LibAVWebCodecs"
        }, {
            file: "dist/libavjs-webcodecs-polyfill.min.js",
            format: "iife",
            name: "LibAVWebCodecs"
        }, {
            file: "dist/libavjs-webcodecs-polyfill.cjs",
            format: "cjs"
        }, {
            file: "dist/libavjs-webcodecs-polyfill.min.cjs",
            format: "cjs",
            plugins: [terser()]
        }, {
            file: "dist/libavjs-webcodecs-polyfill.mjs",
            format: "es"
        }, {
            file: "dist/libavjs-webcodecs-polyfill.min.mjs",
            format: "es",
            plugins: [terser()]
        }
    ],
    context: "this",
    plugins: [nodeResolve(), commonjs()]
};
