import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'graphify-out', 'examples/**/node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // `const { name: _x, ...rest } = obj` is how we drop a field without mutating.
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
);
