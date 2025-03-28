/** @type {import('eslint').Linter.Config} */
module.exports = {
    extends: [
        '../../configs/build.eslintrc.json'
    ],
    parserOptions: {
        tsconfigRootDir: __dirname,
        project: 'tsconfig.json'
    },
    rules: {
        '@typescript-eslint/tslint/config': ['error', {
            rules: {
                'file-header': false
            }
        }]
    }
};
