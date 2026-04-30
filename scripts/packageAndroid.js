'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// __dirname → scripts/ → library root (works whether called from library itself or via node_modules)
const LIBRARY_DIR = path.resolve(__dirname, '..');

function buildJsBundle(libraryDir) {
  const assetsDir = path.join(libraryDir, 'android', 'app', 'src', 'main', 'assets');
  const resDir = path.join(libraryDir, 'android', 'app', 'src', 'main', 'res');
  fs.mkdirSync(assetsDir, { recursive: true });

  console.log('[bridge-lib] JS 번들 빌드 중...');
  execSync(
    [
      'npx react-native bundle',
      '--platform android',
      '--dev false',
      '--entry-file index.js',
      `--bundle-output ${path.join(assetsDir, 'index.android.bundle')}`,
      `--assets-dest ${resDir}`,
    ].join(' '),
    { cwd: libraryDir, stdio: 'inherit' }
  );
  console.log('[bridge-lib] ✓ JS 번들 완료');
}

function packageAndroid({ variant = 'Release', moduleName = 'bridge-lib' } = {}) {
  const libraryDir = LIBRARY_DIR;
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const androidDir = path.join(libraryDir, 'android');

  console.log(`\n[bridge-lib] Android AAR 빌드 시작: ${moduleName} (${variant})`);

  buildJsBundle(libraryDir);

  try {
    execSync(`${gradlew} :bridge-lib:assemble${variant}`, {
      cwd: androidDir,
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('[bridge-lib] 빌드 실패:', err.message);
    process.exit(1);
  }

  const aarSrc = path.join(
    androidDir,
    'bridge-lib',
    'build',
    'outputs',
    'aar',
    `bridge-lib-${variant.toLowerCase()}.aar`
  );
  // AAR은 호출 위치 기준 output/android/에 저장
  const outputDir = path.join(process.cwd(), 'output', 'android');
  const aarDest = path.join(outputDir, `${moduleName}-${variant.toLowerCase()}.aar`);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(aarSrc, aarDest);

  console.log(`[bridge-lib] ✓ AAR 생성 완료: ${aarDest}\n`);
}

module.exports = packageAndroid;
