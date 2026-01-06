import * as assert from "node:assert";
import {
	type TextProvider,
	calculateArgumentSelect,
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

	suite("calculateArgumentSelect", () => {
		test("selects first argument in function call", () => {
			const provider = createTextProvider(["func(arg1, arg2, arg3)"]);
			// Cursor at position 6 (inside "arg1")
			const result = calculateArgumentSelect(provider, 0, 6);
			assert.ok(result);
			assert.strictEqual(result.startLine, 0);
			assert.strictEqual(result.startChar, 5);
			assert.strictEqual(result.endLine, 0);
			assert.strictEqual(result.endChar, 9);
		});

		test("selects middle argument in function call", () => {
			const provider = createTextProvider(["func(arg1, arg2, arg3)"]);
			// Cursor at position 12 (inside "arg2")
			const result = calculateArgumentSelect(provider, 0, 12);
			assert.ok(result);
			assert.strictEqual(result.startChar, 11);
			assert.strictEqual(result.endChar, 15);
		});

		test("selects last argument in function call", () => {
			const provider = createTextProvider(["func(arg1, arg2, arg3)"]);
			// Cursor at position 19 (inside "arg3")
			const result = calculateArgumentSelect(provider, 0, 19);
			assert.ok(result);
			assert.strictEqual(result.startChar, 17);
			assert.strictEqual(result.endChar, 21);
		});

		test("selects single argument", () => {
			const provider = createTextProvider(["func(only_arg)"]);
			const result = calculateArgumentSelect(provider, 0, 8);
			assert.ok(result);
			assert.strictEqual(result.startChar, 5);
			assert.strictEqual(result.endChar, 13);
		});

		test("handles argument with string containing comma", () => {
			const provider = createTextProvider(['func("a, b", arg2)']);
			// Cursor inside the string "a, b"
			const result = calculateArgumentSelect(provider, 0, 8);
			assert.ok(result);
			assert.strictEqual(result.startChar, 5);
			assert.strictEqual(result.endChar, 11);
		});

		test("selects second argument after string with comma", () => {
			const provider = createTextProvider(['func("a, b", arg2)']);
			// Cursor at arg2
			const result = calculateArgumentSelect(provider, 0, 15);
			assert.ok(result);
			assert.strictEqual(result.startChar, 13);
			assert.strictEqual(result.endChar, 17);
		});

		test("handles escaped quotes in string", () => {
			const provider = createTextProvider(['func("say \\"hello\\"", arg2)']);
			// Cursor inside the string with escaped quotes
			const result = calculateArgumentSelect(provider, 0, 10);
			assert.ok(result);
			assert.strictEqual(result.startChar, 5);
			assert.strictEqual(result.endChar, 20);
		});

		test("handles single quoted strings", () => {
			const provider = createTextProvider(["func('a, b', arg2)"]);
			const result = calculateArgumentSelect(provider, 0, 8);
			assert.ok(result);
			assert.strictEqual(result.startChar, 5);
			assert.strictEqual(result.endChar, 11);
		});

		test("handles nested parentheses in argument", () => {
			const provider = createTextProvider(["func(inner(a, b), arg2)"]);
			// Cursor inside inner(a, b)
			const result = calculateArgumentSelect(provider, 0, 8);
			assert.ok(result);
			assert.strictEqual(result.startChar, 5);
			assert.strictEqual(result.endChar, 16);
		});

		test("handles square brackets in array literal", () => {
			const provider = createTextProvider(["func([1, 2, 3], arg2)"]);
			// Cursor at position 8 is inside the array at "2"
			// Should select "2" (the element inside [])
			const result = calculateArgumentSelect(provider, 0, 8);
			assert.ok(result);
			assert.strictEqual(result.startChar, 9);
			assert.strictEqual(result.endChar, 10);
		});

		test("handles curly braces in object literal", () => {
			const provider = createTextProvider(["func({a: 1, b: 2}, arg2)"]);
			// Cursor at position 10 is inside the object at "1"
			// Should select "a: 1" (the first key-value pair inside {})
			const result = calculateArgumentSelect(provider, 0, 10);
			assert.ok(result);
			assert.strictEqual(result.startChar, 6);
			assert.strictEqual(result.endChar, 10);
		});

		test("handles multiline arguments", () => {
			const provider = createTextProvider([
				"func(",
				"  arg1,",
				"  arg2,",
				"  arg3",
				")",
			]);
			// Cursor on line 2 inside arg2
			const result = calculateArgumentSelect(provider, 2, 4);
			assert.ok(result);
			assert.strictEqual(result.startLine, 2);
			assert.strictEqual(result.startChar, 2);
			assert.strictEqual(result.endLine, 2);
			assert.strictEqual(result.endChar, 6);
		});

		test("handles template literals with expressions", () => {
			const provider = createTextProvider(["func(`${a}, ${b}`, arg2)"]);
			// Cursor inside the template literal
			const result = calculateArgumentSelect(provider, 0, 10);
			assert.ok(result);
			assert.strictEqual(result.startChar, 5);
			assert.strictEqual(result.endChar, 17);
		});

		test("returns null when not inside brackets", () => {
			const provider = createTextProvider(["hello world"]);
			const result = calculateArgumentSelect(provider, 0, 5);
			assert.strictEqual(result, null);
		});

		test("handles empty arguments", () => {
			const provider = createTextProvider(["func()"]);
			const result = calculateArgumentSelect(provider, 0, 5);
			assert.strictEqual(result, null);
		});

		test("trims whitespace from argument selection", () => {
			const provider = createTextProvider(["func(  arg1  ,  arg2  )"]);
			// Cursor at arg1
			const result = calculateArgumentSelect(provider, 0, 8);
			assert.ok(result);
			assert.strictEqual(result.startChar, 7);
			assert.strictEqual(result.endChar, 11);
		});

		// Around argument (aa) tests - expand to include comma when already selected inner
		test("expands first argument to include comma after (aa)", () => {
			const provider = createTextProvider(["func(a, b, c)"]);
			// Already selected 'a' (positions 5-6)
			const result = calculateArgumentSelect(provider, 0, 5, 0, 5, 0, 6);
			assert.ok(result);
			// Should expand to include comma: 'a,'
			assert.strictEqual(result.startChar, 5);
			assert.strictEqual(result.endChar, 7);
		});

		test("expands middle argument to include comma before (aa)", () => {
			const provider = createTextProvider(["func(a, b, c)"]);
			// Already selected 'b' (positions 8-9)
			const result = calculateArgumentSelect(provider, 0, 8, 0, 8, 0, 9);
			assert.ok(result);
			// Should expand to include comma before: ', b'
			assert.strictEqual(result.startChar, 6);
			assert.strictEqual(result.endChar, 9);
		});

		test("expands last argument to include comma before (aa)", () => {
			const provider = createTextProvider(["func(a, b, c)"]);
			// Already selected 'c' (positions 11-12)
			const result = calculateArgumentSelect(provider, 0, 11, 0, 11, 0, 12);
			assert.ok(result);
			// Should expand to include comma before: ', c'
			assert.strictEqual(result.startChar, 9);
			assert.strictEqual(result.endChar, 12);
		});

		test("single argument does not expand (no comma)", () => {
			const provider = createTextProvider(["func(only)"]);
			// Already selected 'only' (positions 5-9)
			const result = calculateArgumentSelect(provider, 0, 6, 0, 5, 0, 9);
			assert.ok(result);
			// No comma to include, stays the same
			assert.strictEqual(result.startChar, 5);
			assert.strictEqual(result.endChar, 9);
		});

		// Nested parentheses tests (ported from vscode-waltz)
		test("handles nested parentheses - cursor inside inner function first arg", () => {
			const provider = createTextProvider(["func(a, bar(x, y), c)"]);
			// Position 13: between 'x' and ','
			const result = calculateArgumentSelect(provider, 0, 13);
			assert.ok(result);
			// Should select 'x'
			assert.strictEqual(result.startChar, 12);
			assert.strictEqual(result.endChar, 13);
		});

		test("handles nested parentheses - cursor inside inner function second arg", () => {
			const provider = createTextProvider(["func(a, bar(x, y), c)"]);
			// Position 16: between 'y' and ')'
			const result = calculateArgumentSelect(provider, 0, 16);
			assert.ok(result);
			// Should select 'y'
			assert.strictEqual(result.startChar, 15);
			assert.strictEqual(result.endChar, 16);
		});

		test("handles cursor in outer argument containing nested call at function name", () => {
			const provider = createTextProvider(["foo(bar(), baz, qux)"]);
			// Position 6: at 'r' in 'bar()'
			const result = calculateArgumentSelect(provider, 0, 6);
			assert.ok(result);
			// Should select 'bar()' only
			assert.strictEqual(result.startChar, 4);
			assert.strictEqual(result.endChar, 9);
		});

		test("handles cursor in outer argument containing nested call at opening paren", () => {
			const provider = createTextProvider(["foo(bar(), baz, qux)"]);
			// Position 7: at '(' in 'bar()'
			const result = calculateArgumentSelect(provider, 0, 7);
			assert.ok(result);
			// Should select 'bar()' only
			assert.strictEqual(result.startChar, 4);
			assert.strictEqual(result.endChar, 9);
		});

		test("handles second argument after nested call", () => {
			const provider = createTextProvider(["foo(bar(), baz, qux)"]);
			// Position 12: at 'a' in 'baz'
			const result = calculateArgumentSelect(provider, 0, 12);
			assert.ok(result);
			// Should select 'baz' only
			assert.strictEqual(result.startChar, 11);
			assert.strictEqual(result.endChar, 14);
		});

		test("handles multiple nested calls in different arguments", () => {
			const provider = createTextProvider(["foo(bar(1), baz(2), qux)"]);
			// Position 13: at 'a' in 'baz(2)'
			const result = calculateArgumentSelect(provider, 0, 13);
			assert.ok(result);
			// Should select 'baz(2)' only
			assert.strictEqual(result.startChar, 12);
			assert.strictEqual(result.endChar, 18);
		});

		// Braces argument tests (ported from vscode-waltz)
		test("finds first argument inside braces", () => {
			const provider = createTextProvider(["type s struct{x int, y int}"]);
			// Position 16: between 'x' and ' '
			const result = calculateArgumentSelect(provider, 0, 16);
			assert.ok(result);
			// Should select 'x int'
			assert.strictEqual(result.startChar, 14);
			assert.strictEqual(result.endChar, 19);
		});

		test("finds second argument inside braces", () => {
			const provider = createTextProvider(["type s struct{x int, y int}"]);
			// Position 23: between 'y' and ' '
			const result = calculateArgumentSelect(provider, 0, 23);
			assert.ok(result);
			// Should select 'y int'
			assert.strictEqual(result.startChar, 21);
			assert.strictEqual(result.endChar, 26);
		});

		test("handles braces with spaces", () => {
			const provider = createTextProvider(["{  a  ,  b  }"]);
			// Position 4: at 'a'
			const result = calculateArgumentSelect(provider, 0, 4);
			assert.ok(result);
			// Should select 'a' (spaces excluded)
			assert.strictEqual(result.startChar, 3);
			assert.strictEqual(result.endChar, 4);
		});

		test("expands first brace argument to include comma after (aa)", () => {
			const provider = createTextProvider(["{a, b, c}"]);
			// Already selected 'a' (positions 1-2)
			const result = calculateArgumentSelect(provider, 0, 2, 0, 1, 0, 2);
			assert.ok(result);
			// Should select 'a,'
			assert.strictEqual(result.startChar, 1);
			assert.strictEqual(result.endChar, 3);
		});

		test("expands middle brace argument to include comma before (aa)", () => {
			const provider = createTextProvider(["{a, b, c}"]);
			// Already selected 'b' (positions 4-5)
			const result = calculateArgumentSelect(provider, 0, 5, 0, 4, 0, 5);
			assert.ok(result);
			// Should select ', b'
			assert.strictEqual(result.startChar, 2);
			assert.strictEqual(result.endChar, 5);
		});

		test("handles nested braces and parentheses - prefer inner parentheses", () => {
			const provider = createTextProvider(["{a, func(x, y), c}"]);
			// Position 10: at 'x'
			const result = calculateArgumentSelect(provider, 0, 10);
			assert.ok(result);
			// Should select 'x' (inside the inner parentheses)
			assert.strictEqual(result.startChar, 9);
			assert.strictEqual(result.endChar, 10);
		});

		test("handles nested braces and parentheses - prefer inner braces", () => {
			const provider = createTextProvider(["func(a, {x, y}, c)"]);
			// Position 10: at 'x'
			const result = calculateArgumentSelect(provider, 0, 10);
			assert.ok(result);
			// Should select 'x' (inside the inner braces)
			assert.strictEqual(result.startChar, 9);
			assert.strictEqual(result.endChar, 10);
		});

		test("handles Go struct literal syntax multiline", () => {
			const provider = createTextProvider([
				"type s struct{",
				"    x int,",
				"    y int,",
				"}",
			]);
			// Position (1, 6): at 'x' on line 2
			const result = calculateArgumentSelect(provider, 1, 6);
			assert.ok(result);
			// Should select 'x int'
			assert.strictEqual(result.startLine, 1);
			assert.strictEqual(result.startChar, 4);
			assert.strictEqual(result.endLine, 1);
			assert.strictEqual(result.endChar, 9);
		});

		test("handles single argument inside braces with aa", () => {
			const provider = createTextProvider(["{a}"]);
			// Already selected 'a' (positions 1-2)
			const result = calculateArgumentSelect(provider, 0, 2, 0, 1, 0, 2);
			assert.ok(result);
			// Should select just 'a' (no comma to include)
			assert.strictEqual(result.startChar, 1);
			assert.strictEqual(result.endChar, 2);
		});

		test("handles strings inside braces", () => {
			const provider = createTextProvider(['{"hello, world", b}']);
			// Position 10: inside the string
			const result = calculateArgumentSelect(provider, 0, 10);
			assert.ok(result);
			// Should select the entire string (commas inside strings should be ignored)
			assert.strictEqual(result.startChar, 1);
			assert.strictEqual(result.endChar, 15);
		});

		test("handles character literal with comma", () => {
			const provider = createTextProvider(["func(',', b)"]);
			// Position 6: between ',' and '\''
			const result = calculateArgumentSelect(provider, 0, 6);
			assert.ok(result);
			// Should select the character literal ','
			assert.strictEqual(result.startChar, 5);
			assert.strictEqual(result.endChar, 8);
		});

		// Multiline argument tests (ported from vscode-waltz)
		test("handles multiline first argument with ia in braces", () => {
			const provider = createTextProvider([
				"foo {",
				"    bar,",
				"    baz,",
				"}",
			]);
			// Position (1, 6): at 'bar'
			const result = calculateArgumentSelect(provider, 1, 6);
			assert.ok(result);
			// Should select 'bar' only (not including indentation)
			assert.strictEqual(result.startLine, 1);
			assert.strictEqual(result.startChar, 4);
			assert.strictEqual(result.endLine, 1);
			assert.strictEqual(result.endChar, 7);
		});

		test("handles multiline first argument with aa in braces", () => {
			const provider = createTextProvider([
				"foo {",
				"    bar,",
				"    baz,",
				"}",
			]);
			// Already selected 'bar' (line 1, positions 4-7)
			const result = calculateArgumentSelect(provider, 1, 6, 1, 4, 1, 7);
			assert.ok(result);
			// Should include comma after - '\n    bar,'
			assert.strictEqual(result.startLine, 0);
			assert.strictEqual(result.startChar, 5);
			assert.strictEqual(result.endLine, 1);
			assert.strictEqual(result.endChar, 8);
		});

		test("handles multiline second argument with ia in braces", () => {
			const provider = createTextProvider([
				"foo {",
				"    bar,",
				"    baz,",
				"}",
			]);
			// Position (2, 6): at 'baz'
			const result = calculateArgumentSelect(provider, 2, 6);
			assert.ok(result);
			// Should select 'baz' only
			assert.strictEqual(result.startLine, 2);
			assert.strictEqual(result.startChar, 4);
			assert.strictEqual(result.endLine, 2);
			assert.strictEqual(result.endChar, 7);
		});

		test("handles multiline second argument with aa in braces", () => {
			const provider = createTextProvider([
				"foo {",
				"    bar,",
				"    baz,",
				"}",
			]);
			// Already selected 'baz' (line 2, positions 4-7)
			const result = calculateArgumentSelect(provider, 2, 6, 2, 4, 2, 7);
			assert.ok(result);
			// Should include comma and newline+indentation from previous field
			assert.strictEqual(result.startLine, 1);
			assert.strictEqual(result.startChar, 7);
			assert.strictEqual(result.endLine, 2);
			assert.strictEqual(result.endChar, 7);
		});

		test("handles multiline arguments in parentheses with aa", () => {
			const provider = createTextProvider([
				"func(",
				"    arg1,",
				"    arg2,",
				"    arg3",
				")",
			]);
			// Already selected 'arg2' (line 2, positions 4-8)
			const result = calculateArgumentSelect(provider, 2, 6, 2, 4, 2, 8);
			assert.ok(result);
			// Should include comma from previous line
			assert.strictEqual(result.startLine, 1);
			assert.strictEqual(result.startChar, 8);
			assert.strictEqual(result.endLine, 2);
			assert.strictEqual(result.endChar, 8);
		});

		test("handles multiline last argument with aa - no trailing comma", () => {
			const provider = createTextProvider([
				"func(",
				"    arg1,",
				"    arg2",
				")",
			]);
			// Already selected 'arg2' (line 2, positions 4-8)
			const result = calculateArgumentSelect(provider, 2, 6, 2, 4, 2, 8);
			assert.ok(result);
			// Should include comma from previous line
			assert.strictEqual(result.startLine, 1);
			assert.strictEqual(result.startChar, 8);
			assert.strictEqual(result.endLine, 2);
			assert.strictEqual(result.endChar, 8);
		});

		test("handles Go struct with multiple fields using aa", () => {
			const provider = createTextProvider([
				"type Person struct {",
				"    Name string,",
				"    Age int,",
				"    City string,",
				"}",
			]);
			// Already selected 'Age int' (line 2, positions 4-11)
			const result = calculateArgumentSelect(provider, 2, 6, 2, 4, 2, 11);
			assert.ok(result);
			// Should include comma and newline+indentation from previous field
			assert.strictEqual(result.startLine, 1);
			assert.strictEqual(result.startChar, 15);
			assert.strictEqual(result.endLine, 2);
			assert.strictEqual(result.endChar, 11);
		});

		test("handles compact multiline - first arg with aa", () => {
			const provider = createTextProvider(["{a,", "b}"]);
			// Already selected 'a' (line 0, positions 1-2)
			const result = calculateArgumentSelect(provider, 0, 2, 0, 1, 0, 2);
			assert.ok(result);
			// Should include comma after 'a'
			assert.strictEqual(result.startLine, 0);
			assert.strictEqual(result.startChar, 1);
			assert.strictEqual(result.endLine, 0);
			assert.strictEqual(result.endChar, 3);
		});

		test("handles compact multiline - second arg with aa", () => {
			const provider = createTextProvider(["{a,", "b}"]);
			// Already selected 'b' (line 1, positions 0-1)
			const result = calculateArgumentSelect(provider, 1, 1, 1, 0, 1, 1);
			assert.ok(result);
			// Should include comma and newline before 'b'
			assert.strictEqual(result.startLine, 0);
			assert.strictEqual(result.startChar, 2);
			assert.strictEqual(result.endLine, 1);
			assert.strictEqual(result.endChar, 1);
		});
	});
});
