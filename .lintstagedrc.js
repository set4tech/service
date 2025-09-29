module.exports = {
  // Type check TypeScript files
  '**/*.{ts,tsx}': () => 'npm run typecheck',

  // Lint and format TypeScript/JavaScript files
  '**/*.{js,jsx,ts,tsx}': [
    'eslint --fix',
    'prettier --write'
  ],

  // Format other files
  '**/*.{md,json,yml,yaml}': ['prettier --write'],

  // Check for console.logs and debugger statements
  '**/*.{js,jsx,ts,tsx}': (filenames) => {
    const files = filenames.join(' ');
    return [
      `grep -l 'console\\.log' ${files} && echo "Warning: console.log found in staged files" || true`,
      `grep -l 'debugger' ${files} && echo "Error: debugger statement found" && exit 1 || true`
    ];
  }
};