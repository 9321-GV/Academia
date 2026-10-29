import { describe, expect, it } from 'vitest';
import {
	buildStudyPracticeRequest,
	calculateMcqQuizScore,
	createMcqQuizState,
	extractStudySources,
	parseStudyPracticeResponse,
	resetMcqQuizState,
	submitMcqQuiz,
	type MultipleChoiceQuestion
} from './studyPractice';

describe('study practice helpers', () => {
	it('normalizes nested retrieval results and keeps source metadata', () => {
		const sources = extractStudySources({
			documents: [['Linux permissions control access.', 'Linux permissions control access.', '']],
			metadatas: [[{ name: 'Linux notes.pdf', page: 0 }, {}, {}]]
		});

		expect(sources).toEqual([
			{ content: 'Linux permissions control access.', name: 'Linux notes.pdf', page: '1' }
		]);
	});

	it('states the complete MCQ JSON contract and source-index rules in the prompt', () => {
		const request = buildStudyPracticeRequest('mcq', 'file permissions', 2, [
			{
				content: 'Read, write, and execute bits define access.',
				name: 'Linux notes.pdf',
				page: '4'
			}
		]);

		const prompt = request.messages[0].content;
		expect(request.messages[1].content).toContain('file permissions');
		expect(request.messages[1].content).toContain('Read, write, and execute bits');
		expect(prompt).toContain('Return only valid JSON');
		expect(prompt).toContain('question (non-empty string)');
		expect(prompt).toContain('options (array of exactly four non-empty distinct strings)');
		expect(prompt).toContain('correct_option (integer from 0 to 3, zero-based)');
		expect(prompt).toContain('explanation (non-empty string)');
		expect(prompt).toContain('source_indices (non-empty array of integers)');
		expect(prompt).toContain('"correct_option":0');
		expect(prompt).toContain('"source_indices":[1]');
		expect(prompt).toContain('Never invent, renumber, or fabricate source indices');
		expect(request.params).toEqual({ temperature: 0.25, max_tokens: 2600 });
		expect(request).not.toHaveProperty('response_format');
	});

	it('states the Viva JSON contract and source-index rules in the prompt', () => {
		const request = buildStudyPracticeRequest('viva', 'file permissions', 2, [
			{ content: 'Read bits allow reading.', name: 'Linux notes.pdf' }
		]);
		const prompt = request.messages[0].content;

		expect(prompt).toContain('question (non-empty string)');
		expect(prompt).toContain('answer (non-empty string)');
		expect(prompt).toContain('source_indices (non-empty array of integers)');
		expect(prompt).toContain('Never invent, renumber, or fabricate source indices');
	});

	it('accepts only complete MCQs with four options and valid source references', () => {
		const response = parseStudyPracticeResponse(
			JSON.stringify({
				insufficient_material: false,
				items: [
					{
						question: 'Which permission allows reading a file?',
						options: ['Read', 'Write', 'Execute', 'Delete'],
						correct_option: 0,
						explanation: 'The read bit permits reading file contents.',
						source_indices: [1]
					}
				]
			}),
			'mcq',
			1,
			1
		);

		expect(response.insufficient).toBe(false);
		if (!response.insufficient && response.practice.mode === 'mcq') {
			expect(response.practice.items[0].options).toHaveLength(4);
			expect(response.practice.items[0].correct_option).toBe(0);
		}
	});

	it('returns an explicit insufficient-material result without fabricating questions', () => {
		expect(
			parseStudyPracticeResponse('{"insufficient_material":true,"items":[]}', 'viva', 3, 2)
		).toEqual({ insufficient: true });
	});

	it('parses viva questions with model answers and source references', () => {
		const response = parseStudyPracticeResponse(
			JSON.stringify({
				insufficient_material: false,
				items: [
					{
						question: 'What does chmod change?',
						answer: 'It changes file permission bits.',
						source_indices: [1]
					}
				]
			}),
			'viva',
			1,
			1
		);

		expect(response.insufficient).toBe(false);
		if (!response.insufficient && response.practice.mode === 'viva') {
			expect(response.practice.items[0].answer).toContain('permission bits');
		}
	});

	it('rejects malformed MCQs instead of presenting unsupported questions', () => {
		expect(() =>
			parseStudyPracticeResponse(
				JSON.stringify({
					insufficient_material: false,
					items: [
						{
							question: 'Question',
							options: ['A', 'B'],
							correct_option: 0,
							explanation: 'Explanation',
							source_indices: [1]
						}
					]
				}),
				'mcq',
				1,
				1
			)
		).toThrow('incomplete multiple-choice question');
	});

	it('returns a useful error when the model response is invalid JSON', () => {
		expect(() =>
			parseStudyPracticeResponse('{"insufficient_material":false,', 'mcq', 1, 1)
		).toThrow('The model response was not valid JSON. Please try generating again.');
	});

	describe('MCQ quiz state', () => {
		const questions: MultipleChoiceQuestion[] = [
			{
				question: 'Q1',
				options: ['A', 'B', 'C', 'D'],
				correct_option: 1,
				explanation: 'Q1 explanation',
				source_indices: [1]
			},
			{
				question: 'Q2',
				options: ['A', 'B', 'C', 'D'],
				correct_option: 2,
				explanation: 'Q2 explanation',
				source_indices: [1]
			},
			{
				question: 'Q3',
				options: ['A', 'B', 'C', 'D'],
				correct_option: 3,
				explanation: 'Q3 explanation',
				source_indices: [1]
			}
		];

		it('scores correct, incorrect, and unanswered questions against the displayed total', () => {
			expect(calculateMcqQuizScore(questions, { 0: 1, 1: 0 })).toEqual({
				correct: 1,
				total: 3,
				percentage: 33,
				unanswered: 1
			});
		});

		it('returns a safe zero score for an empty question set', () => {
			expect(calculateMcqQuizScore([], {})).toEqual({
				correct: 0,
				total: 0,
				percentage: 0,
				unanswered: 0
			});
		});

		it('does not count a repeated submission twice', () => {
			const submitted = submitMcqQuiz(questions, {
				selectedAnswers: { 0: 1, 1: 2, 2: 3 },
				submitted: false,
				score: null
			});

			expect(submitMcqQuiz(questions, submitted)).toBe(submitted);
			expect(submitted.score).toEqual({ correct: 3, total: 3, percentage: 100, unanswered: 0 });
		});

		it('resets answer, submission, and score state for a retake', () => {
			const submitted = submitMcqQuiz(questions, {
				selectedAnswers: { 0: 1 },
				submitted: false,
				score: null
			});

			expect(resetMcqQuizState()).toEqual(createMcqQuizState());
			expect(submitted.submitted).toBe(true);
			expect(submitted.score).not.toBeNull();
			expect(questions).toHaveLength(3);
		});
	});
});
