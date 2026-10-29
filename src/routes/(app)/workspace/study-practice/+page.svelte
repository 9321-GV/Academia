<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';

	import { searchKnowledgeBases } from '$lib/apis/knowledge';
	import { queryDoc } from '$lib/apis/retrieval';
	import { generateOpenAIChatCompletion } from '$lib/apis/openai';
	import { config, models as availableModelsStore } from '$lib/stores';
	import {
		buildStudyPracticeRequest,
		createMcqQuizState,
		extractStudySources,
		formatStudySourceLabel,
		parseStudyPracticeResponse,
		resetMcqQuizState,
		submitMcqQuiz,
		type StudyPracticeMode,
		type McqQuizState,
		type StudyPracticeSet,
		type StudySource
	} from '$lib/utils/studyPractice';

	const i18n = getContext<Writable<i18nType>>('i18n');

	type KnowledgeCollection = { id: string; name: string; description?: string };
	let collections: KnowledgeCollection[] = [];
	let selectedCollectionId = '';
	let collectionSearch = '';
	let collectionLoading = true;
	let collectionError = '';

	let availableModels = [];
	let selectedModelId = '';
	let mode: StudyPracticeMode = 'mcq';
	let topic = '';
	let questionCount = 5;
	let generating = false;
	let generationError = '';
	let insufficientMaterial = false;
	let practice: StudyPracticeSet | null = null;
	let practiceSources: StudySource[] = [];
	let mcqQuiz: McqQuizState = createMcqQuizState();

	$: availableModels = ($availableModelsStore ?? []).filter((model) => !(model?.info?.meta?.hidden ?? false));
	$: if (availableModels.length > 0 && !availableModels.some((model) => model.id === selectedModelId)) {
		const defaultModelId = ($config?.default_models ?? '').split(',')[0]?.trim();
		selectedModelId = availableModels.some((model) => model.id === defaultModelId)
			? defaultModelId
			: availableModels[0].id;
	}

	const loadCollections = async () => {
		collectionLoading = true;
		collectionError = '';
		try {
			const response = await searchKnowledgeBases(
				localStorage.token,
				collectionSearch.trim() || null,
				null,
				1
			);
			if (!response) throw new Error($i18n.t('Unable to load Knowledge collections.'));
			collections = response.items ?? [];
			if (!collections.some((collection) => collection.id === selectedCollectionId)) {
				selectedCollectionId = collections[0]?.id ?? '';
			}
		} catch (error) {
			collectionError = error instanceof Error ? error.message : String(error);
			collections = [];
			selectedCollectionId = '';
		}
		collectionLoading = false;
	};

	const selectPracticeMode = (nextMode: StudyPracticeMode) => {
		mode = nextMode;
		practice = null;
		practiceSources = [];
		generationError = '';
		insufficientMaterial = false;
		mcqQuiz = resetMcqQuizState();
	};

	const selectMcqAnswer = (questionIndex: number, optionIndex: number) => {
		if (mcqQuiz.submitted) return;
		mcqQuiz = {
			...mcqQuiz,
			selectedAnswers: { ...mcqQuiz.selectedAnswers, [questionIndex]: optionIndex }
		};
	};

	const submitMcqAnswers = () => {
		if (!practice || practice.mode !== 'mcq' || practice.items.length === 0) return;
		mcqQuiz = submitMcqQuiz(practice.items, mcqQuiz);
	};

	const retakeMcqPractice = () => {
		mcqQuiz = resetMcqQuizState();
	};

	const generatePractice = async () => {
		generationError = '';
		insufficientMaterial = false;
		practice = null;
		practiceSources = [];
		mcqQuiz = resetMcqQuizState();

		if (
			!topic.trim() ||
			!selectedCollectionId ||
			!selectedModelId ||
			!Number.isInteger(questionCount) ||
			questionCount < 1 ||
			questionCount > 10
		)
			return;

		generating = true;
		try {
			const retrieval = await queryDoc(
				localStorage.token,
				selectedCollectionId,
				topic.trim(),
				Math.min(12, Math.max(5, questionCount * 2))
			);
			if (!retrieval) throw new Error($i18n.t('Study material retrieval failed. Please retry.'));

			const sources = extractStudySources(retrieval);
			if (sources.length === 0) {
				insufficientMaterial = true;
				return;
			}

			const request = buildStudyPracticeRequest(mode, topic, questionCount, sources);
			const response = await generateOpenAIChatCompletion(localStorage.token, {
				model: selectedModelId,
				stream: false,
				params: request.params,
				messages: request.messages,
			});
			const content = response?.choices?.[0]?.message?.content;
			if (typeof content !== 'string' || !content.trim()) {
				throw new Error($i18n.t('The model returned an empty response. Please try again.'));
			}

			const parsed = parseStudyPracticeResponse(content, mode, questionCount, sources.length);
			if (parsed.insufficient) {
				insufficientMaterial = true;
				return;
			}

			practice = parsed.practice;
			practiceSources = sources;
			mcqQuiz = resetMcqQuizState();
		} catch (error) {
			generationError = error instanceof Error ? error.message : String(error);
		} finally {
			generating = false;
		}
	};

	onMount(() => {
		loadCollections();
	});
</script>

<svelte:head>
	<title>{$i18n.t('Study Practice')} / {$i18n.t('Workspace')}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 py-5 md:py-8">
	<header class="border-b border-gray-200 pb-5 dark:border-gray-800">
		<h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">
			{$i18n.t('Study Practice Generator')}
		</h1>
		<p class="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
			{$i18n.t('Generate practice questions from material in a Knowledge collection.')}
		</p>
	</header>

	<section aria-labelledby="study-practice-settings" class="grid gap-5 md:grid-cols-2">
		<div class="flex min-w-0 flex-col gap-4">
			<h2 id="study-practice-settings" class="text-base font-medium text-gray-900 dark:text-gray-100">
				{$i18n.t('Study material')}
			</h2>

			<form class="flex items-end gap-2" on:submit|preventDefault={loadCollections}>
				<label class="min-w-0 flex-1 text-sm" for="knowledge-search">
					<span class="mb-1.5 block text-gray-700 dark:text-gray-300">{$i18n.t('Search collections')}</span>
					<input
						id="knowledge-search"
						class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-hidden focus:border-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
						bind:value={collectionSearch}
						placeholder={$i18n.t('Search collections')}
					/>
				</label>
				<button
					class="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
					type="submit"
					disabled={collectionLoading}
				>
					{$i18n.t('Search')}
				</button>
			</form>

			<label class="text-sm" for="knowledge-collection">
				<span class="mb-1.5 block text-gray-700 dark:text-gray-300">{$i18n.t('Knowledge collection')}</span>
				<select
					id="knowledge-collection"
					class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-hidden focus:border-gray-500 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
					bind:value={selectedCollectionId}
					disabled={collectionLoading || collections.length === 0}
				>
					<option value="">{$i18n.t('Select a Knowledge collection')}</option>
					{#each collections as collection (collection.id)}
						<option value={collection.id}>{collection.name}</option>
					{/each}
				</select>
			</label>

			{#if collectionLoading}
				<p class="text-sm text-gray-500" role="status">{$i18n.t('Loading Knowledge collections...')}</p>
			{:else if collectionError}
				<p class="text-sm text-red-600 dark:text-red-400" role="alert">{collectionError}</p>
			{:else if collections.length === 0}
				<div class="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-400">
					<p>{$i18n.t('No collections found.')}</p>
					<a class="w-fit underline underline-offset-2" href="/workspace/knowledge">
						{$i18n.t('Open Knowledge workspace')}
					</a>
				</div>
			{/if}
		</div>

		<div class="flex min-w-0 flex-col gap-4">
			<fieldset>
				<legend class="mb-2 text-sm text-gray-700 dark:text-gray-300">{$i18n.t('Practice mode')}</legend>
				<div class="grid grid-cols-2 rounded-lg border border-gray-300 p-1 dark:border-gray-700">
					<label class="flex cursor-pointer items-center justify-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
						<input
							class="accent-gray-900 dark:accent-gray-100"
							type="radio"
							name="study-practice-mode"
							checked={mode === 'mcq'}
							disabled={generating}
							on:change={() => selectPracticeMode('mcq')}
						/>
						<span>{$i18n.t('MCQ Practice')}</span>
					</label>
					<label class="flex cursor-pointer items-center justify-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
						<input
							class="accent-gray-900 dark:accent-gray-100"
							type="radio"
							name="study-practice-mode"
							checked={mode === 'viva'}
							disabled={generating}
							on:change={() => selectPracticeMode('viva')}
						/>
						<span>{$i18n.t('Viva Practice')}</span>
					</label>
				</div>
			</fieldset>

			<label class="text-sm" for="study-topic">
				<span class="mb-1.5 block text-gray-700 dark:text-gray-300">{$i18n.t('Topic')}</span>
				<input
					id="study-topic"
					class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-hidden focus:border-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
					bind:value={topic}
					maxlength="180"
					placeholder={$i18n.t('Enter a topic from your study material')}
					required
				/>
			</label>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<label class="text-sm" for="question-count">
					<span class="mb-1.5 block text-gray-700 dark:text-gray-300">{$i18n.t('Number of questions')}</span>
					<input
						id="question-count"
						class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-hidden focus:border-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
						type="number"
						bind:value={questionCount}
						min="1"
						max="10"
						required
					/>
				</label>

				<label class="text-sm" for="study-model">
					<span class="mb-1.5 block text-gray-700 dark:text-gray-300">{$i18n.t('Model')}</span>
					<select
						id="study-model"
						class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-hidden focus:border-gray-500 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
						bind:value={selectedModelId}
						disabled={availableModels.length === 0}
					>
						{#each availableModels as model (model.id)}
							<option value={model.id}>{model.name || model.id}</option>
						{/each}
					</select>
				</label>
			</div>

			<button
				class="inline-flex min-h-10 items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
				type="button"
				disabled={generating || !topic.trim() || !selectedCollectionId || !selectedModelId || !Number.isInteger(questionCount) || questionCount < 1 || questionCount > 10}
				aria-busy={generating}
				on:click={generatePractice}
			>
				{generating ? $i18n.t('Generating questions...') : $i18n.t('Generate study practice')}
			</button>
			{#if availableModels.length === 0}
				<p class="text-sm text-amber-700 dark:text-amber-400" role="status">{$i18n.t('No available models were found.')}</p>
			{/if}
		</div>
	</section>

	<section class="border-t border-gray-200 pt-5 dark:border-gray-800" aria-live="polite" aria-busy={generating}>
		{#if generating}
			<p class="text-sm text-gray-600 dark:text-gray-400" role="status">{$i18n.t('Retrieving material and generating questions...')}</p>
		{:else if generationError}
			<p class="text-sm text-red-600 dark:text-red-400" role="alert">{generationError}</p>
		{:else if insufficientMaterial}
			<div class="max-w-2xl">
				<h2 class="text-base font-medium text-gray-900 dark:text-gray-100">{$i18n.t('Insufficient study material')}</h2>
				<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
					{$i18n.t('No sufficiently relevant excerpts were found for this topic. Try a broader topic or another collection.')}
				</p>
			</div>
		{:else if practice}
			<div class="flex flex-col gap-4">
				<div>
					<h2 class="text-base font-medium text-gray-900 dark:text-gray-100">{$i18n.t('Practice questions')}</h2>
					<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
						{$i18n.t('Grounded in retrieved excerpts from {{count}} source(s).', { count: practiceSources.length })}
					</p>
				</div>

				{#if practice.mode === 'mcq'}
					<ol class="flex flex-col gap-4">
						{#each practice.items as question, questionIndex (questionIndex)}
							{@const selectedOption = mcqQuiz.selectedAnswers[questionIndex]}
							<li class="border-b border-gray-200 pb-4 dark:border-gray-800">
								<fieldset>
									<legend class="font-medium text-gray-900 dark:text-gray-100">
										{questionIndex + 1}. {question.question}
									</legend>
									<div class="mt-3 flex flex-col gap-2 text-sm">
										{#each question.options as option, optionIndex (optionIndex)}
											{@const optionId = `study-mcq-${questionIndex}-${optionIndex}`}
											<label
												for={optionId}
												class="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors {selectedOption === optionIndex
													? 'border-gray-800 bg-gray-100 font-medium dark:border-gray-300 dark:bg-gray-800'
													: 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-850'} {mcqQuiz.submitted ? 'cursor-default' : ''}"
											>
												<input
													id={optionId}
													type="radio"
													name={`study-mcq-question-${questionIndex}`}
													checked={selectedOption === optionIndex}
													disabled={mcqQuiz.submitted}
													on:change={() => selectMcqAnswer(questionIndex, optionIndex)}
												/>
												<span>{String.fromCharCode(65 + optionIndex)}. {option}</span>
												{#if selectedOption === optionIndex}
													<span class="ml-auto text-xs">{$i18n.t('Selected')}</span>
												{/if}
											</label>
										{/each}
									</div>
								</fieldset>
								<p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
									{$i18n.t('Sources')}: {question.source_indices.map((index) => formatStudySourceLabel(practiceSources[index - 1], index)).join('; ')}
								</p>
								{#if mcqQuiz.submitted}
									<div class="mt-3 flex flex-col gap-1 text-sm" id={`study-mcq-feedback-${questionIndex}`}>
										{#if selectedOption === undefined}
											<p class="font-medium text-gray-800 dark:text-gray-200">
												{$i18n.t('Not answered; counted as incorrect.')}
											</p>
										{:else if selectedOption === question.correct_option}
											<p class="font-medium text-green-800 dark:text-green-300">
												{$i18n.t('Correct. Your answer: {{answer}}.', { answer: `${String.fromCharCode(65 + selectedOption)}. ${question.options[selectedOption]}` })}
											</p>
										{:else}
											<p class="font-medium text-red-800 dark:text-red-300">
												{$i18n.t('Incorrect. Your answer: {{answer}}.', { answer: `${String.fromCharCode(65 + selectedOption)}. ${question.options[selectedOption]}` })}
											</p>
										{/if}
										<p class="text-gray-700 dark:text-gray-300">
											<strong>{$i18n.t('Correct answer')}:</strong>
											{String.fromCharCode(65 + question.correct_option)}. {question.options[question.correct_option]}
										</p>
										<p class="text-gray-600 dark:text-gray-400">{question.explanation}</p>
									</div>
								{/if}
							</li>
						{/each}
					</ol>
					{#if mcqQuiz.submitted && mcqQuiz.score}
						<div class="flex flex-col gap-2 border-t border-gray-200 pt-4 dark:border-gray-800">
							<p class="text-base font-semibold text-gray-900 dark:text-gray-100" role="status" aria-live="polite">
								{$i18n.t('{{correct}} / {{total}} correct ({{percentage}}%).', {
									correct: mcqQuiz.score.correct,
									total: mcqQuiz.score.total,
									percentage: mcqQuiz.score.percentage
								})}
							</p>
							{#if mcqQuiz.score.unanswered > 0}
								<p class="text-sm text-gray-600 dark:text-gray-400">
									{$i18n.t('{{count}} unanswered, counted as incorrect.', { count: mcqQuiz.score.unanswered })}
								</p>
							{/if}
							<button
								class="w-fit rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
								type="button"
								on:click={retakeMcqPractice}
							>
								{$i18n.t('Retake')}
							</button>
						</div>
					{:else}
						<button
							class="mt-2 w-fit rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
							type="button"
							disabled={mcqQuiz.submitted || practice.items.length === 0}
							on:click={submitMcqAnswers}
						>
							{$i18n.t('Submit Answers')}
						</button>
					{/if}
				{:else}
					<ol class="flex flex-col gap-4">
						{#each practice.items as question, questionIndex (questionIndex)}
							<li class="border-b border-gray-200 pb-4 dark:border-gray-800">
								<h3 class="font-medium text-gray-900 dark:text-gray-100">{questionIndex + 1}. {question.question}</h3>
								<p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
									{$i18n.t('Sources')}: {question.source_indices.map((index) => formatStudySourceLabel(practiceSources[index - 1], index)).join('; ')}
								</p>
								<details class="mt-3 text-sm">
									<summary class="w-fit cursor-pointer font-medium text-gray-800 underline underline-offset-2 dark:text-gray-200">
										{$i18n.t('Show model answer')}
									</summary>
									<p class="mt-2 whitespace-pre-wrap text-gray-700 dark:text-gray-300">{question.answer}</p>
								</details>
							</li>
						{/each}
					</ol>
				{/if}

				<details class="text-sm">
					<summary class="w-fit cursor-pointer font-medium text-gray-700 underline underline-offset-2 dark:text-gray-300">
						{$i18n.t('Retrieved sources')}
					</summary>
					<ul class="mt-2 flex flex-col gap-1 text-gray-600 dark:text-gray-400">
						{#each practiceSources as source, index (index)}
							<li>{formatStudySourceLabel(source, index + 1)}</li>
						{/each}
					</ul>
				</details>
			</div>
		{:else}
			<p class="text-sm text-gray-500 dark:text-gray-400">{$i18n.t('Choose a Knowledge collection and topic to begin.')}</p>
		{/if}
	</section>
</div>