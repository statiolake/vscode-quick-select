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
