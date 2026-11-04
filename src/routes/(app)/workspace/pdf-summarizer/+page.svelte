<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';

	import { getFileDataContentById, searchFiles, uploadFile } from '$lib/apis/files';
	import { generateOpenAIChatCompletion } from '$lib/apis/openai';
	import { config, models as availableModelsStore } from '$lib/stores';
	import {
		summarizePdfText,
		validatePdfInput,
		type PdfSummary,
		type PdfSummaryLength
	} from '$lib/utils/pdfSummarizer';

	const i18n = getContext<Writable<i18nType>>('i18n');

	type PdfFile = { id: string; filename: string };
	type UploadedFile = { id: string; filename: string };
	let pdfFiles: PdfFile[] = [];
	let selectedPdfId = '';
	let selectedUpload: File | null = null;
	let fileLoading = true;
	let fileError = '';
	let uploadError = '';
	let generationError = '';
	let availableModels = [];
	let selectedModelId = '';
	let summaryLength: PdfSummaryLength = 'medium';
	let uploading = false;
	let generating = false;
	let summary: PdfSummary | null = null;
	let sourceName = '';
	let dragOver = false;

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

	const loadPdfFiles = async () => {
		fileLoading = true;
		fileError = '';
		try {
			const response = (await searchFiles(localStorage.token, '*.pdf', 0, 100, false)) as
				| UploadedFile[]
				| null;
			pdfFiles = (response ?? []).map((file) => ({ id: file.id, filename: file.filename }));
			if (!pdfFiles.some((file) => file.id === selectedPdfId)) {
				selectedPdfId = pdfFiles[0]?.id ?? '';
			}
		} catch (error) {
			pdfFiles = [];
			selectedPdfId = '';
			fileError = error instanceof Error ? error.message : String(error);
		} finally {
			fileLoading = false;
		}
	};

	const setUpload = (file: File | null = null) => {
		selectedUpload = file ?? null;
		uploadError = '';
		generationError = '';
		summary = null;
		if (file) selectedPdfId = '';
	};

	const handleFileSelection = (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		setUpload(input.files?.[0]);
	};

	const handleDrop = (event: DragEvent) => {
		event.preventDefault();
		dragOver = false;
		setUpload(event.dataTransfer?.files?.[0]);
	};

	const uploadPdf = async () => {
		uploadError = '';
		if (!selectedUpload) return;

		uploading = true;
		try {
			const header = new Uint8Array(await selectedUpload.slice(0, 1024).arrayBuffer());
			validatePdfInput(selectedUpload, header);

			const uploaded = (await uploadFile(localStorage.token, selectedUpload, null, true, true)) as
				| (UploadedFile & { error?: string })
				| null;
			if (!uploaded) {
				throw new Error($i18n.t('PDF upload failed. Please try again.'));
			}
			if (uploaded.error) {
				throw new Error(String(uploaded.error));
			}
			if (!uploaded.id) {
				throw new Error($i18n.t('PDF upload did not return a file ID.'));
			}

			selectedPdfId = uploaded.id;
			pdfFiles = [
				{ id: uploaded.id, filename: uploaded.filename ?? selectedUpload.name },
				...pdfFiles.filter((file) => file.id !== uploaded.id)
			];
			setUpload(null);
		} catch (error) {
			uploadError = error instanceof Error ? error.message : String(error);
		} finally {
			uploading = false;
		}
	};

	const generateSummary = async () => {
		generationError = '';
		summary = null;
		if (!selectedPdfId || !selectedModelId) return;

		const file = pdfFiles.find((item) => item.id === selectedPdfId);
		if (!file) {
			generationError = $i18n.t('Select a PDF to summarize.');
			return;
		}

		generating = true;
		sourceName = file.filename;
		try {
			const result = await getFileDataContentById(localStorage.token, selectedPdfId);
			if (typeof result?.content !== 'string' || !result.content.trim()) {
				throw new Error(
					$i18n.t('No readable text was extracted from this PDF. Try uploading a text-based PDF.')
				);
			}

			summary = await summarizePdfText(
				result.content,
				summaryLength,
				async (messages, maxTokens) => {
					const response = await generateOpenAIChatCompletion(localStorage.token, {
						model: selectedModelId,
						stream: false,
						params: { temperature: 0.2, max_tokens: maxTokens },
						messages
					});
					const content = response?.choices?.[0]?.message?.content;
					if (typeof content !== 'string' || !content.trim()) {
						throw new Error($i18n.t('The model returned an empty summary. Please try again.'));
					}
					return content;
				}
			);
		} catch (error) {
			generationError = error instanceof Error ? error.message : String(error);
		} finally {
			generating = false;
		}
	};

	onMount(loadPdfFiles);
</script>

<svelte:head>
	<title>{$i18n.t('PDF Summarizer')} / {$i18n.t('Workspace')}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 py-5 md:py-8">
	<header class="border-b border-gray-200 pb-5 dark:border-gray-800">
		<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
			{$i18n.t('Academia')}
		</p>
		<h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">
			{$i18n.t('PDF Summarizer')}
		</h1>
		<p class="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
			{$i18n.t('Create an exam-ready summary from your PDF using your selected AI model.')}
		</p>
	</header>

	<section class="grid gap-6 md:grid-cols-2" aria-labelledby="pdf-source-heading">
		<div class="flex flex-col gap-4">
			<h2 id="pdf-source-heading" class="text-base font-medium text-gray-900 dark:text-gray-100">
				{$i18n.t('Choose a PDF')}
			</h2>
			<div
				class="rounded-xl border-2 border-dashed p-5 text-center transition-colors {dragOver
					? 'border-gray-700 bg-gray-50 dark:border-gray-300 dark:bg-gray-800'
					: 'border-gray-300 dark:border-gray-700'}"
				ondragover={(event) => {
					event.preventDefault();
					dragOver = true;
				}}
				ondragleave={() => (dragOver = false)}
				ondrop={handleDrop}
				role="region"
				aria-label={$i18n.t('PDF upload area')}
			>
				<label
					for="pdf-upload"
					class="cursor-pointer text-sm font-medium underline underline-offset-2"
				>
					{$i18n.t('Choose a PDF to upload')}
				</label>
				<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
					{$i18n.t('or drag and drop a PDF here')}
				</p>
				<input
					id="pdf-upload"
					class="sr-only"
					type="file"
					accept=".pdf,application/pdf"
					onchange={handleFileSelection}
				/>
				{#if selectedUpload}
					<p class="mt-3 break-all text-sm text-gray-700 dark:text-gray-300">
						{selectedUpload.name}
					</p>
					<button
						class="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
						type="button"
						disabled={uploading}
						aria-busy={uploading}
						onclick={uploadPdf}
					>
						{uploading ? $i18n.t('Uploading and extracting PDF text...') : $i18n.t('Upload PDF')}
					</button>
				{/if}
			</div>
			{#if uploadError}
				<p class="text-sm text-red-600 dark:text-red-400" role="alert">{uploadError}</p>
			{/if}

			<div class="flex flex-col gap-2">
				<label for="existing-pdf" class="text-sm text-gray-700 dark:text-gray-300">
					{$i18n.t('Or choose an uploaded PDF')}
				</label>
				<select
					id="existing-pdf"
					class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
					bind:value={selectedPdfId}
					disabled={fileLoading || pdfFiles.length === 0 || uploading}
					onchange={() => {
						setUpload(null);
						summary = null;
					}}
				>
					<option value="">{$i18n.t('Select an uploaded PDF')}</option>
					{#each pdfFiles as file (file.id)}
						<option value={file.id}>{file.filename}</option>
					{/each}
				</select>
				{#if fileLoading}
					<p class="text-sm text-gray-500" role="status">{$i18n.t('Loading uploaded PDFs...')}</p>
				{:else if fileError}
					<p class="text-sm text-amber-700 dark:text-amber-400" role="status">{fileError}</p>
				{:else if pdfFiles.length === 0}
					<p class="text-sm text-gray-500">
						{$i18n.t('No uploaded PDFs found. Upload a PDF to begin.')}
					</p>
				{/if}
			</div>
		</div>

		<div class="flex flex-col gap-4">
			<h2 class="text-base font-medium text-gray-900 dark:text-gray-100">
				{$i18n.t('Summary settings')}
			</h2>
			<label
				for="summary-length"
				class="flex flex-col gap-1.5 text-sm text-gray-700 dark:text-gray-300"
			>
				{$i18n.t('Summary length')}
				<select
					id="summary-length"
					class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
					bind:value={summaryLength}
					disabled={generating}
				>
					<option value="short">{$i18n.t('Short')}</option>
					<option value="medium">{$i18n.t('Medium')}</option>
					<option value="detailed">{$i18n.t('Detailed')}</option>
				</select>
			</label>
			<label
				for="summary-model"
				class="flex flex-col gap-1.5 text-sm text-gray-700 dark:text-gray-300"
			>
				{$i18n.t('Model')}
				<select
					id="summary-model"
					class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
					bind:value={selectedModelId}
					disabled={availableModels.length === 0 || generating}
				>
					{#each availableModels as model (model.id)}
						<option value={model.id}>{model.name || model.id}</option>
					{/each}
				</select>
			</label>
			{#if availableModels.length === 0}
				<p class="text-sm text-amber-700 dark:text-amber-400" role="status">
					{$i18n.t('No available models were found.')}
				</p>
			{/if}
			<button
				class="inline-flex min-h-10 items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
				type="button"
				disabled={generating || uploading || !selectedPdfId || !selectedModelId}
				aria-busy={generating}
				onclick={generateSummary}
			>
				{generating ? $i18n.t('Generating summary...') : $i18n.t('Generate summary')}
			</button>
		</div>
	</section>

	<section
		class="border-t border-gray-200 pt-5 dark:border-gray-800"
		aria-live="polite"
		aria-busy={generating}
	>
		{#if generating}
			<p class="text-sm text-gray-600 dark:text-gray-400" role="status">
				{$i18n.t('Extracting document text and generating summary...')}
			</p>
		{:else if generationError}
			<p class="text-sm text-red-600 dark:text-red-400" role="alert">{generationError}</p>
		{:else if summary}
			<article class="flex flex-col gap-6">
				<header>
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
						{$i18n.t('Academic summary')}
					</h2>
					<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
						{$i18n.t('Based only on extracted text from {{filename}}.', { filename: sourceName })}
					</p>
				</header>
				<section>
					<h3 class="font-semibold text-gray-900 dark:text-gray-100">{$i18n.t('Overview')}</h3>
					<p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">
						{summary.overview}
					</p>
				</section>
				<section>
					<h3 class="font-semibold text-gray-900 dark:text-gray-100">
						{$i18n.t('Section-wise summary')}
					</h3>
					<ol
						class="mt-2 flex list-decimal flex-col gap-3 pl-5 text-sm leading-6 text-gray-700 dark:text-gray-300"
					>
						{#each summary.sections as section, index (`${index}-${section.title}`)}
							<li>
								<strong class="text-gray-900 dark:text-gray-100">{section.title}</strong>
								<p>{section.summary}</p>
							</li>
						{/each}
					</ol>
				</section>
				<section>
					<h3 class="font-semibold text-gray-900 dark:text-gray-100">{$i18n.t('Key points')}</h3>
					<ul
						class="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-gray-700 dark:text-gray-300"
					>
						{#each summary.key_points as point, index (`${index}-${point}`)}
							<li>{point}</li>
						{/each}
					</ul>
				</section>
				<section>
					<h3 class="font-semibold text-gray-900 dark:text-gray-100">
						{$i18n.t('Important terms')}
					</h3>
					<dl class="mt-2 flex flex-col gap-2 text-sm leading-6">
						{#each summary.important_terms as item, index (`${index}-${item.term}`)}
							<div>
								<dt class="font-medium text-gray-900 dark:text-gray-100">{item.term}</dt>
								<dd class="text-gray-700 dark:text-gray-300">{item.explanation}</dd>
							</div>
						{/each}
					</dl>
				</section>
				<section>
					<h3 class="font-semibold text-gray-900 dark:text-gray-100">{$i18n.t('Conclusion')}</h3>
					<p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">
						{summary.conclusion}
					</p>
				</section>
			</article>
		{/if}
	</section>
</div>
