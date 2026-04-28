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

function packageIos({ scheme = 'BridgeLib', configuration = 'Release', output } = {}) {
  const rootDir = findRootDir();
  const outputDir = output || path.join(rootDir, 'output', 'ios');
  const archivesDir = path.join(outputDir, 'archives');
  const xcframeworkPath = path.join(outputDir, `${scheme}.xcframework`);

  const workspace = path.join(rootDir, 'ios', 'app-lib-bridge-react-native.xcworkspace');
  const simulatorArchive = path.join(archivesDir, `${scheme}-simulator.xcarchive`);
  const deviceArchive = path.join(archivesDir, `${scheme}-device.xcarchive`);

  fs.mkdirSync(archivesDir, { recursive: true });

  console.log(`\n[bridge-lib] iOS XCFramework 빌드 시작: ${scheme} (${configuration})`);

  const run = (cmd) => execSync(cmd, { cwd: rootDir, stdio: 'inherit' });

  try {
    console.log('[bridge-lib] 1/3 시뮬레이터 아카이브 빌드...');
    run([
      'xcodebuild archive',
      `-workspace "${workspace}"`,
      `-scheme ${scheme}`,
      `-configuration ${configuration}`,
      `-destination "generic/platform=iOS Simulator"`,
      `-archivePath "${simulatorArchive}"`,
      'SKIP_INSTALL=NO',
      'BUILD_LIBRARY_FOR_DISTRIBUTION=YES',
    ].join(' '));

    console.log('[bridge-lib] 2/3 디바이스 아카이브 빌드...');
    run([
      'xcodebuild archive',
      `-workspace "${workspace}"`,
      `-scheme ${scheme}`,
      `-configuration ${configuration}`,
      `-destination "generic/platform=iOS"`,
      `-archivePath "${deviceArchive}"`,
      'SKIP_INSTALL=NO',
      'BUILD_LIBRARY_FOR_DISTRIBUTION=YES',
    ].join(' '));

    console.log('[bridge-lib] 3/3 XCFramework 생성...');
    run([
      'xcodebuild -create-xcframework',
      `-framework "${simulatorArchive}/Products/Library/Frameworks/${scheme}.framework"`,
      `-framework "${deviceArchive}/Products/Library/Frameworks/${scheme}.framework"`,
      `-output "${xcframeworkPath}"`,
    ].join(' '));

  } catch (err) {
    console.error('[bridge-lib] iOS 빌드 실패:', err.message);
    process.exit(1);
  }

  console.log(`[bridge-lib] ✓ XCFramework 생성 완료: ${xcframeworkPath}\n`);
}

module.exports = packageIos;
