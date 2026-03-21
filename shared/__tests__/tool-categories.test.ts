import { describe, test, expect } from 'bun:test';
import { resolveToolSpecifiers, TOOL_CATEGORIES, CATEGORY_NAMES } from '../tool-categories';

describe('resolveToolSpecifiers', () => {
    test('"all" returns undefined (no restriction)', () => {
        expect(resolveToolSpecifiers('all')).toBeUndefined();
    });

    test('"none" returns empty array', () => {
        expect(resolveToolSpecifiers('none')).toEqual([]);
    });

    test('single category expands to tool names', () => {
        const result = resolveToolSpecifiers('github');
        expect(result).toBeArray();
        expect(result!.length).toBe(TOOL_CATEGORIES.github.length);
        expect(result).toContain('corvid_github_star_repo');
        expect(result).toContain('corvid_github_create_pr');
    });

    test('multiple categories expand and merge', () => {
        const result = resolveToolSpecifiers('github,web');
        expect(result).toBeArray();
        expect(result!.length).toBe(TOOL_CATEGORIES.github.length + TOOL_CATEGORIES.web.length);
        expect(result).toContain('corvid_github_star_repo');
        expect(result).toContain('corvid_web_search');
    });

    test('individual tool names pass through', () => {
        const result = resolveToolSpecifiers('read_file,write_file');
        expect(result).toEqual(['read_file', 'write_file']);
    });

    test('mix of categories and tool names', () => {
        const result = resolveToolSpecifiers('web,read_file');
        expect(result).toBeArray();
        expect(result).toContain('corvid_web_search');
        expect(result).toContain('corvid_deep_research');
        expect(result).toContain('read_file');
    });

    test('deduplicates when category and individual overlap', () => {
        const result = resolveToolSpecifiers('web,corvid_web_search');
        expect(result).toBeArray();
        // Should only appear once
        expect(result!.filter(t => t === 'corvid_web_search').length).toBe(1);
    });

    test('handles whitespace in specifiers', () => {
        const result = resolveToolSpecifiers('github , web');
        expect(result).toBeArray();
        expect(result).toContain('corvid_github_star_repo');
        expect(result).toContain('corvid_web_search');
    });

    test('case insensitive', () => {
        const result = resolveToolSpecifiers('GitHub,WEB');
        expect(result).toBeArray();
        expect(result).toContain('corvid_github_star_repo');
        expect(result).toContain('corvid_web_search');
    });

    test('"all" overrides other specifiers', () => {
        expect(resolveToolSpecifiers('github,all,web')).toBeUndefined();
    });
});

describe('CATEGORY_NAMES', () => {
    test('contains expected categories', () => {
        expect(CATEGORY_NAMES).toContain('github');
        expect(CATEGORY_NAMES).toContain('memory');
        expect(CATEGORY_NAMES).toContain('code');
        expect(CATEGORY_NAMES).toContain('messaging');
        expect(CATEGORY_NAMES).toContain('work');
        expect(CATEGORY_NAMES).toContain('web');
    });
});
