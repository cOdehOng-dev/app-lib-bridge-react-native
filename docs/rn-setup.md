# React Native 프로젝트 설정 가이드

## 1. 패키지 설치

### .npmrc 설정 (최초 1회)

프로젝트 루트에 `.npmrc` 파일을 생성한다:

```
@codehong-dev:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

`YOUR_GITHUB_TOKEN`은 GitHub → Settings → Developer settings → Personal access tokens에서 `read:packages` 권한으로 발급한다.

> 주의: `.npmrc` 파일을 `.gitignore`에 추가하거나, 환경 변수 방식(`_authToken=${GITHUB_TOKEN}`)을 사용하세요. 토큰을 하드코딩한 채 커밋하지 마세요.

### 패키지 설치

```bash
# npm
npm install @codehong-dev/hongfield

# yarn
yarn add @codehong-dev/hongfield

# 또는 로컬 경로로 참조 (npm)
npm install /path/to/app-lib-bridge-react-native

# 또는 로컬 경로로 참조 (yarn)
yarn add /path/to/app-lib-bridge-react-native
```

## 2. 컴포넌트 등록

`index.js`에서 네이티브 앱이 호출할 컴포넌트를 등록한다.

```javascript
import { AppRegistry } from 'react-native';
import App from './App';
import HomeScreen from './screens/HomeScreen';

// 기본 앱 등록
AppRegistry.registerComponent('MyApp', () => App);

// 네이티브에서 개별 화면으로 실행할 컴포넌트 등록
AppRegistry.registerComponent('HomeScreen', () => HomeScreen);
AppRegistry.registerComponent('PaymentScreen', () => PaymentScreen);
```

## 3. 이벤트 구독 (네이티브 → RN)

```typescript
import { useBridgeEvent } from '@codehong-dev/hongfield';

function HomeScreen() {
  // 기본 사용 (타입 추론)
  useBridgeEvent('USER_LOGGED_IN', (data) => {
    console.log('로그인 사용자:', data.name);
  });

  // 제네릭으로 타입 명시
  useBridgeEvent<{ name: string; role: string }>('USER_LOGGED_IN', (data) => {
    console.log('로그인 사용자:', data.name, data.role);
  });

  return <View />;
}
```

## 4. 이벤트 전송 (RN → 네이티브)

```typescript
import { sendToNative } from '@codehong-dev/hongfield';

function PaymentButton() {
  const handlePress = () => {
    // 기본 사용
    sendToNative('PAYMENT_DONE', { amount: 9900, currency: 'KRW' });

    // 제네릭으로 타입 명시
    sendToNative<{ amount: number; currency: string }>(
      'PAYMENT_DONE',
      { amount: 9900, currency: 'KRW' }
    );
  };

  return <Button onPress={handlePress} title="결제" />;
}
```

## 5. 네이티브 화면 닫기 (RN → 네이티브)

RN에서 네이티브 컨테이너(Activity/Fragment/ViewController)를 닫으려면 `popToNative()`를 호출한다.

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

네이티브 측에서 `onPopRequested` 콜백을 등록해야 동작한다.
- Android: `BridgeLibActivity.onPopRequested` / `BridgeLibFragment.onPopRequested` 참고
- iOS: `BridgeLibViewController.onPopRequested` 참고

## 6. 번들 빌드 및 네이티브 패키징

번들 빌드는 AAR / XCFramework 빌드 시 자동으로 실행됩니다. 별도 실행 불필요합니다.

### Android

**sh 스크립트 (권장)**

```bash
# AAR 빌드 + 로컬 Maven 배포
./node_modules/@codehong-dev/hongfield/package-android.sh --module-name bridgelib

# AAR만 빌드 (Maven 배포 제외)
./node_modules/@codehong-dev/hongfield/package-android.sh --module-name bridgelib --skip-maven
```

**CLI**

```bash
# AAR 빌드
npx hongfield package:android --variant Release --module-name bridgelib

# 로컬 Maven 배포 (--version 필수)
npx hongfield publish:android --module-name bridgelib --version 1.0.0
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

## 7. Codegen 설정 확인

`package.json`에 다음이 포함되어 있어야 한다:

```json
{
  "codegenConfig": {
    "name": "NativeBridgeModuleSpec",
    "type": "modules",
    "jsSrcsDir": "src/specs"
  }
}
```

## 8. iOS Framework 타겟 설정 (Xcode, 최초 1회)

BridgeLib을 XCFramework로 패키징하기 위해 Xcode에서 Framework 타겟을 한 번 생성해야 한다.

### 타겟 생성

1. `ios/<project>.xcworkspace` 열기
2. File → New → Target → Framework 선택
3. Product Name: `BridgeLib`, Language: `Swift`
4. 생성된 `BridgeLib` 폴더를 우클릭 → **Convert to Group** (CocoaPods 호환 필수)
5. `BridgeLibTests` 폴더도 Convert to Group

### 필수 Build Settings

BridgeLib 타겟을 선택하고 Build Settings 탭에서 다음을 설정한다:


| Build Setting                    | Value | 이유                                         |
| -------------------------------- | ----- | ------------------------------------------ |
| Build Libraries for Distribution | YES   | Swift module interface 생성 (XCFramework 필수) |
| User Script Sandboxing           | NO    | JS 번들 빌드 스크립트가 파일을 수정할 수 있도록 허용            |
| Skip Install                     | NO    | Xcode가 archive 시 framework 파일을 생성하도록 보장    |
| Enable Module Verifier           | NO    | 빌드 시 모듈 검증 생략 (빌드 속도 개선)                   |


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

## 9. 버전 관리 및 배포

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

`package.json` (line 3)과 `package-lock.json` (line 2~3) 두 곳의 `"version"` 필드를 같은 값으로 수정한다:

```json
"version": "1.0.1"
```

### 배포 트리거


| 방법                       | 트리거 조건                 | dist-tag   |
| ------------------------ | ---------------------- | ---------- |
| master 브랜치 push          | `src/**` 변경 포함 시 자동 실행 | `latest`   |
| `v*` 태그 push             | 항상 실행 (paths 무관)       | `latest`   |
| develop/feature 브랜치 push | `src/**` 변경 포함 시 자동 실행 | `snapshot` |
| `snap_v*` 태그 push        | 항상 실행 (paths 무관)       | `snapshot` |
| GitHub Actions 수동 실행     | Actions 탭에서 직접 실행      | 선택         |


### 첫 배포 또는 `src/` 변경 없이 배포할 때

```bash
# 정식 릴리즈
git tag v1.0.1
git push origin v1.0.1

# 스냅샷
git tag snap_v1.0.1
git push origin snap_v1.0.1
```

