'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'];

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

// app/build 하위에서 libappmodules.so 파일을 ABI별로 탐색
function findAppModulesSo(appBuildDir) {
  const result = {};

  function search(dir) {
    if (!fs.existsSync(dir)) return;
    let items;
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        search(fullPath);
      } else if (item.isFile() && item.name === 'libappmodules.so') {
        const abi = path.basename(path.dirname(fullPath));
        if (ABIS.includes(abi) && !result[abi]) {
          result[abi] = fullPath;
        }
      }
    }
  }

  search(appBuildDir);
  return result;
}

function buildNativeLibs(gradlew, androidDir) {
  console.log('\n[bridge-lib] Native 라이브러리 빌드 중 (:app:externalNativeBuildRelease)...');
  try {
    execSync(
      `${gradlew} :app:externalNativeBuildRelease`,
      { cwd: androidDir, stdio: 'inherit' }
    );
  } catch (err) {
    console.error('[bridge-lib] Native 빌드 실패:', err.message);
    process.exit(1);
  }
}

function copyNativeLibsToJniLibs(androidDir, jniLibsDir) {
  const appBuildDir = path.join(androidDir, 'app', 'build');
  const soByAbi = findAppModulesSo(appBuildDir);
  const foundAbis = Object.keys(soByAbi);

  if (foundAbis.length === 0) {
    console.error(
      '[bridge-lib] 오류: libappmodules.so를 찾을 수 없습니다.\n' +
      '  :app:externalNativeBuildRelease 결과를 확인하세요.'
    );
    process.exit(1);
  }

  for (const [abi, soFile] of Object.entries(soByAbi)) {
    const destDir = path.join(jniLibsDir, abi);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(soFile, path.join(destDir, 'libappmodules.so'));
    console.log(`[bridge-lib] ✓ ${abi}/libappmodules.so → jniLibs`);
  }
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
  const jniLibsDir = path.join(bridgeLibDir, 'src', 'main', 'jniLibs');

  // 1) JS 번들 빌드 → bridge-lib assets에 포함시켜 AAR에 패키징
  buildJsBundle(rootDir, assetsDir);

  // 2) :app 모듈 Native 빌드 → libappmodules.so 생성
  //    javaModuleProvider 함수 포인터를 설정하는 SO로, DeviceInfo 등 코어 TurboModule 조회에 필요
  buildNativeLibs(gradlew, androidDir);
  copyNativeLibsToJniLibs(androidDir, jniLibsDir);

  // 3) AAR + 번들 + libappmodules.so Maven 배포
  //    autolinking이 만든 :codehong-dev_hongfield 모듈을 사용 (:bridgelib과 소스 충돌 방지)
  try {
    execSync(
      `${gradlew} :${GRADLE_MODULE}:publishMavenAarPublicationToLocalRepository -PmavenRepoPath=${repoPath} -PlibVersion=${version}`,
      { cwd: androidDir, stdio: 'inherit' }
    );
  } catch (err) {
    fs.rmSync(jniLibsDir, { recursive: true, force: true });
    console.error('[bridge-lib] Maven 배포 실패:', err.message);
    process.exit(1);
  }

  // 4) jniLibs 정리 (node_modules 임시 수정 복원)
  fs.rmSync(jniLibsDir, { recursive: true, force: true });

  console.log(`[bridge-lib] ✓ Maven 배포 완료: ${repoPath}/com/hong/lib/hongfield/${version}/\n`);
}

module.exports = publishAndroid;
