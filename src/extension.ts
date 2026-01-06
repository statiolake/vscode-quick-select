// The module 'vscode' contains the VS Code extensibility API
// Original author: David Bankier @dbankier (https://github.com/dbankier)
// MIT License

import * as vscode from "vscode";

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
}

function findOccurances(
	doc: vscode.TextDocument,
	line: number,
	char: string,
): number[] {
	const content = doc.lineAt(line);
	const matches = `${content.text}hack`
		.split(char)
		.reduce<number[]>((acc, p) => {
			let len = p.length + 1;
			if (acc.length > 0) {
				len += acc[acc.length - 1];
			}
			acc.push(len);
			return acc;
		}, []);
	matches.pop();
	return matches;
}

function findNext(
	doc: vscode.TextDocument,
	line: number,
	char: string,
	start_index = 0,
	nest_char?: string,
	nested = 0,
): vscode.Position | undefined {
	if (line === doc.lineCount) {
		return undefined;
	}
	const occurances = findOccurances(doc, line, char).filter(
		(n) => n >= start_index,
	);
	const nests = nest_char
		? findOccurances(doc, line, nest_char).filter((n) => n >= start_index)
		: [];
	let occurance_index = 0;
	let nests_index = 0;
	let currentNested = nested;
	while (
		(occurance_index < occurances.length || nests_index < nests.length) &&
		currentNested >= 0
	) {
		if (
			occurances[occurance_index] < nests[nests_index] ||
			nests[nests_index] === undefined
		) {
			if (currentNested === 0) {
				return new vscode.Position(line, occurances[occurance_index]);
			}
			currentNested--;
			occurance_index++;
		} else if (
			nests[nests_index] < occurances[occurance_index] ||
			occurances[occurance_index] === undefined
		) {
			currentNested++;
			nests_index++;
		}
	}
	return findNext(doc, line + 1, char, 0, nest_char, currentNested);
}

function findPrevious(
	doc: vscode.TextDocument,
	line: number,
	char: string,
	start_index?: number,
	nest_char?: string,
	nested = 0,
): vscode.Position | undefined {
	if (line === -1) {
		return undefined;
	}
	const actualStartIndex = start_index ?? doc.lineAt(line).text.length;
	const occurances = findOccurances(doc, line, char).filter(
		(n) => n <= actualStartIndex,
	);
	const nests = nest_char
		? findOccurances(doc, line, nest_char).filter((n) => n <= actualStartIndex)
		: [];
	let occurance_index = occurances.length - 1;
	let nests_index = nests.length - 1;
	let currentNested = nested;
	while ((occurance_index > -1 || nests_index > -1) && currentNested >= 0) {
		if (
			occurances[occurance_index] > nests[nests_index] ||
			nests[nests_index] === undefined
		) {
			if (currentNested === 0) {
				return new vscode.Position(line, occurances[occurance_index]);
			}
			currentNested--;
			occurance_index--;
		} else if (
			nests[nests_index] > occurances[occurance_index] ||
			occurances[occurance_index] === undefined
		) {
			currentNested++;
			nests_index--;
		}
	}
	return findPrevious(doc, line - 1, char, undefined, nest_char, currentNested);
}

function findSingleSelect(
	s: vscode.Selection,
	doc: vscode.TextDocument,
	char: string,
	outer?: boolean,
	multiline?: boolean,
): vscode.Selection {
	const { line, character } = s.active;
	const matches = findOccurances(doc, line, char);
	const next = matches.find((a) => a > character);
	let next_index = next !== undefined ? matches.indexOf(next) : -1;
	let offset = outer ? char.length : 0;

	if (matches.length > 1 && matches.length % 2 === 0) {
		if (next_index === -1) {
			return s;
		}
		if (next_index % 2 !== 0) {
			next_index--;
		}
		if (
			!outer &&
			new vscode.Position(line, matches[next_index]).isEqual(s.anchor) &&
			new vscode.Position(line, matches[next_index + 1] - 1).isEqual(s.end)
		) {
			offset = char.length;
		}
		return new vscode.Selection(
			new vscode.Position(line, matches[next_index] - offset),
			new vscode.Position(line, matches[next_index + 1] - 1 + offset),
		);
	}

	if (multiline) {
		let start_pos =
			findPrevious(doc, line, char, character) ??
			(next_index >= 0
				? new vscode.Position(line, matches[next_index])
				: undefined);
		if (!start_pos) {
			return s;
		}
		let end_pos = findNext(doc, start_pos.line, char, start_pos.character + 1);
		if (!end_pos) {
			return s;
		}
		if (
			!outer &&
			start_pos.isEqual(s.anchor) &&
			new vscode.Position(end_pos.line, end_pos.character - 1).isEqual(s.end)
		) {
			offset = char.length;
		}
		if (start_pos && end_pos) {
			start_pos = new vscode.Position(
				start_pos.line,
				start_pos.character - offset,
			);
			end_pos = new vscode.Position(
				end_pos.line,
				end_pos.character - 1 + offset,
			);
			return new vscode.Selection(start_pos, end_pos);
		}
	}

	return s;
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
	let start_offset = outer ? start_char.length : 0;
	let end_offset = outer ? end_char.length : 0;
	editor.selections = sel.map((s) => {
		const { line, character } = s.active;
		const starts = findOccurances(doc, line, start_char);
		const start = starts.find((a) => a > character);
		const start_index = start !== undefined ? starts.indexOf(start) : -1;
		let start_pos: vscode.Position | undefined =
			findPrevious(doc, line, start_char, character, end_char) ??
			(start_index >= 0
				? new vscode.Position(line, starts[start_index])
				: undefined);
		if (!start_pos) {
			return s;
		}
		let end_pos = findNext(
			doc,
			start_pos.line,
			end_char,
			start_pos.character + 1,
			start_char,
		);
		if (start_pos && end_pos) {
			if (
				!outer &&
				start_pos.isEqual(s.anchor) &&
				new vscode.Position(end_pos.line, end_pos.character - 1).isEqual(s.end)
			) {
				start_offset = start_char.length;
				end_offset = end_char.length;
			}
			start_pos = new vscode.Position(
				start_pos.line,
				start_pos.character - start_offset,
			);
			end_pos = new vscode.Position(
				end_pos.line,
				end_pos.character - 1 + end_offset,
			);
			return new vscode.Selection(start_pos, end_pos);
		}
		return s;
	});
}
