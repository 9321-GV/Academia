<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import { user } from '$lib/stores';
	import BookOpen from '$lib/components/icons/BookOpen.svelte';
	import Calendar from '$lib/components/icons/Calendar.svelte';
	import ChatBubble from '$lib/components/icons/ChatBubble.svelte';
	import Cube from '$lib/components/icons/Cube.svelte';
	import Document from '$lib/components/icons/Document.svelte';
	import Home from '$lib/components/icons/Home.svelte';
	import Sparkles from '$lib/components/icons/Sparkles.svelte';
	import {
		ACADEMIA_FEATURE_LINKS,
		ACADEMIA_NAV_GROUPS,
		isAcademiaNavActive
	} from '$lib/utils/academiaDashboard';
	import { page } from '$app/stores';

	const i18n = getContext<Writable<i18nType>>('i18n');

	$: isAdmin = $user?.role === 'admin';
	$: canViewKnowledge = isAdmin || Boolean($user?.permissions?.workspace?.knowledge);
	$: canViewModels = isAdmin || Boolean($user?.permissions?.workspace?.models);
	$: featureIcons = {
		'study-practice': BookOpen,
		'pdf-summarizer': Document,
		'study-planner': Calendar
	};
	$: quickAccess = [
		{ id: 'chat', title: 'Chat', href: '/', icon: ChatBubble, visible: true },
		{
			id: 'knowledge',
			title: 'Knowledge',
			href: '/workspace/knowledge',
			icon: BookOpen,
			visible: canViewKnowledge
		},
		{
			id: 'models',
			title: 'Models',
			href: '/workspace/models',
			icon: Cube,
			visible: canViewModels
		}
	];
	$: navigationGroups = ACADEMIA_NAV_GROUPS.map((group) => ({
		...group,
		links: group.links.filter(
			(link) => link.href === '/workspace' || link.href === '/' || canViewKnowledge
		)
	}));
</script>

<svelte:head>
	<title>{$i18n.t('Academia Dashboard')} / {$i18n.t('Workspace')}</title>
	<meta
		name="description"
		content="Your AI-powered learning workspace for study, revision, and planning."
	/>
</svelte:head>

<div
	class="academia-page academia-dashboard -mx-3 -mt-1 min-h-full px-4 py-5 sm:px-6 sm:py-7 lg:px-8"
>
	<div
		class="mx-auto grid w-full max-w-[1440px] min-w-0 grid-cols-1 gap-6 lg:grid-cols-[228px_minmax(0,1fr)] lg:gap-9"
	>
		<aside
			class="academia-glass-nav h-fit rounded-2xl p-4 text-slate-100 lg:sticky lg:top-4 lg:p-5"
			aria-label={$i18n.t('Academia navigation')}
		>
			<a
				href="/workspace"
				class="mb-5 flex items-center gap-3 rounded-xl px-2 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
			>
				<span
					class="academia-brand-mark flex size-10 items-center justify-center rounded-xl text-indigo-100"
				>
					<Sparkles className="size-5" />
				</span>
				<span>
					<span class="block text-[0.95rem] font-semibold tracking-[0.01em]">Academia</span>
					<span class="mt-0.5 block text-[0.7rem] tracking-wide text-slate-400"
						>{$i18n.t('Learning workspace')}</span
					>
				</span>
			</a>

			<div class="flex flex-wrap gap-x-6 gap-y-4 lg:flex-col lg:gap-6">
				{#each navigationGroups as group (group.title)}
					<section class="min-w-0 flex-1 lg:flex-none" aria-label={$i18n.t(group.title)}>
						<h2
							class="academia-nav-group-title mb-2 px-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em]"
						>
							{$i18n.t(group.title)}
						</h2>
						<nav class="flex flex-wrap gap-1 lg:flex-col" aria-label={$i18n.t(group.title)}>
							{#each group.links as link (link.id)}
								<a
									href={link.href}
									aria-current={isAcademiaNavActive($page.url.pathname, link.href) ? 'page' : null}
									class="academia-nav-link flex min-h-10 items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-[0.82rem] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 {isAcademiaNavActive(
										$page.url.pathname,
										link.href
									)
										? 'academia-active font-medium text-white'
										: 'text-slate-300'}"
								>
									{#if link.id === 'dashboard'}
										<Home className="size-4 shrink-0" />
									{:else if link.id === 'chat'}
										<ChatBubble className="size-4 shrink-0" />
									{:else if link.id === 'knowledge'}
										<BookOpen className="size-4 shrink-0" />
									{:else if link.id === 'study-practice'}
										<Sparkles className="size-4 shrink-0" />
									{:else if link.id === 'pdf-summarizer'}
										<Document className="size-4 shrink-0" />
									{:else}
										<Calendar className="size-4 shrink-0" />
									{/if}
									<span class="whitespace-nowrap">{$i18n.t(link.title)}</span>
								</a>
							{/each}
						</nav>
					</section>
				{/each}
			</div>
		</aside>

		<main class="min-w-0">
			<header
				class="academia-glass-panel mb-7 flex flex-wrap items-end justify-between gap-4 rounded-2xl px-5 py-5 sm:mb-8 sm:px-7 sm:py-6"
			>
				<div class="max-w-3xl">
					<p class="academia-eyebrow mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em]">
						{$i18n.t('Your academic workspace')}
					</p>
					<h1
						class="text-[1.8rem] font-semibold leading-tight tracking-[-0.035em] text-white sm:text-3xl"
					>
						{$i18n.t('Welcome to Academia')}
					</h1>
					<p class="mt-2 max-w-2xl text-sm leading-6 text-indigo-100/80 sm:text-[0.95rem]">
						{$i18n.t(
							'Your AI-powered learning workspace. Study, revise, and plan your learning with tools built for college life.'
						)}
					</p>
				</div>
			</header>

			{#if canViewKnowledge}
				<section aria-labelledby="study-tools-heading">
					<div class="mb-4 flex flex-wrap items-end justify-between gap-2">
						<div>
							<h2
								id="study-tools-heading"
								class="text-lg font-semibold tracking-tight text-white sm:text-xl"
							>
								{$i18n.t('Study tools')}
							</h2>
							<p class="mt-1 text-sm text-indigo-100/75">
								{$i18n.t('Focused tools to help you prepare with confidence.')}
							</p>
						</div>
					</div>

					<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
						{#each ACADEMIA_FEATURE_LINKS as feature (feature.id)}
							{@const Icon = featureIcons[feature.id]}
							<article
								class="academia-glass-panel group flex min-h-[220px] flex-col rounded-xl p-5 transition duration-200 hover:-translate-y-0.5 sm:p-5"
							>
								<div
									class="academia-feature-icon mb-4 flex size-10 items-center justify-center rounded-xl"
								>
									<Icon className="size-5" />
								</div>
								<h3 class="text-[1.02rem] font-semibold tracking-tight text-white">
									{$i18n.t(feature.title)}
								</h3>
								<p class="mt-2 flex-1 text-[0.84rem] leading-6 text-indigo-100/75">
									{$i18n.t(feature.description)}
								</p>
								<a
									href={feature.href}
									class="academia-action-link mt-4 inline-flex w-fit items-center gap-2 rounded-lg px-3.5 py-2.5 text-[0.8rem] font-medium text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-200"
								>
									{$i18n.t(feature.action)}
									<span class="transition-transform group-hover:translate-x-0.5" aria-hidden="true"
										>→</span
									>
								</a>
							</article>
						{/each}
					</div>
				</section>
			{:else}
				<section class="academia-glass-panel rounded-xl p-5 text-sm text-indigo-50" role="status">
					{$i18n.t(
						'Study tools require Knowledge access. Contact your administrator to enable them.'
					)}
				</section>
			{/if}

			<section class="mt-8 border-t border-white/15 pt-6" aria-labelledby="quick-access-heading">
				<div class="mb-3">
					<h2 id="quick-access-heading" class="text-lg font-semibold tracking-tight text-white">
						{$i18n.t('Quick access')}
					</h2>
					<p class="mt-1 text-sm text-indigo-100/75">
						{$i18n.t('Continue with your existing Academia workspace.')}
					</p>
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{#each quickAccess.filter((item) => item.visible) as item (item.id)}
						<a
							href={item.href}
							class="academia-glass-panel group flex min-w-0 items-center gap-3 rounded-xl p-3.5 transition duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-200"
						>
							<span
								class="academia-feature-icon flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors"
							>
								<svelte:component this={item.icon} className="size-5" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block text-sm font-medium text-white">{$i18n.t(item.title)}</span>
								<span class="mt-0.5 block text-xs text-indigo-100/70">
									{#if item.id === 'chat'}
										{$i18n.t('Start or continue a conversation')}
									{:else if item.id === 'knowledge'}
										{$i18n.t('Browse your study collections')}
									{:else}
										{$i18n.t('Explore available AI models')}
									{/if}
								</span>
							</span>
							<span
								class="text-indigo-100/60 transition-transform group-hover:translate-x-0.5 group-hover:text-white"
								aria-hidden="true">→</span
							>
						</a>
					{/each}
				</div>
			</section>
		</main>
	</div>
</div>
