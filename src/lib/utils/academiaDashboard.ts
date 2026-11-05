export const ACADEMIA_FEATURE_LINKS = [
	{
		id: 'study-practice',
		title: 'Study Practice',
		description: 'Practice MCQs and viva questions from your study material.',
		action: 'Start Practicing',
		href: '/workspace/study-practice'
	},
	{
		id: 'pdf-summarizer',
		title: 'PDF Summarizer',
		description: 'Turn lengthy academic PDFs into structured, easy-to-revise summaries.',
		action: 'Summarize PDF',
		href: '/workspace/pdf-summarizer'
	},
	{
		id: 'study-planner',
		title: 'AI Study Planner',
		description: 'Build a realistic study timetable based on your subjects and exam schedule.',
		action: 'Create Study Plan',
		href: '/workspace/study-planner'
	}
] as const;

export const ACADEMIA_QUICK_ACCESS_LINKS = [
	{ id: 'chat', title: 'Chat', href: '/' },
	{ id: 'knowledge', title: 'Knowledge', href: '/workspace/knowledge' },
	{ id: 'models', title: 'Models', href: '/workspace/models' }
] as const;

export const ACADEMIA_NAV_GROUPS = [
	{
		title: 'Academia',
		links: [
			{ id: 'dashboard', title: 'Dashboard', href: '/workspace' },
			{ id: 'chat', title: 'Chat', href: '/' },
			{ id: 'knowledge', title: 'Knowledge', href: '/workspace/knowledge' }
		]
	},
	{
		title: 'Study Tools',
		links: ACADEMIA_FEATURE_LINKS.map(({ id, title, href }) => ({ id, title, href }))
	}
] as const;

export const isAcademiaNavActive = (pathname: string, href: string): boolean =>
	href === '/workspace'
		? pathname === href
		: pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
