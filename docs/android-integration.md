# Android 네이티브 연동 가이드

## 1. AAR 빌드 및 로컬 Maven 배포

소비앱 프로젝트 루트에서 실행합니다. JS 번들 빌드 → AAR 빌드 → Maven 배포 순서로 자동 실행됩니다.

```bash
./node_modules/@codehong-dev/hongfield/package-android.sh --module-name bridgelib
```

> CLI 명령어는 [rn-setup.md — 섹션 6](./rn-setup.md#6-번들-빌드-및-네이티브-패키징)를 참고하세요.

결과물: `output/android/bridgelib-release.aar`

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

## 3. AndroidManifest.xml 설정

```xml
<uses-permission android:name="android.permission.INTERNET" />

<!-- BridgeLibActivity가 자동으로 manifest에 포함됨 (AAR merge) -->
```

## 4. Application 초기화

기본값으로 자동 설정되므로 대부분의 경우 한 줄로 충분합니다:

```kotlin
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        BridgeLibHost.init(application = this)
    }
}
```

커스텀이 필요한 경우 `BundleConfig`를 전달합니다:

```kotlin
BridgeLibHost.init(
    application = this,
    bundleConfig = BundleConfig(localBundlePath = localOtaBundlePath)
)
```

> **자동 설정 기본값**
> - `assetPath`: `"index.android.bundle"`
> - `isDebug`: `ApplicationInfo.FLAG_DEBUGGABLE` 플래그에서 자동 감지

## 5. RN 화면 실행

### Activity 방식

```kotlin
BridgeLibActivity.start(context = this, moduleName = "HomeScreen")

BridgeLibActivity.start(
    context = this,
    moduleName = "HomeScreen",
    initialProps = bundleOf("userId" to "123", "theme" to "dark")
)
```

### Fragment 방식

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

### popToNative 콜백 등록

RN이 `popToNative()`를 호출했을 때 실행될 콜백을 등록한다.

**Activity (기본 동작):**

`onPopRequested`가 null이면 기본 동작으로 `finish()`가 호출된다. 별도 처리가 필요한 경우에만 서브클래싱한다.

```kotlin
// 기본: finish()로 자동 종료
BridgeLibActivity.start(context = this, moduleName = "HomeScreen")

// 커스텀: 서브클래싱으로 onPopRequested 설정
class HomeActivity : BridgeLibActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        onPopRequested = { finish() } // 커스텀 동작
        super.onCreate(savedInstanceState)
    }
}
```

**Fragment:**
```kotlin
val fragment = BridgeLibFragment.newInstance("HomeScreen")
fragment.onPopRequested = { supportFragmentManager.popBackStack() }

supportFragmentManager.beginTransaction()
    .replace(R.id.container, fragment)
    .addToBackStack(null)
    .commit()
```

### Back 버튼 제어

Activity와 Fragment 모두 `setBackEnabled()`를 지원한다.

```kotlin
// Fragment
fragment.setBackEnabled(false) // RN 내부 스택이 소진될 때까지 네이티브 뒤로가기 비활성화
fragment.setBackEnabled(true)  // 네이티브 뒤로가기 재활성화

// Activity (서브클래스에서)
setBackEnabled(false)
setBackEnabled(true)
```

## 6. 이벤트 통신

```kotlin
// 네이티브 → RN
BridgeEventBus.send("USER_LOGGED_IN", mapOf("name" to "Oscar", "role" to "admin"))

// RN → 네이티브 리스너
BridgeEventBus.on("PAYMENT_DONE") { data ->
    val amount = data["amount"] as? Double ?: 0.0
    processPayment(amount)
}

// 리스너 해제
BridgeEventBus.off("PAYMENT_DONE")
```

### 이벤트 큐 동작

`BridgeLibHost.init()` 이후 React Native가 완전히 로딩되기 전에 `BridgeEventBus.send()`를 호출하면 이벤트가 버퍼링됩니다. RN 모듈이 등록되는 즉시 자동으로 flush되므로 이벤트 유실 없이 동작합니다.

```kotlin
// Application.onCreate()에서 이벤트를 즉시 전송해도 안전
override fun onCreate() {
    super.onCreate()
    BridgeLibHost.init(application = this)
    // RN 로딩 전이어도 큐에 쌓임 → 로딩 완료 시 자동 전송
    BridgeEventBus.send("APP_INIT", mapOf("version" to BuildConfig.VERSION_NAME))
}
```

## 7. OTA 번들 설정

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

## 8. 트러블슈팅

### Could not find com.facebook.react:react-android:.

```
Could not resolve all files for configuration ':mobile:prdDebugRuntimeClasspath'.
  > Could not find com.facebook.react:react-android:.
    Required by: project :mobile > com.hong.lib:hongfield:x.x.x
  > Could not find com.facebook.hermes:hermes-android:.
    Required by: project :mobile > com.hong.lib:hongfield:x.x.x
```

**원인:** hongfield `1.0.2` 이하 버전은 POM에 `react-android` / `hermes-android` 버전이 비어있어(`:.`) Gradle이 어느 버전을 받아야 할지 알 수 없다.

**해결:** hongfield `1.0.3` 이상으로 업그레이드한다. 1.0.3부터 POM에 버전이 명시되어 Maven Central에서 자동으로 해소된다.

업그레이드가 불가능한 경우, 소비앱 `build.gradle`에 직접 버전을 선언한다:

```kotlin
dependencies {
    implementation("com.hong.lib:hongfield:1.0.2")
    implementation("com.facebook.react:react-android:0.84.1")
    implementation("com.facebook.hermes:hermes-android:250829098.0.9")
}
```

`settings.gradle.kts`에 `mavenCentral()`이 없다면 추가한다 (섹션 2 — 방법 B 참고).

### NoClassDefFoundError: OpenSourceMergedSoMapping

```
java.lang.NoClassDefFoundError: Failed resolution of: Lcom/facebook/react/soloader/OpenSourceMergedSoMapping;
    at com.bridgelib.BridgeLibHost.init(BridgeLibHost.kt:29)
```

**원인:** `OpenSourceMergedSoMapping`은 `react-android 0.73+`에서 추가된 클래스다. 소비앱의 다른 의존성이 더 낮은 버전의 `react-android`를 transitively 끌어들이면 Gradle 충돌 해소 과정에서 낮은 버전이 선택되어 런타임에 클래스를 찾지 못한다.

**해결:** 소비앱 `build.gradle`에서 버전을 강제 지정한다.

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

> `react-android`는 `com.facebook.react` 그룹, `hermes-android`는 `com.facebook.hermes` 그룹이다. 버전 불일치 시 다른 런타임 오류가 발생할 수 있으므로 정확히 맞춰야 한다.

### DeviceInfo could not be found (TurboModuleRegistry)

```
[runtime not ready]: Invariant Violation:
TurboModuleRegistry.getEnforcing(...):
'DeviceInfo' could not be found. Verify that a module by this name is registered in the native binary.
```

**원인:** New Architecture(Bridgeless)에서 `DeviceInfo` 등 코어 Java TurboModule은 `javaModuleProvider` C++ 함수 포인터를 통해 조회된다. 이 포인터는 `libappmodules.so`의 `JNI_OnLoad`에서 설정된다. `libappmodules.so`가 없으면 포인터가 null로 남아 모든 코어 Java TurboModule 조회가 실패한다.

**해결:** `1.0.5` 이상으로 업그레이드한다. 1.0.5부터 AAR에 `libappmodules.so`가 포함되어 자동으로 해소된다.

업그레이드가 불가능한 경우, 소비앱에서 직접 `appmodules` SO를 빌드해야 한다. `app/build.gradle`에 `com.facebook.react` 플러그인을 application 모드로 적용하고 `autolinkLibrariesWithApp()`을 추가한다(RN 브라운필드 통합 가이드 참고).
