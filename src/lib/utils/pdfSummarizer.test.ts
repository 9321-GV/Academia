import { describe, expect, it, vi } from 'vitest';
import {
	buildPdfSummaryMessages,
	parsePdfSummaryResponse,
	PDF_SUMMARY_TOKEN_BUDGETS,
	splitPdfText,
	summarizePdfText,
	validatePdfInput,
	type PdfSummaryLength,
	type PdfSummaryMessage
} from './pdfSummarizer';

const summaryResponse = JSON.stringify({
	overview: 'A document about cell structure.',
	sections: [{ title: 'Cell membrane', summary: 'The membrane regulates exchange.' }],
	key_points: ['The membrane is selectively permeable.'],
	important_terms: [{ term: 'Osmosis', explanation: 'Movement of water across a membrane.' }],
	conclusion: 'Membrane structure controls transport.'
});

describe('PDF summarizer helpers', () => {
	it('accepts a PDF with a valid signature', () => {
		expect(() =>
			validatePdfInput(
				{ name: 'biology.pdf', type: 'application/pdf', size: 12 },
				new TextEncoder().encode('%PDF-1.7')
			)
		).not.toThrow();
	});

	it('rejects invalid file types and unreadable or empty PDFs', () => {
		const signature = new TextEncoder().encode('%PDF-1.7');
		expect(() =>
			validatePdfInput({ name: 'notes.docx', type: 'application/pdf', size: 12 }, signature)
		).toThrow('Choose a PDF file.');
		expect(() =>
			validatePdfInput({ name: 'notes.pdf', type: 'text/plain', size: 12 }, signature)
		).toThrow('The selected file is not a PDF.');
		expect(() =>
			validatePdfInput({ name: 'empty.pdf', type: 'application/pdf', size: 0 }, signature)
		).toThrow('The selected PDF is empty.');
		expect(() =>
			validatePdfInput(
				{ name: 'image-only.pdf', type: 'application/pdf', size: 12 },
				new TextEncoder().encode('not a PDF')
			)
		).toThrow('The selected file is not a readable PDF.');
	});

	it('splits long documents into bounded, non-empty chunks', () => {
		const source = `${'A'.repeat(60)}\n\n${'B'.repeat(60)}\n\n${'C'.repeat(60)}`;
		const chunks = splitPdfText(source, 70);

		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks.every((chunk) => chunk.length <= 70)).toBe(true);
		expect(chunks.join(' ')).toContain('A'.repeat(60));
		expect(chunks.join(' ')).toContain('B'.repeat(60));
		expect(chunks.join(' ')).toContain('C'.repeat(60));
		expect(splitPdfText(' \n\t ')).toEqual([]);
	});

	it('validates the structured summary response', () => {
		expect(parsePdfSummaryResponse(summaryResponse)).toEqual({
			overview: 'A document about cell structure.',
			sections: [{ title: 'Cell membrane', summary: 'The membrane regulates exchange.' }],
			key_points: ['The membrane is selectively permeable.'],
			important_terms: [{ term: 'Osmosis', explanation: 'Movement of water across a membrane.' }],
			conclusion: 'Membrane structure controls transport.'
		});
		expect(() =>
			parsePdfSummaryResponse(
				JSON.stringify({ overview: 'Missing required sections', conclusion: 'Incomplete' })
			)
		).toThrow('incomplete structured summary');
	});

	it('builds distinct verbosity instructions for every stage and selected length', () => {
		const source = 'Cells exchange material across their selectively permeable membrane.';
		const lengths: PdfSummaryLength[] = ['short', 'medium', 'detailed'];
		const finalInstructions = lengths.map(
			(length) => buildPdfSummaryMessages('final', source, length)[0].content
		);

		expect(finalInstructions[0]).toContain('100-130 words total');
		expect(finalInstructions[0]).toContain('20-30% of a medium summary');
		expect(finalInstructions[0]).toContain('3-5 brief key points');
		expect(finalInstructions[1]).toContain('400-500 words total');
		expect(finalInstructions[1]).toContain('2-4 sentences each');
		expect(finalInstructions[2]).toContain('700-900 words total');
		expect(finalInstructions[2]).toContain('1.5-2 times a medium summary');
		expect(finalInstructions[2]).toContain('source examples');
		expect(new Set(finalInstructions).size).toBe(3);

		for (const stage of ['chunk', 'reduction'] as const) {
			const instructions = lengths.map(
				(length) => buildPdfSummaryMessages(stage, source, length)[0].content
			);
			expect(new Set(instructions).size).toBe(3);
			expect(instructions[0]).toContain('40-70 words');
			expect(instructions[1]).toContain('balanced');
			expect(instructions[2]).toMatch(/preserv/i);
		}
	});

	it('uses mode-specific budgets and prompts through the full single-chunk flow', async () => {
		const source = 'The cell membrane controls transport and helps maintain homeostasis.';
		const lengths: PdfSummaryLength[] = ['short', 'medium', 'detailed'];

		for (const length of lengths) {
			const calls: { messages: PdfSummaryMessage[]; maxTokens: number }[] = [];
			const complete = async (messages: PdfSummaryMessage[], maxTokens: number) => {
				calls.push({ messages, maxTokens });
				return messages[0].content.includes('Return only valid JSON')
					? summaryResponse
					: 'Membrane transport supports homeostasis.';
			};

			await summarizePdfText(source, length, complete);

			expect(calls).toHaveLength(2);
			expect(calls[0].messages[0].content).toBe(
				buildPdfSummaryMessages('chunk', source, length)[0].content
			);
			expect(calls[0].maxTokens).toBe(PDF_SUMMARY_TOKEN_BUDGETS[length].chunk);
			expect(calls[1].messages[0].content).toBe(
				buildPdfSummaryMessages('final', '', length)[0].content
			);
			expect(calls[1].maxTokens).toBe(PDF_SUMMARY_TOKEN_BUDGETS[length].final);
		}

		expect(PDF_SUMMARY_TOKEN_BUDGETS.short.final).toBeLessThan(
			PDF_SUMMARY_TOKEN_BUDGETS.medium.final
		);
		expect(PDF_SUMMARY_TOKEN_BUDGETS.detailed.final).toBeGreaterThan(
			PDF_SUMMARY_TOKEN_BUDGETS.medium.final
		);
	});

	it('preserves the selected length instructions and budget during long-document reduction', async () => {
		const lengths: PdfSummaryLength[] = ['short', 'medium', 'detailed'];

		for (const length of lengths) {
			const calls: { messages: PdfSummaryMessage[]; maxTokens: number }[] = [];
			const complete = async (messages: PdfSummaryMessage[], maxTokens: number) => {
				calls.push({ messages, maxTokens });
				const system = messages[0].content;
				if (system.includes('Return only valid JSON')) return summaryResponse;
				if (system.includes('These notes represent only part')) {
					return `Chunk notes: ${'important detail '.repeat(50)}`;
				}
				return `Reduced notes: ${'preserved fact '.repeat(50)}`;
			};

			await summarizePdfText('PDF text. '.repeat(20000), length, complete);
			const reductions = calls.filter((call) =>
				call.messages[0].content.includes('The notes may overlap')
			);

			expect(reductions.length).toBeGreaterThan(0);
			for (const reduction of reductions) {
				expect(reduction.messages[0].content).toBe(
					buildPdfSummaryMessages('reduction', '', length)[0].content
				);
				expect(reduction.maxTokens).toBe(PDF_SUMMARY_TOKEN_BUDGETS[length].reduction);
				if (length === 'detailed') {
					expect(reduction.messages[0].content).toContain(
						'do not collapse related but distinct ideas'
					);
				}
				if (length === 'short') {
					expect(reduction.messages[0].content).toContain('Condense these notes aggressively');
				}
			}
		}
	});

	it('surfaces model/API failures and rejects documents without readable text', async () => {
		const failure = new Error('Model service unavailable');
		const complete = vi
			.fn(async (_messages: PdfSummaryMessage[], _maxTokens: number): Promise<string> => '')
			.mockRejectedValue(failure);

		await expect(summarizePdfText('Readable PDF text.', 'short', complete)).rejects.toBe(failure);
		await expect(summarizePdfText(' \n ', 'short', complete)).rejects.toThrow(
			'No readable text was extracted'
		);
		expect(complete).toHaveBeenCalledTimes(1);
	});
});
