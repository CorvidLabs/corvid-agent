import { describe, expect, test } from 'bun:test';
import {
    tokenizeBashCommand,
    extractPathsFromCommand,
    detectDangerousPatterns,
    analyzeBashCommand,
    EXPANDED_WRITE_OPERATORS,
} from '../lib/bash-security';

// ── tokenizeBashCommand ─────────────────────────────────────────────────

describe('tokenizeBashCommand', () => {
    test('simple command', () => {
        expect(tokenizeBashCommand('ls -la /tmp')).toEqual(['ls', '-la', '/tmp']);
    });

    test('handles single-quoted paths', () => {
        expect(tokenizeBashCommand("cat '/path with spaces/file.ts'")).toEqual([
            'cat',
            '/path with spaces/file.ts',
        ]);
    });

    test('handles double-quoted paths', () => {
        expect(tokenizeBashCommand('rm "/path with spaces/file.ts"')).toEqual([
            'rm',
            '/path with spaces/file.ts',
        ]);
    });

    test('handles backslash escaping', () => {
        expect(tokenizeBashCommand('cat /path\\ with\\ spaces/file.ts')).toEqual([
            'cat',
            '/path with spaces/file.ts',
        ]);
    });

    test('handles mixed quotes', () => {
        expect(tokenizeBashCommand(`echo "hello" 'world'`)).toEqual(['echo', 'hello', 'world']);
    });

    test('splits shell operators as separate tokens', () => {
        expect(tokenizeBashCommand('cat foo | grep bar')).toEqual([
            'cat', 'foo', '|', 'grep', 'bar',
        ]);
    });

    test('handles && operator', () => {
        expect(tokenizeBashCommand('cd /tmp && ls')).toEqual([
            'cd', '/tmp', '&&', 'ls',
        ]);
    });

    test('handles redirection operators', () => {
        expect(tokenizeBashCommand('echo hello > output.txt')).toEqual([
            'echo', 'hello', '>', 'output.txt',
        ]);
    });

    test('handles >> append', () => {
        expect(tokenizeBashCommand('echo data >> log.txt')).toEqual([
            'echo', 'data', '>>', 'log.txt',
        ]);
    });

    test('empty input returns empty array', () => {
        expect(tokenizeBashCommand('')).toEqual([]);
    });

    test('backslash escaping inside double quotes', () => {
        expect(tokenizeBashCommand('"hello\\"world"')).toEqual(['hello"world']);
    });

    test('handles || operator', () => {
        expect(tokenizeBashCommand('cmd1 || cmd2')).toEqual(['cmd1', '||', 'cmd2']);
    });

    test('handles & background operator', () => {
        expect(tokenizeBashCommand('sleep 10 &')).toEqual(['sleep', '10', '&']);
    });

    test('handles semicolon separator', () => {
        expect(tokenizeBashCommand('cd /tmp; ls')).toEqual(['cd', '/tmp', ';', 'ls']);
    });

    test('handles << heredoc operator', () => {
        expect(tokenizeBashCommand('cat << EOF')).toEqual(['cat', '<<', 'EOF']);
    });

    test('handles < input redirection', () => {
        expect(tokenizeBashCommand('sort < input.txt')).toEqual(['sort', '<', 'input.txt']);
    });

    test('handles multiple operators in sequence', () => {
        expect(tokenizeBashCommand('a && b || c ; d')).toEqual([
            'a', '&&', 'b', '||', 'c', ';', 'd',
        ]);
    });

    test('whitespace-only input returns empty array', () => {
        expect(tokenizeBashCommand('   ')).toEqual([]);
    });

    test('preserves backslash escaping of special chars', () => {
        expect(tokenizeBashCommand('echo \\$HOME')).toEqual(['echo', '$HOME']);
    });

    test('handles adjacent quotes', () => {
        expect(tokenizeBashCommand('"hello""world"')).toEqual(['helloworld']);
    });
});

// ── extractPathsFromCommand ─────────────────────────────────────────────

describe('extractPathsFromCommand', () => {
    test('extracts paths, filters flags and operators', () => {
        const paths = extractPathsFromCommand('cp -r /source/dir /dest/dir');
        expect(paths).toEqual(['/source/dir', '/dest/dir']);
    });

    test('filters out common command names', () => {
        const paths = extractPathsFromCommand('grep pattern file.ts');
        expect(paths).toEqual(['pattern', 'file.ts']);
    });

    test('handles quoted paths with spaces', () => {
        const paths = extractPathsFromCommand('rm "/my path/manager.ts"');
        expect(paths).toEqual(['/my path/manager.ts']);
    });

    test('handles piped commands', () => {
        const paths = extractPathsFromCommand('cat foo.txt | grep bar');
        expect(paths).toEqual(['foo.txt', 'bar']);
    });

    test('handles semicolon-separated commands', () => {
        const paths = extractPathsFromCommand('cd /tmp ; ls somefile');
        expect(paths).toEqual(['/tmp', 'somefile']);
    });

    test('filters out flags with values', () => {
        const paths = extractPathsFromCommand('grep -n pattern file.ts');
        expect(paths).toEqual(['pattern', 'file.ts']);
    });

    test('handles empty command', () => {
        expect(extractPathsFromCommand('')).toEqual([]);
    });

    test('filters out all known command names', () => {
        const paths = extractPathsFromCommand('bash script.sh');
        expect(paths).toEqual(['script.sh']);
    });
});

// ── detectDangerousPatterns ─────────────────────────────────────────────

describe('detectDangerousPatterns', () => {
    test('detects $() command substitution', () => {
        const result = detectDangerousPatterns('rm $(echo manager.ts)');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('$()');
    });

    test('detects backtick command substitution', () => {
        const result = detectDangerousPatterns('rm `echo manager.ts`');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('backtick');
    });

    test('detects ${} variable expansion', () => {
        const result = detectDangerousPatterns('rm ${TARGET_FILE}');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('${}');
    });

    test('detects heredoc redirection', () => {
        const result = detectDangerousPatterns('cat << EOF > file.ts');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('heredoc');
    });

    test('detects eval', () => {
        const result = detectDangerousPatterns('eval "rm manager.ts"');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('eval');
    });

    test('detects exec', () => {
        const result = detectDangerousPatterns('exec rm manager.ts');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('exec');
    });

    test('detects bash -c', () => {
        const result = detectDangerousPatterns('bash -c "rm manager.ts"');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('shell -c');
    });

    test('detects sh -c', () => {
        const result = detectDangerousPatterns('sh -c "rm manager.ts"');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('shell -c');
    });

    test('safe command passes', () => {
        const result = detectDangerousPatterns('cat readme.md');
        expect(result.isDangerous).toBe(false);
    });

    test('safe command with pipe passes', () => {
        const result = detectDangerousPatterns('cat file.txt | grep pattern');
        expect(result.isDangerous).toBe(false);
    });

    test('safe command with redirect passes', () => {
        const result = detectDangerousPatterns('echo hello > output.txt');
        expect(result.isDangerous).toBe(false);
    });

    test('detects command -p bypass', () => {
        const result = detectDangerousPatterns('command -p rm .env');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('command -p');
    });

    test('detects env rm bypass', () => {
        const result = detectDangerousPatterns('env rm .env');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('env command wrapper');
    });

    test('detects env perl bypass', () => {
        const result = detectDangerousPatterns('env perl -e "print"');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('env command wrapper');
    });

    test('detects env ruby bypass', () => {
        const result = detectDangerousPatterns('env ruby -e "File.write"');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('env command wrapper');
    });

    test('detects env python bypass', () => {
        const result = detectDangerousPatterns('env python -c "import os"');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('env command wrapper');
    });

    test('detects env node bypass', () => {
        const result = detectDangerousPatterns('env node -e "require(\'fs\').writeFileSync(\'.env\', \'\')"');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('env command wrapper');
    });

    test('detects env bun bypass', () => {
        const result = detectDangerousPatterns('env bun -e "await Bun.write(\'.env\', \'\')"');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('env command wrapper');
    });

    test('detects env bash bypass', () => {
        const result = detectDangerousPatterns('env bash -c "rm .env"');
        expect(result.isDangerous).toBe(true);
        // Detected as shell -c invocation (checked before env wrapper) — still blocked
        expect(result.reason).toContain('shell -c');
    });

    test('detects zsh -c invocation', () => {
        const result = detectDangerousPatterns('zsh -c "rm .env"');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('shell -c');
    });

    test('detects find -delete', () => {
        const result = detectDangerousPatterns('find /app -name "*.env" -delete');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('find');
    });

    test('detects find -exec', () => {
        const result = detectDangerousPatterns('find . -name ".env" -exec rm {} \\;');
        expect(result.isDangerous).toBe(true);
        expect(result.reason).toContain('find');
    });

    test('nested $() is detected', () => {
        const result = detectDangerousPatterns('echo $(cat $(whoami))');
        expect(result.isDangerous).toBe(true);
    });
});

// ── analyzeBashCommand ──────────────────────────────────────────────────

describe('analyzeBashCommand', () => {
    test('returns full analysis for a simple command', () => {
        const result = analyzeBashCommand('rm /tmp/file.txt');
        expect(result.tokens).toEqual(['rm', '/tmp/file.txt']);
        expect(result.paths).toEqual(['/tmp/file.txt']);
        expect(result.hasDangerousPatterns).toBe(false);
    });

    test('detects bypass via quoted protected path', () => {
        const result = analyzeBashCommand(`rm '/some/path/manager.ts'`);
        expect(result.paths).toContain('/some/path/manager.ts');
    });

    test('detects bypass via eval wrapping', () => {
        const result = analyzeBashCommand('eval "rm manager.ts"');
        expect(result.hasDangerousPatterns).toBe(true);
        expect(result.reason).toContain('eval');
    });

    test('detects bypass via command substitution', () => {
        const result = analyzeBashCommand('rm $(printf "manager.ts")');
        expect(result.hasDangerousPatterns).toBe(true);
    });
});

// ── EXPANDED_WRITE_OPERATORS regex ──────────────────────────────────────

describe('EXPANDED_WRITE_OPERATORS', () => {
    test('matches redirect operators', () => {
        expect(EXPANDED_WRITE_OPERATORS.test('echo data > file.txt')).toBe(true);
        expect(EXPANDED_WRITE_OPERATORS.test('echo data >> file.txt')).toBe(true);
    });

    test('matches rm command', () => {
        expect(EXPANDED_WRITE_OPERATORS.test('rm file.txt')).toBe(true);
    });

    test('matches mv command', () => {
        expect(EXPANDED_WRITE_OPERATORS.test('mv a.txt b.txt')).toBe(true);
    });

    test('matches sed -i', () => {
        expect(EXPANDED_WRITE_OPERATORS.test('sed -i s/a/b/ file.txt')).toBe(true);
    });

    test('matches tee', () => {
        expect(EXPANDED_WRITE_OPERATORS.test('echo data | tee file.txt')).toBe(true);
    });

    test('does not match read-only commands', () => {
        expect(EXPANDED_WRITE_OPERATORS.test('cat file.txt')).toBe(false);
        expect(EXPANDED_WRITE_OPERATORS.test('grep pattern file.txt')).toBe(false);
        expect(EXPANDED_WRITE_OPERATORS.test('ls -la')).toBe(false);
    });

    test('matches ruby -e', () => {
        expect(EXPANDED_WRITE_OPERATORS.test('ruby -e \'File.write(".env", "")\'')).toBe(true);
    });

    test('matches ruby -i', () => {
        expect(EXPANDED_WRITE_OPERATORS.test('ruby -i.bak script.rb')).toBe(true);
    });

    test('matches php -r', () => {
        expect(EXPANDED_WRITE_OPERATORS.test('php -r \'file_put_contents(".env", "")\'')).toBe(true);
    });

    test('matches command -p', () => {
        expect(EXPANDED_WRITE_OPERATORS.test('command -p rm .env')).toBe(true);
    });

    test('perl -pi is already caught by perl -', () => {
        expect(EXPANDED_WRITE_OPERATORS.test('perl -pi -e \'s/x/y/\' .env')).toBe(true);
    });

    test('matches find -delete', () => {
        expect(EXPANDED_WRITE_OPERATORS.test('find /app -name "*.env" -delete')).toBe(true);
    });

    test('matches find -exec', () => {
        expect(EXPANDED_WRITE_OPERATORS.test('find . -name ".env" -exec rm {} \\;')).toBe(true);
    });

    test('does not match safe find command', () => {
        expect(EXPANDED_WRITE_OPERATORS.test('find . -name "*.ts" -print')).toBe(false);
    });
});
