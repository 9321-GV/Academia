import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
import {
	ACADEMIA_FEATURE_LINKS,
	ACADEMIA_NAV_GROUPS,
	ACADEMIA_QUICK_ACCESS_LINKS,
	isAcademiaNavActive
} from './academiaDashboard';

describe('Academia dashboard navigation', () => {
	it('compiles the existing Workspace landing route as a Svelte dashboard', () => {
		const routePath = new URL('../../routes/(app)/workspace/+page.svelte', import.meta.url);
		const source = readFileSync(routePath, 'utf8');

		expect(() => compile(source, { filename: routePath.pathname })).not.toThrow();
		expect(source).toContain('Welcome to Academia');
		expect(source).toContain('Study tools');
		expect(source).toContain('Quick access');
	});

	it('links each academic feature to its existing route', () => {
		expect(ACADEMIA_FEATURE_LINKS.map(({ id, href }) => [id, href])).toEqual([
			['study-practice', '/workspace/study-practice'],
			['pdf-summarizer', '/workspace/pdf-summarizer'],
			['study-planner', '/workspace/study-planner']
		]);
	});

	it('provides working Chat, Knowledge, and Models destinations', () => {
		expect(ACADEMIA_QUICK_ACCESS_LINKS.map(({ id, href }) => [id, href])).toEqual([
			['chat', '/'],
			['knowledge', '/workspace/knowledge'],
			['models', '/workspace/models']
		]);
	});

	it('includes Dashboard and inherited destinations in the Academia navigation', () => {
		expect(ACADEMIA_NAV_GROUPS[0].links.map(({ href }) => href)).toEqual([
			'/workspace',
			'/',
			'/workspace/knowledge'
		]);
	});

	it('activates only exact dashboard navigation and nested workspace destinations', () => {
		expect(isAcademiaNavActive('/workspace', '/workspace')).toBe(true);
		expect(isAcademiaNavActive('/workspace/study-planner', '/workspace')).toBe(false);
		expect(isAcademiaNavActive('/workspace/study-planner', '/workspace/study-planner')).toBe(true);
		expect(isAcademiaNavActive('/workspace/knowledge/create', '/workspace/knowledge')).toBe(true);
		expect(isAcademiaNavActive('/workspace', '/')).toBe(false);
		expect(isAcademiaNavActive('/', '/')).toBe(true);
	});
});
