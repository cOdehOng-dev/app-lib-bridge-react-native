# RN 프로젝트 내 Android/iOS 네이티브 설정 추가 설계

**날짜:** 2026-04-29
**목적:** brownfield가 제공하는 RN 프로젝트 내 android/ios 폴더 설정을 직접 구현 (brownfield 의존성 없이)

---

## 1. 배경

기존 설계(`2026-04-28-bridge-lib-design.md`)에서 `android/bridge-lib/`와 `ios/BridgeLib/`는
라이브러리 코드로 존재했으나, brownfield가 RN 프로젝트 내에 요구하는 다음 설정들이 누락되어 있었다:

- Android: React Native Gradle Plugin(RNGP) 연결 + autolinking + build config fields + Maven publishing 개선
- iOS: Podfile BridgeLib 타겟 + static linking + public interface 파일 + Xcode Framework 설정 문서

brownfield 라이브러리를 의존성으로 추가하지 않고, 동등한 기능을 직접 구현한다.

---

## 2. Maven 좌표 변경

기존 → 변경:

| 항목 | 기존 | 변경 |
|---|---|---|
| groupId | `com.bridgelib` | `com.hong.lib` |
| artifactId | `bridge-lib` | `hongfield` |
| version | `1.0.0` | `1.0.0` |

영향 파일:
- `android/bridge-lib/build.gradle` (publishing 블록)
- `docs/android-integration.md` (방법 B: 로컬 Maven 예시)
- `docs/superpowers/specs/2026-04-28-bridge-lib-design.md` (섹션 3-4)

---

## 3. Android: `bridge-lib/build.gradle` 변경 사항

### 3-1. 추가할 플러그인
```groovy
id 'com.facebook.react'   // RNGP — autolinking 활성화
```

### 3-2. react 블록 (autolinking)
```groovy
react {
    autolinkLibrariesWithApp()
}
```
3rd party 네이티브 모듈(reanimated, react-navigation 등)이 AAR에 자동 포함된다.

### 3-3. Build Config Fields
```groovy
android {
    buildFeatures {
        buildConfig = true
    }
    defaultConfig {
        buildConfigField("boolean", "IS_NEW_ARCHITECTURE_ENABLED",
            (properties["newArchEnabled"] ?: "false").toString())
        buildConfigField("boolean", "IS_HERMES_ENABLED",
            (properties["hermesEnabled"] ?: "true").toString())
    }
    publishing {
        multipleVariants {
            allVariants()   // release + debug 변형 모두 퍼블리시
        }
    }
}
```

`gradle.properties`의 `newArchEnabled`, `hermesEnabled` 값을 읽는다 (이미 존재 확인).

### 3-4. Maven Publishing 개선
brownfield의 `removeDependenciesFromModuleFile` 등가 태스크:
POM과 module.json에서 루트 프로젝트 내부 모듈 의존성을 제거한다.
호스트 앱이 AAR을 사용할 때 존재하지 않는 내부 모듈을 resolve하려다 실패하는 것을 방지한다.

```groovy
tasks.register("removeDependenciesFromPom") {
    doLast {
        // build/publications/release/pom-default.xml 파싱 후
        // groupId == rootProject.name 인 <dependency> 노드 제거
        def pomFile = file("${layout.buildDirectory.get()}/publications/release/pom-default.xml")
        if (pomFile.exists()) {
            def xml = new XmlParser().parse(pomFile)
            def deps = xml.dependencies[0]
            deps?.children()?.removeAll { it.groupId.text() == rootProject.name }
            new XmlNodePrinter(new PrintWriter(pomFile)).print(xml)
        }
    }
}
tasks.named("generatePomFileForReleasePublication") {
    finalizedBy("removeDependenciesFromPom")
}
```

---

## 4. iOS: Podfile 변경 사항

### 4-1. Static linking (상단에 추가)
```ruby
linkage = ENV['USE_FRAMEWORKS']
if linkage != nil
  Pod::UI.puts "Configuring Pod with #{linkage}ally linked Frameworks".green
  use_frameworks! :linkage => linkage.to_sym
else
  use_frameworks! :linkage => :static
end
```
XCFramework 빌드 시 static linking이 필수다.

### 4-2. BridgeLib Framework 타겟 추가
```ruby
target 'app-lib-bridge-react-native' do
  config = use_native_modules!

  target 'BridgeLib' do
    inherit! :complete
  end

  use_react_native!(...)
end
```
`inherit! :complete`로 모든 pod 의존성과 빌드 단계를 BridgeLib 타겟이 상속한다.

---

## 5. iOS: `ios/BridgeLib/BridgeLib.swift` (신규)

brownfield의 public interface 파일 등가. XCFramework에서 Bundle 위치를 특정하는 앵커 역할.

```swift
public let BridgeLibBundle = Bundle(for: BridgeLibBundleClass.self)
internal class BridgeLibBundleClass {}
```

BridgeLibManager.swift에서 번들 내 JS 번들 파일 경로를 찾을 때 `BridgeLibBundle`을 사용한다.

---

## 6. iOS: 문서 추가 — Xcode Framework 타겟 설정

`docs/rn-setup.md`에 "iOS Framework 타겟 설정" 섹션 추가.

brownfield의 "Create a Framework Target in Xcode" 섹션 등가.

### 6-1. Xcode 타겟 생성 절차
1. `ios/<project>.xcworkspace` 열기
2. File → New → Target → Framework
3. 타겟 이름: `BridgeLib`
4. Convert to Group (CocoaPods 호환)

### 6-2. 필수 Build Settings

| Build Setting | Value | 이유 |
|---|---|---|
| Build Libraries for Distribution | YES | Swift module interface 생성 (XCFramework 필수) |
| User Script Sandboxing | NO | JS 번들 스크립트가 파일을 수정할 수 있도록 허용 |
| Skip Install | NO | Xcode가 framework 파일을 생성하도록 보장 |
| Enable Module Verifier | NO | 빌드 시 모듈 검증 건너뜀 (빌드 속도 개선) |

### 6-3. Bundle Script 단계
1. RN 앱 타겟 → Build Phases → "Bundle React Native code and images" 스크립트 복사
2. BridgeLib 타겟 → Build Phases → `+` → New Run Script Phase
3. 스크립트 붙여넣기, 단계 이름: "Bundle React Native code and images"
4. Input files 추가:
   - `$(SRCROOT)/.xcode.env.local`
   - `$(SRCROOT)/.xcode.env`

---

## 7. `docs/ios-integration.md` 변경 사항

현재 2항 "Xcode 프레임워크 타겟 설정"이 불완전함.
rn-setup.md의 Framework 타겟 생성이 전제 조건임을 명시하고,
BridgeLib.swift public interface 파일 위치를 안내한다.

---

## 8. 변경 파일 목록

| 파일 | 변경 유형 |
|---|---|
| `android/bridge-lib/build.gradle` | 수정 — RNGP, autolinking, build config, publishing 개선, Maven 좌표 변경 |
| `ios/Podfile` | 수정 — static linking, BridgeLib target |
| `ios/BridgeLib/BridgeLib.swift` | 신규 — public interface |
| `docs/rn-setup.md` | 수정 — iOS Framework 타겟 설정 섹션 추가 |
| `docs/ios-integration.md` | 수정 — Bundle script, Xcode 설정 섹션 보강 |
| `docs/android-integration.md` | 수정 — Maven 좌표 업데이트 |
| `docs/superpowers/specs/2026-04-28-bridge-lib-design.md` | 수정 — Maven 좌표 업데이트 |
