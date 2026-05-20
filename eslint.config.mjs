import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [
  ...nextVitals,
  {
    ignores: ['.next/**', '.mastra/**', 'node_modules/**', 'dist/**', 'coverage/**'],
  },
];

export default eslintConfig;
