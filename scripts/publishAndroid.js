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

function publishAndroid({ moduleName = 'bridge-lib', version, repo } = {}) {
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

  try {
    execSync(
      `${gradlew} :${moduleName}:publishMavenAarPublicationToLocalRepository -PmavenRepoPath=${repoPath} -PlibVersion=${version}`,
      { cwd: androidDir, stdio: 'inherit' }
    );
  } catch (err) {
    console.error('[bridge-lib] Maven 배포 실패:', err.message);
    process.exit(1);
  }

  console.log(`[bridge-lib] ✓ Maven 배포 완료: ${repoPath}/com/hong/lib/hongfield/\n`);
}

module.exports = publishAndroid;
