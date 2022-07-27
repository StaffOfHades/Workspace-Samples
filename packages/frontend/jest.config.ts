module.exports = {
  displayName: 'frontend',
  preset: '../../jest.preset.js',
  transform: {
    '.*.(vue)$': '@vue/vue2-jest',
    '^.+.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'vue', 'json'],
  coverageDirectory: '../../coverage/packages/frontend',
  collectCoverageFrom: [
    '<rootDir>/components/**/*.vue',
    '<rootDir>/pages/**/*.vue',
  ],
  moduleNameMapper: {
    '^vue$': 'vue/dist/vue.common.js',
  },
  globals: {
    'ts-jest': { tsconfig: '<rootDir>/tsconfig.spec.json' },
    'vue-jest': { tsConfig: 'packages/frontend/tsconfig.spec.json' },
  },
};
