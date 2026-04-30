# Android 네이티브 연동 가이드

## 개요

이 라이브러리는 네이티브 Android 앱에서 React Native 화면을 임베딩하기 위한 브리지 라이브러리입니다. 각 클래스의 역할은 다음과 같습니다.

| 클래스 | 역할 |
|---|---|
| `BridgeLibHost` | `ReactHost` 싱글톤을 초기화하고 관리. `init()` 은 최초 1회만 적용됨 |
| `BridgeLibActivity` | RN 화면을 전체화면 Activity로 실행. edge-to-edge + SafeAreaView 연동 내장 |
| `BridgeLibFragment` | RN 화면을 Fragment로 임베딩. 브라운필드 통합에 적합. inset 자동 전달 내장 |
| `BridgeLibPackage` | `NativeBridgeModule`을 RN 패키지로 등록 |
| `NativeBridgeModule` | JS ↔ 네이티브 이벤트 전송 채널. `BridgeEventBus`와 연결됨 |
| `BridgeEventBus` | 네이티브 코드 어디서든 RN으로 이벤트를 보내거나 받을 수 있는 싱글톤 버스 |
| `RNEventListener` | RN → 네이티브 이벤트를 수신하기 위한 인터페이스. `ReactNativeActivity`가 기본 구현을 제공함 |
| `ReactNativeActivity` | `BridgeLibActivity`를 확장한 Activity. `RNEventListener`를 구현하며 전역 이벤트 수신을 제공함 |
| `BundleConfig` | JS 번들 경로와 디버그 여부를 설정하는 데이터 클래스 |

---

## 1. AAR 빌드 및 로컬 Maven 배포

소비앱 프로젝트 루트에서 실행합니다. JS 번들 빌드 → AAR 빌드 → Maven 배포 순서로 자동 실행됩니다.

```bash
./node_modules/@codehong-dev/hongfield/package-android.sh
```

> CLI 명령어는 [rn-setup.md — 섹션 6](./rn-setup.md#6-번들-빌드-및-네이티브-패키징)를 참고하세요.

결과물: `output/android/bridgelib-release.aar`

---

## 2. 호스트 앱에 AAR 추가

### 방법 A: 파일 직접 추가

`app/libs/` 폴더에 AAR 복사 후 의존성 추가:

**Groovy (build.gradle)**

```groovy
dependencies {
    implementation fileTree(dir: 'libs', include: ['*.aar'])
    implementation 'com.facebook.react:react-android:0.84.1'
    implementation 'com.facebook.hermes:hermes-android:250829098.0.9'
}
```

**Kotlin DSL (build.gradle.kts)**

```kotlin
dependencies {
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.aar"))))
    implementation("com.facebook.react:react-android:0.84.1")
    implementation("com.facebook.hermes:hermes-android:250829098.0.9")
}
```

### 방법 B: 로컬 Maven 사용

`react-android` / `hermes-android`는 RN 0.71+부터 Maven Central에 직접 배포된다. `mavenCentral()`과 로컬 m2 저장소만 선언하면 된다.

**settings.gradle (Groovy)**

```groovy
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven { url "${System.properties['user.home']}/.m2/repository" }
    }
}
```

**settings.gradle.kts (Kotlin DSL)**

```kotlin
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("${System.getProperty("user.home")}/.m2/repository") }
    }
}
```

**build.gradle (Groovy)**

```groovy
dependencies {
    implementation 'com.hong.lib:hongfield:1.0.0' // publish:android --version 에 지정한 버전
}
```

**build.gradle.kts (Kotlin DSL)**

```kotlin
dependencies {
    implementation("com.hong.lib:hongfield:1.0.0") // publish:android --version 에 지정한 버전
}
```

> `react-android` / `hermes-android`는 hongfield POM에 명시되어 있어 Gradle이 Maven Central에서 자동으로 받아온다. 직접 선언할 필요 없다.

### 방법 C: Autolinking (RN 소스 빌드 프로젝트)

RN 프로젝트에서 AAR 대신 소스를 직접 빌드하는 경우 autolinking을 사용한다. `react-native.config.js`가 `android.sourceDir`을 선언하고 있으므로 `autolinkLibrariesFromCommand()`가 자동으로 native module을 링크하고 Codegen을 실행한다.

autolinking은 `:codehong-dev_hongfield` 프로젝트를 자동 생성한다. AAR publish를 위해 `:bridgelib`를 별도로 선언해도 이름이 달라 충돌하지 않는다.

**android/settings.gradle**

```groovy
pluginManagement { includeBuild("../node_modules/@react-native/gradle-plugin") }
plugins { id("com.facebook.react.settings") }
extensions.configure(com.facebook.react.ReactSettingsExtension) { ex ->
    ex.autolinkLibrariesFromCommand()
}
rootProject.name = 'MyApp'
include ':app'

// AAR publish 전용 — autolinking의 :codehong-dev_hongfield와 이름이 달라 충돌 없음
include ':bridgelib'
project(':bridgelib').projectDir = new File(rootProject.projectDir, '../node_modules/@codehong-dev/hongfield/android/bridge-lib')

includeBuild('../node_modules/@react-native/gradle-plugin')
```

> `:bridgelib`는 publish 태스크 전용이며 `:app`의 `dependencies`에 추가하지 않는다. `:app`은 autolinking이 생성한 `:codehong-dev_hongfield`를 사용한다.

---

## 3. AndroidManifest.xml 설정

```xml
<uses-permission android:name="android.permission.INTERNET" />

<!-- BridgeLibActivity가 자동으로 manifest에 포함됨 (AAR merge) -->
```

---

## 4. BridgeLibHost 설정

`BridgeLibHost`는 `ReactHost` 싱글톤을 관리하는 오브젝트입니다. `Application.onCreate()`에서 반드시 한 번 초기화해야 하며, 이후 호출은 무시됩니다.

### 시그니처

```kotlin
fun init(
    application: Application,
    bundleConfig: BundleConfig = BundleConfig(),
    packages: List<ReactPackage> = emptyList(),
    jsMainModulePath: String = "index"
)
```

### BundleConfig 파라미터

```kotlin
data class BundleConfig(
    val assetPath: String = "index.android.bundle",  // assets에 포함된 번들 파일명
    val localBundlePath: String? = null,             // OTA로 다운로드된 번들의 로컬 파일 경로. null이면 assetPath 사용
    val isDebug: Boolean? = null                     // null이면 ApplicationInfo.FLAG_DEBUGGABLE에서 자동 감지
)
```

### RN 프로젝트 (autolinking 사용) — 권장

`@react-native/gradle-plugin`으로 autolinking이 설정된 프로젝트는 `packages` 없이 한 줄로 초기화된다. `react-native-safe-area-context` 등 autolinking 패키지는 내부에서 `PackageList`를 리플렉션으로 탐지해 자동 포함된다.

```kotlin
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        BridgeLibHost.init(application = this)
    }
}
```

### 순수 네이티브 앱 (autolinking 없음)

RN 프로젝트 없이 AAR만 사용하는 경우 `PackageList`가 생성되지 않는다. 이때 `BridgeLibHost`는 `KNOWN_RN_PACKAGE_CLASSES` 목록(safe-area-context, gesture-handler, screens, vector-icons)을 리플렉션으로 탐지해 소비앱 classpath에 존재하는 패키지를 자동 등록한다. 추가로 필요한 패키지는 `packages`로 직접 전달한다.

```kotlin
import com.th3rdwave.safeareacontext.SafeAreaContextPackage

class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        BridgeLibHost.init(
            application = this,
            packages = listOf(SafeAreaContextPackage())
        )
    }
}
```

커스텀 번들 설정이 필요한 경우:

```kotlin
BridgeLibHost.init(
    application = this,
    bundleConfig = BundleConfig(localBundlePath = localOtaBundlePath)
)
```

> **`RNCSafeAreaProvider` 에러가 발생한다면**
> 소비앱에 autolinking이 설정되지 않은 환경이다. `packages = listOf(SafeAreaContextPackage())`를 추가하거나, [방법 C (Autolinking)](#방법-c-autolinking-rn-소스-빌드-프로젝트)를 참고해 autolinking을 설정한다.

---

## 5. BridgeLibActivity 사용법

`BridgeLibActivity`는 RN 화면을 전체화면 Activity로 실행합니다.

### 기본 실행

```kotlin
// moduleName만 지정
BridgeLibActivity.start(context = this, moduleName = "HomeScreen")

// initialProps 함께 전달
BridgeLibActivity.start(
    context = this,
    moduleName = "HomeScreen",
    initialProps = bundleOf("userId" to "123", "theme" to "dark")
)
```

`start()` 내부에서 `Context`가 Activity가 아닌 경우 `FLAG_ACTIVITY_NEW_TASK`를 자동으로 추가합니다.

### Intent Extra 키

| 상수 | 키 문자열 | 설명 |
|---|---|---|
| `EXTRA_MODULE_NAME` | `"bridge_lib_module_name"` | RN에 등록된 컴포넌트 이름 (필수) |
| `EXTRA_INITIAL_PROPS` | `"bridge_lib_initial_props"` | RN으로 전달할 초기 Props (Bundle, 선택) |

### edge-to-edge와 SafeAreaView 연동

`BridgeLibActivity`는 `onCreate()`에서 `WindowCompat.setDecorFitsSystemWindows(window, false)`로 edge-to-edge 레이아웃을 활성화합니다. 이렇게 하면 시스템 window inset이 뷰 계층을 통해 RN의 `SafeAreaProvider`까지 전달되어 `SafeAreaView`가 올바른 padding을 계산합니다.

단, `AppCompatActivity.setContentView()`는 내부적으로 `FitWindowsLinearLayout`(sub-decor)을 생성하며, 이 뷰의 `fitsSystemWindows=true`가 status bar 높이만큼 `paddingTop`을 추가합니다. `setDecorFitsSystemWindows(false)`는 Window 레벨만 처리하므로 sub-decor에는 영향을 주지 않습니다.

이를 해결하기 위해 `ReactSurfaceView`가 레이아웃에 붙는 시점에 `DecorView`까지의 모든 부모 뷰에 대해 `fitsSystemWindows = false`와 padding 0을 강제 적용합니다:

```kotlin
surfaceView.doOnAttach { view ->
    var v: View? = view.parent as? View
    while (v != null && v !== window.decorView) {
        v.fitsSystemWindows = false
        v.setPadding(0, 0, 0, 0)
        v = v.parent as? View
    }
}
```

이 덕분에 RN의 `SafeAreaView`가 정확한 top inset 값을 받습니다.

### popToNative 콜백 등록

RN에서 `popToNative()`를 호출했을 때의 동작을 지정합니다.

`onPopRequested`가 null이면 기본 동작으로 `finish()`가 호출됩니다. 별도 처리가 필요한 경우에만 서브클래싱합니다.

```kotlin
// 기본: finish()로 자동 종료
BridgeLibActivity.start(context = this, moduleName = "HomeScreen")

// 커스텀: 서브클래싱으로 onPopRequested 설정
class HomeActivity : BridgeLibActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        onPopRequested = { /* 커스텀 동작 */ finish() }
        super.onCreate(savedInstanceState)
    }
}
```

### Back 버튼 제어

```kotlin
// 서브클래스 또는 Activity 내부에서
setBackEnabled(false) // 뒤로가기 비활성화
setBackEnabled(true)  // 뒤로가기 재활성화
```

`backEnabled = false`이면 `onBackPressed()`가 즉시 반환됩니다. `true`이면 `BridgeLibHost.getReactHost().onBackPressed()`로 RN JS BackHandler에 위임합니다.

### 생명주기

Activity 생명주기(`onResume`, `onPause`, `onDestroy`)에서 `ReactHost`의 생명주기 메서드를 자동으로 호출합니다. `onDestroy`에서 `ReactSurface`를 중지하고 `popToNativeCallback`을 해제합니다.

---

## 6. BridgeLibFragment 사용법

`BridgeLibFragment`는 RN 화면을 Fragment로 임베딩합니다. 기존 네이티브 앱(브라운필드) 화면에 RN 뷰를 부분적으로 삽입할 때 적합합니다.

### 기본 사용

```kotlin
val fragment = BridgeLibFragment.newInstance(
    moduleName = "HomeScreen",
    initialProps = bundleOf("userId" to "123")
)

supportFragmentManager.beginTransaction()
    .replace(R.id.container, fragment)
    .addToBackStack(null)
    .commit()
```

### Fragment Argument 키

| 상수 | 키 문자열 | 설명 |
|---|---|---|
| `ARG_MODULE_NAME` | `"bridge_lib_module_name"` | RN에 등록된 컴포넌트 이름 (필수) |
| `ARG_INITIAL_PROPS` | `"bridge_lib_initial_props"` | RN으로 전달할 초기 Props (Bundle, 선택) |

### inset 자동 전달 (브라운필드 대응)

호스트 Activity가 이미 window inset을 소비한 경우에도 `BridgeLibFragment`는 `ReactSurfaceView`에 inset을 올바르게 전달합니다. `onCreateView()`에서 두 가지 처리를 수행합니다.

첫째, `surfaceView`가 레이아웃에 붙는 즉시 Window 루트에서 inset을 직접 읽어 dispatch합니다:

```kotlin
surfaceView.doOnAttach { view ->
    ViewCompat.getRootWindowInsets(view)?.let { insets ->
        ViewCompat.dispatchApplyWindowInsets(view, insets)
    }
}
```

둘째, `OnApplyWindowInsetsListener`를 등록해 `surfaceView`의 자식 뷰에도 inset이 전파되도록 합니다:

```kotlin
ViewCompat.setOnApplyWindowInsetsListener(surfaceView) { v, insets ->
    if (v is ViewGroup) {
        for (i in 0 until v.childCount) {
            ViewCompat.dispatchApplyWindowInsets(v.getChildAt(i), insets)
        }
    }
    insets
}
```

이 두 처리 덕분에 RN의 `SafeAreaView`가 호스트 Activity의 inset 소비 여부와 관계없이 정확한 padding을 계산합니다.

### popToNative 콜백 등록

```kotlin
val fragment = BridgeLibFragment.newInstance("HomeScreen")
fragment.onPopRequested = { supportFragmentManager.popBackStack() }

supportFragmentManager.beginTransaction()
    .replace(R.id.container, fragment)
    .addToBackStack(null)
    .commit()
```

`onPopRequested`가 null이면 아무 동작도 하지 않습니다.

### Back 버튼 제어

```kotlin
fragment.setBackEnabled(false) // RN 내부 JS 스택 소진될 때까지 네이티브 뒤로가기 비활성화
fragment.setBackEnabled(true)  // 네이티브 뒤로가기 재활성화
```

`backEnabled = false` 설정 시 `OnBackPressedCallback`이 활성화되어 뒤로가기를 RN JS BackHandler에 위임합니다. JS 스택이 소진되면 아무 동작도 하지 않습니다.

### 생명주기

`onResume`/`onPause`에서 `ReactHost` 생명주기 메서드를 호출합니다. `onDestroyView`에서 `ReactSurface`를 중지하고 `popToNativeCallback`을 해제합니다. Fragment 방식에서는 호스트 Activity가 `DefaultHardwareBackBtnHandler`를 구현해야 `onResume`에서 back handler가 정상 등록됩니다.

---

## 7. 이벤트 송수신

이벤트 통신은 `BridgeEventBus` 싱글톤을 통해 이루어집니다. `NativeBridgeModule`이 JS ↔ 네이티브 채널을 담당하며, `BridgeLibPackage`가 이를 RN에 자동 등록합니다.

### 네이티브 → RN 이벤트 전송

```kotlin
BridgeEventBus.send("USER_LOGGED_IN", mapOf("name" to "Oscar", "role" to "admin"))
```

RN 측에서는 `NativeEventEmitter`의 `"BridgeEvent"` 이벤트를 수신하며, payload 형태는 `{ name: string, data: object }`입니다.

`data` 값의 타입 매핑은 다음과 같습니다: `String`, `Int`, `Double`, `Boolean`, `Long`(→ Double), `null`, 그 외(→ `toString()`).

### RN → 네이티브 이벤트 수신

RN → 네이티브 이벤트를 수신하는 방법은 두 가지입니다.

#### 방법 A: `BridgeEventBus.on()` (이벤트별 등록)

특정 이벤트만 선택적으로 수신하거나, `ReactNativeActivity`를 사용하지 않는 환경(Fragment 단독 사용 등)에 적합합니다.

```kotlin
BridgeEventBus.on("PAYMENT_DONE") { data ->
    val amount = data["amount"] as? Double ?: 0.0
    processPayment(amount)
}

// 리스너 해제 — Activity/Fragment의 onDestroy 또는 onDestroyView에서 반드시 호출
BridgeEventBus.off("PAYMENT_DONE")
```

#### 방법 B: `RNEventListener` 인터페이스 (권장 — `ReactNativeActivity` 사용 시)

`ReactNativeActivity`는 `RNEventListener` 인터페이스를 구현하며, `onCreate()`에서 `BridgeEventBus.setGlobalEventListener()`를 자동으로 등록하고 `onDestroy()`에서 해제합니다. RN에서 발생하는 **모든 이벤트**를 한 곳에서 처리할 수 있어, `ReactNativeActivity`를 상속하는 경우에는 이 방식을 권장합니다.

`ReactNativeActivity`를 상속하고 `onEvent()`만 오버라이드하면 됩니다. 리스너 등록/해제는 자동으로 처리됩니다.

```kotlin
class MyActivity : ReactNativeActivity() {
    override fun onEvent(eventName: String, data: Map<String, Any?>) {
        when (eventName) {
            "PAYMENT_DONE" -> {
                val amount = data["amount"] as? Double ?: 0.0
                processPayment(amount)
            }
            "USER_LOGOUT" -> handleLogout()
        }
    }
}
```

`setGlobalEventListener()`는 `BridgeEventBus`에 전역 리스너를 하나 등록합니다. RN에서 `NativeBridgeModule.sendEvent()`가 호출될 때 이벤트별 `on()` 리스너와 전역 리스너가 모두 호출됩니다.

> **두 방식 혼용 시 주의:** `BridgeEventBus.on()`으로 등록한 이벤트별 리스너와 `setGlobalEventListener()`로 등록한 전역 리스너는 독립적으로 동작합니다. 동일 이벤트에 두 방식을 모두 등록하면 둘 다 호출됩니다. 중복 처리가 발생하지 않도록 주의하세요.

RN 측에서는 `NativeBridgeModule.sendEvent(name, data)`를 호출하면 됩니다.

### popToNative

RN에서 `NativeBridgeModule.popToNative()`를 호출하면 `BridgeEventBus`에 등록된 `popToNativeCallback`이 실행됩니다. 이 콜백은 `BridgeLibActivity.onCreate()`와 `BridgeLibFragment.onCreateView()`에서 자동으로 등록됩니다.

### 이벤트 큐 동작

`NativeBridgeModule`이 아직 초기화되지 않은 상태(RN 로딩 전)에서 `BridgeEventBus.send()`를 호출하면, 이벤트는 내부 `pendingQueue`(`ConcurrentLinkedQueue`)에 쌓입니다. `NativeBridgeModule.initialize()`가 호출되는 즉시 자동으로 flush되어 이벤트 유실 없이 동작합니다.

```kotlin
// Application.onCreate()에서 이벤트를 즉시 전송해도 안전
override fun onCreate() {
    super.onCreate()
    BridgeLibHost.init(application = this)
    // RN 로딩 전이어도 큐에 쌓임 → 로딩 완료 시 자동 전송
    BridgeEventBus.send("APP_INIT", mapOf("version" to BuildConfig.VERSION_NAME))
}
```

---

## 8. OTA 번들 설정

`BridgeLibHost.init()`은 최초 1회만 적용됩니다. OTA 번들을 적용하려면 앱 재시작 전에 경로를 저장해두어야 합니다.

```kotlin
// 1) OTA 다운로드 완료 후 — 번들을 내부 저장소에 저장하고 경로 기록
val bundleFile = File(filesDir, "bridge_bundle.js")
// bundleFile.writeBytes(downloadedBytes)

getSharedPreferences("bridge_lib", Context.MODE_PRIVATE)
    .edit().putString("bundle_path", bundleFile.absolutePath).apply()

// 2) Application.onCreate() — 저장된 경로 읽기
val localPath = getSharedPreferences("bridge_lib", Context.MODE_PRIVATE)
    .getString("bundle_path", null)

BridgeLibHost.init(
    application = this,
    bundleConfig = BundleConfig(localBundlePath = localPath)
)
```

---

## 9. 주의사항

- **`BridgeLibHost.init()` 호출 시점**: `Application.onCreate()`에서 반드시 호출해야 합니다. `Activity.onCreate()`에서 호출하면 `BridgeLibActivity`나 `BridgeLibFragment`가 먼저 `getReactHost()`를 호출할 때 `IllegalStateException`이 발생합니다.
- **Fragment에서의 back handler**: `BridgeLibFragment`가 `onResume()`에서 `DefaultHardwareBackBtnHandler`를 참조합니다. 호스트 Activity가 이를 구현하지 않으면 RN에 back 이벤트가 전달되지 않습니다.
- **이벤트 리스너 해제**: `BridgeEventBus.on()`으로 등록한 리스너는 화면이 종료될 때 `BridgeEventBus.off()`로 반드시 해제해야 합니다. Activity/Fragment의 `onDestroy` 또는 `onDestroyView`에서 해제하세요.
- **`setGlobalEventListener` 스코프**: `BridgeEventBus.setGlobalEventListener()`는 전역 슬롯 하나를 덮어씁니다. `ReactNativeActivity`는 `onCreate()`에서 등록하고 `onDestroy()`에서 `null`로 해제하므로 생명주기가 자동 관리됩니다. 단, 동시에 여러 `ReactNativeActivity` 인스턴스가 존재하면 마지막으로 `onCreate()`를 호출한 인스턴스의 리스너만 유효합니다.
- **`popToNativeCallback` 스코프**: `BridgeLibActivity`와 `BridgeLibFragment`는 각각 자신의 생명주기(`onDestroy`/`onDestroyView`)에서 `BridgeEventBus.setPopToNativeCallback(null)`을 호출해 콜백을 해제합니다. 동시에 여러 RN 화면을 띄우는 경우 마지막으로 생성된 화면의 콜백만 유효합니다.
- **`BundleConfig.localBundlePath`가 null이면 `assetPath` 사용**: `localBundlePath`에 잘못된 경로가 전달되면 RN 로딩이 실패합니다. OTA 번들 적용 전에 파일 존재 여부를 검증하세요.

---

## 10. 트러블슈팅

### Could not find com.facebook.react:react-android:.

```
Could not resolve all files for configuration ':mobile:prdDebugRuntimeClasspath'.
  > Could not find com.facebook.react:react-android:.
    Required by: project :mobile > com.hong.lib:hongfield:x.x.x
  > Could not find com.facebook.hermes:hermes-android:.
    Required by: project :mobile > com.hong.lib:hongfield:x.x.x
```

**원인:** hongfield `1.0.2` 이하 버전은 POM에 `react-android` / `hermes-android` 버전이 비어있어(`:.`) Gradle이 어느 버전을 받아야 할지 알 수 없습니다.

**해결:** hongfield `1.0.3` 이상으로 업그레이드합니다. 1.0.3부터 POM에 버전이 명시되어 Maven Central에서 자동으로 해소됩니다.

업그레이드가 불가능한 경우, 소비앱 `build.gradle`에 직접 버전을 선언합니다:

```kotlin
dependencies {
    implementation("com.hong.lib:hongfield:1.0.2")
    implementation("com.facebook.react:react-android:0.84.1")
    implementation("com.facebook.hermes:hermes-android:250829098.0.9")
}
```

`settings.gradle.kts`에 `mavenCentral()`이 없다면 추가합니다 (섹션 2 — 방법 B 참고).

### NoClassDefFoundError: OpenSourceMergedSoMapping

```
java.lang.NoClassDefFoundError: Failed resolution of: Lcom/facebook/react/soloader/OpenSourceMergedSoMapping;
    at com.bridgelib.BridgeLibHost.init(BridgeLibHost.kt:29)
```

**원인:** `OpenSourceMergedSoMapping`은 `react-android 0.73+`에서 추가된 클래스입니다. 소비앱의 다른 의존성이 더 낮은 버전의 `react-android`를 transitively 끌어들이면 Gradle 충돌 해소 과정에서 낮은 버전이 선택되어 런타임에 클래스를 찾지 못합니다.

**해결:** 소비앱 `build.gradle`에서 버전을 강제 지정합니다.

**Groovy (build.gradle)**
```groovy
configurations.all {
    resolutionStrategy {
        force 'com.facebook.react:react-android:0.84.1'
        force 'com.facebook.hermes:hermes-android:250829098.0.9'
    }
}
```

**Kotlin DSL (build.gradle.kts)**
```kotlin
configurations.all {
    resolutionStrategy {
        force("com.facebook.react:react-android:0.84.1")
        force("com.facebook.hermes:hermes-android:250829098.0.9")
    }
}
```

> `react-android`는 `com.facebook.react` 그룹, `hermes-android`는 `com.facebook.hermes` 그룹입니다. 버전 불일치 시 다른 런타임 오류가 발생할 수 있으므로 정확히 맞춰야 합니다.

### DeviceInfo could not be found (TurboModuleRegistry)

```
[runtime not ready]: Invariant Violation:
TurboModuleRegistry.getEnforcing(...):
'DeviceInfo' could not be found. Verify that a module by this name is registered in the native binary.
```

**원인:** New Architecture(Bridgeless)에서 `DeviceInfo` 등 코어 Java TurboModule은 `javaModuleProvider` C++ 함수 포인터를 통해 조회됩니다. 이 포인터는 `libappmodules.so`의 `JNI_OnLoad`에서 설정됩니다. `libappmodules.so`가 없으면 포인터가 null로 남아 모든 코어 Java TurboModule 조회가 실패합니다.

**해결:** 최신 버전으로 업그레이드합니다. AAR에 `libappmodules.so`가 포함되어 있고 `BridgeLibHost.init()`에서 `SoLoader.loadLibrary("appmodules")`를 자동으로 호출합니다.

업그레이드가 불가능한 경우, 소비앱에서 직접 `appmodules` SO를 빌드해야 합니다. `app/build.gradle`에 `com.facebook.react` 플러그인을 application 모드로 적용하고 `autolinkLibrariesWithApp()`을 추가합니다(RN 브라운필드 통합 가이드 참고).
