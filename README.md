# @codehong-dev/hongfield

Android / iOS Native와 React Native 사이의 브리지 라이브러리입니다.

## Requirements

- React >= 19.0.0
- React Native >= 0.84.0
- react-native-safe-area-context >= 4.0.0

---

## Installation

이 패키지는 [GitHub Packages](https://github.com/cOdehOng-dev/app-lib-bridge-react-native/packages)에 배포되어 있습니다.

### 1. GitHub CLI 설치 및 로그인

[GitHub CLI](https://cli.github.com)가 없다면 먼저 설치합니다.

```bash
# macOS
brew install gh

# 로그인
gh auth login
```

### 2. .npmrc 설정

아래 명령어를 실행하면 레지스트리와 토큰이 글로벌에 자동 설정됩니다.

```bash
echo "@codehong-dev:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=$(gh auth token)" >> ~/.npmrc
```

### 3. 패키지 설치

```bash
npm install @codehong-dev/hongfield
# 또는
yarn add @codehong-dev/hongfield
```

---

## API

### `sendToNative(name, data?)`

React Native → Native 방향으로 이벤트를 전송합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|:----:|------|
| `name` | `string` | O | 이벤트 이름 |
| `data` | `Record<string, unknown>` | X | 함께 전달할 데이터 (기본값: `{}`) |

```ts
import { sendToNative } from '@codehong-dev/hongfield';

sendToNative('PAYMENT_DONE', { amount: 9900, currency: 'KRW' });
```

---

### `useBridgeEvent(eventName, callback)`

Native → React Native 방향으로 오는 이벤트를 구독하는 훅입니다.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `eventName` | `string` | 구독할 이벤트 이름 |
| `callback` | `(data: Record<string, unknown>) => void` | 이벤트 수신 시 실행할 함수 |

컴포넌트 언마운트 시 구독이 자동으로 해제됩니다.

```ts
import { useBridgeEvent } from '@codehong-dev/hongfield';

useBridgeEvent('USER_LOGGED_IN', (data) => {
  console.log('userId:', data.userId);
});
```

---

### Native에서 RN 이벤트 수신 (`RNEventListener`)

`sendToNative`로 전송된 이벤트는 각 플랫폼의 `RNEventListener` 인터페이스/프로토콜을 통해 수신합니다.

**Android** — `ReactNativeActivity`를 상속한 Activity에서 `onEvent`를 오버라이드합니다.

```kotlin
class MyActivity : ReactNativeActivity() {
    override fun onEvent(eventName: String, data: Map<String, Any?>) {
        when (eventName) {
            "PAYMENT_DONE" -> { /* handle */ }
        }
    }
}
```

**iOS** — `BridgeLibViewController` 서브클래스에서 `RNEventListener` 프로토콜을 채택하고 `eventListener`에 self를 할당합니다.

```swift
class MyViewController: BridgeLibViewController, RNEventListener {
    override func viewDidLoad() {
        super.viewDidLoad()
        eventListener = self
    }

    func onEvent(eventName: String, data: [String: Any]) {
        switch eventName {
        case "PAYMENT_DONE": break
        default: break
        }
    }
}
```

---

### `BridgeLib`

번들 모드와 라이브러리 버전 정보를 제공하는 객체입니다.

| 프로퍼티 | 타입 | 설명 |
|---------|------|------|
| `bundleMode` | `'dev' \| 'assets' \| 'remote'` | 현재 번들 모드 (`__DEV__`이면 `'dev'`, 아니면 `'assets'`) |
| `version` | `string` | 라이브러리 버전 (`package.json`에서 읽음) |

```ts
import { BridgeLib } from '@codehong-dev/hongfield';

console.log(BridgeLib.bundleMode); // 'dev' | 'assets' | 'remote'
console.log(BridgeLib.version);    // '1.0.1'
```

---

## Development

### 빌드

소스를 수정한 뒤 반드시 빌드를 실행해야 배포 및 로컬 연동에 반영됩니다.

```bash
npm run build
```

`dist/` 폴더에 컴파일된 `.js` 파일과 TypeScript 타입 선언 파일(`.d.ts`)이 생성됩니다.

> 자동 import가 안 된다면 빌드 후 IDE의 TypeScript 서버를 재시작하세요.
> VS Code 기준: `Cmd+Shift+P` → `TypeScript: Restart TS Server`

### 배포

```bash
npm publish
```

---

## CLI (소비앱에서 실행)

Brownfield 구조에서 소비앱(네이티브 Android/iOS 앱)이 React Native를 임베드할 때 사용합니다.
패키지를 설치하면 `package-android.sh` / `package-ios.sh` 스크립트가 `node_modules` 안에 포함됩니다.

**전체 흐름**

```
소비앱에서 npm install @codehong-dev/hongfield
  └─ ./node_modules/@codehong-dev/hongfield/package-android.sh
       ├─ JS 번들 → android/app/src/main/assets/index.android.bundle
       ├─ AAR     → output/android/bridge-lib-release.aar
       └─ Maven   → ~/.m2/repository (네이티브 프로젝트에서 의존성으로 참조)

  └─ ./node_modules/@codehong-dev/hongfield/package-ios.sh
       ├─ JS 번들 → ios/main.jsbundle
       └─ XCFramework → output/ios/BridgeLib.xcframework
```

---

### Android AAR 빌드 + Maven 배포

JS 번들 빌드 → AAR 빌드 → 로컬 Maven 배포 순서로 자동 실행됩니다.

```bash
./node_modules/@codehong-dev/hongfield/package-android.sh
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--variant` | 빌드 variant | `Release` |
| `--module-name` | 출력 파일명 | `bridge-lib` |
| `--repo` | Maven 저장소 경로 | `~/.m2/repository` |
| `--skip-maven` | Maven 배포 건너뜀 | - |

```bash
# AAR만 빌드 (Maven 배포 제외)
./node_modules/@codehong-dev/hongfield/package-android.sh --skip-maven

# Debug 빌드
./node_modules/@codehong-dev/hongfield/package-android.sh --variant Debug
```

결과물: `output/android/bridge-lib-release.aar`

---

### iOS XCFramework 빌드

JS 번들 빌드 → XCFramework 빌드 순서로 자동 실행됩니다.

```bash
./node_modules/@codehong-dev/hongfield/package-ios.sh
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--scheme` | Xcode 스킴 이름 | `BridgeLib` |
| `--configuration` | 빌드 구성 | `Release` |
| `--output` | 출력 디렉터리 경로 | `output/ios` |

```bash
# 출력 경로 지정
./node_modules/@codehong-dev/hongfield/package-ios.sh --output ./build/ios
```

결과물: `output/ios/BridgeLib.xcframework`
