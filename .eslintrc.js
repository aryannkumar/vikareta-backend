module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
    },
    plugins: ['@typescript-eslint'],
    extends: [
        'eslint:recommended',
    ],
    env: {
        node: true,
        es6: true,
    },
    rules: {
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': 'warn', // Changed to warn instead of error
        'no-console': 'off', // Disabled for now
        'prefer-const': 'warn',
        'no-var': 'warn',
        'no-undef': 'off', // Disabled for TypeScript
        'no-control-regex': 'off',
        'no-constant-condition': 'warn',
        'no-unreachable': 'warn',
        'no-case-declarations': 'warn',
        'no-useless-escape': 'warn',
    },
    ignorePatterns: [
        'dist/',
        'node_modules/',
        '*.js',
        '*.d.ts',
    ],
};