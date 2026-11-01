import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/main.ts", "./src/worker.ts"],
  format: "esm",
  outDir: "./dist",
  clean: true,
  deps: {
    alwaysBundle: [/@app\/.*/],
  },
});
