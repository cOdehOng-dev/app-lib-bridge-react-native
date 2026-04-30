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

function bundleAndroid({ entryFile = 'index.js' } = {}) {
  const rootDir = findRootDir();
  const bridgeLibDir = path.join(
    rootDir, 'node_modules', '@codehong-dev', 'hongfield', 'android', 'bridge-lib'
  );
  const assetsDir = path.join(bridgeLibDir, 'src', 'main', 'assets');

  fs.mkdirSync(assetsDir, { recursive: true });

  console.log('[bridge-lib] JS 번들 빌드 중...');
  try {
    execSync(
      [
        'npx react-native bundle',
        '--platform android',
        '--dev false',
        `--entry-file ${entryFile}`,
        `--bundle-output ${path.join(assetsDir, 'index.android.bundle')}`,
        `--assets-dest ${path.join(assetsDir, '..', '..', 'res')}`,
      ].join(' '),
      { cwd: rootDir, stdio: 'inherit' }
    );
  } catch (err) {
    console.error('[bridge-lib] JS 번들 빌드 실패:', err.message);
    process.exit(1);
  }

  console.log(`[bridge-lib] ✓ JS 번들 완료: ${path.join(assetsDir, 'index.android.bundle')}`);
}

module.exports = bundleAndroid;
