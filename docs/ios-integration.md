# iOS 네이티브 연동 가이드

## 1. XCFramework 빌드

bridge-lib 레포에서 (Xcode 스킴 `BridgeLib` 설정 후):

```bash
npx bridge-lib package:ios --scheme BridgeLib --configuration Release
```

결과물: `output/ios/BridgeLib.xcframework`

## 2. Xcode 프레임워크 타겟 설정 (최초 1회)

1. Xcode에서 `ios/BridgeLib/` 폴더의 Swift/ObjC 파일들을 새 Framework 타겟에 추가
2. 타겟 이름: `BridgeLib`
3. `Build Settings > Build Library for Distribution`: `YES`
4. `Build Settings > Swift Language Version`: `Swift 5`
5. `Product > Scheme > New Scheme`으로 `BridgeLib` 스킴 생성

## 3. 호스트 앱에 XCFramework 추가

1. `BridgeLib.xcframework`를 Xcode 프로젝트로 드래그 앤 드롭
2. `General > Frameworks, Libraries, and Embedded Content`에서 **Embed & Sign** 선택
3. React Native 의존성 추가 (CocoaPods):

```ruby
# 호스트 앱 Podfile
pod 'React-Core', :path => '../node_modules/react-native'
pod 'React-RCTAppDelegate', :path => '../node_modules/react-native'
```

## 4. AppDelegate 초기화

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
        BridgeLibManager.shared.initialize(
            bundleConfig: BundleConfig(
                devURL: URL(string: "http://localhost:8081/index.bundle")!,
                assetName: "main",          // main.jsbundle
                localBundleURL: nil         // OTA 다운로드 시 설정
            )
        )
        return true
    }
}
```

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

## 7. OTA/CodePush 번들 설정

OTA로 새 번들이 다운로드된 후, 다음 앱 콜드 스타트 시 적용되도록 번들 URL을 저장해두어야 한다.  
`BridgeLibManager.initialize()`는 최초 1회만 적용되므로 런타임에 재호출해도 번들이 교체되지 않는다.

```swift
// OTA 다운로드 완료 후 — URL을 영구 저장소에 기록
let downloadedBundleURL = URL(fileURLWithPath: "/path/to/downloaded/bundle.js")
UserDefaults.standard.set(downloadedBundleURL.path, forKey: "bridge_lib_bundle_path")

// AppDelegate — 앱 시작 시 저장된 경로 읽기
let localBundleURL: URL? = {
    guard let path = UserDefaults.standard.string(forKey: "bridge_lib_bundle_path") else { return nil }
    return URL(fileURLWithPath: path)
}()

BridgeLibManager.shared.initialize(
    bundleConfig: BundleConfig(
        devURL: URL(string: "http://localhost:8081/index.bundle")!,
        assetName: "main",
        localBundleURL: localBundleURL   // nil이면 assets 번들 사용
    )
)
```

## 8. 개발 서버 연결 설정

시뮬레이터: 자동으로 `localhost:8081` 연결  
실기기: `Info.plist`에 추가:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```
