/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
    plugins: [angular()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['src/test-setup.ts'],
        include: ['src/**/*.spec.ts'],
        reporters: ['default'],
        pool: 'forks',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            reportsDirectory: '../coverage/client',
            include: ['src/**/*.ts'],
            exclude: ['src/test-setup.ts', 'src/**/*.spec.ts'],
        },
    },
});
