// The module 'vscode' contains the VS Code extensibility API
// Original author: David Bankier @dbankier (https://github.com/dbankier)
// MIT License

import * as vscode from "vscode";
import {
	type TextProvider,
	calculateArgumentSelect,
	calculateMatchingSelect,
	calculateSingleSelect,
} from "./selection";

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"extension.selectDoubleQuote",
			singleSelect.bind(null, { char: '"' }),
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"extension.selectSingleQuote",
			singleSelect.bind(null, { char: "'" }),
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"extension.selectEitherQuote",
			selectEitherQuote,
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand("extension.switchQuotes", switchQuotes),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"extension.selectBackTick",
			singleSelect.bind(null, { char: "`", multiline: true }),
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"extension.selectParenthesis",
			matchingSelect.bind(null, { start_char: "(", end_char: ")" }),
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"extension.selectSquareBrackets",
			matchingSelect.bind(null, { start_char: "[", end_char: "]" }),
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"extension.selectCurlyBrackets",
			matchingSelect.bind(null, { start_char: "{", end_char: "}" }),
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"extension.selectParenthesisOuter",
			matchingSelect.bind(null, {
				start_char: "(",
				end_char: ")",
				outer: true,
			}),
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"extension.selectSquareBracketsOuter",
			matchingSelect.bind(null, {
				start_char: "[",
				end_char: "]",
				outer: true,
			}),
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"extension.selectCurlyBracketsOuter",
			matchingSelect.bind(null, {
				start_char: "{",
				end_char: "}",
				outer: true,
			}),
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"extension.selectAngleBrackets",
			matchingSelect.bind(null, { start_char: "<", end_char: ">" }),
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"extension.selectInTag",
			matchingSelect.bind(null, { start_char: ">", end_char: "<" }),
		),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand("extension.selectArgument", selectArgument),
	);
}

function createTextProvider(doc: vscode.TextDocument): TextProvider {
	return {
		lineCount: doc.lineCount,
		getLineText: (line: number) => doc.lineAt(line).text,
	};
}

function findSingleSelect(
	s: vscode.Selection,
	doc: vscode.TextDocument,
	char: string,
	outer?: boolean,
	multiline?: boolean,
): vscode.Selection {
	const textProvider = createTextProvider(doc);
	const result = calculateSingleSelect(
		textProvider,
		s.active.line,
		s.active.character,
		s.anchor.line,
		s.anchor.character,
		s.end.line,
		s.end.character,
		char,
		outer,
		multiline,
	);

	if (!result) {
		return s;
	}

	return new vscode.Selection(
		new vscode.Position(result.startLine, result.startChar),
		new vscode.Position(result.endLine, result.endChar),
	);
}

interface SingleSelectOptions {
	char: string;
	outer?: boolean;
	multiline?: boolean;
}

function singleSelect({
	char,
	outer = false,
	multiline = false,
}: SingleSelectOptions) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const doc = editor.document;
	const sel = editor.selections;
	editor.selections = sel.map((s) =>
		findSingleSelect(s, doc, char, outer, multiline),
	);
}

function getSwitchables(): string[] {
	const includeBackTicks = vscode.workspace
		.getConfiguration("quick-select")
		.get<boolean>("includeBackticks");
	return ['"', "'"].concat(includeBackTicks ? ["`"] : []);
}

function selectEitherQuote() {
	const switchables = getSwitchables();
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const doc = editor.document;
	const sel = editor.selections;
	editor.selections = sel.map((s: vscode.Selection) => {
		const selections = switchables
			.map((char) => findSingleSelect(s, doc, char, false, false))
			.filter((sel) => sel !== s)
			.filter(
				(sel) =>
					sel.start.isBeforeOrEqual(s.start) && sel.end.isAfterOrEqual(s.end),
			)
			.sort((a, b) => (a.start.isBefore(b.start) ? 1 : -1));
		if (selections.length > 0) {
			return selections[0];
		}
		return s;
	});
}

function charRange(p: vscode.Position): vscode.Selection {
	const end_pos = new vscode.Position(p.line, p.character + 1);
	return new vscode.Selection(p, end_pos);
}

function switchQuotes() {
	const switchables = getSwitchables();
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const original_sel = editor.selections;
	selectEitherQuote();
	const doc = editor.document;
	const sel = editor.selections;
	for (let s of sel) {
		if (s.start.isEqual(s.end)) {
			continue;
		}
		const expand_start =
			switchables.indexOf(doc.getText(charRange(s.start))) === -1 ? 1 : 0;
		const expand_end =
			switchables.indexOf(doc.getText(charRange(s.end))) === -1 ? 1 : 0;
		const start_pos = new vscode.Position(
			s.start.line,
			s.start.character - expand_start,
		);
		const end_pos = new vscode.Position(
			s.end.line,
			s.end.character - expand_end,
		);
		s = new vscode.Selection(start_pos, end_pos);
		const char = doc.getText(charRange(s.start));
		const edit = new vscode.WorkspaceEdit();
		let next_index = switchables.indexOf(char) + 1;
		if (next_index === switchables.length) {
			next_index = 0;
		}
		const next_char = switchables[next_index];
		edit.replace(doc.uri, charRange(s.start), next_char);
		edit.replace(doc.uri, charRange(s.end), next_char);
		vscode.workspace.applyEdit(edit);
	}
	editor.selections = original_sel;
}

interface MatchingSelectOptions {
	start_char: string;
	end_char: string;
	outer?: boolean;
}

function matchingSelect({
	start_char,
	end_char,
	outer = false,
}: MatchingSelectOptions) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const doc = editor.document;
	const sel = editor.selections;
	const textProvider = createTextProvider(doc);

	editor.selections = sel.map((s) => {
		const result = calculateMatchingSelect(
			textProvider,
			s.active.line,
			s.active.character,
			s.anchor.line,
			s.anchor.character,
			s.end.line,
			s.end.character,
			start_char,
			end_char,
			outer,
		);

		if (!result) {
			return s;
		}

		return new vscode.Selection(
			new vscode.Position(result.startLine, result.startChar),
			new vscode.Position(result.endLine, result.endChar),
		);
	});
}

function selectArgument() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const doc = editor.document;
	const textProvider = createTextProvider(doc);

	editor.selections = editor.selections.map((s) => {
		const result = calculateArgumentSelect(
			textProvider,
			s.active.line,
			s.active.character,
		);

		if (!result) {
			return s;
		}

		return new vscode.Selection(
			new vscode.Position(result.startLine, result.startChar),
			new vscode.Position(result.endLine, result.endChar),
		);
	});
}
