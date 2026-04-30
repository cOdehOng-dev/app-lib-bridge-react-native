# React Native 프로젝트 설정 가이드

## 개요

`@codehong-dev/hongfield`는 네이티브(Android/iOS)와 React Native 웹뷰 레이어 사이의 브리지를 담당하는 라이브러리이다.

RN 측에서는 다음 역할을 수행한다:

- **네이티브 → RN 이벤트 수신**: `useBridgeEvent` 훅으로 네이티브에서 발생한 이벤트를 구독
- **RN → 네이티브 이벤트 전송**: `sendToNative` 함수로 네이티브에 이름+데이터를 전달
- **네이티브 화면 닫기**: `popToNative` 함수로 네이티브 컨테이너(Activity/ViewController)를 닫음
- **번들 메타 정보 제공**: `BridgeLib` 객체로 현재 번들 모드와 라이브러리 버전을 노출

내부적으로는 TurboModuleRegistry를 통해 `NativeBridgeModule`을 조회하며, New Architecture(TurboModule) 기반으로 동작한다.

---

## 1. 설치 방법

### .npmrc 설정 (최초 1회)

패키지는 GitHub Packages에 배포되어 있으므로, 프로젝트 루트에 `.npmrc` 파일을 생성해야 한다:

```
@codehong-dev:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

> 주의: `_authToken`에 토큰을 하드코딩한 채 커밋하지 마세요. 환경 변수(`${GITHUB_TOKEN}`) 방식을 사용하거나, `.npmrc`를 `.gitignore`에 추가하세요. GitHub → Settings → Developer settings → Personal access tokens에서 `read:packages` 권한으로 토큰을 발급합니다.

### 패키지 설치

```bash
# npm
npm install @codehong-dev/hongfield

# yarn
yarn add @codehong-dev/hongfield

# 로컬 경로로 참조 (npm)
npm install /path/to/app-lib-bridge-react-native

# 로컬 경로로 참조 (yarn)
yarn add /path/to/app-lib-bridge-react-native
```

### peerDependencies

이 라이브러리는 다음 패키지를 peerDependencies로 요구한다. 소비 프로젝트에 반드시 설치되어 있어야 한다:

| 패키지 | 최소 버전 |
| --- | --- |
| `react` | `>=19.0.0` |
| `react-native` | `>=0.84.0` |
| `react-native-safe-area-context` | `>=4.0.0` |

---

## 2. 공개 API 목록

`src/index.ts`에서 내보내는 항목은 다음 네 가지이다:

```typescript
export { BridgeLib } from './BridgeLib';
export { sendToNative } from './sendToNative';
export { useBridgeEvent } from './useBridgeEvent';
export { popToNative } from './popToNative';
```

| 내보내기 | 종류 | 역할 |
| --- | --- | --- |
| `BridgeLib` | 객체 (const) | 번들 모드(`bundleMode`)와 라이브러리 버전(`version`) 제공 |
| `sendToNative` | 함수 | RN → 네이티브로 이벤트 전송 |
| `useBridgeEvent` | React 훅 | 네이티브 → RN 이벤트 구독 |
| `popToNative` | 함수 | 네이티브 화면(Activity/ViewController) 닫기 요청 |

---

## 3. BridgeLib

`BridgeLib`는 현재 번들 실행 환경 정보를 담은 읽기 전용 객체이다.

```typescript
import { BridgeLib } from '@codehong-dev/hongfield';

console.log(BridgeLib.bundleMode); // 'dev' | 'assets'
console.log(BridgeLib.version);    // package.json의 version 문자열 (예: "1.0.36")
```

`bundleMode`는 다음 규칙으로 결정된다:

- `__DEV__` 가 `true` 이면 → `'dev'`
- 그 외 → `'assets'`

> `'remote'` 타입도 선언되어 있으나, 현재 `resolveBundleMode()` 로직에서는 반환되지 않는 예약 값이다.

---

## 4. sendToNative 사용법

RN에서 네이티브 쪽으로 이름(`name`)과 데이터(`data`)를 전달한다.

```typescript
import { sendToNative } from '@codehong-dev/hongfield';

// 기본 사용 (data 생략 가능, 빈 객체로 처리됨)
sendToNative('PAYMENT_DONE');

// data 포함
sendToNative('PAYMENT_DONE', { amount: 9900, currency: 'KRW' });

// 제네릭으로 data 타입 명시 (권장)
sendToNative<{ amount: number; currency: string }>(
  'PAYMENT_DONE',
  { amount: 9900, currency: 'KRW' }
);
```

함수 시그니처:

```typescript
function sendToNative<T extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  data: T = {} as T,
): void
```

내부적으로 `NativeBridgeModule.sendEvent(name, data)`를 호출한다.

> 주의: `T`를 구체적인 타입으로 지정하는 경우, `data` 인수를 반드시 명시해야 한다. `data`를 생략하면 기본값(`{}`)이 `T` 타입과 불일치할 수 있다.

---

## 5. popToNative 사용법

네이티브 컨테이너(Android Activity/Fragment, iOS ViewController)를 닫도록 요청한다.

```typescript
import { popToNative } from '@codehong-dev/hongfield';

function MyScreen() {
  return (
    <Button
      onPress={() => popToNative()}
      title="닫기"
    />
  );
}
```

함수 시그니처:

```typescript
function popToNative(): void
```

내부적으로 `NativeBridgeModule.popToNative()`를 호출한다. 네이티브 측에서 해당 콜백을 등록해야 실제로 동작한다:

- Android: `BridgeLibActivity.onPopRequested` / `BridgeLibFragment.onPopRequested` 참고
- iOS: `BridgeLibViewController.onPopRequested` 참고

---

## 6. useBridgeEvent 훅 사용법

네이티브에서 전송한 이벤트를 RN에서 구독한다. `NativeEventEmitter`를 내부적으로 사용하며, 마운트 시 리스너를 등록하고 언마운트 시 자동으로 해제한다.

```typescript
import { useBridgeEvent } from '@codehong-dev/hongfield';

function HomeScreen() {
  // 기본 사용 (data 타입은 Record<string, unknown>으로 추론됨)
  useBridgeEvent('USER_LOGGED_IN', (data) => {
    console.log('로그인 이벤트:', data);
  });

  // 제네릭으로 data 타입 명시 (권장)
  useBridgeEvent<{ userId: string; role: string }>('USER_LOGGED_IN', (data) => {
    console.log('사용자 ID:', data.userId, '역할:', data.role);
  });

  return <View />;
}
```

함수 시그니처:

```typescript
function useBridgeEvent<T extends Record<string, unknown> = Record<string, unknown>>(
  eventName: string,
  callback: (data: T) => void
): void
```

동작 방식:

- 이벤트 채널명은 항상 `'BridgeEvent'`로 고정되어 있다.
- 네이티브에서 전송하는 이벤트 구조: `{ name: string; data: T }`
- `event.name === eventName` 일 때만 `callback`이 호출된다.
- `callback`은 `useRef`로 최신 참조가 유지되므로, 매 렌더마다 리스너를 재등록하지 않는다.
- `eventName`이 변경되면 `useEffect`가 재실행되어 리스너를 교체한다.

> 주의: `NativeEventEmitter`는 런타임에서 `T`의 타입 형태를 검증하지 않는다. 제네릭 타입은 개발 시 타입 힌트 목적으로만 사용된다.

---

## 7. SafeAreaView 사용법

이 라이브러리는 `react-native-safe-area-context`를 peerDependency로 사용한다. 안전 영역(노치, 홈 바 등)을 처리하려면 앱 최상단에 `SafeAreaProvider`를 배치하고, 각 화면에서 `useSafeAreaInsets`를 활용한다.

`App.tsx` 기준 구조:

```typescript
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      {/* safeAreaInsets.top / bottom 등을 padding 등에 활용 */}
    </View>
  );
}
```

규칙:
- `SafeAreaProvider`는 앱 루트에 한 번만 배치한다.
- `useSafeAreaInsets`는 `SafeAreaProvider` 하위 컴포넌트에서만 호출 가능하다.
- `SafeAreaView` 컴포넌트 대신 `useSafeAreaInsets` 훅을 사용하면 레이아웃 제어가 더 유연하다.

---

## 8. App 진입점 구조

### index.js

RN 앱의 진입점이다. `app.json`에서 앱 이름을 읽어 컴포넌트를 등록한다:

```javascript
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
```

- 네이티브 앱은 등록된 `appName`으로 RN 번들을 시작한다.
- `appName`은 `app.json`의 `"name"` 필드 값이다.
- 소비 앱에서 여러 화면을 개별 진입점으로 등록하려면 `AppRegistry.registerComponent`를 추가로 호출하면 된다.

### App.tsx

루트 컴포넌트이다. 현재 구현은 다음 구조를 따른다:

```typescript
function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <NewAppScreen
        templateFileName="App.tsx"
        safeAreaInsets={safeAreaInsets}
      />
    </View>
  );
}
```

- `App`: `SafeAreaProvider`와 `StatusBar`를 배치하는 최상위 컴포넌트
- `AppContent`: `useSafeAreaInsets`로 insets를 받아 실제 화면 콘텐츠를 렌더링하는 컴포넌트

---

## 9. NativeBridgeModule 스펙

`src/specs/NativeBridgeModule.ts`에 TurboModule 인터페이스가 정의되어 있다:

```typescript
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  sendEvent(name: string, data: Object): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
  popToNative(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeBridgeModule');
```

- `TurboModuleRegistry.getEnforcing`을 사용하므로, 네이티브 모듈이 등록되어 있지 않으면 런타임 오류가 발생한다.
- 네이티브 측에서 모듈 이름을 반드시 `'NativeBridgeModule'`로 등록해야 한다.

---

## 10. 빌드 설정

### babel.config.js

```javascript
module.exports = {
  presets: ['module:@react-native/babel-preset'],
};
```

### metro.config.js

```javascript
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const config = {};
module.exports = mergeConfig(getDefaultConfig(__dirname), config);
```

### react-native.config.js

```javascript
module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android/bridge-lib',
      },
      ios: {
        sourceDir: './ios',
      },
    },
  },
};
```

Android는 일반적인 `./android`가 아니라 `./android/bridge-lib`를 소스 디렉터리로 지정한다. Autolinking 사용 시 이 경로를 기준으로 네이티브 모듈이 연결된다.

---

## 11. 번들 빌드 및 네이티브 패키징

번들 빌드는 AAR / XCFramework 빌드 시 자동으로 실행된다. 별도 실행은 불필요하다.

### Android

**sh 스크립트 (권장)**

```bash
# AAR 빌드 + 로컬 Maven 배포
./node_modules/@codehong-dev/hongfield/package-android.sh

# AAR만 빌드 (Maven 배포 제외)
./node_modules/@codehong-dev/hongfield/package-android.sh --skip-maven
```

**CLI**

```bash
# AAR 빌드
npx hongfield package:android --variant Release

# 로컬 Maven 배포 (--version 필수)
npx hongfield publish:android --version 1.0.0
```

### iOS

**sh 스크립트 (권장)**

```bash
./node_modules/@codehong-dev/hongfield/package-ios.sh --scheme BridgeLib --configuration Release
```

**CLI**

```bash
# XCFramework 빌드
npx hongfield package:ios --scheme BridgeLib --configuration Release

# 로컬 CocoaPods 배포 (--version 필수)
npx hongfield publish:ios --version 1.0.0
```

---

## 12. Codegen 설정

`NativeBridgeModule`은 레거시 아키텍처 방식(`ReactContextBaseJavaModule`)으로 구현되어 있으므로 `codegenConfig`를 사용하지 않는다. New Architecture에서는 레거시 인터롭 레이어를 통해 자동으로 동작한다.

### Autolinking 사용 시 (권장)

소비 프로젝트의 `android/settings.gradle`에 `autolinkLibrariesFromCommand()`가 선언되어 있으면 네이티브 모듈이 자동으로 링크된다:

```groovy
plugins { id("com.facebook.react.settings") }
extensions.configure(com.facebook.react.ReactSettingsExtension) { ex ->
    ex.autolinkLibrariesFromCommand()
}
```

### AAR 소비 시 (autolinking 없음)

순수 네이티브 앱에서 AAR만 사용하는 경우 별도 Codegen 설정이 필요 없다. 네이티브 브리지 코드가 이미 AAR에 컴파일되어 포함되어 있다.

---

## 13. iOS Framework 타겟 설정 (Xcode, 최초 1회)

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
| --- | --- | --- |
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

이후 아래 명령어로 XCFramework를 빌드한다:

```bash
./node_modules/@codehong-dev/hongfield/package-ios.sh --scheme BridgeLib --configuration Release
```

---

## 14. 버전 관리 및 배포

### 버전 변경 방법

새 버전을 배포할 때는 `package.json`과 `package-lock.json` 두 파일의 `version` 필드를 모두 수정해야 한다.

**방법 A: npm version 명령 사용 (권장)**

```bash
npm version patch   # 1.0.0 → 1.0.1 (버그 수정)
npm version minor   # 1.0.0 → 1.1.0 (기능 추가)
npm version major   # 1.0.0 → 2.0.0 (하위 호환 불가 변경)
```

이 명령은 `package.json`과 `package-lock.json`을 동시에 업데이트한다.

**방법 B: 직접 수정**

`package.json`과 `package-lock.json` 두 곳의 `"version"` 필드를 같은 값으로 수정한다:

```json
"version": "1.0.1"
```

### 배포 트리거

| 방법 | 트리거 조건 | dist-tag |
| --- | --- | --- |
| master 브랜치 push | `src/**` 변경 포함 시 자동 실행 | `latest` |
| `v*` 태그 push | 항상 실행 (paths 무관) | `latest` |
| develop/feature 브랜치 push | `src/**` 변경 포함 시 자동 실행 | `snapshot` |
| `snap_v*` 태그 push | 항상 실행 (paths 무관) | `snapshot` |
| GitHub Actions 수동 실행 | Actions 탭에서 직접 실행 | 선택 |

### 첫 배포 또는 `src/` 변경 없이 배포할 때

```bash
# 정식 릴리즈
git tag v1.0.1
git push origin v1.0.1

# 스냅샷
git tag snap_v1.0.1
git push origin snap_v1.0.1
```

---

## 주의사항

- `TurboModuleRegistry.getEnforcing`을 사용하므로, 네이티브에 `NativeBridgeModule`이 등록되지 않은 환경(순수 JS 테스트 등)에서는 임포트 시점에 오류가 발생한다.
- `useBridgeEvent`의 제네릭 타입 `T`는 런타임에서 검증되지 않는다. 네이티브가 전송하는 실제 데이터 구조와 일치하도록 직접 관리해야 한다.
- `sendToNative`에서 `T`를 구체적 타입으로 지정할 경우 `data` 인수를 반드시 명시해야 한다. 생략하면 기본값 `{}`가 `T` 형태와 맞지 않을 수 있다.
- Android sourceDir은 `./android/bridge-lib`이다. 일반적인 RN 프로젝트의 `./android`와 다르므로 autolinking 설정 시 주의한다.
- `SafeAreaProvider`는 앱 루트에서 반드시 한 번만 배치해야 한다. `useSafeAreaInsets`는 `SafeAreaProvider` 하위에서만 호출할 수 있다.
- `.npmrc`에 GitHub 토큰을 하드코딩한 채로 커밋하지 않도록 주의한다.
