import * as assert from "node:assert";
import * as vscode from "vscode";

suite("Extension Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	test("Extension should be present", () => {
		assert.ok(
			vscode.extensions.getExtension(
				"statiolake.customized-vscode-quick-select",
			),
		);
	});

	test("Commands should be registered", async () => {
		const commands = await vscode.commands.getCommands();
		assert.ok(commands.includes("extension.selectDoubleQuote"));
		assert.ok(commands.includes("extension.selectSingleQuote"));
		assert.ok(commands.includes("extension.selectEitherQuote"));
		assert.ok(commands.includes("extension.switchQuotes"));
		assert.ok(commands.includes("extension.selectParenthesis"));
		assert.ok(commands.includes("extension.selectBackTick"));
		assert.ok(commands.includes("extension.selectSquareBrackets"));
		assert.ok(commands.includes("extension.selectCurlyBrackets"));
	});
});
