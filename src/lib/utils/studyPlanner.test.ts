import { describe, expect, it, vi } from 'vitest';
import {
	addPlannerSubject,
	buildStudyPlannerMessages,
	createPlannerSubject,
	generateStudyPlan,
	MAX_STUDY_PLAN_DAYS,
	parseStudyPlanResponse,
	removePlannerSubject,
	STUDY_PLAN_MAX_TOKENS,
	validateStudyPlannerInput,
	type StudyPlannerInput
} from './studyPlanner';

const plannerInput = (): StudyPlannerInput => ({
	subjects: [
		{
			name: 'Biology',
			examDate: '2026-01-09',
			preparationLevel: 'beginner',
			topics: 'Cell structure, membranes'
		}
	],
	dailyHours: 3,
	startTime: '17:00',
	studyDays: [1, 2, 3, 4, 5],
	breakMinutes: 10,
	startDate: '2026-01-05',
	endDate: '2026-01-10',
	intensity: 'balanced'
});

const validPlan = JSON.stringify({
	strategy: 'Start with core concepts and revisit them with spaced practice.',
	days: ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'].map(
		(date, index) => ({
			date,
			sessions:
				index === 0
					? [
							{
								subject: 'Biology',
								topic: 'Review cell structure',
								duration_minutes: 60,
								type: 'study'
							},
							{ subject: 'Break', topic: 'Rest', duration_minutes: 10, type: 'break' },
							{
								subject: 'Biology',
								topic: 'Recall membrane functions',
								duration_minutes: 40,
								type: 'practice'
							}
						]
					: []
		})
	)
});

describe('study planner helpers', () => {
	it('accepts a valid subject and study availability form', () => {
		expect(() => validateStudyPlannerInput(plannerInput())).not.toThrow();
	});

	it('rejects missing or invalid exam dates and dates outside the plan period', () => {
		const input = plannerInput();
		input.subjects[0].examDate = '';
		expect(() => validateStudyPlannerInput(input)).toThrow(
			'Enter a valid exam date for each subject.'
		);

		input.subjects[0].examDate = '2026-02-30';
		expect(() => validateStudyPlannerInput(input)).toThrow(
			'Enter a valid exam date for each subject.'
		);

		input.subjects[0].examDate = '2026-01-11';
		expect(() => validateStudyPlannerInput(input)).toThrow(
			'Each exam date must be within the planning period.'
		);
	});

	it('validates daily hours, selected study days, and bounded planning range', () => {
		const input = plannerInput();
		input.dailyHours = 0;
		expect(() => validateStudyPlannerInput(input)).toThrow(
			'Daily study availability must be between 0.5 and 12 hours.'
		);

		input.dailyHours = 13;
		expect(() => validateStudyPlannerInput(input)).toThrow(
			'Daily study availability must be between 0.5 and 12 hours.'
		);

		input.dailyHours = 3;
		input.studyDays = [];
		expect(() => validateStudyPlannerInput(input)).toThrow('Select at least one valid study day.');

		input.studyDays = [1, 2, 3, 4, 5];
		input.endDate = '2026-03-06';
		input.subjects[0].examDate = input.endDate;
		expect(MAX_STUDY_PLAN_DAYS).toBe(60);
		expect(() => validateStudyPlannerInput(input)).toThrow(
			'The planning period exceeds the supported 60-day limit.'
		);

		input.endDate = '2026-01-10';
		input.subjects = Array.from({ length: 4 }, (_, index) => ({
			name: `Subject ${index + 1}`,
			examDate: '2026-01-09',
			preparationLevel: 'beginner' as const,
			topics: 'x'.repeat(1600)
		}));
		expect(() => validateStudyPlannerInput(input)).toThrow(
			'Combined subject topics must be 6,000 characters or fewer.'
		);
	});

	it('adds and removes subjects without mutating the original list', () => {
		const first = createPlannerSubject('2026-01-09');
		first.name = 'Biology';
		const added = addPlannerSubject([first], '2026-01-10');
		expect(added).toHaveLength(2);
		expect(first.name).toBe('Biology');
		expect(removePlannerSubject(added, 0)).toEqual([added[1]]);
		expect(added).toHaveLength(2);
	});

	it('builds a clear structured prompt with all student preferences', () => {
		const messages = buildStudyPlannerMessages(plannerInput());
		const preferences = JSON.parse(messages[1].content);

		expect(messages[0].content).toContain('Return only valid JSON');
		expect(messages[0].content).toContain('Never schedule a subject after its exam date');
		expect(messages[0].content).toContain('daily available study hours');
		expect(preferences.subjects[0]).toEqual({
			name: 'Biology',
			exam_date: '2026-01-09',
			preparation_level: 'beginner',
			topics: 'Cell structure, membranes'
		});
		expect(preferences.study_weekdays).toEqual([1, 2, 3, 4, 5]);
		expect(preferences.daily_available_hours).toBe(3);
	});

	it('parses a structured plan and rejects schedules that exceed daily availability', () => {
		const parsed = parseStudyPlanResponse(validPlan, plannerInput());
		expect(parsed.days).toHaveLength(5);
		expect(parsed.days[0].sessions).toHaveLength(3);
		expect(parsed.days[1].sessions).toEqual([]);
		const withinStudyHours = JSON.parse(validPlan);
		withinStudyHours.days[0].sessions[2].duration_minutes = 120;
		expect(() =>
			parseStudyPlanResponse(JSON.stringify(withinStudyHours), plannerInput())
		).not.toThrow();

		const overloaded = JSON.parse(validPlan);
		overloaded.days[0].sessions[2].duration_minutes = 121;
		expect(() => parseStudyPlanResponse(JSON.stringify(overloaded), plannerInput())).toThrow(
			'The study plan exceeds your daily available hours.'
		);

		const tooManySessions = JSON.parse(validPlan);
		tooManySessions.days[0].sessions.push({
			subject: 'Biology',
			topic: 'Additional block',
			duration_minutes: 20,
			type: 'revision'
		});
		expect(() => parseStudyPlanResponse(JSON.stringify(tooManySessions), plannerInput())).toThrow(
			'The model returned a day with an invalid date or too many sessions.'
		);
	});

	it('rejects a session after its subject exam date and dates outside selected study days', () => {
		const input = plannerInput();
		input.studyDays = [1, 2, 3, 4, 5, 6];
		const afterExam = JSON.parse(validPlan);
		afterExam.days[0].date = '2026-01-10';
		expect(() => parseStudyPlanResponse(JSON.stringify(afterExam), input)).toThrow(
			'The study plan schedules a subject after its exam date.'
		);

		const wrongWeekday = JSON.parse(validPlan);
		wrongWeekday.days[0].date = '2026-01-10';
		input.subjects[0].examDate = '2026-01-10';
		input.studyDays = [1, 2, 3, 4, 5];
		expect(() => parseStudyPlanResponse(JSON.stringify(wrongWeekday), input)).toThrow(
			'The study plan includes a date outside your selected planning days.'
		);
	});

	it('rejects plans that omit selected study days before the last exam', () => {
		const incomplete = JSON.parse(validPlan);
		incomplete.days.pop();
		expect(() => parseStudyPlanResponse(JSON.stringify(incomplete), plannerInput())).toThrow(
			'The study plan does not include exactly the available study days.'
		);
	});

	it('rejects invalid structured output, empty responses, and model failures', async () => {
		expect(() => parseStudyPlanResponse('not JSON', plannerInput())).toThrow(
			'The model response was not valid JSON.'
		);
		expect(() => parseStudyPlanResponse('', plannerInput())).toThrow(
			'The model returned an empty study plan.'
		);

		const failure = new Error('Model service unavailable');
		const complete = vi.fn(async () => {
			throw failure;
		});
		await expect(generateStudyPlan(plannerInput(), complete)).rejects.toBe(failure);
		expect(complete).toHaveBeenCalledWith(
			buildStudyPlannerMessages(plannerInput()),
			STUDY_PLAN_MAX_TOKENS
		);
	});

	it('does not accept break sessions when breaks are disabled or overlong', () => {
		const input = plannerInput();
		input.breakMinutes = 0;
		expect(() => parseStudyPlanResponse(validPlan, input)).toThrow(
			'The study plan includes a break longer than the requested duration.'
		);
	});
});
