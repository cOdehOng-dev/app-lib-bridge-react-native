'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// @codehong-dev/hongfield → Gradle 프로젝트명: codehong-dev_hongfield
const GRADLE_MODULE = 'codehong-dev_hongfield';

// autolinking 패키지를 Maven에 배포할 때 사용할 groupId
const AUTOLINKING_GROUP_ID = 'com.npm.rn';

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

/**
 * autolinking.json을 읽어 각 패키지를 빌드하고 로컬 Maven에 배포한다.
 * 순수 네이티브 소비앱이 PackageList 없이도 패키지 클래스를 사용할 수 있도록
 * AAR을 ~/.m2/repository에 설치한다.
 */
function publishAutolinkingPackages(rootDir, androidDir, gradlew, repoPath) {
  const autolinkingJsonPath = path.join(
    androidDir, 'build', 'generated', 'autolinking', 'autolinking.json'
  );
  if (!fs.existsSync(autolinkingJsonPath)) {
    console.log('[bridge-lib] autolinking.json 없음, autolinking 패키지 배포 건너뜀');
    return [];
  }

  const autolinkingConfig = JSON.parse(fs.readFileSync(autolinkingJsonPath, 'utf8'));
  const dependencies = autolinkingConfig.dependencies || {};
  const published = [];

  for (const [pkgName, pkgInfo] of Object.entries(dependencies)) {
    const android = pkgInfo.platforms && pkgInfo.platforms.android;
    if (!android || !android.sourceDir) continue;
    if (pkgName === '@codehong-dev/hongfield') continue;

    const sourceDir = android.sourceDir;
    const pkgJsonPath = path.join(rootDir, 'node_modules', pkgName, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkgVersion = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')).version;

    // 빌드된 AAR 위치: <sourceDir>/build/outputs/aar/<pkgName>-release.aar
    // settings.gradle 없는 패키지는 Gradle 복합 빌드명이 소스 디렉터리명('android')으로 결정되어
    // 태스크 이름이 맞지 않으므로, 메인 빌드 후 이미 생성된 AAR을 우선 사용한다.
    const aarDir = path.join(sourceDir, 'build', 'outputs', 'aar');
    let aarPath = path.join(aarDir, `${pkgName}-release.aar`);
    if (!fs.existsSync(aarPath)) {
      // 폴백: 디렉터리에서 *-release.aar 검색
      const releaseAars = fs.existsSync(aarDir)
        ? fs.readdirSync(aarDir).filter(f => f.endsWith('-release.aar'))
        : [];
      if (releaseAars.length > 0) {
        aarPath = path.join(aarDir, releaseAars[0]);
      } else {
        // AAR이 없으면 assembleRelease 태스크로 직접 빌드 시도
        console.log(`\n[bridge-lib] autolinking 패키지 빌드: ${pkgName}@${pkgVersion}`);
        try {
          execSync(`${gradlew} :${path.basename(sourceDir)}:assembleRelease`, { cwd: androidDir, stdio: 'inherit' });
        } catch (err) {
          console.warn(`[bridge-lib] ⚠ ${pkgName} 빌드 실패, 건너뜀: ${err.message}`);
          continue;
        }
        // 빌드 후 재검색
        const built = fs.existsSync(aarDir)
          ? fs.readdirSync(aarDir).filter(f => f.endsWith('-release.aar'))
          : [];
        if (built.length === 0) {
          console.warn(`[bridge-lib] ⚠ AAR 없음: ${aarDir}, 건너뜀`);
          continue;
        }
        aarPath = path.join(aarDir, built[0]);
      }
    }

    // 로컬 Maven에 설치: ~/.m2/repository/com/npm/rn/<pkgName>/<version>/
    const artifactId = pkgName;
    installToLocalMaven(aarPath, AUTOLINKING_GROUP_ID, artifactId, pkgVersion, repoPath);
    published.push({ groupId: AUTOLINKING_GROUP_ID, artifactId, version: pkgVersion });
    console.log(`[bridge-lib] ✓ ${pkgName}@${pkgVersion} → ${repoPath}`);
  }

  return published;
}

function installToLocalMaven(aarPath, groupId, artifactId, version, repoPath) {
  const groupPath = groupId.replace(/\./g, path.sep);
  const targetDir = path.join(repoPath, groupPath, artifactId, version);
  fs.mkdirSync(targetDir, { recursive: true });

  const baseName = `${artifactId}-${version}`;
  const destAar = path.join(targetDir, `${baseName}.aar`);
  const destPom = path.join(targetDir, `${baseName}.pom`);

  fs.copyFileSync(aarPath, destAar);

  const pom = `<?xml version="1.0" encoding="UTF-8"?>
<project xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd"
    xmlns="http://maven.apache.org/POM/4.0.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <modelVersion>4.0.0</modelVersion>
  <groupId>${groupId}</groupId>
  <artifactId>${artifactId}</artifactId>
  <version>${version}</version>
  <packaging>aar</packaging>
</project>`;
  fs.writeFileSync(destPom, pom);

  // md5 / sha1 (Gradle 캐시 무효화 방지)
  const aarBuf = fs.readFileSync(destAar);
  fs.writeFileSync(`${destAar}.md5`, crypto.createHash('md5').update(aarBuf).digest('hex'));
  fs.writeFileSync(`${destAar}.sha1`, crypto.createHash('sha1').update(aarBuf).digest('hex'));
  const pomBuf = Buffer.from(pom, 'utf8');
  fs.writeFileSync(`${destPom}.md5`, crypto.createHash('md5').update(pomBuf).digest('hex'));
  fs.writeFileSync(`${destPom}.sha1`, crypto.createHash('sha1').update(pomBuf).digest('hex'));
}

function publishAndroid({ version, repo } = {}) {
  const rootDir = findRootDir();
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const androidDir = path.join(rootDir, 'android');
  const repoPath = repo || path.join(os.homedir(), '.m2', 'repository');

  if (!version) {
    // --version 미지정 시 설치된 @codehong-dev/hongfield 버전을 사용한다.
    try {
      const pkgJson = path.join(rootDir, 'node_modules', '@codehong-dev', 'hongfield', 'package.json');
      version = JSON.parse(fs.readFileSync(pkgJson, 'utf8')).version;
      console.log(`[bridge-lib] --version 미지정: ${version} (node_modules/@codehong-dev/hongfield) 사용`);
    } catch (_) {
      console.error('[bridge-lib] 오류: --version 옵션이 필요합니다 (또는 node_modules/@codehong-dev/hongfield/package.json 누락).');
      console.error('[bridge-lib] 예시: npx hongfield publish:android --version 1.0.0');
      process.exit(1);
    }
  }

  console.log(`\n[bridge-lib] Maven 배포 시작 → ${repoPath} (version: ${version})`);

  // autolinking이 생성한 Gradle 모듈의 소스 경로 (react-native.config.js android.sourceDir 기준)
  const bridgeLibDir = path.join(rootDir, 'node_modules', '@codehong-dev', 'hongfield', 'android', 'bridge-lib');
  const assetsDir = path.join(bridgeLibDir, 'src', 'main', 'assets');

  // 1) JS 번들 빌드 → bridge-lib assets에 포함시켜 AAR에 패키징
  buildJsBundle(rootDir, assetsDir);

  // 2) 메인 AAR 빌드 및 Maven 배포
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

  console.log(`[bridge-lib] ✓ Maven 배포 완료: ${repoPath}/com/hong/lib/hongfield/${version}/`);

  // 3) autolinking 패키지 빌드 및 Maven 배포
  //    순수 네이티브 소비앱이 PackageList 없이도 패키지 클래스를 classpath에서 찾을 수 있도록
  //    각 패키지의 AAR을 로컬 Maven에 설치한다.
  console.log('\n[bridge-lib] autolinking 패키지 Maven 배포 시작...');
  const published = publishAutolinkingPackages(rootDir, androidDir, gradlew, repoPath);

  if (published.length > 0) {
    console.log('\n========================================');
    console.log(' 순수 네이티브 앱 build.gradle.kts 의존성');
    console.log('========================================');
    console.log('아래 의존성을 소비앱 build.gradle.kts에 추가하세요:\n');
    published.forEach(({ groupId, artifactId, version: v }) => {
      console.log(`  implementation("${groupId}:${artifactId}:${v}")`);
    });
    console.log('');
  }

  console.log('[bridge-lib] ✓ 전체 배포 완료\n');
}

module.exports = publishAndroid;
