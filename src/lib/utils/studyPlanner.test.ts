import { describe, expect, it, vi } from 'vitest';
import {
	addPlannerSubject,
	buildStudyPlannerMessages,
	createPlannerSubject,
	getStudyWeekday,
	generateStudyPlan,
	MAX_STUDY_PLAN_DAYS,
	parseStudyPlanResponse,
	removePlannerSubject,
	STUDY_WEEKDAY_NAMES,
	STUDY_PLAN_MAX_TOKENS,
	StudyPlanCorrectionError,
	UnselectedStudyWeekdayError,
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

const novemberInput = (): StudyPlannerInput => ({
	...plannerInput(),
	startDate: '2026-11-05',
	endDate: '2026-11-19',
	subjects: [{ ...plannerInput().subjects[0], examDate: '2026-11-19' }],
	studyDays: [1, 2, 3, 4, 5]
});

const novemberWeekdayPlan = () =>
	JSON.stringify({
		strategy: 'Focused weekday study blocks.',
		days: Array.from({ length: 15 }, (_, index) => {
			const date = new Date(Date.UTC(2026, 10, 5 + index)).toISOString().slice(0, 10);
			const weekday = getStudyWeekday(date);
			return {
				date,
				sessions:
					weekday === 5
						? [
								{
									subject: 'Biology',
									topic: 'Review cell structure',
									duration_minutes: 90,
									type: 'study'
								}
							]
						: []
			};
		})
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
		expect(messages[0].content).toContain('Never place sessions on unselected weekdays');
		expect(messages[0].content).toContain('Use supplied ISO dates as calendar dates');
		expect(messages[0].content).toContain('one or two focused study/revision/practice sessions');
		expect(messages[0].content).toContain('daily availability');
		expect(messages[0].content).toContain('"duration_minutes":50');
		expect(messages[0].content).toContain('duration_minutes is a JSON number');
		expect(messages[0].content).toContain('Do not add a per-session startTime');
		expect(preferences.subjects[0]).toEqual({
			name: 'Biology',
			exam_date: '2026-01-09',
			preparation_level: 'beginner',
			topics: 'Cell structure, membranes'
		});
		expect(preferences.study_weekdays).toEqual([1, 2, 3, 4, 5]);
		expect(preferences.study_weekday_names).toEqual([
			'Monday',
			'Tuesday',
			'Wednesday',
			'Thursday',
			'Friday'
		]);
		expect(preferences.required_study_dates).toEqual([
			'2026-01-05',
			'2026-01-06',
			'2026-01-07',
			'2026-01-08',
			'2026-01-09'
		]);
		expect(preferences.daily_available_hours).toBe(3);
	});

	it('maps Sunday through Saturday to JavaScript weekday indices', () => {
		const dates = [
			'2026-11-08',
			'2026-11-09',
			'2026-11-10',
			'2026-11-11',
			'2026-11-12',
			'2026-11-13',
			'2026-11-14'
		];
		expect(dates.map(getStudyWeekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
		expect(STUDY_WEEKDAY_NAMES).toEqual([
			'Sunday',
			'Monday',
			'Tuesday',
			'Wednesday',
			'Thursday',
			'Friday',
			'Saturday'
		]);
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

	it('accepts fenced JSON and reports exact session fields for invalid Qwen output', () => {
		const fencedPlan = `\`\`\`json\n${validPlan}\n\`\`\``;
		expect(parseStudyPlanResponse(fencedPlan, plannerInput()).days).toHaveLength(5);

		const missingDuration = JSON.parse(validPlan);
		delete missingDuration.days[0].sessions[0].duration_minutes;
		expect(() => parseStudyPlanResponse(JSON.stringify(missingDuration), plannerInput())).toThrow(
			'Generated session is missing duration_minutes on 2026-01-05 (session 1)'
		);

		const stringDuration = JSON.parse(validPlan);
		stringDuration.days[0].sessions[0].duration_minutes = '60';
		expect(() => parseStudyPlanResponse(JSON.stringify(stringDuration), plannerInput())).toThrow(
			'Generated session is invalid duration_minutes on 2026-01-05 (session 1)'
		);

		const unsupportedType = JSON.parse(validPlan);
		unsupportedType.days[0].sessions[0].type = 'lecture';
		expect(() => parseStudyPlanResponse(JSON.stringify(unsupportedType), plannerInput())).toThrow(
			'Generated session is invalid type on 2026-01-05 (session 1)'
		);
	});

	it('identifies malformed and truncated model JSON distinctly', () => {
		expect(() => parseStudyPlanResponse('{"days":[}', plannerInput())).toThrow(
			'The model response was not valid JSON:'
		);
		expect(() => parseStudyPlanResponse('{"strategy":"plan","days":[', plannerInput())).toThrow(
			'The JSON object is incomplete; the model response may have been truncated.'
		);
	});

	it('reports unknown subject references at the exact session', () => {
		const unknownSubject = JSON.parse(validPlan);
		unknownSubject.days[0].sessions[0].subject = 'DBMS';
		expect(() => parseStudyPlanResponse(JSON.stringify(unknownSubject), plannerInput())).toThrow(
			'Generated session references unknown subject "DBMS" on 2026-01-05'
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
			UnselectedStudyWeekdayError
		);
	});

	it.each([
		['Saturday', '2026-11-07', 6],
		['Sunday', '2026-11-08', 0]
	])(
		'identifies an unselected %s session in the exact planning scenario',
		(_, weekendDate, weekday) => {
			const input = novemberInput();
			const weekendPlan = {
				strategy: 'Study on weekdays.',
				days: JSON.parse(novemberWeekdayPlan()).days
			};
			weekendPlan.days.find(
				(day: { date: string; sessions: unknown[] }) => day.date === weekendDate
			).sessions = [
				{
					subject: 'Biology',
					topic: 'Review cells',
					duration_minutes: 45,
					type: 'study'
				}
			];

			try {
				parseStudyPlanResponse(JSON.stringify(weekendPlan), input);
				throw new Error('Expected the excluded weekday to be rejected.');
			} catch (error) {
				expect(error).toBeInstanceOf(UnselectedStudyWeekdayError);
				if (!(error instanceof UnselectedStudyWeekdayError)) throw error;
				expect(error).toMatchObject({
					date: weekendDate,
					weekday,
					selectedWeekdays: [1, 2, 3, 4, 5],
					sessions: [{ subject: 'Biology', type: 'study', duration_minutes: 45 }]
				});
				expect(error.message).toContain(
					`${STUDY_WEEKDAY_NAMES[weekday]} (${weekendDate}; weekday ${weekday})`
				);
			}
		}
	);

	it('accepts a valid plan for the exact Monday-Friday scenario with empty weekend rest days', () => {
		const input = novemberInput();
		const messages = buildStudyPlannerMessages(input);
		expect(JSON.parse(messages[1].content)).toMatchObject({
			plan_start_date: '2026-11-05',
			plan_end_date: '2026-11-19',
			daily_available_hours: 3,
			preferred_start_time: '17:00',
			study_weekdays: [1, 2, 3, 4, 5],
			study_weekday_names: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
			required_study_dates: [
				'2026-11-05',
				'2026-11-06',
				'2026-11-09',
				'2026-11-10',
				'2026-11-11',
				'2026-11-12',
				'2026-11-13',
				'2026-11-16',
				'2026-11-17',
				'2026-11-18',
				'2026-11-19'
			],
			break_duration_minutes: 10,
			intensity: 'balanced'
		});
		const plan = parseStudyPlanResponse(novemberWeekdayPlan(), input);
		expect(plan.days).toHaveLength(15);
		expect(plan.days.find(({ date }) => date === '2026-11-07')?.sessions).toEqual([]);
		expect(plan.days.find(({ date }) => date === '2026-11-08')?.sessions).toEqual([]);
		expect(plan.days.find(({ date }) => date === '2026-11-06')?.sessions[0].duration_minutes).toBe(
			90
		);
	});

	it('enforces exam deadlines within the exact planning scenario', () => {
		const input = novemberInput();
		input.subjects[0].examDate = '2026-11-10';
		const afterExam = JSON.parse(novemberWeekdayPlan());
		afterExam.days.find(
			(day: { date: string; sessions: unknown[] }) => day.date === '2026-11-11'
		).sessions = [
			{
				subject: 'Biology',
				topic: 'Review cells',
				duration_minutes: 45,
				type: 'study'
			}
		];

		expect(() => parseStudyPlanResponse(JSON.stringify(afterExam), input)).toThrow(
			'The study plan schedules a subject after its exam date.'
		);
	});

	it('allows empty rest-day entries on excluded weekdays and weekday sessions in range', () => {
		const input = plannerInput();
		input.startDate = '2026-11-05';
		input.endDate = '2026-11-19';
		input.subjects[0].examDate = input.endDate;
		const weekdayPlan = {
			strategy: 'Study on weekdays and rest on the weekend.',
			days: Array.from({ length: 15 }, (_, index) => {
				const date = new Date(Date.UTC(2026, 10, 5 + index)).toISOString().slice(0, 10);
				return {
					date,
					sessions:
						date === '2026-11-06'
							? [
									{
										subject: 'Biology',
										topic: 'Review cell structure',
										duration_minutes: 45,
										type: 'study'
									}
								]
							: []
				};
			})
		};

		const parsedPlan = parseStudyPlanResponse(JSON.stringify(weekdayPlan), input);
		expect(parsedPlan.days).toHaveLength(15);
		expect(parsedPlan.days.find(({ date }) => date === '2026-11-07')?.sessions).toEqual([]);
		expect(parsedPlan.days.find(({ date }) => date === '2026-11-06')?.sessions).toHaveLength(1);
	});

	it('includes both planning boundaries and rejects out-of-range rest days', () => {
		const input = plannerInput();
		input.startDate = '2026-11-05';
		input.endDate = '2026-11-06';
		input.subjects[0].examDate = input.endDate;
		input.studyDays = [4, 5];
		const boundaryPlan = {
			strategy: 'Use both available days.',
			days: [
				{ date: '2026-11-05', sessions: [] },
				{ date: '2026-11-06', sessions: [] }
			]
		};
		expect(() => parseStudyPlanResponse(JSON.stringify(boundaryPlan), input)).not.toThrow();

		boundaryPlan.days.push({ date: '2026-11-07', sessions: [] });
		expect(() => parseStudyPlanResponse(JSON.stringify(boundaryPlan), input)).toThrow(
			'The study plan includes a date outside your selected planning days.'
		);
	});

	it('uses ISO calendar weekdays without timezone shifts', () => {
		const input = plannerInput();
		input.startDate = '2026-11-05';
		input.endDate = '2026-11-09';
		input.subjects[0].examDate = input.endDate;
		const plan = {
			strategy: 'Use local calendar dates.',
			days: ['2026-11-05', '2026-11-06', '2026-11-09'].map((date) => ({
				date,
				sessions: []
			}))
		};

		expect(
			parseStudyPlanResponse(JSON.stringify(plan), input).days.map(({ date }) => date)
		).toEqual(['2026-11-05', '2026-11-06', '2026-11-09']);
	});

	it('rejects plans that omit selected study days before the last exam', () => {
		const incomplete = JSON.parse(validPlan);
		incomplete.days.pop();
		expect(() => parseStudyPlanResponse(JSON.stringify(incomplete), plannerInput())).toThrow(
			'The study plan does not include exactly the available study days.'
		);
	});

	it('corrects an excluded-weekday schedule once and reports validation timing diagnostics', async () => {
		const input = novemberInput();
		const initialPlan = JSON.parse(novemberWeekdayPlan());
		initialPlan.days.find(
			(day: { date: string; sessions: unknown[] }) => day.date === '2026-11-07'
		).sessions = [
			{
				subject: 'Biology',
				topic: 'Review cells',
				duration_minutes: 45,
				type: 'study'
			}
		];
		const complete = vi
			.fn()
			.mockResolvedValueOnce(JSON.stringify(initialPlan))
			.mockResolvedValueOnce(novemberWeekdayPlan());
		const diagnostics = vi.fn();

		const result = await generateStudyPlan(input, complete, diagnostics);

		expect(result.days).toHaveLength(15);
		expect(complete).toHaveBeenCalledTimes(2);
		expect(complete).toHaveBeenNthCalledWith(1, expect.any(Array), 2500);
		expect(complete.mock.calls[1][0].at(-1).content).toContain('2026-11-07; weekday 6');
		expect(complete.mock.calls[1][0].at(-1).content).toContain(
			'Return the complete corrected JSON'
		);
		expect(diagnostics).toHaveBeenCalledTimes(2);
		expect(diagnostics).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				attempt: 1,
				selectedWeekdays: [1, 2, 3, 4, 5],
				rawResponse: JSON.stringify(initialPlan),
				validationError: expect.stringContaining('2026-11-07; weekday 6'),
				durationMs: expect.any(Number)
			})
		);
		expect(diagnostics.mock.calls[0][0].durationMs).toBeGreaterThanOrEqual(0);
		expect(diagnostics.mock.calls[0][0].dates).toContainEqual({
			date: '2026-11-07',
			weekday: 6,
			weekdayName: 'Saturday',
			sessions: 1
		});
	});

	it('stops after one correction when the model repeats the excluded weekday', async () => {
		const invalidPlan = JSON.parse(novemberWeekdayPlan());
		invalidPlan.days.find(
			(day: { date: string; sessions: unknown[] }) => day.date === '2026-11-08'
		).sessions = [
			{
				subject: 'Biology',
				topic: 'Review cells',
				duration_minutes: 45,
				type: 'study'
			}
		];
		const complete = vi.fn(async () => JSON.stringify(invalidPlan));
		const diagnostics = vi.fn();

		await expect(generateStudyPlan(novemberInput(), complete, diagnostics)).rejects.toBeInstanceOf(
			StudyPlanCorrectionError
		);
		expect(complete).toHaveBeenCalledTimes(2);
		expect(diagnostics).toHaveBeenCalledTimes(2);
		expect(diagnostics.mock.calls[1][0].validationError).toContain('2026-11-08; weekday 0');
	});

	it('retries once when a required session property is missing', async () => {
		const incomplete = JSON.parse(novemberWeekdayPlan());
		incomplete.days.find(
			(day: { date: string; sessions: unknown[] }) => day.date === '2026-11-06'
		).sessions[0].duration_minutes = undefined;
		const complete = vi
			.fn()
			.mockResolvedValueOnce(JSON.stringify(incomplete))
			.mockResolvedValueOnce(novemberWeekdayPlan());

		const diagnostics = vi.fn();
		const result = await generateStudyPlan(novemberInput(), complete, diagnostics);

		expect(result.days).toHaveLength(15);
		expect(complete).toHaveBeenCalledTimes(2);
		expect(complete.mock.calls[1][0].at(-1).content).toContain(
			'missing duration_minutes on 2026-11-06 (session 1)'
		);
		expect(diagnostics.mock.calls[0][0]).toMatchObject({
			validationStage: 'session',
			invalidSession: {
				date: '2026-11-06',
				sessionIndex: 0,
				field: 'duration_minutes'
			}
		});
		expect(diagnostics.mock.calls[0][0].rawResponse).toBe(JSON.stringify(incomplete));
		expect(diagnostics.mock.calls[0][0].durationMs).toBeGreaterThanOrEqual(0);
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
