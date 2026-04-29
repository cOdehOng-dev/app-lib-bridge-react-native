# iOS 네이티브 연동 가이드

## 1. XCFramework 빌드

소비앱 프로젝트 루트에서 실행합니다. JS 번들 빌드 → XCFramework 빌드 순서로 자동 실행됩니다.

```bash
./node_modules/@codehong-dev/hongfield/package-ios.sh --scheme BridgeLib --configuration Release
```

> CLI 명령어는 [rn-setup.md — 섹션 5](./rn-setup.md#5-번들-빌드-및-네이티브-패키징)를 참고하세요.

결과물: `output/ios/BridgeLib.xcframework`

## 2. Xcode 프레임워크 타겟 설정 (최초 1회)

React Native 프로젝트에서 BridgeLib Framework 타겟을 생성하고 설정해야 합니다.
전체 절차는 [RN 프로젝트 설정 가이드 — 섹션 7](./rn-setup.md#7-ios-framework-타겟-설정-xcode-최초-1회)을 참고합니다.

> **필수 Build Settings 요약:**
> - Build Libraries for Distribution: `YES`
> - User Script Sandboxing: `NO`
> - Skip Install: `NO`
> - Enable Module Verifier: `NO`
>
> Bundle React Native code and images 스크립트를 BridgeLib 타겟의 Build Phases에 추가해야 JS 번들이 XCFramework에 포함됩니다.

## 3. 호스트 앱에 XCFramework 추가

1. `BridgeLib.xcframework`를 Xcode 프로젝트로 드래그 앤 드롭
2. `General > Frameworks, Libraries, and Embedded Content`에서 **Embed & Sign** 선택
3. React Native 의존성 추가 (Podfile):

```ruby
pod 'React-Core', :path => '../node_modules/react-native'
pod 'React-RCTAppDelegate', :path => '../node_modules/react-native'
```

> **Static linking 필수:** BridgeLib XCFramework는 static linking 환경에서 빌드되었습니다. 호스트 앱 Podfile에서 React Native 의존성을 dynamic으로 링크하면 충돌이 발생할 수 있습니다.

## 4. AppDelegate 초기화

기본값으로 자동 설정되므로 대부분의 경우 한 줄로 충분합니다:

```swift
import UIKit
import BridgeLib

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        BridgeLibManager.shared.initialize()
        return true
    }
}
```

커스텀이 필요한 경우 `BundleConfig`를 전달합니다:

```swift
BridgeLibManager.shared.initialize(
    bundleConfig: BundleConfig(
        devURL: URL(string: "http://192.168.1.100:8081/index.bundle")!, // 실기기 접속 시
        localBundleURL: localOtaBundleURL                               // OTA 번들 경로
    )
)
```

> **자동 설정 기본값**
> - `assetName`: `"main"` (main.jsbundle)
> - `devURL`: `http://localhost:8081/index.bundle` (시뮬레이터 표준)
> - 디버그 여부: `#if DEBUG` 컴파일 플래그로 자동 감지

### 실기기 `devURL` 설정

| 환경 | devURL |
|---|---|
| iOS 시뮬레이터 | `http://localhost:8081/index.bundle` (기본값) |
| 실기기 (USB/Wi-Fi) | `http://<개발 Mac IP>:8081/index.bundle` |

Mac IP 확인: `ifconfig | grep "inet "` 또는 시스템 환경설정 > 네트워크

실기기 사용 시 `Info.plist`에 ATS 예외 설정 필요 (아래 섹션 8 참고).

## 5. RN 화면 실행

```swift
import BridgeLib

// Push
let vc = BridgeLibViewController(
    moduleName: "HomeScreen",
    initialProps: ["userId": "123", "theme": "dark"]
)
navigationController?.pushViewController(vc, animated: true)

// Modal
let vc = BridgeLibViewController(moduleName: "PaymentScreen")
present(vc, animated: true)
```

## 6. 이벤트 통신

```swift
import BridgeLib

// 네이티브 → RN
BridgeEventEmitter.shared.send("USER_LOGGED_IN", body: ["name": "Oscar"])

// RN → 네이티브 리스너
BridgeEventEmitter.shared.on("PAYMENT_DONE") { data in
    if let amount = data["amount"] as? Double {
        self.processPayment(amount: amount)
    }
}

// 리스너 해제
BridgeEventEmitter.shared.off("PAYMENT_DONE")
```

## 7. OTA 번들 설정

`BridgeLibManager.initialize()`는 최초 1회만 적용됩니다. OTA 번들을 적용하려면 앱 콜드 스타트 전에 URL을 저장해두어야 합니다.

```swift
// 1) OTA 다운로드 완료 후 — URL을 영구 저장소에 기록
UserDefaults.standard.set(downloadedBundleURL.path, forKey: "bridge_lib_bundle_path")

// 2) AppDelegate — 앱 시작 시 저장된 경로 읽기
let localBundleURL: URL? = {
    guard let path = UserDefaults.standard.string(forKey: "bridge_lib_bundle_path") else { return nil }
    return URL(fileURLWithPath: path)
}()

BridgeLibManager.shared.initialize(
    bundleConfig: BundleConfig(localBundleURL: localBundleURL)
)
```

## 8. 개발 서버 연결 설정 (실기기 전용)

실기기에서 Metro 서버에 접속하려면 `Info.plist`에 ATS 예외를 추가합니다:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

시뮬레이터는 `localhost`를 자동으로 사용하므로 별도 설정이 필요하지 않습니다.
