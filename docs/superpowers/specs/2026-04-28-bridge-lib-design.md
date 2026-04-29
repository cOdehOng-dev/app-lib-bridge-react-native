# bridge-lib 설계 문서

**날짜:** 2026-04-28  
**프로젝트:** app-lib-bridge-react-native  
**목적:** 네이티브(Android/iOS) 호스트 앱과 React Native 앱을 양방향으로 연동하는 라이브러리

---

## 1. 개요

Callstack의 brownfield 라이브러리와 동일한 목적을 가지되, 다음 차이점을 가진다:

- React Native **신규 아키텍처** (TurboModule/Fabric, RN 0.84.1) 기반
- 외부 의존성 없이 **직접 소유한 코드**로 구성 (즉시 수정 가능)
- Android: **AAR** 배포, iOS: **XCFramework** 배포
- **OTA/CodePush** 번들 URL 지원
- **CLI 도구** 포함 (`npx bridge-lib` 명령어)

---

## 2. 레포 구조

```
app-lib-bridge-react-native/
├── src/                              ← RN TypeScript 패키지 (npm 배포)
│   ├── index.ts                      ← 진입점
│   ├── BridgeLib.ts                  ← 번들 모드 유틸리티
│   ├── useBridgeEvent.ts             ← 네이티브 이벤트 구독 훅
│   ├── sendToNative.ts               ← 네이티브로 이벤트 전송
│   └── specs/NativeBridgeModule.ts   ← TurboModule 타입 정의 (Codegen)
│
├── android/
│   ├── app/                          ← 기존 RN 앱 (개발/테스트용)
│   └── bridge-lib/                   ← AAR 빌드 대상 라이브러리 모듈
│       └── src/main/kotlin/com/bridgelib/
│           ├── BridgeLibHost.kt      ← ReactHost 초기화
│           ├── BridgeLibActivity.kt  ← RN 화면 Activity
│           ├── BridgeLibFragment.kt  ← RN 화면 Fragment
│           ├── BridgeEventBus.kt     ← 네이티브 ↔ RN 이벤트 버스
│           ├── BundleConfig.kt       ← 번들 로딩 설정
│           └── NativeBridgeModule.kt ← TurboModule 구현체
│
├── ios/
│   ├── app-lib-bridge-react-native/  ← 기존 RN 앱 (개발/테스트용)
│   └── BridgeLib/                    ← XCFramework 빌드 대상
│       ├── BridgeLibManager.swift    ← RCTReactNativeFactory 초기화
│       ├── BridgeLibViewController.swift ← RN 화면 ViewController
│       ├── BridgeEventEmitter.swift  ← 네이티브 ↔ RN 이벤트 버스
│       ├── BundleConfig.swift        ← 번들 로딩 설정
│       └── NativeBridgeModule.mm     ← TurboModule 구현체
│
├── bin/
│   └── bridge-lib.js                 ← CLI 진입점
│
├── scripts/
│   ├── packageAndroid.js             ← package:android 구현
│   ├── publishAndroid.js             ← publish:android 구현
│   └── packageIos.js                 ← package:ios 구현
│
└── docs/
    ├── rn-setup.md                   ← RN 프로젝트 설정 가이드
    ├── android-integration.md        ← Android 네이티브 연동 가이드
    └── ios-integration.md            ← iOS 네이티브 연동 가이드
```

---

## 3. Android 라이브러리 설계

### 3-1. BridgeLibHost

Application 클래스에서 1회 호출하여 ReactHost를 초기화한다.

```kotlin
BridgeLibHost.init(
    application = this,
    bundleConfig = BundleConfig(
        devUrl = "http://10.0.2.2:8081/index.bundle",
        assetPath = "index.android.bundle",
        remoteUrl = "https://your-ota-server.com/bundle.js" // nullable
    )
)
```

- `BundleConfig.resolve()`: `__DEV__` → devUrl, remoteUrl 설정 시 → remoteUrl, 기본 → assetPath 순으로 자동 선택
- ReactHost 인스턴스를 싱글턴으로 관리

### 3-2. BridgeLibActivity / BridgeLibFragment

네이티브 앱에서 RN 화면으로 전환할 때 사용한다.

```kotlin
// Activity 방식
BridgeLibActivity.start(
    context = this,
    moduleName = "HomeScreen",
    initialProps = bundleOf("userId" to "123")
)

// Fragment 방식 (기존 Activity에 임베딩)
val fragment = BridgeLibFragment.newInstance(
    moduleName = "HomeScreen",
    initialProps = bundleOf("userId" to "123")
)
supportFragmentManager.beginTransaction()
    .replace(R.id.container, fragment)
    .commit()
```

### 3-3. BridgeEventBus

네이티브 ↔ RN 양방향 이벤트 통신을 담당한다.

```kotlin
// 네이티브 → RN
BridgeEventBus.send("USER_LOGGED_IN", mapOf("name" to "Oscar"))

// RN → 네이티브 (리스너 등록)
BridgeEventBus.on("PAYMENT_DONE") { data ->
    val amount = data["amount"]
}

// 리스너 해제
BridgeEventBus.off("PAYMENT_DONE")
```

내부적으로 신규 아키텍처의 `DeviceEventManagerModule.RCTDeviceEventEmitter`를 사용하여 JS로 이벤트를 전달한다.

### 3-4. AAR 배포

`android/bridge-lib` 모듈에 `maven-publish` 플러그인을 적용하여 로컬 Maven에 배포한다.

```
groupId: com.nol.lib.reactnative
artifactId: bridgeLib
version: 1.0.0
```

---

## 4. iOS 라이브러리 설계

### 4-1. BridgeLibManager

AppDelegate에서 1회 호출하여 RCTReactNativeFactory를 초기화한다.

```swift
BridgeLibManager.shared.initialize(
    bundleConfig: BundleConfig(
        devURL: URL(string: "http://localhost:8081/index.bundle")!,
        assetName: "main",           // main.jsbundle
        remoteURL: URL(string: "https://your-ota-server.com/bundle.js") // optional
    )
)
```

- `BundleConfig.resolve()`: DEBUG → devURL, remoteURL 설정 시 → remoteURL, 기본 → Bundle.main 내 assetName
- RCTReactNativeFactory 인스턴스를 싱글턴으로 관리

### 4-2. BridgeLibViewController

네이티브 앱에서 RN 화면으로 전환할 때 사용한다.

```swift
let vc = BridgeLibViewController(
    moduleName: "HomeScreen",
    initialProps: ["userId": "123"]
)
navigationController?.pushViewController(vc, animated: true)
// 또는 present(vc, animated: true)
```

### 4-3. BridgeEventEmitter

네이티브 ↔ RN 양방향 이벤트 통신을 담당한다.

```swift
// 네이티브 → RN
BridgeEventEmitter.shared.send("USER_LOGGED_IN", body: ["name": "Oscar"])

// RN → 네이티브
BridgeEventEmitter.shared.on("PAYMENT_DONE") { data in
    let amount = data["amount"]
}

// 리스너 해제
BridgeEventEmitter.shared.off("PAYMENT_DONE")
```

### 4-4. XCFramework 배포

simulator(x86_64/arm64) + device(arm64) 두 아키텍처를 합쳐 XCFramework로 빌드한다.

---

## 5. RN TypeScript 패키지 설계

### 5-1. TurboModule 정의 (Codegen)

```typescript
// src/specs/NativeBridgeModule.ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  sendEvent(name: string, data: Object): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeBridgeModule');
```

### 5-2. useBridgeEvent 훅

```typescript
// 네이티브에서 온 이벤트 구독
useBridgeEvent('USER_LOGGED_IN', (data) => {
    console.log(data.name)
})
```

내부적으로 `NativeEventEmitter` + `NativeBridgeModule`을 사용하며, 컴포넌트 언마운트 시 자동 구독 해제한다.

### 5-3. sendToNative

```typescript
// RN → 네이티브 이벤트 전송
sendToNative('PAYMENT_DONE', { amount: 9900 })
```

### 5-4. BridgeLib 유틸리티

```typescript
BridgeLib.bundleMode   // 'dev' | 'assets' | 'remote'
BridgeLib.version      // 라이브러리 버전
```

---

## 6. 번들 로딩 전략

| 조건 | 번들 소스 |
|---|---|
| `__DEV__ === true` | Metro 개발 서버 URL |
| `remoteURL` 설정됨 (릴리즈) | OTA/CodePush 원격 URL |
| 기본값 (릴리즈) | 앱 내 assets 번들 |

번들 모드 우선순위: **dev > remote > assets**

---

## 7. CLI 도구 설계

`package.json`의 `bin` 필드에 등록하여 `npx bridge-lib` 형태로 실행 가능하다.

### Android

```bash
# AAR 빌드
npx bridge-lib package:android --variant Release --module-name reactnativeapp

# 로컬 Maven 배포
npx bridge-lib publish:android --module-name reactnativeapp

# 경로 지정
npx bridge-lib publish:android --module-name reactnativeapp --repo ~/.m2/repository
```

### iOS

```bash
# XCFramework 빌드
npx bridge-lib package:ios --scheme BridgeLib --configuration Release

# 결과물 경로 지정
npx bridge-lib package:ios --scheme BridgeLib --configuration Release --output ./output/ios
```

### CLI 내부 동작

**package:android**
1. `./gradlew :bridge-lib:assembleRelease -PvariantName={variant}` 실행
2. 생성된 AAR을 `./output/android/{module-name}-release.aar`로 복사

**publish:android**
1. `./gradlew :bridge-lib:publishToMavenLocal` 실행
2. `~/.m2/repository/com/nol/lib/reactnative/bridgeLib/` 에 설치됨

**package:ios**
1. `xcodebuild archive` — 시뮬레이터 빌드
2. `xcodebuild archive` — 디바이스 빌드
3. `xcodebuild -create-xcframework` — 두 아카이브 합쳐서 XCFramework 생성
4. `./output/ios/BridgeLib.xcframework`로 저장

---

## 8. 문서 구성

| 파일 | 내용 |
|---|---|
| `docs/rn-setup.md` | RN 프로젝트 설정, TurboModule Codegen 활성화, index.js 컴포넌트 등록 |
| `docs/android-integration.md` | AAR 임포트, BridgeLibHost 초기화, BridgeLibActivity 사용법, 이벤트 통신 |
| `docs/ios-integration.md` | XCFramework 임포트, BridgeLibManager 초기화, BridgeLibViewController 사용법, 이벤트 통신 |

---

## 9. 에러 처리 원칙

- `BridgeLibHost.init()` 미호출 상태에서 `BridgeLibActivity.start()` 호출 시 `IllegalStateException` throw
- 번들 로딩 실패 시 fallback: remoteURL → assetPath 순으로 재시도
- TurboModule 미등록 시 명확한 에러 메시지 출력
