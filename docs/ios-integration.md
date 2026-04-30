# iOS 네이티브 연동 가이드

## 개요

`BridgeLib`는 React Native(New Architecture / Fabric) 화면을 네이티브 iOS 앱에 임베드하기 위한 XCFramework입니다.
핵심 구성 요소는 다음과 같습니다.

| 클래스 | 역할 |
|---|---|
| `BridgeLibManager` | RN 런타임(RCTReactNativeFactory) 초기화 및 수명 관리 |
| `BridgeLibViewController` | RN 화면을 UIViewController로 래핑 (Fabric 기반) |
| `BridgeEventEmitter` | 네이티브 ↔ RN 이벤트 송수신 허브 |
| `BundleConfig` | 번들 URL 해석 전략 구성 (DEBUG/RELEASE/OTA) |

---

## 1. 설치 방법

### 1-1. XCFramework 빌드

소비 앱 프로젝트 루트에서 실행합니다. JS 번들 빌드 → XCFramework 빌드 순서로 자동 실행됩니다.

```bash
./node_modules/@codehong-dev/hongfield/package-ios.sh --scheme BridgeLib --configuration Release
```

> CLI 명령어 상세 설명은 [rn-setup.md — 섹션 6](./rn-setup.md#6-번들-빌드-및-네이티브-패키징)을 참고하세요.

결과물: `output/ios/BridgeLib.xcframework`

### 1-2. Xcode 프레임워크 타겟 설정 (최초 1회)

React Native 프로젝트에서 `BridgeLib` Framework 타겟을 생성하고 설정해야 합니다.
전체 절차는 [rn-setup.md — 섹션 7](./rn-setup.md#7-ios-framework-타겟-설정-xcode-최초-1회)을 참고합니다.

> **필수 Build Settings 요약:**
> - Build Libraries for Distribution: `YES`
> - User Script Sandboxing: `NO`
> - Skip Install: `NO`
> - Enable Module Verifier: `NO`
>
> Bundle React Native code and images 스크립트를 BridgeLib 타겟의 Build Phases에 추가해야 JS 번들이 XCFramework에 포함됩니다.

### 1-3. Podfile 설정

라이브러리 내부 Podfile은 **static linkage**를 사용합니다. 호스트 앱 Podfile에서 동일하게 맞춰야 충돌을 방지할 수 있습니다.

```ruby
# Resolve react_native_pods.rb with node to allow for hoisting
require Pod::Executable.execute_command('node', ['-p',
  'require.resolve(
    "react-native/scripts/react_native_pods.rb",
    {paths: [process.argv[1]]},
  )', __dir__]).strip

platform :ios, min_ios_version_supported
prepare_react_native_project!

# static linkage 필수 — BridgeLib XCFramework는 static 환경에서 빌드됩니다.
use_frameworks! :linkage => :static

target 'YourApp' do
  config = use_native_modules!

  use_react_native!(
    :path => config[:reactNativePath],
    :app_path => "#{Pod::Config.instance.installation_root}/.."
  )

  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false
    )
  end
end
```

> **주의:** `use_frameworks! :linkage => :dynamic`이나 pod 개별 선언(`pod 'React-Core'` 등)은 사용하지 마세요. BridgeLib XCFramework는 static linking 환경에서 빌드되었으므로 동적 링크 시 심볼 충돌이 발생합니다.

### 1-4. 호스트 앱에 XCFramework 추가

1. `BridgeLib.xcframework`를 Xcode 프로젝트로 드래그 앤 드롭
2. `General > Frameworks, Libraries, and Embedded Content`에서 **Embed & Sign** 선택

---

## 2. BridgeLibManager 초기화

`BridgeLibManager`는 RN 런타임(`RCTReactNativeFactory`)을 생성하고 보관합니다.
`AppDelegate.application(_:didFinishLaunchingWithOptions:)`에서 **반드시 1회 호출**해야 합니다.

> `initialize()`는 내부에서 `guard factory == nil`로 보호되어 있어, 두 번째 호출은 자동으로 무시됩니다.

### 기본값으로 초기화 (시뮬레이터 개발)

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
        do {
            try BridgeLibManager.shared.initialize()
        } catch {
            // 초기화 실패 시 적절한 에러 처리
            assertionFailure("[AppDelegate] BridgeLib 초기화 실패: \(error)")
        }
        return true
    }
}
```

> `initialize()`는 기본값으로 `BundleConfig()`를 사용합니다. 별도 설정이 없으면 DEBUG 빌드에서 `http://localhost:8081/index.bundle`에 접속합니다.

### 커스텀 BundleConfig 전달

```swift
BridgeLibManager.shared.initialize(
    bundleConfig: BundleConfig(
        devURL: URL(string: "http://192.168.1.100:8081/index.bundle")!, // 실기기 접속 시
        localBundleURL: localOtaBundleURL                               // OTA 번들 경로
    )
)
```

### BundleConfig 기본값

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `devURL` | `http://localhost:8081/index.bundle` | DEBUG 빌드에서 사용 (시뮬레이터 표준) |
| `assetName` | `"main"` | RELEASE 빌드에서 참조할 `.jsbundle` 파일명 (확장자 제외) |
| `localBundleURL` | `nil` | OTA 다운로드 번들 경로. nil이면 `assetName` 사용 |

**빌드 구성에 따른 번들 URL 해석 전략:**

```swift
// BundleConfig.resolvedURL() 내부 로직 (요약)
#if DEBUG
return devURL                   // Metro 개발 서버
#else
if let localURL = localBundleURL {
    return localURL             // OTA 번들 우선
}
return BridgeLibBundle.url(forResource: assetName, withExtension: "jsbundle") // 앱 내장 번들
#endif
```

---

## 3. BridgeLibViewController 사용법

`BridgeLibViewController`는 React Native(Fabric) 화면을 UIViewController로 래핑합니다.
내부에서 `RCTFabricSurface` + `RCTSurfaceHostingView`를 생성하여 `view.bounds` 전체에 임베드합니다.

### Push 방식

```swift
import BridgeLib

let vc = BridgeLibViewController(
    moduleName: "HomeScreen",
    initialProps: ["userId": "123", "theme": "dark"]
)
vc.onPopRequested = { [weak self] in
    self?.navigationController?.popViewController(animated: true)
}
navigationController?.pushViewController(vc, animated: true)
```

### Modal 방식

```swift
import BridgeLib

let vc = BridgeLibViewController(moduleName: "PaymentScreen")
vc.onPopRequested = { [weak self] in
    self?.dismiss(animated: true)
}
present(vc, animated: true)
```

### onPopRequested 동작 원리

`onPopRequested`는 RN 측에서 `popToNative()`를 호출할 때 실행되는 클로저입니다.

- `viewDidLoad`에서 `BridgeEventEmitter.shared.setPopToNativeCallback`에 자동 등록됩니다.
- `viewDidDisappear`에서 콜백이 자동으로 `nil`로 해제되므로 수동 정리가 필요 없습니다.
- `nil`로 두면 아무 동작도 하지 않습니다.

```swift
// BridgeLibViewController 내부 동작 (참고용)
public override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    embedReactNativeView()
    BridgeEventEmitter.shared.setPopToNativeCallback { [weak self] in
        self?.onPopRequested?()
    }
}

public override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    BridgeEventEmitter.shared.setPopToNativeCallback(nil)
}
```

### 초기화 순서 주의

`BridgeLibViewController`는 내부에서 `BridgeLibManager.shared.getFactory().bridge`를 사용합니다.
`BridgeLibManager.shared.initialize()`가 호출되지 않은 상태에서 ViewController를 생성하면 런타임에 `fatalError`가 발생합니다.

---

## 4. 이벤트 송수신

`BridgeEventEmitter`는 네이티브와 RN 사이의 이벤트 허브입니다. JS 이벤트 채널명은 내부적으로 `"BridgeEvent"` 하나로 통합되며, `name` 필드로 이벤트 종류를 구분합니다.

### 네이티브 → RN 이벤트 전송

```swift
import BridgeLib

// 단순 이벤트
BridgeEventEmitter.shared.send("USER_LOGGED_IN", body: ["name": "Oscar"])

// body가 없는 경우
BridgeEventEmitter.shared.send("SESSION_EXPIRED")
```

> **주의:** `send()`는 `NativeBridgeModule.shared`가 초기화된 이후에만 동작합니다. RN 런타임이 완전히 기동되기 전에 호출하면 이벤트가 드롭되며 NSLog 경고만 출력됩니다. Android의 `BridgeEventBus`와 달리 iOS에는 이벤트 버퍼링이 없습니다.

### RN → 네이티브 이벤트 수신

RN → 네이티브 방향의 이벤트 수신 방식은 두 가지가 있습니다.

#### 방식 A. `RNEventListener` 프로토콜 (권장 — `BridgeLibViewController` 사용 시)

`BridgeLibViewController`를 상속하는 경우 `RNEventListener` 프로토콜을 채택하고 `eventListener`에 자기 자신을 할당하면, RN에서 발생하는 **모든 이벤트**를 단일 메서드에서 처리할 수 있습니다. 라이프사이클 등록/해제가 자동으로 관리되므로 별도 `off()` 호출이 필요 없습니다.

```swift
import BridgeLib

class MyViewController: BridgeLibViewController, RNEventListener {

    override func viewDidLoad() {
        super.viewDidLoad()
        eventListener = self  // BridgeLibViewController가 자동으로 등록/해제 처리
    }

    // MARK: - RNEventListener

    func onEvent(eventName: String, data: [String: Any]) {
        switch eventName {
        case "PAYMENT_DONE":
            guard let amount = data["amount"] as? Double else { return }
            processPayment(amount: amount)
        case "ORDER_UPDATED":
            guard let orderId = data["orderId"] as? String,
                  let status = data["status"] as? String else { return }
            updateOrderUI(orderId: orderId, status: status)
        default:
            break
        }
    }
}
```

**동작 원리:**

- `viewDidLoad`에서 `BridgeEventEmitter.shared.setGlobalEventListener`에 자동 등록됩니다.
- `viewDidDisappear`에서 `globalEventListener`가 자동으로 `nil`로 해제되므로 수동 정리가 필요 없습니다.
- per-event 리스너(`on()`)와 `globalEventListener`는 독립적으로 동작합니다. 동일 이벤트에 둘 다 등록된 경우 양쪽 모두 호출됩니다.

> `eventListener`는 `weak` 참조입니다. 할당 대상이 메모리에서 해제되면 자동으로 `nil`이 되어 이벤트가 무시됩니다.

#### 방식 B. `on()` / `off()` 클로저 (개별 이벤트 구독)

`BridgeLibViewController` 외부에서 특정 이벤트만 구독하거나, ViewController를 상속하지 않는 경우에 사용합니다.

```swift
import BridgeLib

// 리스너 등록
BridgeEventEmitter.shared.on("PAYMENT_DONE") { data in
    if let amount = data["amount"] as? Double {
        self.processPayment(amount: amount)
    }
}

// 복합 데이터 수신 예시
BridgeEventEmitter.shared.on("ORDER_UPDATED") { data in
    guard let orderId = data["orderId"] as? String,
          let status = data["status"] as? String else { return }
    self.updateOrderUI(orderId: orderId, status: status)
}
```

> Swift는 런타임 타입이므로 `as?` 캐스팅으로 타입을 검증하세요. RN 측에서 `useBridgeEvent<T>` 제네릭 훅을 사용하더라도 iOS에서는 `[String: Any]` 딕셔너리로 수신됩니다.

### 리스너 해제 (`on()` 방식 사용 시)

```swift
// 특정 이벤트 리스너 제거
BridgeEventEmitter.shared.off("PAYMENT_DONE")
```

> 리스너는 이벤트명 기준으로 단일 등록됩니다. 동일 이벤트명으로 `on()`을 다시 호출하면 이전 콜백이 덮어씌워집니다.
> `RNEventListener` 프로토콜 방식(`eventListener`)을 사용하는 경우에는 `off()` 호출이 불필요합니다.

### 이벤트 흐름 요약

```
[네이티브 → RN]
BridgeEventEmitter.send(name, body)
  → NativeBridgeModule.emitToJS(eventName:data:)
  → RCTEventEmitter.sendEvent(withName: "BridgeEvent", body: ["name": eventName, "data": data])
  → RN JS: useBridgeEvent(name) 훅

[RN → 네이티브]
RN JS: BridgeNativeModule.sendEvent(name, data)
  → NativeBridgeModule.sendEvent(_:data:)  [RCT_EXTERN_METHOD]
  → BridgeEventEmitter.handleFromRN(name:data:)
  ├── on(name) 콜백 호출  [방식 B — 이벤트별 클로저]
  └── globalEventListener(name, data) 호출  [방식 A — RNEventListener 프로토콜]
        → BridgeLibViewController.eventListener?.onEvent(eventName:data:)
```

> `on()` 클로저와 `globalEventListener`(RNEventListener 방식)는 독립적으로 동작하며 동시에 호출될 수 있습니다. 동일 이벤트에 두 방식 모두 등록된 경우 순서는 `on()` → `globalEventListener` 순입니다.

---

## 5. SafeAreaView / Inset 관련 주의사항

`BridgeLibViewController`는 `view.backgroundColor = .systemBackground`를 설정하고,
`RCTSurfaceHostingView`를 `view.bounds` 전체 (`autoresizingMask: [.flexibleWidth, .flexibleHeight]`)에 채웁니다.

**Safe Area 처리 책임은 RN(JS) 코드에 있습니다.**

- 네이티브 컨테이너는 Safe Area를 자동으로 적용하지 않습니다.
- RN 화면에서 `<SafeAreaView>` 또는 `useSafeAreaInsets()`(`react-native-safe-area-context`)를 사용하여 직접 처리해야 합니다.
- Navigation Bar, Tab Bar가 있는 경우 `additionalSafeAreaInsets`를 네이티브에서 조정하거나 RN 측에서 inset 값을 초기 props로 전달하는 방식을 사용할 수 있습니다.

---

## 6. OTA 번들 설정

`BridgeLibManager.initialize()`는 최초 1회만 적용됩니다. OTA 번들을 사용하려면 앱 콜드 스타트 전에 URL을 영구 저장소에 기록해두어야 합니다.

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

---

## 7. 개발 서버 연결 설정 (실기기 전용)

### devURL 설정

| 환경 | devURL |
|---|---|
| iOS 시뮬레이터 | `http://localhost:8081/index.bundle` (기본값, 별도 설정 불필요) |
| 실기기 (USB/Wi-Fi) | `http://<개발 Mac IP>:8081/index.bundle` |

Mac IP 확인: `ifconfig | grep "inet "` 또는 시스템 환경설정 > 네트워크

### Info.plist ATS 예외 설정

실기기에서 Metro 서버(`http://`)에 접속하려면 `Info.plist`에 ATS 예외를 추가해야 합니다.

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

> 시뮬레이터는 `localhost`를 자동으로 사용하므로 별도 ATS 설정이 필요하지 않습니다.

---

## 8. 주의사항

### BridgeLibManager.initialize() 호출 순서

`BridgeLibManager.shared.initialize()`는 반드시 `BridgeLibViewController` 생성 전에 호출되어야 합니다.
초기화 전에 ViewController를 생성하면 `embedReactNativeView()` 내부에서 `assertionFailure` 및 `fatalError`가 발생합니다.

### 두 번 초기화 불가

`initialize()`는 `factory == nil` 체크로 보호되어 있습니다. 두 번째 호출은 NSLog 경고와 함께 무시됩니다.
OTA 번들을 교체하려면 앱을 재시작해야 합니다.

### 이벤트 드롭 위험

`BridgeEventEmitter.shared.send()`는 `NativeBridgeModule.shared`가 `nil`이면 이벤트를 버퍼 없이 드롭합니다.
RN 런타임이 완전히 기동되고 `NativeBridgeModule`이 초기화된 이후에 호출하세요.

### onPopRequested는 화면당 1개

`setPopToNativeCallback`은 전역 단일 콜백입니다. 동시에 여러 `BridgeLibViewController`가 화면에 존재하면 마지막으로 `viewDidLoad`가 호출된 ViewController의 콜백만 동작합니다.
화면이 사라질 때(`viewDidDisappear`) 자동으로 `nil`로 해제됩니다.

### eventListener(RNEventListener)도 전역 단일 리스너

`setGlobalEventListener`는 전역 단일 클로저입니다. `onPopRequested`와 동일하게 마지막으로 `viewDidLoad`가 호출된 `BridgeLibViewController`의 `eventListener`만 활성화됩니다. 동시에 여러 ViewController가 이벤트를 수신해야 하는 경우에는 방식 B(`on()` 클로저)를 각 ViewController에서 별도로 등록하세요.

### Static linkage 필수

BridgeLib XCFramework는 `use_frameworks! :linkage => :static` 환경에서 빌드됩니다.
호스트 앱 Podfile에서 dynamic linkage를 사용하면 심볼 충돌 또는 듀얼 로딩 문제가 발생할 수 있습니다.

### New Architecture(Fabric) 전용

`BridgeLibViewController`는 `RCTFabricSurface`와 `RCTSurfaceHostingView`를 사용하므로
React Native New Architecture(Fabric)가 활성화된 환경에서만 동작합니다.
Old Architecture(Bridge) 환경은 지원하지 않습니다.
