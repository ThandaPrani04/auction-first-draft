module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react/jsx-no-target-blank': 'off',
    // This is a plain-JS project with no PropTypes or TypeScript anywhere;
    // the rule only fired once components were split out of the single
    // propless God component, and adding PropTypes throughout would be noise.
    'react/prop-types': 'off',
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
  overrides: [
    {
      // Build config runs in Node, not the browser, so it legitimately uses
      // `process`.
      files: ['vite.config.js'],
      env: { node: true, browser: false },
    },
  ],
}
