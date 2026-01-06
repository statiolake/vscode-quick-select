import * as assert from "node:assert";
import {
	type TextProvider,
	calculateMatchingSelect,
	calculateSingleSelect,
	findNextInText,
	findOccurancesInText,
	findPreviousInText,
} from "../selection";

// Helper to create a TextProvider from an array of lines
function createTextProvider(lines: string[]): TextProvider {
	return {
		lineCount: lines.length,
		getLineText: (line: number) => lines[line],
	};
}

suite("Selection Core Tests", () => {
	suite("findOccurancesInText", () => {
		test("finds double quotes in text", () => {
			const result = findOccurancesInText('hello "world" test', '"');
			assert.deepStrictEqual(result, [7, 13]);
		});

		test("finds single quotes in text", () => {
			const result = findOccurancesInText("hello 'world' test", "'");
			assert.deepStrictEqual(result, [7, 13]);
		});

		test("finds multiple pairs of quotes", () => {
			const result = findOccurancesInText('"a" "b" "c"', '"');
			assert.deepStrictEqual(result, [1, 3, 5, 7, 9, 11]);
		});

		test("finds parentheses", () => {
			const result = findOccurancesInText("foo(bar)", "(");
			assert.deepStrictEqual(result, [4]);
		});

		test("finds nested brackets", () => {
			const result = findOccurancesInText("a(b(c)d)e", "(");
			assert.deepStrictEqual(result, [2, 4]);
		});

		test("returns empty array for no matches", () => {
			const result = findOccurancesInText("hello world", '"');
			assert.deepStrictEqual(result, []);
		});

		test("handles empty string", () => {
			const result = findOccurancesInText("", '"');
			assert.deepStrictEqual(result, []);
		});

		test("handles character at start of string", () => {
			const result = findOccurancesInText('"hello"', '"');
			assert.deepStrictEqual(result, [1, 7]);
		});

		test("handles character at end of string", () => {
			const result = findOccurancesInText('test"', '"');
			assert.deepStrictEqual(result, [5]);
		});
	});

	suite("findNextInText", () => {
		test("finds next closing bracket on same line", () => {
			const provider = createTextProvider(["(hello)"]);
			const result = findNextInText(provider, 0, ")", 1);
			assert.ok(result);
			assert.strictEqual(result.line, 0);
			assert.strictEqual(result.character, 7);
		});

		test("finds next closing bracket on different line", () => {
			const provider = createTextProvider(["(hello", "world)"]);
			const result = findNextInText(provider, 0, ")", 1);
			assert.ok(result);
			assert.strictEqual(result.line, 1);
			assert.strictEqual(result.character, 6);
		});

		test("handles nested brackets", () => {
			const provider = createTextProvider(["(a(b)c)"]);
			// "(a(b)c)" - positions: ( at 1, ( at 3, ) at 5, ) at 7
			// Starting from position 2, looking for ')' with '(' as nest char
			// At pos 3, finds '(' → nested++
			// At pos 5, finds ')' but nested=1 → nested--
			// At pos 7, finds ')' and nested=0 → returns 7 (the outer closing bracket)
			const result = findNextInText(provider, 0, ")", 2, "(");
			assert.ok(result);
			assert.strictEqual(result.line, 0);
			assert.strictEqual(result.character, 7);
		});

		test("returns undefined when no match found", () => {
			const provider = createTextProvider(["hello"]);
			const result = findNextInText(provider, 0, ")");
			assert.strictEqual(result, undefined);
		});

		test("finds match starting from specific index", () => {
			const provider = createTextProvider(["a)b)c)"]);
			const result = findNextInText(provider, 0, ")", 3);
			assert.ok(result);
			assert.strictEqual(result.character, 4);
		});
	});

	suite("findPreviousInText", () => {
		test("finds previous opening bracket on same line", () => {
			const provider = createTextProvider(["(hello)"]);
			const result = findPreviousInText(provider, 0, "(", 6);
			assert.ok(result);
			assert.strictEqual(result.line, 0);
			assert.strictEqual(result.character, 1);
		});

		test("finds previous opening bracket on different line", () => {
			const provider = createTextProvider(["(hello", "world)"]);
			const result = findPreviousInText(provider, 1, "(", 5);
			assert.ok(result);
			assert.strictEqual(result.line, 0);
			assert.strictEqual(result.character, 1);
		});

		test("handles nested brackets", () => {
			const provider = createTextProvider(["(a(b)c)"]);
			const result = findPreviousInText(provider, 0, "(", 6, ")");
			assert.ok(result);
			assert.strictEqual(result.line, 0);
			assert.strictEqual(result.character, 1);
		});

		test("returns undefined when no match found", () => {
			const provider = createTextProvider(["hello"]);
			const result = findPreviousInText(provider, 0, "(");
			assert.strictEqual(result, undefined);
		});
	});

	suite("calculateSingleSelect", () => {
		test("selects content inside double quotes", () => {
			const provider = createTextProvider(['hello "world" test']);
			const result = calculateSingleSelect(
				provider,
				0,
				10, // cursor inside "world"
				0,
				10,
				0,
				10,
				'"',
				false,
				false,
			);
			assert.ok(result);
			assert.strictEqual(result.startLine, 0);
			assert.strictEqual(result.startChar, 7);
			assert.strictEqual(result.endLine, 0);
			assert.strictEqual(result.endChar, 12);
		});

		test("selects outer quotes when outer=true", () => {
			const provider = createTextProvider(['hello "world" test']);
			const result = calculateSingleSelect(
				provider,
				0,
				10,
				0,
				10,
				0,
				10,
				'"',
				true,
				false,
			);
			assert.ok(result);
			assert.strictEqual(result.startChar, 6);
			assert.strictEqual(result.endChar, 13);
		});

		test("expands to outer when already selected inner", () => {
			const provider = createTextProvider(['hello "world" test']);
			// Already selected "world" (positions 7-12)
			const result = calculateSingleSelect(
				provider,
				0,
				10,
				0,
				7, // anchor at opening quote position
				0,
				12, // end at closing quote position
				'"',
				false,
				false,
			);
			assert.ok(result);
			// Should expand to include quotes
			assert.strictEqual(result.startChar, 6);
			assert.strictEqual(result.endChar, 13);
		});

		test("returns null when no quotes found", () => {
			const provider = createTextProvider(["hello world"]);
			const result = calculateSingleSelect(
				provider,
				0,
				5,
				0,
				5,
				0,
				5,
				'"',
				false,
				false,
			);
			assert.strictEqual(result, null);
		});

		test("selects multiline backticks", () => {
			const provider = createTextProvider(["`hello", "world`"]);
			const result = calculateSingleSelect(
				provider,
				0,
				3,
				0,
				3,
				0,
				3,
				"`",
				false,
				true,
			);
			assert.ok(result);
			assert.strictEqual(result.startLine, 0);
			assert.strictEqual(result.startChar, 1);
			assert.strictEqual(result.endLine, 1);
			assert.strictEqual(result.endChar, 5);
		});
	});

	suite("calculateMatchingSelect", () => {
		test("selects content inside parentheses", () => {
			const provider = createTextProvider(["foo(bar)baz"]);
			const result = calculateMatchingSelect(
				provider,
				0,
				5, // cursor inside (bar)
				0,
				5,
				0,
				5,
				"(",
				")",
				false,
			);
			assert.ok(result);
			assert.strictEqual(result.startChar, 4);
			assert.strictEqual(result.endChar, 7);
		});

		test("selects outer parentheses when outer=true", () => {
			const provider = createTextProvider(["foo(bar)baz"]);
			const result = calculateMatchingSelect(
				provider,
				0,
				5,
				0,
				5,
				0,
				5,
				"(",
				")",
				true,
			);
			assert.ok(result);
			assert.strictEqual(result.startChar, 3);
			assert.strictEqual(result.endChar, 8);
		});

		test("handles nested brackets", () => {
			const provider = createTextProvider(["a(b(c)d)e"]);
			const result = calculateMatchingSelect(
				provider,
				0,
				4, // cursor inside inner (c)
				0,
				4,
				0,
				4,
				"(",
				")",
				false,
			);
			assert.ok(result);
			assert.strictEqual(result.startChar, 4);
			assert.strictEqual(result.endChar, 5);
		});

		test("selects outer bracket when cursor between brackets", () => {
			const provider = createTextProvider(["a(b(c)d)e"]);
			const result = calculateMatchingSelect(
				provider,
				0,
				6, // cursor at 'd' between inner ) and outer )
				0,
				6,
				0,
				6,
				"(",
				")",
				false,
			);
			assert.ok(result);
			assert.strictEqual(result.startChar, 2);
			assert.strictEqual(result.endChar, 7);
		});

		test("handles multiline brackets", () => {
			const provider = createTextProvider([
				"function(",
				"  arg1,",
				"  arg2",
				")",
			]);
			const result = calculateMatchingSelect(
				provider,
				1,
				3, // cursor on line 1
				1,
				3,
				1,
				3,
				"(",
				")",
				false,
			);
			assert.ok(result);
			assert.strictEqual(result.startLine, 0);
			assert.strictEqual(result.startChar, 9);
			assert.strictEqual(result.endLine, 3);
			assert.strictEqual(result.endChar, 0);
		});

		test("selects inside square brackets", () => {
			const provider = createTextProvider(["array[index]"]);
			const result = calculateMatchingSelect(
				provider,
				0,
				8,
				0,
				8,
				0,
				8,
				"[",
				"]",
				false,
			);
			assert.ok(result);
			assert.strictEqual(result.startChar, 6);
			assert.strictEqual(result.endChar, 11);
		});

		test("selects inside curly brackets", () => {
			const provider = createTextProvider(["obj{key: value}"]);
			const result = calculateMatchingSelect(
				provider,
				0,
				8,
				0,
				8,
				0,
				8,
				"{",
				"}",
				false,
			);
			assert.ok(result);
			assert.strictEqual(result.startChar, 4);
			assert.strictEqual(result.endChar, 14);
		});

		test("selects inside angle brackets", () => {
			const provider = createTextProvider(["Array<string>"]);
			const result = calculateMatchingSelect(
				provider,
				0,
				8,
				0,
				8,
				0,
				8,
				"<",
				">",
				false,
			);
			assert.ok(result);
			assert.strictEqual(result.startChar, 6);
			assert.strictEqual(result.endChar, 12);
		});

		test("returns null when no brackets found", () => {
			const provider = createTextProvider(["hello world"]);
			const result = calculateMatchingSelect(
				provider,
				0,
				5,
				0,
				5,
				0,
				5,
				"(",
				")",
				false,
			);
			assert.strictEqual(result, null);
		});

		test("expands to outer when already selected inner", () => {
			const provider = createTextProvider(["foo(bar)baz"]);
			// Already selected "bar" (positions 4-7)
			const result = calculateMatchingSelect(
				provider,
				0,
				5,
				0,
				4, // anchor at opening paren position
				0,
				7, // end at closing paren position
				"(",
				")",
				false,
			);
			assert.ok(result);
			// Should expand to include parens
			assert.strictEqual(result.startChar, 3);
			assert.strictEqual(result.endChar, 8);
		});
	});
});
