module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Customize as needed
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation only
        'style', // Formatting, no code change
        'refactor', // Code change that neither fixes bug nor adds feature
        'perf', // Performance improvement
        'test', // Adding tests
        'chore', // Maintenance tasks
        'ci', // CI/CD changes
        'build', // Build system changes
        'revert', // Revert previous commit
      ],
    ],
    'subject-case': [0], // Disable subject case check (allow any case)
  },
};
