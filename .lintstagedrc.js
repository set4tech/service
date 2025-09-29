module.exports = {
  // Type check TypeScript files
  '**/*.{ts,tsx}': () => 'npm run typecheck',

  // Lint and format TypeScript/JavaScript files
  '**/*.{js,jsx,ts,tsx}': ['eslint --fix', 'prettier --write'],

  // Format other files
  '**/*.{md,json,yml,yaml}': ['prettier --write'],
};
