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

function packageAndroid({ variant = 'Release', moduleName = 'bridge-lib' } = {}) {
  const rootDir = findRootDir();
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const androidDir = path.join(rootDir, 'android');

  console.log(`\n[bridge-lib] Android AAR 빌드 시작: ${moduleName} (${variant})`);

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
  const outputDir = path.join(rootDir, 'output', 'android');
  const aarDest = path.join(outputDir, `${moduleName}-${variant.toLowerCase()}.aar`);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(aarSrc, aarDest);

  console.log(`[bridge-lib] ✓ AAR 생성 완료: ${aarDest}\n`);
}

module.exports = packageAndroid;
