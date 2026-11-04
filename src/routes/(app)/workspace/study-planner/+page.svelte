<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';

	import { generateOpenAIChatCompletion } from '$lib/apis/openai';
	import { config, models as availableModelsStore } from '$lib/stores';
	import {
		addPlannerSubject,
		createPlannerSubject,
		generateStudyPlan,
		MAX_STUDY_PLAN_DAYS,
		removePlannerSubject,
		type PlannerSubject,
		type StudyIntensity,
		type StudyPlannerInput,
		type StudyPlan,
		type StudySessionType
	} from '$lib/utils/studyPlanner';

	const i18n = getContext<Writable<i18nType>>('i18n');

	const today = () => {
		const date = new Date();
		const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
		return localDate.toISOString().slice(0, 10);
	};
	const dateOffset = (date: string, days: number) => {
		const result = new Date(`${date}T00:00:00`);
		result.setDate(result.getDate() + days);
		const localDate = new Date(result.getTime() - result.getTimezoneOffset() * 60000);
		return localDate.toISOString().slice(0, 10);
	};
	const weekdayLabels = [
		'Sunday',
		'Monday',
		'Tuesday',
		'Wednesday',
		'Thursday',
		'Friday',
		'Saturday'
	];
	const sessionLabels: Record<StudySessionType, string> = {
		study: 'Study',
		revision: 'Revision',
		practice: 'Practice',
		break: 'Break'
	};
	const sessionStyles: Record<StudySessionType, string> = {
		study: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950',
		revision: 'border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950',
		practice: 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950',
		break: 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
	};

	const planStartDate = today();
	let startDate = planStartDate;
	let endDate = dateOffset(planStartDate, 14);
	let subjects: PlannerSubject[] = [createPlannerSubject(endDate)];
	let dailyHours = 3;
	let startTime = '17:00';
	let studyDays = [1, 2, 3, 4, 5];
	let breakMinutes = 10;
	let intensity: StudyIntensity = 'balanced';
	let availableModels = [];
	let selectedModelId = '';
	let generating = false;
	let generationError = '';
	let plan: StudyPlan | null = null;
	let copyStatus = '';

	$: availableModels = ($availableModelsStore ?? []).filter(
		(model) => !(model?.info?.meta?.hidden ?? false)
	);
	$: if (
		availableModels.length > 0 &&
		!availableModels.some((model) => model.id === selectedModelId)
	) {
		const defaultModelId = ($config?.default_models ?? '').split(',')[0]?.trim();
		selectedModelId = availableModels.some((model) => model.id === defaultModelId)
			? defaultModelId
			: availableModels[0].id;
	}

	const plannerInput = (): StudyPlannerInput => ({
		subjects,
		dailyHours,
		startTime,
		studyDays,
		breakMinutes,
		startDate,
		endDate,
		intensity
	});

	const addSubject = () => {
		if (subjects.length < 12) subjects = addPlannerSubject(subjects, endDate);
	};

	const deleteSubject = (index: number) => {
		subjects = removePlannerSubject(subjects, index);
	};

	const toggleStudyDay = (day: number) => {
		studyDays = studyDays.includes(day)
			? studyDays.filter((selected) => selected !== day)
			: [...studyDays, day].sort((a, b) => a - b);
	};

	const generatePlan = async () => {
		generationError = '';
		copyStatus = '';
		plan = null;
		if (!selectedModelId) {
			generationError = $i18n.t('No available models were found.');
			return;
		}

		const input = plannerInput();
		try {
			generating = true;
			plan = await generateStudyPlan(input, async (messages, maxTokens) => {
				const response = await generateOpenAIChatCompletion(localStorage.token, {
					model: selectedModelId,
					stream: false,
					params: { temperature: 0.3, max_tokens: maxTokens },
					messages
				});
				const content = response?.choices?.[0]?.message?.content;
				if (typeof content !== 'string' || !content.trim()) {
					throw new Error($i18n.t('The model returned an empty study plan. Please try again.'));
				}
				return content;
			});
		} catch (error) {
			generationError = $i18n.t(error instanceof Error ? error.message : String(error));
		} finally {
			generating = false;
		}
	};

	const sessionTime = (sessions: StudyPlan['days'][number]['sessions'], index: number) => {
		const [hours, minutes] = startTime.split(':').map(Number);
		const start =
			hours * 60 +
			minutes +
			sessions.slice(0, index).reduce((total, session) => total + session.duration_minutes, 0);
		const end = start + sessions[index].duration_minutes;
		const format = (value: number) =>
			`${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
		return `${format(start)}–${format(end)}`;
	};

	const copyPlan = async () => {
		if (!plan) return;
		const text = [
			plan.strategy,
			...plan.days.flatMap((day) => [
				'',
				`${day.date} — ${new Date(`${day.date}T00:00:00`).toLocaleDateString()}`,
				...day.sessions.map(
					(session, index) =>
						`${sessionTime(day.sessions, index)} | ${session.subject} | ${session.topic} | ${session.duration_minutes} min | ${session.type}`
				)
			])
		].join('\n');
		try {
			await navigator.clipboard.writeText(text);
			copyStatus = $i18n.t('Study plan copied.');
		} catch (error) {
			copyStatus = $i18n.t('Could not copy the study plan. Please copy it manually.');
			console.error('Failed to copy study plan:', error);
		}
	};
</script>

<svelte:head>
	<title>{$i18n.t('AI Study Planner')} / {$i18n.t('Workspace')}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 py-5 md:py-8">
	<header class="border-b border-gray-200 pb-5 dark:border-gray-800">
		<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
			{$i18n.t('Academia')}
		</p>
		<h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">
			{$i18n.t('AI Study Planner')}
		</h1>
		<p class="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
			{$i18n.t(
				'Build a realistic day-wise study timetable around your subjects, exams, and available time.'
			)}
		</p>
	</header>

	<form class="flex flex-col gap-6" on:submit|preventDefault={generatePlan}>
		<section class="flex flex-col gap-4" aria-labelledby="planner-subjects-heading">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h2
						id="planner-subjects-heading"
						class="text-base font-medium text-gray-900 dark:text-gray-100"
					>
						{$i18n.t('Subjects and exams')}
					</h2>
					<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
						{$i18n.t('Add each subject, its exam date, and your current preparation level.')}
					</p>
				</div>
				<button
					class="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
					type="button"
					on:click={addSubject}
					disabled={subjects.length >= 12 || generating}
				>
					{$i18n.t('Add subject')}
				</button>
			</div>

			{#each subjects as subject, index (index)}
				<fieldset
					class="grid gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 md:grid-cols-2"
				>
					<legend class="sr-only">{$i18n.t('Subject {{number}}', { number: index + 1 })}</legend>
					<label class="text-sm" for={`planner-subject-${index}`}>
						<span class="mb-1.5 block text-gray-700 dark:text-gray-300"
							>{$i18n.t('Subject name')}</span
						>
						<input
							id={`planner-subject-${index}`}
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
							bind:value={subject.name}
							maxlength="100"
							required
							disabled={generating}
							placeholder={$i18n.t('e.g. Biology')}
						/>
					</label>
					<label class="text-sm" for={`planner-exam-${index}`}>
						<span class="mb-1.5 block text-gray-700 dark:text-gray-300">{$i18n.t('Exam date')}</span
						>
						<input
							id={`planner-exam-${index}`}
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
							type="date"
							bind:value={subject.examDate}
							min={startDate}
							max={endDate}
							required
							disabled={generating}
						/>
					</label>
					<label class="text-sm" for={`planner-level-${index}`}>
						<span class="mb-1.5 block text-gray-700 dark:text-gray-300"
							>{$i18n.t('Preparation level')}</span
						>
						<select
							id={`planner-level-${index}`}
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
							bind:value={subject.preparationLevel}
							disabled={generating}
						>
							<option value="beginner">{$i18n.t('Beginner')}</option>
							<option value="intermediate">{$i18n.t('Intermediate')}</option>
							<option value="advanced">{$i18n.t('Advanced')}</option>
						</select>
					</label>
					<label class="text-sm" for={`planner-topics-${index}`}>
						<span class="mb-1.5 block text-gray-700 dark:text-gray-300"
							>{$i18n.t('Topics or syllabus (optional)')}</span
						>
						<textarea
							id={`planner-topics-${index}`}
							class="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
							bind:value={subject.topics}
							maxlength="2000"
							rows="2"
							disabled={generating}
							placeholder={$i18n.t('Enter topics to cover')}
						></textarea>
					</label>
					{#if subjects.length > 1}
						<button
							class="w-fit text-sm text-red-700 underline underline-offset-2 dark:text-red-300 md:col-span-2"
							type="button"
							on:click={() => deleteSubject(index)}
							disabled={generating}
						>
							{$i18n.t('Remove subject')}
						</button>
					{/if}
				</fieldset>
			{/each}
		</section>

		<section class="grid gap-5 border-t border-gray-200 pt-5 dark:border-gray-800 md:grid-cols-2">
			<div class="flex flex-col gap-4">
				<h2 class="text-base font-medium text-gray-900 dark:text-gray-100">
					{$i18n.t('Study availability')}
				</h2>
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="text-sm" for="planner-hours">
						<span class="mb-1.5 block text-gray-700 dark:text-gray-300"
							>{$i18n.t('Daily available hours')}</span
						>
						<input
							id="planner-hours"
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
							type="number"
							bind:value={dailyHours}
							min="0.5"
							max="12"
							step="0.5"
							required
							disabled={generating}
						/>
					</label>
					<label class="text-sm" for="planner-start-time">
						<span class="mb-1.5 block text-gray-700 dark:text-gray-300"
							>{$i18n.t('Preferred start time')}</span
						>
						<input
							id="planner-start-time"
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
							type="time"
							bind:value={startTime}
							required
							disabled={generating}
						/>
					</label>
					<label class="text-sm" for="planner-break">
						<span class="mb-1.5 block text-gray-700 dark:text-gray-300"
							>{$i18n.t('Break duration')}</span
						>
						<select
							id="planner-break"
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
							bind:value={breakMinutes}
							disabled={generating}
						>
							<option value={0}>{$i18n.t('No breaks')}</option>
							<option value={5}>5 {$i18n.t('minutes')}</option>
							<option value={10}>10 {$i18n.t('minutes')}</option>
							<option value={15}>15 {$i18n.t('minutes')}</option>
							<option value={20}>20 {$i18n.t('minutes')}</option>
							<option value={30}>30 {$i18n.t('minutes')}</option>
						</select>
					</label>
					<label class="text-sm" for="planner-model">
						<span class="mb-1.5 block text-gray-700 dark:text-gray-300">{$i18n.t('Model')}</span>
						<select
							id="planner-model"
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
							bind:value={selectedModelId}
							disabled={availableModels.length === 0 || generating}
						>
							{#each availableModels as model (model.id)}
								<option value={model.id}>{model.name || model.id}</option>
							{/each}
						</select>
					</label>
				</div>
				<fieldset>
					<legend class="mb-2 text-sm text-gray-700 dark:text-gray-300"
						>{$i18n.t('Study days')}</legend
					>
					<div class="flex flex-wrap gap-2">
						{#each weekdayLabels as weekday, day}
							<label
								class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-2 text-sm dark:border-gray-700"
							>
								<input
									type="checkbox"
									checked={studyDays.includes(day)}
									on:change={() => toggleStudyDay(day)}
									disabled={generating}
								/>
								<span>{$i18n.t(weekday)}</span>
							</label>
						{/each}
					</div>
				</fieldset>
			</div>

			<div class="flex flex-col gap-4">
				<h2 class="text-base font-medium text-gray-900 dark:text-gray-100">
					{$i18n.t('Planning preferences')}
				</h2>
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="text-sm" for="planner-plan-start">
						<span class="mb-1.5 block text-gray-700 dark:text-gray-300"
							>{$i18n.t('Plan start date')}</span
						>
						<input
							id="planner-plan-start"
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
							type="date"
							bind:value={startDate}
							min={planStartDate}
							required
							disabled={generating}
						/>
					</label>
					<label class="text-sm" for="planner-plan-end">
						<span class="mb-1.5 block text-gray-700 dark:text-gray-300"
							>{$i18n.t('Plan end date')}</span
						>
						<input
							id="planner-plan-end"
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
							type="date"
							bind:value={endDate}
							min={startDate}
							max={dateOffset(startDate, MAX_STUDY_PLAN_DAYS - 1)}
							required
							disabled={generating}
						/>
					</label>
					<label class="text-sm sm:col-span-2" for="planner-intensity">
						<span class="mb-1.5 block text-gray-700 dark:text-gray-300"
							>{$i18n.t('Study intensity')}</span
						>
						<select
							id="planner-intensity"
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
							bind:value={intensity}
							disabled={generating}
						>
							<option value="light">{$i18n.t('Light')}</option>
							<option value="balanced">{$i18n.t('Balanced')}</option>
							<option value="intensive">{$i18n.t('Intensive')}</option>
						</select>
					</label>
				</div>
				<p class="text-xs text-gray-500 dark:text-gray-400">
					{$i18n.t(
						'Plans can cover up to {{days}} days. Exam dates must fall within the selected planning period.',
						{ days: MAX_STUDY_PLAN_DAYS }
					)}
				</p>
			</div>
		</section>

		<div class="flex flex-col gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
			{#if availableModels.length === 0}
				<p class="text-sm text-amber-700 dark:text-amber-400" role="status">
					{$i18n.t('No available models were found.')}
				</p>
			{/if}
			<button
				class="inline-flex min-h-10 items-center justify-center self-start rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
				type="submit"
				disabled={generating || availableModels.length === 0}
				aria-busy={generating}
			>
				{generating ? $i18n.t('Generating study plan...') : $i18n.t('Generate study plan')}
			</button>
		</div>
	</form>

	<section
		class="border-t border-gray-200 pt-5 dark:border-gray-800"
		aria-live="polite"
		aria-busy={generating}
	>
		{#if generating}
			<p class="text-sm text-gray-600 dark:text-gray-400" role="status">
				{$i18n.t('Creating a day-wise study timetable with your selected model...')}
			</p>
		{:else if generationError}
			<p class="text-sm text-red-600 dark:text-red-400" role="alert">{generationError}</p>
		{:else if plan}
			<div class="flex flex-col gap-5">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="max-w-3xl">
						<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
							{$i18n.t('Your study plan')}
						</h2>
						<h3 class="mt-3 text-sm font-medium text-gray-900 dark:text-gray-100">
							{$i18n.t('Overall strategy')}
						</h3>
						<p class="mt-1 whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">
							{plan.strategy}
						</p>
					</div>
					<button
						class="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
						type="button"
						on:click={copyPlan}
					>
						{$i18n.t('Copy plan')}
					</button>
				</div>
				{#if copyStatus}
					<p class="text-sm text-gray-600 dark:text-gray-400" role="status">{copyStatus}</p>
				{/if}
				<div class="grid gap-4 md:grid-cols-2">
					{#each plan.days as day (day.date)}
						<article class="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
							<h3 class="mb-3 font-medium text-gray-900 dark:text-gray-100">
								{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, {
									weekday: 'long',
									month: 'short',
									day: 'numeric'
								})}
							</h3>
							{#if day.sessions.length === 0}
								<p class="text-sm text-gray-600 dark:text-gray-400">
									{$i18n.t('Rest day: no sessions planned.')}
								</p>
							{:else}
								<ol class="flex flex-col gap-2">
									{#each day.sessions as session, index (`${day.date}-${index}`)}
										<li class="rounded-lg border p-3 {sessionStyles[session.type]}">
											<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
												<span
													class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300"
													>{$i18n.t(sessionLabels[session.type])}</span
												>
												<span class="text-xs text-gray-600 dark:text-gray-300"
													>{sessionTime(day.sessions, index)}</span
												>
											</div>
											<p class="mt-1 font-medium text-gray-900 dark:text-gray-100">
												{session.subject}
											</p>
											<p class="mt-1 text-sm text-gray-700 dark:text-gray-300">
												{session.topic}
											</p>
											<p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
												{$i18n.t('{{minutes}} min', { minutes: session.duration_minutes })}
											</p>
										</li>
									{/each}
								</ol>
							{/if}
						</article>
					{/each}
				</div>
			</div>
		{:else}
			<p class="text-sm text-gray-600 dark:text-gray-400">
				{$i18n.t('Your generated timetable will appear here.')}
			</p>
		{/if}
	</section>
</div>
