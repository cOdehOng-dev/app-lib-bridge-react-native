# RN 프로젝트 네이티브 설정 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** brownfield가 RN 프로젝트 내에 요구하는 android/ios 설정(RNGP autolinking, build config fields, static linking, public interface 등)을 brownfield 의존성 없이 직접 구현하고, Maven 좌표를 변경한다.

**Architecture:** `android/bridge-lib/build.gradle`에 RNGP 플러그인과 autolinking을 추가해 3rd party 네이티브 모듈이 AAR에 자동 포함되게 한다. iOS는 Podfile에 BridgeLib framework target + static linking을 추가하고, `BridgeLib.swift` public interface 파일로 XCFramework 내 Bundle 참조를 확립한다. `BundleConfig.swift`의 `Bundle.main` 참조를 `BridgeLibBundle`로 교체해 XCFramework 배포 시 JS 번들을 찾을 수 있게 한다.

**Tech Stack:** Android Gradle (Groovy), React Native Gradle Plugin (RNGP), CocoaPods, Swift, Maven Publish

---

## 파일 구조

| 파일 | 변경 유형 | 역할 |
|---|---|---|
| `android/bridge-lib/build.gradle` | 수정 | RNGP, autolinking, build config fields, Maven 좌표, POM cleanup |
| `ios/Podfile` | 수정 | static linking 기본값, BridgeLib target |
| `ios/BridgeLib/BridgeLib.swift` | **신규** | public interface, `BridgeLibBundle` 앵커 |
| `ios/BridgeLib/BundleConfig.swift` | 수정 | `Bundle.main` → `BridgeLibBundle` |
| `docs/android-integration.md` | 수정 | Maven 좌표 업데이트 |
| `docs/superpowers/specs/2026-04-28-bridge-lib-design.md` | 수정 | Maven 좌표 업데이트 |
| `docs/rn-setup.md` | 수정 | iOS Framework 타겟 생성 단계 추가 |
| `docs/ios-integration.md` | 수정 | Bundle script, Xcode build settings 보강 |

---

## Task 1: Android — `bridge-lib/build.gradle` 전면 업데이트

**Files:**
- Modify: `android/bridge-lib/build.gradle`

이 태스크는 RNGP 플러그인 추가, autolinking, build config fields, Maven 좌표 변경, POM/module.json 의존성 정리를 한 파일에서 모두 처리한다.

> **참고:** `:app` 모듈도 이미 `autolinkLibrariesWithApp()`을 사용 중이다. RNGP는 동일 프로젝트에서 여러 모듈이 autolinking을 사용하는 것을 지원한다 (brownfield가 이 패턴을 공식 지원).

- [ ] **Step 1: `build.gradle` 전체를 아래 내용으로 교체**

`android/bridge-lib/build.gradle`을 열어 전체 내용을 다음으로 교체한다:

```groovy
plugins {
    id 'com.android.library'
    id 'org.jetbrains.kotlin.android'
    id 'com.facebook.react'
    id 'maven-publish'
}

android {
    namespace 'com.bridgelib.lib'
    compileSdk rootProject.ext.compileSdkVersion

    defaultConfig {
        minSdk rootProject.ext.minSdkVersion
        targetSdk rootProject.ext.targetSdkVersion

        buildConfigField("boolean", "IS_NEW_ARCHITECTURE_ENABLED",
            (properties["newArchEnabled"] ?: "false").toString())
        buildConfigField("boolean", "IS_HERMES_ENABLED",
            (properties["hermesEnabled"] ?: "true").toString())
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            minifyEnabled false
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = '17'
    }

    publishing {
        multipleVariants {
            allVariants()
        }
    }
}

react {
    autolinkLibrariesWithApp()
}

dependencies {
    implementation 'com.facebook.react:react-android'
    implementation 'com.facebook.react:hermes-android'
    implementation 'androidx.appcompat:appcompat:1.7.0'
}

publishing {
    publications {
        mavenAar(MavenPublication) {
            groupId 'com.hong.lib'
            artifactId 'hongfield'
            version '1.0.0'
            afterEvaluate {
                from components.getByName("default")
            }
            pom {
                withXml {
                    def dependenciesNode = asNode().get('dependencies')?.getAt(0)
                    if (dependenciesNode) {
                        dependenciesNode.children()
                            .findAll { it.groupId.text() == rootProject.name }
                            .each { dependenciesNode.remove(it) }
                    }
                }
            }
        }
    }
    repositories {
        maven {
            name = 'Local'
            url = uri(findProperty('mavenRepoPath') ?: "${System.properties['user.home']}/.m2/repository")
        }
        mavenLocal()
    }
}

tasks.register("removeDependenciesFromModuleFile") {
    doLast {
        def moduleFile = file("${layout.buildDirectory.get()}/publications/mavenAar/module.json")
        if (moduleFile.exists()) {
            def json = new groovy.json.JsonSlurper().parse(moduleFile)
            json.variants?.each { variant ->
                variant.dependencies?.removeAll { it.group == rootProject.name }
            }
            moduleFile.text = groovy.json.JsonOutput.prettyPrint(
                groovy.json.JsonOutput.toJson(json))
        }
    }
}

tasks.named("generateMetadataFileForMavenAarPublication") {
    finalizedBy("removeDependenciesFromModuleFile")
}
```

- [ ] **Step 2: Gradle sync 검증**

```bash
cd /path/to/app-lib-bridge-react-native/android
./gradlew :bridge-lib:dependencies --configuration releaseRuntimeClasspath 2>&1 | head -60
```

Expected: 에러 없이 의존성 트리 출력. `com.facebook.react:react-android`가 포함되어야 한다.

- [ ] **Step 3: Build config field 생성 확인**

```bash
./gradlew :bridge-lib:generateReleaseResValues 2>&1 | tail -20
```

Expected: BUILD SUCCESSFUL. `IS_NEW_ARCHITECTURE_ENABLED`와 `IS_HERMES_ENABLED`가 생성됨.

- [ ] **Step 4: Commit**

```bash
git add android/bridge-lib/build.gradle
git commit -m "feat(android): add RNGP autolinking, build config fields, update Maven coordinates"
```

---

## Task 2: iOS — `Podfile` static linking + BridgeLib target 추가

**Files:**
- Modify: `ios/Podfile`

- [ ] **Step 1: linkage 블록에 else 분기 추가**

`ios/Podfile`의 linkage 조건문을 찾아 수정한다.

기존:
```ruby
linkage = ENV['USE_FRAMEWORKS']
if linkage != nil
  Pod::UI.puts "Configuring Pod with #{linkage}ally linked Frameworks".green
  use_frameworks! :linkage => linkage.to_sym
end
```

변경 후:
```ruby
linkage = ENV['USE_FRAMEWORKS']
if linkage != nil
  Pod::UI.puts "Configuring Pod with #{linkage}ally linked Frameworks".green
  use_frameworks! :linkage => linkage.to_sym
else
  use_frameworks! :linkage => :static
end
```

- [ ] **Step 2: target 블록 안에 BridgeLib 타겟 추가**

`target 'app-lib-bridge-react-native' do` 블록 안, `use_native_modules!` 바로 다음에 추가한다.

기존:
```ruby
target 'app-lib-bridge-react-native' do
  config = use_native_modules!

  use_react_native!(
```

변경 후:
```ruby
target 'app-lib-bridge-react-native' do
  config = use_native_modules!

  target 'BridgeLib' do
    inherit! :complete
  end

  use_react_native!(
```

- [ ] **Step 3: pod install 실행**

```bash
cd /path/to/app-lib-bridge-react-native/ios
pod install 2>&1 | tail -30
```

Expected: `BridgeLib` 타겟이 포함되어 설치 완료. 마지막 줄에 `Pod installation complete!` 출력.

- [ ] **Step 4: Commit**

```bash
git add ios/Podfile ios/Podfile.lock
git commit -m "feat(ios): add static linking default and BridgeLib CocoaPods target"
```

---

## Task 3: iOS — `BridgeLib.swift` 생성 + `BundleConfig.swift` Bundle 수정

**Files:**
- Create: `ios/BridgeLib/BridgeLib.swift`
- Modify: `ios/BridgeLib/BundleConfig.swift`

- [ ] **Step 1: `ios/BridgeLib/BridgeLib.swift` 파일 생성**

```swift
// XCFramework 배포 시 framework 번들 위치를 특정하는 앵커.
// Bundle.main 대신 BridgeLibBundle을 사용해야 framework 내부 리소스를 올바르게 찾는다.
public let BridgeLibBundle = Bundle(for: BridgeLibBundleClass.self)
internal class BridgeLibBundleClass {}
```

- [ ] **Step 2: `BundleConfig.swift` — `Bundle.main` → `BridgeLibBundle`**

`ios/BridgeLib/BundleConfig.swift:33`을 수정한다.

기존:
```swift
return Bundle.main.url(forResource: assetName, withExtension: "jsbundle")
```

변경 후:
```swift
return BridgeLibBundle.url(forResource: assetName, withExtension: "jsbundle")
```

**이유:** XCFramework으로 배포될 때 JS 번들(`main.jsbundle`)은 framework 번들 안에 있다. `Bundle.main`(호스트 앱 번들)에는 존재하지 않으므로 반드시 `BridgeLibBundle`을 사용해야 한다.

- [ ] **Step 3: Xcode에서 빌드 에러 없음 확인**

Xcode → BridgeLib 타겟 → Product → Build (⌘B)

Expected: 0 errors. `BridgeLibBundle`이 `BundleConfig.swift`에서 참조 가능해야 함 (같은 모듈 내 선언).

- [ ] **Step 4: Commit**

```bash
git add ios/BridgeLib/BridgeLib.swift ios/BridgeLib/BundleConfig.swift
git commit -m "feat(ios): add BridgeLib public interface and fix XCFramework bundle lookup"
```

---

## Task 4: Maven 좌표 변경 — 관련 문서 업데이트

**Files:**
- Modify: `docs/android-integration.md`
- Modify: `docs/superpowers/specs/2026-04-28-bridge-lib-design.md`

- [ ] **Step 1: `docs/android-integration.md` Maven 좌표 수정**

파일 내 두 곳을 수정한다.

**Groovy 예시 (방법 B 로컬 Maven):**

기존:
```groovy
dependencies {
    implementation 'com.bridgelib:bridge-lib:1.0.0'
}
```

변경 후:
```groovy
dependencies {
    implementation 'com.hong.lib:hongfield:1.0.0'
}
```

**Kotlin DSL 예시 (방법 B 로컬 Maven):**

기존:
```kotlin
dependencies {
    implementation("com.bridgelib:bridge-lib:1.0.0")
}
```

변경 후:
```kotlin
dependencies {
    implementation("com.hong.lib:hongfield:1.0.0")
}
```

- [ ] **Step 2: `docs/superpowers/specs/2026-04-28-bridge-lib-design.md` Maven 좌표 수정**

파일 내 섹션 3-4를 찾아 수정한다.

기존:
```
groupId: com.bridgelib
artifactId: bridge-lib
version: 1.0.0
```

변경 후:
```
groupId: com.hong.lib
artifactId: hongfield
version: 1.0.0
```

- [ ] **Step 3: Commit**

```bash
git add docs/android-integration.md docs/superpowers/specs/2026-04-28-bridge-lib-design.md
git commit -m "docs: update Maven coordinates to com.hong.lib:hongfield"
```

---

## Task 5: `docs/rn-setup.md` — iOS Framework 타겟 설정 섹션 추가

**Files:**
- Modify: `docs/rn-setup.md`

- [ ] **Step 1: 파일 끝에 새 섹션 추가**

`docs/rn-setup.md` 파일 맨 끝(섹션 6 이후)에 다음 내용을 추가한다:

```markdown
## 7. iOS Framework 타겟 설정 (Xcode, 최초 1회)

BridgeLib을 XCFramework로 패키징하기 위해 Xcode에서 Framework 타겟을 한 번 생성해야 한다.

### 타겟 생성

1. `ios/<project>.xcworkspace` 열기
2. File → New → Target → Framework 선택
3. Product Name: `BridgeLib`, Language: `Swift`
4. 생성된 `BridgeLib` 폴더를 우클릭 → **Convert to Group** (CocoaPods 호환 필수)
5. `BridgeLibTests` 폴더도 Convert to Group

### 필수 Build Settings

BridgeLib 타겟을 선택하고 Build Settings 탭에서 다음을 설정한다:

| Build Setting | Value | 이유 |
|---|---|---|
| Build Libraries for Distribution | YES | Swift module interface 생성 (XCFramework 필수) |
| User Script Sandboxing | NO | JS 번들 빌드 스크립트가 파일을 수정할 수 있도록 허용 |
| Skip Install | NO | Xcode가 archive 시 framework 파일을 생성하도록 보장 |
| Enable Module Verifier | NO | 빌드 시 모듈 검증 생략 (빌드 속도 개선) |

### Bundle React Native code and images 스크립트 추가

Xcode는 JS 번들을 framework에 포함시키기 위한 스크립트를 자동으로 추가하지 않는다. 아래 단계로 직접 추가한다:

1. `app-lib-bridge-react-native` 타겟 → Build Phases → `Bundle React Native code and images` 스크립트 전체 복사
2. BridgeLib 타겟 → Build Phases → **+** → New Run Script Phase
3. 복사한 스크립트 붙여넣기
4. 단계 이름을 `Bundle React Native code and images`로 변경
5. **Input Files** 추가:
   - `$(SRCROOT)/.xcode.env.local`
   - `$(SRCROOT)/.xcode.env`

### Scheme 생성

Product → Scheme → New Scheme → `BridgeLib` 타겟 선택 → `BridgeLib` 이름으로 생성

이후 `npx bridge-lib package:ios --scheme BridgeLib --configuration Release` 명령어로 XCFramework를 빌드한다.
```

- [ ] **Step 2: Commit**

```bash
git add docs/rn-setup.md
git commit -m "docs: add iOS Xcode Framework target setup section to rn-setup.md"
```

---

## Task 6: `docs/ios-integration.md` — Xcode 설정 섹션 보강

**Files:**
- Modify: `docs/ios-integration.md`

- [ ] **Step 1: 섹션 2 교체 — Xcode 프레임워크 타겟 설정**

기존 섹션 2 전체를 다음으로 교체한다:

기존:
```markdown
## 2. Xcode 프레임워크 타겟 설정 (최초 1회)

1. Xcode에서 `ios/BridgeLib/` 폴더의 Swift/ObjC 파일들을 새 Framework 타겟에 추가
2. 타겟 이름: `BridgeLib`
3. `Build Settings > Build Library for Distribution`: `YES`
4. `Build Settings > Swift Language Version`: `Swift 5`
5. `Product > Scheme > New Scheme`으로 `BridgeLib` 스킴 생성
```

변경 후:
```markdown
## 2. Xcode 프레임워크 타겟 설정 (최초 1회)

React Native 프로젝트에서 BridgeLib Framework 타겟을 생성하고 설정해야 한다.
전체 절차는 [RN 프로젝트 설정 가이드 — 섹션 7](./rn-setup.md#7-ios-framework-타겟-설정-xcode-최초-1회)을 참고한다.

> **필수 Build Settings 요약:**
> - Build Libraries for Distribution: `YES`
> - User Script Sandboxing: `NO`
> - Skip Install: `NO`
> - Enable Module Verifier: `NO`
>
> Bundle React Native code and images 스크립트를 BridgeLib 타겟의 Build Phases에 추가해야 JS 번들이 XCFramework에 포함된다.
```

- [ ] **Step 2: 섹션 3 CocoaPods 항목 업데이트**

섹션 3 "호스트 앱에 XCFramework 추가"의 CocoaPods 부분을 수정한다.

기존:
```markdown
3. React Native 의존성 추가 (CocoaPods):

```ruby
# 호스트 앱 Podfile
pod 'React-Core', :path => '../node_modules/react-native'
pod 'React-RCTAppDelegate', :path => '../node_modules/react-native'
```
```

변경 후:
```markdown
3. React Native 의존성 추가 (CocoaPods):

```ruby
# 호스트 앱 Podfile
pod 'React-Core', :path => '../node_modules/react-native'
pod 'React-RCTAppDelegate', :path => '../node_modules/react-native'
```

> **Static linking 필수:** BridgeLib XCFramework는 static linking 환경에서 빌드되었다. 호스트 앱 Podfile에서 React Native 의존성을 dynamic으로 링크하면 충돌이 발생할 수 있다.
```

- [ ] **Step 3: Commit**

```bash
git add docs/ios-integration.md
git commit -m "docs: strengthen Xcode framework target and static linking guidance in ios-integration.md"
```

---

## 완료 확인 체크리스트

- [ ] `./gradlew :bridge-lib:dependencies` 에러 없음
- [ ] `bridge-lib/build.gradle`에 `autolinkLibrariesWithApp()` 존재
- [ ] `bridge-lib/build.gradle` Maven groupId = `com.hong.lib`, artifactId = `hongfield`
- [ ] `ios/Podfile`에 `use_frameworks! :linkage => :static` (else 분기)
- [ ] `ios/Podfile`에 `target 'BridgeLib' do ... inherit! :complete ... end` 존재
- [ ] `ios/BridgeLib/BridgeLib.swift` 파일 존재, `BridgeLibBundle` 선언
- [ ] `ios/BridgeLib/BundleConfig.swift:33` → `BridgeLibBundle.url(...)` 사용
- [ ] `docs/android-integration.md` → `com.hong.lib:hongfield:1.0.0`
- [ ] `docs/rn-setup.md` → 섹션 7 존재 (Xcode Framework, Build Settings 표, Bundle script 단계)
- [ ] `docs/ios-integration.md` → 섹션 2 업데이트, static linking 주의사항 추가
