import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

export default {
    input: "src/main.js",
    output: [
        {
            file: "dist/libavjs-webcodecs-polyfill.js",
            format: "umd",
            name: "LibAVWebCodecs"
        }, {
            file: "dist/libavjs-webcodecs-polyfill.min.js",
            format: "umd",
            name: "LibAVWebCodecs"
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
