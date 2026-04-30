'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function findRootDir() {
  let dir = process.cwd();
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('package.json을 찾을 수 없습니다.');
}

function bundleIos({ entryFile = 'index.js' } = {}) {
  const rootDir = findRootDir();
  const bundleOutput = path.join(rootDir, 'ios', 'main.jsbundle');
  const assetsDir = path.join(rootDir, 'ios');

  console.log('[bridge-lib] iOS JS 번들 빌드 중...');
  try {
    execSync(
      [
        'npx react-native bundle',
        '--platform ios',
        '--dev false',
        `--entry-file ${entryFile}`,
        `--bundle-output ${bundleOutput}`,
        `--assets-dest ${assetsDir}`,
      ].join(' '),
      { cwd: rootDir, stdio: 'inherit' }
    );
  } catch (err) {
    console.error('[bridge-lib] iOS JS 번들 빌드 실패:', err.message);
    process.exit(1);
  }

  console.log(`[bridge-lib] ✓ iOS JS 번들 완료: ${bundleOutput}`);
}

module.exports = bundleIos;
