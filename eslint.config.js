const { defineConfig } = require('eslint/config');
const globals = require('globals');
const js = require('@eslint/js');

module.exports = defineConfig([
    {
        files: ['**/*.{js,mjs,cjs}'],
        plugins: { js },
        extends: ['js/recommended'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: globals.node,
        },
        linterOptions: {
            reportUnusedInlineConfigs: 'error',
        },
        rules: {
            'comma-dangle': ['error', 'always-multiline'],
            'no-var': 'error',
            'prefer-const': 'error',
            quotes: ['error', 'single', { avoidEscape: true }],
        },
    },
]);
