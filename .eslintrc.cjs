module.exports = {
  root: true,
  extends: [
		'eslint:recommended',
		'prettier',
    'plugin:@typescript-eslint/recommended',
    'plugin:require-extensions/recommended',
  ],
  plugins: ['require-extensions'],
};
