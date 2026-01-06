// Core selection logic - pure functions for testing
// Original author: David Bankier @dbankier (https://github.com/dbankier)
// MIT License

/**
 * Find all occurrences of a character in a line of text.
 * Returns an array of 1-based positions where the character appears.
 */
export function findOccurancesInText(text: string, char: string): number[] {
	const matches = `${text}hack`.split(char).reduce<number[]>((acc, p) => {
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

export interface SelectionRange {
	startLine: number;
	startChar: number;
	endLine: number;
	endChar: number;
}

export interface TextProvider {
	lineCount: number;
	getLineText(line: number): string;
}

/**
 * Find the next occurrence of a character, handling nesting.
 */
export function findNextInText(
	textProvider: TextProvider,
	line: number,
	char: string,
	startIndex = 0,
	nestChar?: string,
	nested = 0,
): { line: number; character: number } | undefined {
	if (line === textProvider.lineCount) {
		return undefined;
	}
	const lineText = textProvider.getLineText(line);
	const occurances = findOccurancesInText(lineText, char).filter(
		(n) => n >= startIndex,
	);
	const nests = nestChar
		? findOccurancesInText(lineText, nestChar).filter((n) => n >= startIndex)
		: [];
	let occuranceIndex = 0;
	let nestsIndex = 0;
	let currentNested = nested;

	while (
		(occuranceIndex < occurances.length || nestsIndex < nests.length) &&
		currentNested >= 0
	) {
		if (
			occurances[occuranceIndex] < nests[nestsIndex] ||
			nests[nestsIndex] === undefined
		) {
			if (currentNested === 0) {
				return { line, character: occurances[occuranceIndex] };
			}
			currentNested--;
			occuranceIndex++;
		} else if (
			nests[nestsIndex] < occurances[occuranceIndex] ||
			occurances[occuranceIndex] === undefined
		) {
			currentNested++;
			nestsIndex++;
		}
	}
	return findNextInText(
		textProvider,
		line + 1,
		char,
		0,
		nestChar,
		currentNested,
	);
}

/**
 * Find the previous occurrence of a character, handling nesting.
 */
export function findPreviousInText(
	textProvider: TextProvider,
	line: number,
	char: string,
	startIndex?: number,
	nestChar?: string,
	nested = 0,
): { line: number; character: number } | undefined {
	if (line === -1) {
		return undefined;
	}
	const lineText = textProvider.getLineText(line);
	const actualStartIndex = startIndex ?? lineText.length;
	const occurances = findOccurancesInText(lineText, char).filter(
		(n) => n <= actualStartIndex,
	);
	const nests = nestChar
		? findOccurancesInText(lineText, nestChar).filter(
				(n) => n <= actualStartIndex,
			)
		: [];
	let occuranceIndex = occurances.length - 1;
	let nestsIndex = nests.length - 1;
	let currentNested = nested;

	while ((occuranceIndex > -1 || nestsIndex > -1) && currentNested >= 0) {
		if (
			occurances[occuranceIndex] > nests[nestsIndex] ||
			nests[nestsIndex] === undefined
		) {
			if (currentNested === 0) {
				return { line, character: occurances[occuranceIndex] };
			}
			currentNested--;
			occuranceIndex--;
		} else if (
			nests[nestsIndex] > occurances[occuranceIndex] ||
			occurances[occuranceIndex] === undefined
		) {
			currentNested++;
			nestsIndex--;
		}
	}
	return findPreviousInText(
		textProvider,
		line - 1,
		char,
		undefined,
		nestChar,
		currentNested,
	);
}

/**
 * Calculate selection range for single-character delimiters (quotes, backticks).
 */
export function calculateSingleSelect(
	textProvider: TextProvider,
	cursorLine: number,
	cursorChar: number,
	anchorLine: number,
	anchorChar: number,
	endLine: number,
	endChar: number,
	char: string,
	outer?: boolean,
	multiline?: boolean,
): SelectionRange | null {
	const lineText = textProvider.getLineText(cursorLine);
	const matches = findOccurancesInText(lineText, char);
	const next = matches.find((a) => a > cursorChar);
	let nextIndex = next !== undefined ? matches.indexOf(next) : -1;
	let offset = outer ? char.length : 0;

	if (matches.length > 1 && matches.length % 2 === 0) {
		if (nextIndex === -1) {
			return null;
		}
		if (nextIndex % 2 !== 0) {
			nextIndex--;
		}
		// Check if already selected inner content - expand to outer
		if (
			!outer &&
			cursorLine === anchorLine &&
			matches[nextIndex] === anchorChar &&
			matches[nextIndex + 1] - 1 === endChar
		) {
			offset = char.length;
		}
		return {
			startLine: cursorLine,
			startChar: matches[nextIndex] - offset,
			endLine: cursorLine,
			endChar: matches[nextIndex + 1] - 1 + offset,
		};
	}

	if (multiline) {
		const startPos =
			findPreviousInText(textProvider, cursorLine, char, cursorChar) ??
			(nextIndex >= 0
				? { line: cursorLine, character: matches[nextIndex] }
				: undefined);
		if (!startPos) {
			return null;
		}
		const endPos = findNextInText(
			textProvider,
			startPos.line,
			char,
			startPos.character + 1,
		);
		if (!endPos) {
			return null;
		}
		// Check if already selected inner content - expand to outer
		if (
			!outer &&
			startPos.line === anchorLine &&
			startPos.character === anchorChar &&
			endPos.line === endLine &&
			endPos.character - 1 === endChar
		) {
			offset = char.length;
		}
		return {
			startLine: startPos.line,
			startChar: startPos.character - offset,
			endLine: endPos.line,
			endChar: endPos.character - 1 + offset,
		};
	}

	return null;
}

/**
 * Calculate selection range for matching bracket pairs.
 */
export function calculateMatchingSelect(
	textProvider: TextProvider,
	cursorLine: number,
	cursorChar: number,
	anchorLine: number,
	anchorChar: number,
	endLine: number,
	endChar: number,
	startChar: string,
	endCharDelim: string,
	outer?: boolean,
): SelectionRange | null {
	const lineText = textProvider.getLineText(cursorLine);
	const starts = findOccurancesInText(lineText, startChar);
	const start = starts.find((a) => a > cursorChar);
	const startIndex = start !== undefined ? starts.indexOf(start) : -1;

	const startPos =
		findPreviousInText(
			textProvider,
			cursorLine,
			startChar,
			cursorChar,
			endCharDelim,
		) ??
		(startIndex >= 0
			? { line: cursorLine, character: starts[startIndex] }
			: undefined);

	if (!startPos) {
		return null;
	}

	const endPos = findNextInText(
		textProvider,
		startPos.line,
		endCharDelim,
		startPos.character + 1,
		startChar,
	);

	if (!endPos) {
		return null;
	}

	let startOffset = outer ? startChar.length : 0;
	let endOffset = outer ? endCharDelim.length : 0;

	// Check if already selected inner content - expand to outer
	if (
		!outer &&
		startPos.line === anchorLine &&
		startPos.character === anchorChar &&
		endPos.line === endLine &&
		endPos.character - 1 === endChar
	) {
		startOffset = startChar.length;
		endOffset = endCharDelim.length;
	}

	return {
		startLine: startPos.line,
		startChar: startPos.character - startOffset,
		endLine: endPos.line,
		endChar: endPos.character - 1 + endOffset,
	};
}

/**
 * Find the enclosing bracket pair for a given cursor position.
 * Returns the opening and closing bracket positions.
 */
function findEnclosingBrackets(
	textProvider: TextProvider,
	cursorLine: number,
	cursorChar: number,
): {
	openLine: number;
	openChar: number;
	closeLine: number;
	closeChar: number;
} | null {
	const bracketPairs: [string, string][] = [
		["(", ")"],
		["[", "]"],
		["{", "}"],
	];

	// Try each bracket type and find the innermost enclosing pair
	let bestResult: {
		openLine: number;
		openChar: number;
		closeLine: number;
		closeChar: number;
	} | null = null;

	for (const [open, close] of bracketPairs) {
		const openPos = findPreviousInText(
			textProvider,
			cursorLine,
			open,
			cursorChar,
			close,
		);
		if (!openPos) continue;

		const closePos = findNextInText(
			textProvider,
			openPos.line,
			close,
			openPos.character + 1,
			open,
		);
		if (!closePos) continue;

		// Check if cursor is within this bracket pair
		const cursorIsAfterOpen =
			cursorLine > openPos.line ||
			(cursorLine === openPos.line && cursorChar >= openPos.character);
		const cursorIsBeforeClose =
			cursorLine < closePos.line ||
			(cursorLine === closePos.line && cursorChar <= closePos.character);

		if (cursorIsAfterOpen && cursorIsBeforeClose) {
			// Check if this is more inner than previous best
			if (
				!bestResult ||
				openPos.line > bestResult.openLine ||
				(openPos.line === bestResult.openLine &&
					openPos.character > bestResult.openChar)
			) {
				bestResult = {
					openLine: openPos.line,
					openChar: openPos.character,
					closeLine: closePos.line,
					closeChar: closePos.character,
				};
			}
		}
	}

	return bestResult;
}

/**
 * Parse text and find argument boundaries, respecting strings and nested brackets.
 * Returns 0-based indices of commas that are at the top level (not inside strings or nested brackets).
 * @param startChar - 1-based position of opening bracket
 * @param endChar - 1-based position of closing bracket
 */
function findArgumentBoundaries(
	textProvider: TextProvider,
	startLine: number,
	startChar: number,
	endLine: number,
	endChar: number,
): { line: number; idx: number }[] {
	const commas: { line: number; idx: number }[] = [];

	let inString: string | null = null; // '"', "'", or '`'
	let escaped = false;
	let bracketDepth = 0;

	for (let line = startLine; line <= endLine; line++) {
		const lineText = textProvider.getLineText(line);
		// Convert 1-based positions to 0-based indices for iteration
		const lineStartIdx = line === startLine ? startChar : 0; // startChar is 1-based pos of '(', so it's 0-based idx of char after '('
		const lineEndIdx = line === endLine ? endChar - 1 : lineText.length; // endChar is 1-based pos of ')', so endChar-1 is 0-based idx of ')'

		for (let i = lineStartIdx; i < lineEndIdx; i++) {
			const ch = lineText[i];

			if (escaped) {
				escaped = false;
				continue;
			}

			if (ch === "\\") {
				escaped = true;
				continue;
			}

			if (inString) {
				if (ch === inString) {
					inString = null;
				}
				continue;
			}

			if (ch === '"' || ch === "'" || ch === "`") {
				inString = ch;
				continue;
			}

			if (ch === "(" || ch === "[" || ch === "{") {
				bracketDepth++;
				continue;
			}

			if (ch === ")" || ch === "]" || ch === "}") {
				bracketDepth--;
				continue;
			}

			if (ch === "," && bracketDepth === 0) {
				commas.push({ line, idx: i }); // Store 0-based index
			}
		}
	}

	return commas;
}

/**
 * Calculate selection range for the current argument at cursor position.
 * Handles strings with commas, nested brackets, and escaped characters.
 */
export function calculateArgumentSelect(
	textProvider: TextProvider,
	cursorLine: number,
	cursorChar: number,
): SelectionRange | null {
	// Find enclosing brackets
	const brackets = findEnclosingBrackets(textProvider, cursorLine, cursorChar);
	if (!brackets) {
		return null;
	}

	// Find all commas at top level within the brackets (returns 0-based indices)
	const commas = findArgumentBoundaries(
		textProvider,
		brackets.openLine,
		brackets.openChar,
		brackets.closeLine,
		brackets.closeChar,
	);

	// Determine argument boundaries based on cursor position
	// Arguments are separated by commas, with bracket boundaries at the ends
	// All indices are now 0-based

	// Create boundary list: [opening bracket idx, comma1 idx, comma2 idx, ..., closing bracket idx]
	// brackets.openChar is 1-based, so openChar-1 is 0-based index of '('
	// brackets.closeChar is 1-based, so closeChar-1 is 0-based index of ')'
	const boundaries: { line: number; idx: number }[] = [
		{ line: brackets.openLine, idx: brackets.openChar - 1 }, // 0-based index of '('
		...commas,
		{ line: brackets.closeLine, idx: brackets.closeChar - 1 }, // 0-based index of ')'
	];

	// Find which argument the cursor is in
	let argStartBoundary: { line: number; idx: number } | null = null;
	let argEndBoundary: { line: number; idx: number } | null = null;

	for (let i = 0; i < boundaries.length - 1; i++) {
		const start = boundaries[i];
		const end = boundaries[i + 1];

		// Check if cursor is between these boundaries (all 0-based)
		const cursorAfterStart =
			cursorLine > start.line ||
			(cursorLine === start.line && cursorChar > start.idx);
		const cursorBeforeEnd =
			cursorLine < end.line ||
			(cursorLine === end.line && cursorChar <= end.idx);

		if (cursorAfterStart && cursorBeforeEnd) {
			argStartBoundary = start;
			argEndBoundary = end;
			break;
		}
	}

	if (!argStartBoundary || !argEndBoundary) {
		return null;
	}

	// Calculate the actual argument text range (excluding delimiters and trimming whitespace)
	// All indices are 0-based
	let startLine = argStartBoundary.line;
	let startIdx = argStartBoundary.idx + 1; // First character after the delimiter
	let endLine = argEndBoundary.line;
	let endIdx = argEndBoundary.idx - 1; // Last character before the delimiter

	// Trim leading whitespace
	while (startLine <= endLine) {
		const lineText = textProvider.getLineText(startLine);
		const lineEndIdx = startLine === endLine ? endIdx : lineText.length - 1;

		let foundNonWhitespace = false;
		for (let i = startIdx; i <= lineEndIdx; i++) {
			if (lineText[i] !== " " && lineText[i] !== "\t") {
				startIdx = i;
				foundNonWhitespace = true;
				break;
			}
		}

		if (foundNonWhitespace) {
			break;
		}

		startLine++;
		startIdx = 0;
	}

	// Trim trailing whitespace
	while (endLine >= startLine) {
		const lineText = textProvider.getLineText(endLine);
		const lineStartIdx = endLine === startLine ? startIdx : 0;

		let foundNonWhitespace = false;
		for (let i = endIdx; i >= lineStartIdx; i--) {
			if (lineText[i] !== " " && lineText[i] !== "\t") {
				endIdx = i;
				foundNonWhitespace = true;
				break;
			}
		}

		if (foundNonWhitespace) {
			break;
		}

		endLine--;
		if (endLine >= 0) {
			endIdx = textProvider.getLineText(endLine).length - 1;
		}
	}

	// Check for empty argument
	if (startLine > endLine || (startLine === endLine && startIdx > endIdx)) {
		return null;
	}

	// Return 0-based indices for VS Code Selection compatibility
	// startChar: 0-based index of first char (inclusive)
	// endChar: 0-based index after last char (exclusive)
	return {
		startLine,
		startChar: startIdx,
		endLine,
		endChar: endIdx + 1,
	};
}
