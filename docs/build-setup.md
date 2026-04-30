# 빌드 설정 및 배포 가이드

## 개요

`@codehong-dev/hongfield`는 Android(AAR)와 iOS(XCFramework)를 모두 지원하는 Native–React Native 브릿지 라이브러리입니다.

- **패키지명**: `@codehong-dev/hongfield`
- **현재 버전**: `package.json`의 `version` 필드 참고
- **레지스트리**: GitHub Packages (`https://npm.pkg.github.com`)
- **CLI 진입점**: `bin/bridge-lib.js` (`npx hongfield` 명령으로 실행)
- **TypeScript 빌드 결과물**: `dist/` (진입점: `dist/index.js`, 타입: `dist/index.d.ts`)

---

## 사전 요구사항

| 항목 | 최소 버전 | 비고 |
|------|-----------|------|
| Node.js | 22.11.0 이상 | `engines.node` 기준 |
| React Native | 0.84.0 이상 | peerDependency |
| React | 19.0.0 이상 | peerDependency |
| Java / JDK | 17 | Android 빌드 (`compileOptions` JavaVersion.VERSION_17) |
| Kotlin | - | `kotlinOptions.jvmTarget = '17'` |
| Android Gradle | - | `android/build.gradle` 기준 |
| Xcode | - | iOS XCFramework 빌드 (`xcodebuild` 필요) |
| CocoaPods | - | iOS 워크스페이스 생성 (`pod install`) |

---

## 디렉터리 구조

```
app-lib-bridge-react-native/
├── src/                        # TypeScript 소스
├── dist/                       # tsc 빌드 결과물 (자동 생성)
│   ├── index.js
│   └── index.d.ts
├── bin/
│   └── bridge-lib.js           # hongfield CLI 진입점
├── scripts/
│   ├── packageAndroid.js       # Android AAR 빌드 로직
│   ├── publishAndroid.js       # Android Maven 배포 로직
│   ├── packageIos.js           # iOS XCFramework 빌드 로직
│   └── publishIos.js           # iOS CocoaPods 로컬 배포 로직
├── android/
│   └── bridge-lib/             # Android 라이브러리 모듈
│       └── build.gradle        # AAR 빌드 + maven-publish 설정
├── ios/
│   └── BridgeLib/              # iOS 라이브러리 소스
├── package-android.sh          # Android 빌드 + Maven 배포 래퍼 스크립트
├── package-ios.sh              # iOS XCFramework 빌드 래퍼 스크립트
├── tsconfig.json               # 앱 실행용 TypeScript 설정
├── tsconfig.lib.json           # 라이브러리 배포 빌드 전용 TypeScript 설정
└── react-native.config.js      # autolinking 소스 경로 설정
```

---

## npm 스크립트 목록

`package.json`의 `scripts` 필드에 정의된 명령어입니다.

| 명령어 | 설명 |
|--------|------|
| `npm run build` | `tsconfig.lib.json` 기준으로 `src/`를 컴파일해 `dist/`에 `.js` + `.d.ts` 파일 생성 |
| `npm run android` | `react-native run-android` — 개발용 Android 앱 실행 |
| `npm run ios` | `react-native run-ios` — 개발용 iOS 앱 실행 |
| `npm run start` | Metro 번들러 시작 |
| `npm run lint` | ESLint 실행 |
| `npm run test` | Jest 테스트 실행 |

### TypeScript 라이브러리 빌드

소스를 수정한 후에는 반드시 아래 명령으로 빌드를 다시 실행해야 변경 사항이 `dist/`에 반영됩니다.

```bash
npm run build
```

`tsconfig.lib.json` 설정 요약:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "module": "CommonJS",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["src/**/__tests__", "node_modules"]
}
```

---

## Android 빌드 및 배포 방법

### 개요

Android 빌드는 두 단계로 구성됩니다.

1. **AAR 빌드** (`npx hongfield package:android`): JS 번들 생성 후 Gradle로 AAR 파일 생성
2. **로컬 Maven 배포** (`npx hongfield publish:android`): AAR을 `~/.m2/repository`에 설치

### `package-android.sh` 사용법 (권장)

소비앱 프로젝트 루트에서 실행합니다.

```bash
# 기본 실행 (Release 빌드 + Maven 배포)
./node_modules/@codehong-dev/hongfield/package-android.sh

# Debug 빌드
./node_modules/@codehong-dev/hongfield/package-android.sh --variant Debug

# 출력 파일명 변경
./node_modules/@codehong-dev/hongfield/package-android.sh --module-name my-bridge

# Maven 저장소 경로 지정
./node_modules/@codehong-dev/hongfield/package-android.sh --repo /path/to/maven/repo

# Maven 배포 건너뛰기 (AAR 파일만 생성)
./node_modules/@codehong-dev/hongfield/package-android.sh --skip-maven
```

#### 옵션 목록

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--variant` | `Release` | 빌드 variant (`Debug` 또는 `Release`) |
| `--module-name` | `bridge-lib` | 출력 AAR 파일명 |
| `--repo` | `~/.m2/repository` | 로컬 Maven 저장소 경로 |
| `--skip-maven` | `false` | 지정 시 Maven 배포 단계를 건너뜀 |

#### 빌드 결과물 위치

```
output/android/<module-name>-<variant>.aar
# 예시: output/android/bridge-lib-release.aar
```

### hongfield CLI 직접 사용

```bash
# AAR 빌드만 실행
npx hongfield package:android --variant Release --module-name bridge-lib

# Maven 배포만 실행
npx hongfield publish:android --module-name bridge-lib --version 1.0.0

# Maven 저장소 경로 지정
npx hongfield publish:android --module-name bridge-lib --version 1.0.0 --repo /path/to/maven/repo
```

### 내부 빌드 동작 설명

`scripts/packageAndroid.js`는 아래 순서로 동작합니다.

1. `npx react-native bundle`로 JS 번들 생성 → `android/app/src/main/assets/index.android.bundle`
2. `./gradlew :bridge-lib:assemble<Variant>` 실행
3. 생성된 AAR을 소비앱의 `output/android/` 디렉터리로 복사

`scripts/publishAndroid.js`는 아래 순서로 동작합니다.

1. JS 번들 생성 → `node_modules/@codehong-dev/hongfield/android/bridge-lib/src/main/assets/`
2. `./gradlew :codehong-dev_hongfield:publishMavenAarPublicationToLocalRepository` 실행
3. `autolinking.json`을 읽어 autolinking 패키지 AAR도 함께 로컬 Maven에 설치
4. 배포된 `hongfield` POM 및 `.module` 파일에 autolinking 패키지를 transitive dependency로 주입

#### Maven 배포 좌표

| 항목 | 값 |
|------|-----|
| groupId | `com.hong.lib` |
| artifactId | `hongfield` |
| 버전 | `--version` 옵션 또는 `node_modules/@codehong-dev/hongfield/package.json` 의 `version` 값 |

배포 후 소비앱 `build.gradle`에는 아래 한 줄만 추가하면 됩니다.

```groovy
implementation("com.hong.lib:hongfield:<version>")
```

### Android Gradle 빌드 설정 요약 (`android/bridge-lib/build.gradle`)

- `namespace`: `com.bridgelib.lib`
- Java / Kotlin 호환 버전: 17
- 의존성: `react-android:0.84.1`, `hermes-android:250829098.0.9`, `appcompat:1.7.0`
- `maven-publish` 플러그인으로 로컬 Maven 배포 지원
- `packagingOptions`로 `libc++_shared.so`, `libreactnative.so`, `libjsi.so`, `libfbjni.so` 제외 (소비앱 APK 충돌 방지)

---

## iOS 빌드 및 배포 방법

### 개요

iOS 빌드는 두 단계로 구성됩니다.

1. **XCFramework 빌드** (`npx hongfield package:ios`): 시뮬레이터·디바이스 아카이브 생성 후 XCFramework 합성
2. **로컬 CocoaPods 배포** (`npx hongfield publish:ios`): XCFramework를 로컬 스펙 레포에 설치

### 사전 준비

iOS 빌드 전 CocoaPods 설치가 완료되어 있어야 합니다.

```bash
cd ios && pod install
```

`ios/app-lib-bridge-react-native.xcworkspace` 파일이 존재하지 않으면 빌드가 실패합니다.

### `package-ios.sh` 사용법 (권장)

소비앱 프로젝트 루트에서 실행합니다.

```bash
# 기본 실행 (Release 빌드)
./node_modules/@codehong-dev/hongfield/package-ios.sh

# 스킴 및 구성 지정
./node_modules/@codehong-dev/hongfield/package-ios.sh --scheme BridgeLib --configuration Release

# 출력 디렉터리 지정
./node_modules/@codehong-dev/hongfield/package-ios.sh --output /path/to/output
```

#### 옵션 목록

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--scheme` | `BridgeLib` | Xcode 스킴 이름 |
| `--configuration` | `Release` | 빌드 구성 (`Debug` 또는 `Release`) |
| `--output` | `output/ios` | 출력 디렉터리 경로 |

#### 빌드 결과물 위치

```
<output>/<scheme>.xcframework
# 예시: output/ios/BridgeLib.xcframework
```

### hongfield CLI 직접 사용

```bash
# XCFramework 빌드
npx hongfield package:ios --scheme BridgeLib --configuration Release

# 출력 경로 지정
npx hongfield package:ios --scheme BridgeLib --output /path/to/output

# CocoaPods 로컬 배포
npx hongfield publish:ios --version 1.0.0

# 옵션 전체 지정
npx hongfield publish:ios \
  --version 1.0.0 \
  --group-id com.hong.lib \
  --artifact-id hongfield \
  --repo ~/.cocoapods/local
```

### 내부 빌드 동작 설명

`scripts/packageIos.js`는 아래 순서로 동작합니다.

1. `npx react-native bundle`로 JS 번들 생성 → `ios/main.jsbundle`
2. `xcodebuild archive`로 시뮬레이터 아카이브 생성 (`generic/platform=iOS Simulator`)
3. `xcodebuild archive`로 디바이스 아카이브 생성 (`generic/platform=iOS`)
4. `xcodebuild -create-xcframework`로 두 아카이브를 합쳐 XCFramework 생성

`scripts/publishIos.js`는 아래 순서로 동작합니다.

1. `output/ios/BridgeLib.xcframework` 존재 여부 확인
2. `~/.cocoapods/local/Specs/<artifactId>/<version>/` 디렉터리에 XCFramework 복사
3. 동일 경로에 `.podspec` 파일 자동 생성

#### CocoaPods 배포 좌표 기본값

| 항목 | 값 |
|------|-----|
| groupId | `com.hong.lib` |
| artifactId | `hongfield` |
| 로컬 스펙 레포 | `~/.cocoapods/local` |

배포 후 소비앱 `Podfile`에 아래와 같이 추가합니다.

```ruby
source 'file://~/.cocoapods/local'
pod 'hongfield', '<version>'
```

---

## GitHub Packages 배포 방법

패키지는 GitHub Packages npm 레지스트리(`https://npm.pkg.github.com`)에 배포됩니다.

### 인증 설정

GitHub Personal Access Token(PAT)에 `write:packages` 권한이 필요합니다.

```bash
# ~/.npmrc 또는 프로젝트 .npmrc에 추가
//npm.pkg.github.com/:_authToken=<YOUR_GITHUB_TOKEN>
```

### 배포 실행

```bash
# TypeScript 빌드 먼저 실행
npm run build

# npm 배포
npm publish
```

`package.json`의 `publishConfig`에 따라 자동으로 GitHub Packages 레지스트리에 게시됩니다.

```json
{
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

### 배포 포함 파일

`package.json`의 `files` 필드에 정의된 항목만 배포됩니다.

```
dist/
src/
bin/
scripts/
android/bridge-lib/
ios/BridgeLib/
package-android.sh
package-ios.sh
react-native.config.js
```

---

## 버전 관리 방법

### 버전 변경

`package.json`의 `version` 필드를 직접 수정하거나 `npm version` 명령을 사용합니다.

```bash
# 패치 버전 올리기 (예: 1.0.36 → 1.0.37)
npm version patch

# 마이너 버전 올리기 (예: 1.0.36 → 1.1.0)
npm version minor

# 메이저 버전 올리기 (예: 1.0.36 → 2.0.0)
npm version major

# 버전 직접 지정
npm version 1.0.37
```

### Android Maven 배포 버전

`npx hongfield publish:android` 실행 시:

- `--version` 옵션을 지정하면 해당 버전으로 배포
- `--version` 미지정 시 `node_modules/@codehong-dev/hongfield/package.json`의 `version` 값 자동 사용

```bash
npx hongfield publish:android --version 1.0.37
```

### iOS CocoaPods 배포 버전

`npx hongfield publish:ios` 실행 시 `--version` 옵션이 필수입니다.

```bash
npx hongfield publish:ios --version 1.0.37
```

---

## IDE 자동 import 설정

### TypeScript 서버 재시작

`npm run build` 이후 자동 import가 동작하지 않으면 TypeScript 서버를 재시작합니다.

- **VS Code / Cursor**: `Cmd+Shift+P` → `TypeScript: Restart TS Server`
- **WebStorm / IntelliJ**: `File` → `Invalidate Caches`

### 자동 import 추천 활성화

VS Code / Cursor에서 패키지를 처음 사용할 때 자동 import 추천이 뜨지 않는 경우 `settings.json`에 아래 설정을 추가합니다.

```json
"typescript.preferences.includePackageJsonAutoImports": "on"
```

설정 후 `TypeScript: Restart TS Server`를 실행합니다.
