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

function findBridgeLibAssetsDir(androidDir, moduleName) {
  const settingsGradle = path.join(androidDir, 'settings.gradle');
  if (!fs.existsSync(settingsGradle)) {
    throw new Error(`settings.gradle를 찾을 수 없습니다: ${settingsGradle}`);
  }

  const content = fs.readFileSync(settingsGradle, 'utf8');
  const regex = new RegExp(
    `project\\s*\\(':${moduleName}'\\)\\s*\\.projectDir\\s*=\\s*new File\\([^,]+,\\s*['"]([^'"]+)['"]\\)`
  );
  const match = content.match(regex);

  if (!match) {
    throw new Error(
      `settings.gradle에서 ':${moduleName}' 프로젝트 경로를 찾을 수 없습니다.\n` +
      `settings.gradle에 다음 형식의 설정이 필요합니다:\n` +
      `  project(':${moduleName}').projectDir = new File(rootProject.projectDir, '<경로>')`
    );
  }

  // rootProject.projectDir = androidDir이므로 상대경로를 androidDir 기준으로 resolve
  const libDir = path.resolve(androidDir, match[1]);
  return path.join(libDir, 'src', 'main', 'assets');
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

function publishAndroid({ moduleName = 'bridge-lib', version, repo } = {}) {
  const rootDir = findRootDir();
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const androidDir = path.join(rootDir, 'android');
  const repoPath = repo || path.join(os.homedir(), '.m2', 'repository');

  if (!version) {
    console.error('[bridge-lib] 오류: --version 옵션이 필요합니다.');
    console.error('[bridge-lib] 예시: npx hongfield publish:android --module-name bridgelib --version 1.0.0');
    process.exit(1);
  }

  console.log(`\n[bridge-lib] Maven 배포 시작 → ${repoPath} (version: ${version})`);

  // 1) JS 번들 빌드 → bridge-lib 라이브러리 assets에 포함시켜 AAR에 패키징
  const bridgeLibAssetsDir = findBridgeLibAssetsDir(androidDir, moduleName);
  buildJsBundle(rootDir, bridgeLibAssetsDir);

  // 2) AAR + 번들 Maven 배포
  try {
    execSync(
      `${gradlew} :${moduleName}:publishMavenAarPublicationToLocalRepository -PmavenRepoPath=${repoPath} -PlibVersion=${version}`,
      { cwd: androidDir, stdio: 'inherit' }
    );
  } catch (err) {
    console.error('[bridge-lib] Maven 배포 실패:', err.message);
    process.exit(1);
  }

  console.log(`[bridge-lib] ✓ Maven 배포 완료: ${repoPath}/com/hong/lib/hongfield/${version}/\n`);
}

module.exports = publishAndroid;
