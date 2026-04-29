# iOS 네이티브 연동 가이드

## 1. XCFramework 빌드

소비앱 프로젝트 루트에서 실행합니다. JS 번들 빌드 → XCFramework 빌드 순서로 자동 실행됩니다.

```bash
./node_modules/@codehong-dev/hongfield/package-ios.sh
```

결과물: `output/ios/BridgeLib.xcframework`

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

## 3. 호스트 앱에 XCFramework 추가

1. `BridgeLib.xcframework`를 Xcode 프로젝트로 드래그 앤 드롭
2. `General > Frameworks, Libraries, and Embedded Content`에서 **Embed & Sign** 선택
3. React Native 의존성 추가 (CocoaPods):

```ruby
# 호스트 앱 Podfile
pod 'React-Core', :path => '../node_modules/react-native'
pod 'React-RCTAppDelegate', :path => '../node_modules/react-native'
```

> **Static linking 필수:** BridgeLib XCFramework는 static linking 환경에서 빌드되었다. 호스트 앱 Podfile에서 React Native 의존성을 dynamic으로 링크하면 충돌이 발생할 수 있다.

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

### `devURL` 값 결정 방법

Metro 개발 서버에 접속하는 URL로, 실행 환경에 따라 다르다.

| 환경 | devURL |
|---|---|
| iOS 시뮬레이터 | `http://localhost:8081/index.bundle` |
| 실기기 (USB/Wi-Fi) | `http://<개발 Mac IP>:8081/index.bundle` |

- **시뮬레이터**: Mac과 같은 네트워크 스택을 공유하므로 `localhost`를 그대로 사용한다.
- **실기기**: 기기와 Mac이 같은 Wi-Fi에 연결된 상태에서 Mac의 로컬 IP를 사용한다. IP는 시스템 환경설정 > 네트워크 또는 터미널에서 `ifconfig | grep "inet "` 으로 확인한다.
- 포트 `8081`은 Metro의 기본값이다. `react-native start --port 9090` 처럼 변경한 경우 해당 포트를 사용한다.
- 실기기 사용 시 `Info.plist`에 ATS 예외 설정이 필요하다 (아래 섹션 8 참고).

### `localBundleURL` 값 결정 방법

OTA(CodePush 등)로 다운로드한 번들 파일의 **기기 내 파일 URL**이다. `nil`이면 `assetName`의 번들을 사용한다.

앱 샌드박스 내 쓰기 가능한 경로를 사용해야 한다. Documents 디렉토리 또는 Library/Application Support가 일반적이다:

```swift
// Documents 디렉토리 기반 경로 예시
let bundleURL = FileManager.default
    .urls(for: .documentDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("bridge_bundle.js")
```

CodePush를 사용한다면 다운로드 완료 콜백에서 URL을 `UserDefaults`에 저장한 뒤 앱 재시작 시 읽어서 전달한다:

```swift
// OTA 다운로드 완료 시 경로 저장
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
