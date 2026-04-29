'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function findRootDir() {
  let dir = process.cwd();
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('package.json을 찾을 수 없습니다.');
}

function writePodspec({ rootDir, groupId, artifactId, version, xcframeworkPath }) {
  const podspecContent = `Pod::Spec.new do |s|
  s.name         = '${artifactId}'
  s.version      = '${version}'
  s.summary      = 'Native-React Native bridge XCFramework'
  s.homepage     = 'https://github.com/codehong-dev/${artifactId}'
  s.license      = { :type => 'MIT' }
  s.author       = { '${groupId}' => 'noreply@${groupId}' }
  s.platform     = :ios, '13.0'
  s.vendored_frameworks = '${xcframeworkPath}'
  s.preserve_paths = '${xcframeworkPath}'
end
`;
  const podspecPath = path.join(rootDir, `${artifactId}.podspec`);
  fs.writeFileSync(podspecPath, podspecContent, 'utf-8');
  return podspecPath;
}

function publishIos({ moduleName = 'bridge-lib', repo, groupId = 'com.hong.lib', artifactId = 'hongfield', version } = {}) {
  if (!version) {
    console.error('[bridge-lib] 오류: --version 옵션이 필요합니다.');
    console.error('[bridge-lib] 예시: npx hongfield publish:ios --version 1.0.0');
    process.exit(1);
  }

  const rootDir = findRootDir();
  const repoPath = repo || path.join(os.homedir(), '.cocoapods', 'local');
  const xcframeworkPath = path.join(rootDir, 'output', 'ios', `BridgeLib.xcframework`);

  if (!fs.existsSync(xcframeworkPath)) {
    console.error(`[bridge-lib] 오류: XCFramework를 찾을 수 없습니다: ${xcframeworkPath}`);
    console.error('[bridge-lib] 먼저 package:ios 명령을 실행하세요.');
    process.exit(1);
  }

  console.log(`\n[bridge-lib] CocoaPods 로컬 배포 시작 → ${repoPath}`);
  console.log(`[bridge-lib] groupId: ${groupId} / artifactId: ${artifactId} / version: ${version}`);

  const specDir = path.join(repoPath, 'Specs', artifactId, version);
  fs.mkdirSync(specDir, { recursive: true });

  const xcframeworkDest = path.join(specDir, `${artifactId}.xcframework`);

  try {
    if (fs.existsSync(xcframeworkDest)) {
      execSync(`rm -rf "${xcframeworkDest}"`, { stdio: 'inherit' });
    }
    execSync(`cp -R "${xcframeworkPath}" "${xcframeworkDest}"`, { stdio: 'inherit' });

    const podspecPath = writePodspec({
      rootDir: specDir,
      groupId,
      artifactId,
      version,
      xcframeworkPath: `${artifactId}.xcframework`,
    });

    console.log(`[bridge-lib] ✓ podspec 생성: ${podspecPath}`);
  } catch (err) {
    console.error('[bridge-lib] CocoaPods 배포 실패:', err.message);
    process.exit(1);
  }

  console.log(`[bridge-lib] ✓ CocoaPods 로컬 배포 완료: ${specDir}\n`);
  console.log('[bridge-lib] 사용 방법 (Podfile):');
  console.log(`  source 'file://${repoPath}'`);
  console.log(`  pod '${artifactId}', '${version}'\n`);
}

module.exports = publishIos;
