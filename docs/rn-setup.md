# React Native 프로젝트 설정 가이드

## 1. 패키지 설치

```bash
# npm
npm install bridge-lib

# 또는 로컬 경로로 참조
npm install /path/to/app-lib-bridge-react-native
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
import { useBridgeEvent } from 'bridge-lib';

function HomeScreen() {
  useBridgeEvent('USER_LOGGED_IN', (data) => {
    console.log('로그인 사용자:', data.name);
  });

  return <View />;
}
```

## 4. 이벤트 전송 (RN → 네이티브)

```typescript
import { sendToNative } from 'bridge-lib';

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
