'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// @codehong-dev/hongfield → Gradle 프로젝트명: codehong-dev_hongfield
const GRADLE_MODULE = 'codehong-dev_hongfield';

function findRootDir() {
  let dir = process.cwd();
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('package.json을 찾을 수 없습니다.');
}

function buildJsBundle(rootDir, assetsDir) {
  fs.mkdirSync(assetsDir, { recursive: true });

  console.log('[bridge-lib] JS 번들 빌드 중...');
  execSync(
    [
      'npx react-native bundle',
      '--platform android',
      '--dev false',
      '--entry-file index.js',
      `--bundle-output ${path.join(assetsDir, 'index.android.bundle')}`,
      `--assets-dest ${path.join(assetsDir, '..', '..', 'res')}`,
    ].join(' '),
    { cwd: rootDir, stdio: 'inherit' }
  );
  console.log('[bridge-lib] ✓ JS 번들 완료');
}

function publishAndroid({ version, repo } = {}) {
  const rootDir = findRootDir();
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const androidDir = path.join(rootDir, 'android');
  const repoPath = repo || path.join(os.homedir(), '.m2', 'repository');

  if (!version) {
    console.error('[bridge-lib] 오류: --version 옵션이 필요합니다.');
    console.error('[bridge-lib] 예시: npx hongfield publish:android --version 1.0.0');
    process.exit(1);
  }

  console.log(`\n[bridge-lib] Maven 배포 시작 → ${repoPath} (version: ${version})`);

  // autolinking이 생성한 Gradle 모듈의 소스 경로 (react-native.config.js android.sourceDir 기준)
  const bridgeLibDir = path.join(rootDir, 'node_modules', '@codehong-dev', 'hongfield', 'android', 'bridge-lib');
  const assetsDir = path.join(bridgeLibDir, 'src', 'main', 'assets');

  // 1) JS 번들 빌드 → bridge-lib assets에 포함시켜 AAR에 패키징
  buildJsBundle(rootDir, assetsDir);

  // 2) AAR 빌드 및 Maven 배포
  //    externalNativeBuild가 bridge-lib/src/main/jni/CMakeLists.txt를 사용해
  //    libappmodules.so를 빌드하고 AAR에 자동으로 패키징한다.
  //    libappmodules.so는 javaModuleProvider를 설정해 DeviceInfo 등 코어 TurboModule을 활성화한다.
  try {
    execSync(
      `${gradlew} :${GRADLE_MODULE}:publishMavenAarPublicationToLocalRepository -PmavenRepoPath=${repoPath} -PlibVersion=${version}`,
      { cwd: androidDir, stdio: 'inherit' }
    );
  } catch (err) {
    console.error('[bridge-lib] Maven 배포 실패:', err.message);
    process.exit(1);
  }

  console.log(`[bridge-lib] ✓ Maven 배포 완료: ${repoPath}/com/hong/lib/hongfield/${version}/\n`);
}

module.exports = publishAndroid;
