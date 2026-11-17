import { defineConfig } from "rolldown";

// One file the Stream Deck app runs with its own Node.js (manifest: Nodejs 24).
export default defineConfig({
	input: "src/plugin.ts",
	platform: "node",
	resolve: { conditionNames: ["node"] },
	output: {
		file: "uk.coredev.sona.sdPlugin/bin/plugin.js",
		format: "esm",
		minify: true,
	},
	plugins: [
		{
			name: "module-package",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: '{ "type": "module" }', type: "asset" });
			},
		},
	],
});
