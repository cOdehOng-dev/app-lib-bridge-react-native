# Android 네이티브 연동 가이드

## 1. AAR 빌드 및 로컬 Maven 배포

소비앱 프로젝트 루트에서 실행합니다. JS 번들 빌드 → AAR 빌드 → Maven 배포 순서로 자동 실행됩니다.

```bash
./node_modules/@codehong-dev/hongfield/package-android.sh --module-name bridgelib
```

> CLI 명령어는 [rn-setup.md — 섹션 5](./rn-setup.md#5-번들-빌드-및-네이티브-패키징)를 참고하세요.

결과물: `output/android/bridgelib-release.aar`

## 2. 호스트 앱에 AAR 추가

### 방법 A: 파일 직접 추가

`app/libs/` 폴더에 AAR 복사 후 의존성 추가:

**Groovy (build.gradle)**

```groovy
dependencies {
    implementation fileTree(dir: 'libs', include: ['*.aar'])
    implementation 'com.facebook.react:react-android:0.84.1'
    implementation 'com.facebook.react:hermes-android:0.84.1'
}
```

**Kotlin DSL (build.gradle.kts)**

```kotlin
dependencies {
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.aar"))))
    implementation("com.facebook.react:react-android:0.84.1")
    implementation("com.facebook.react:hermes-android:0.84.1")
}
```

### 방법 B: 로컬 Maven 사용

**Groovy (build.gradle / settings.gradle)**

```groovy
repositories {
    maven { url "${System.properties['user.home']}/.m2/repository" }
}

dependencies {
    implementation 'com.hong.lib:hongfield:1.0.0' // publish:android --version 에 지정한 버전
}
```

**Kotlin DSL (settings.gradle.kts / build.gradle.kts)**

```kotlin
repositories {
    maven { url = uri("${System.getProperty("user.home")}/.m2/repository") }
}

dependencies {
    implementation("com.hong.lib:hongfield:1.0.0") // publish:android --version 에 지정한 버전
}
```

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
