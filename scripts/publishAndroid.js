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
 * autolinking.json을 읽어 각 패키지 AAR을 로컬 Maven에 배포한다.
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
    // AAR 파일명은 npm 패키지명과 동일하다. settings.gradle이 없는 패키지는
    // Gradle 복합 빌드명이 디렉터리명('android')으로 결정되므로
    // assembleRelease 태스크 대신 메인 빌드 후 이미 생성된 AAR을 우선 사용한다.
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
        // AAR이 없으면 assembleRelease 태스크로 직접 빌드 시도.
        // autolinking.json의 projectName 필드를 우선 사용하고,
        // 없으면 npm 패키지명을 Gradle 프로젝트명으로 사용한다.
        // (path.basename(sourceDir)은 항상 'android'가 되므로 사용하지 않는다.)
        const gradleProject = android.projectName || pkgName;
        console.log(`\n[bridge-lib] autolinking 패키지 빌드: ${pkgName}@${pkgVersion}`);
        try {
          execSync(`${gradlew} :${gradleProject}:assembleRelease`, { cwd: androidDir, stdio: 'inherit' });
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
    installToLocalMaven(aarPath, AUTOLINKING_GROUP_ID, pkgName, pkgVersion, repoPath);
    published.push({ groupId: AUTOLINKING_GROUP_ID, artifactId: pkgName, version: pkgVersion });
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

  writeChecksums(destAar, fs.readFileSync(destAar));
  writeChecksums(destPom, Buffer.from(pom, 'utf8'));
}

/**
 * autolinking 패키지들을 hongfield POM / .module 파일의 transitive dependency로 주입한다.
 *
 * Gradle maven-publish가 생성한 POM에는 autolinking 패키지가 포함되지 않는다.
 * (autolinking 패키지는 bridge-lib 의 Gradle 의존성이 아니라 :app 의 의존성이기 때문)
 * 배포 후 POM과 .module 파일을 직접 수정하여 transitive dep을 삽입한다.
 */
function injectTransitiveDeps(repoPath, libVersion, deps) {
  if (deps.length === 0) return;

  const libDir = path.join(repoPath, 'com', 'hong', 'lib', 'hongfield', libVersion);
  const baseName = `hongfield-${libVersion}`;

  // ── POM 수정 ──────────────────────────────────────────────────────────────
  const pomPath = path.join(libDir, `${baseName}.pom`);
  if (fs.existsSync(pomPath)) {
    let pom = fs.readFileSync(pomPath, 'utf8');

    const newDepsXml = deps.map(({ groupId, artifactId, version }) =>
      `    <dependency>\n` +
      `      <groupId>${groupId}</groupId>\n` +
      `      <artifactId>${artifactId}</artifactId>\n` +
      `      <version>${version}</version>\n` +
      `      <scope>runtime</scope>\n` +
      `    </dependency>`
    ).join('\n');

    if (pom.includes('<dependencies>')) {
      pom = pom.replace('</dependencies>', `${newDepsXml}\n  </dependencies>`);
    } else {
      pom = pom.replace('</project>', `  <dependencies>\n${newDepsXml}\n  </dependencies>\n</project>`);
    }

    fs.writeFileSync(pomPath, pom);
    writeChecksums(pomPath, Buffer.from(pom, 'utf8'));
    console.log(`[bridge-lib] ✓ POM transitive dep 주입 완료: ${pomPath}`);
  }

  // ── .module 수정 (Gradle Metadata — POM보다 우선순위가 높으므로 반드시 수정) ──
  const modulePath = path.join(libDir, `${baseName}.module`);
  if (fs.existsSync(modulePath)) {
    const moduleJson = JSON.parse(fs.readFileSync(modulePath, 'utf8'));

    const newDeps = deps.map(({ groupId, artifactId, version }) => ({
      group: groupId,
      module: artifactId,
      version: { requires: version },
    }));

    (moduleJson.variants || []).forEach(variant => {
      if (!Array.isArray(variant.dependencies)) variant.dependencies = [];
      // 중복 방지: 이미 주입된 항목은 건너뜀
      for (const dep of newDeps) {
        const exists = variant.dependencies.some(
          d => d.group === dep.group && d.module === dep.module
        );
        if (!exists) variant.dependencies.push(dep);
      }
    });

    const moduleContent = JSON.stringify(moduleJson, null, 2);
    fs.writeFileSync(modulePath, moduleContent);
    writeChecksums(modulePath, Buffer.from(moduleContent, 'utf8'));
    console.log(`[bridge-lib] ✓ .module transitive dep 주입 완료: ${modulePath}`);
  }
}

function writeChecksums(filePath, buf) {
  fs.writeFileSync(`${filePath}.md5`, crypto.createHash('md5').update(buf).digest('hex'));
  fs.writeFileSync(`${filePath}.sha1`, crypto.createHash('sha1').update(buf).digest('hex'));
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

  // 3) autolinking 패키지 AAR을 로컬 Maven에 설치
  console.log('\n[bridge-lib] autolinking 패키지 Maven 배포 시작...');
  const published = publishAutolinkingPackages(rootDir, androidDir, gradlew, repoPath);

  // 4) 배포된 hongfield POM / .module 파일에 autolinking 패키지를 transitive dep으로 주입
  //    (autolinking 패키지는 bridge-lib의 Gradle 의존성이 아니므로 Gradle이 자동으로 POM에 추가하지 않음)
  if (published.length > 0) {
    console.log('\n[bridge-lib] hongfield POM / .module에 transitive dep 주입 중...');
    injectTransitiveDeps(repoPath, version, published);
  }

  console.log('[bridge-lib] ✓ 전체 배포 완료\n');
  console.log('[bridge-lib] 소비앱에는 아래 의존성 하나만 추가하세요:');
  console.log(`[bridge-lib]   implementation("com.hong.lib:hongfield:${version}")\n`);
}

module.exports = publishAndroid;
