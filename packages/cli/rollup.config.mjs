import { nodeResolve } from "@rollup/plugin-node-resolve";
import { dts } from "rollup-plugin-dts";

export default {
  input: "src/index.ts",
  output: {
    file: "dist/index.d.ts",
    format: "es",
  },
  plugins: [nodeResolve({ extensions: [".ts", ".d.ts", ".js"] }), dts({ respectExternal: false })],
};
