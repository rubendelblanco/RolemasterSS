/** @type {import('jest').Config} */
export default {
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.js'],
    moduleFileExtensions: ['js', 'json'],
    transform: {},
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    verbose: true,
    injectGlobals: true,
    collectCoverageFrom: [
        'module/**/*.js',
        '!module/**/*.test.js'
    ]
};
