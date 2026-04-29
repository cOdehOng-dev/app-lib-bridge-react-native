# React Native 프로젝트 설정 가이드

## 1. 패키지 설치

```bash
# npm
npm install nol-react-native-bridge

# yarn
yarn add nol-react-native-bridge

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
import { useBridgeEvent } from 'nol-react-native-bridge';

function HomeScreen() {
  useBridgeEvent('USER_LOGGED_IN', (data) => {
    console.log('로그인 사용자:', data.name);
  });

  return <View />;
}
```

## 4. 이벤트 전송 (RN → 네이티브)

```typescript
import { sendToNative } from 'nol-react-native-bridge';

function PaymentButton() {
  const handlePress = () => {
    sendToNative('PAYMENT_DONE', { amount: 9900, currency: 'KRW' });
  };

  return <Button onPress={handlePress} title="결제" />;
}
```

## 5. 번들 빌드

```bash
# Android 번들
react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res

# iOS 번들
react-native bundle \
  --platform ios \
  --dev false \
  --entry-file index.js \
  --bundle-output ios/main.jsbundle \
  --assets-dest ios
```

## 6. Codegen 설정 확인

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

이후 아래 명령어로 XCFramework를 빌드한다:

```bash
# npm
npx nol-react-native-bridge package:ios --scheme BridgeLib --configuration Release

# yarn
yarn nol-react-native-bridge package:ios --scheme BridgeLib --configuration Release
```
