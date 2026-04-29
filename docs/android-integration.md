# Android 네이티브 연동 가이드

## 1. AAR 빌드 및 로컬 Maven 배포

소비앱 프로젝트 루트에서 실행합니다. JS 번들 빌드 → AAR 빌드 → Maven 배포 순서로 자동 실행됩니다.

```bash
# AAR 빌드 + 로컬 Maven 배포
./node_modules/@codehong-dev/hongfield/package-android.sh --module-name bridgelib

# AAR만 빌드 (Maven 배포 제외)
./node_modules/@codehong-dev/hongfield/package-android.sh --module-name bridgelib --skip-maven
```

> CLI 명령어는 [rn-setup.md — 섹션 5](./rn-setup.md#5-번들-빌드-및-네이티브-패키징)를 참고하세요.

결과물: `output/android/bridgelib-release.aar`

## 3. 호스트 앱에 AAR 추가

### 방법 A: 파일 직접 추가

`app/libs/` 폴더에 AAR 복사 후 의존성 추가:

**Groovy (build.gradle)**

```groovy
dependencies {
    implementation fileTree(dir: 'libs', include: ['*.aar'])
    // React Native 의존성
    implementation 'com.facebook.react:react-android:0.84.1'
    implementation 'com.facebook.react:hermes-android:0.84.1'
}
```

**Kotlin DSL (build.gradle.kts)**

```kotlin
dependencies {
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.aar"))))
    // React Native 의존성
    implementation("com.facebook.react:react-android:0.84.1")
    implementation("com.facebook.react:hermes-android:0.84.1")
}
```

### 방법 B: 로컬 Maven 사용

**Groovy (build.gradle / settings.gradle)**

```groovy
// settings.gradle 또는 프로젝트 수준 build.gradle의 repositories 블록
repositories {
    maven { url "${System.properties['user.home']}/.m2/repository" }
}

// app/build.gradle
dependencies {
    implementation 'com.hong.lib:hongfield:1.0.0'
}
```

**Kotlin DSL (settings.gradle.kts / build.gradle.kts)**

```kotlin
// settings.gradle.kts 또는 프로젝트 수준 build.gradle.kts의 repositories 블록
repositories {
    maven { url = uri("${System.getProperty("user.home")}/.m2/repository") }
}

// app/build.gradle.kts
dependencies {
    implementation("com.hong.lib:hongfield:1.0.0")
}
```

## 4. AndroidManifest.xml 설정

```xml
<uses-permission android:name="android.permission.INTERNET" />

<!-- BridgeLibActivity가 자동으로 manifest에 포함됨 (AAR merge) -->
```

## 5. Application 초기화

```kotlin
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        BridgeLibHost.init(
            application = this,
            bundleConfig = BundleConfig(
                devUrl = "http://10.0.2.2:8081/index.bundle",
                assetPath = "index.android.bundle",
                localBundlePath = null,   // OTA 다운로드 시 경로 설정
                isDebug = BuildConfig.DEBUG
            )
            // 자동링크 패키지 추가 시: packages = PackageList(this).packages
        )
    }
}
```

### `devUrl` 값 결정 방법

Metro 개발 서버에 접속하는 URL로, 실행 환경에 따라 다르다.


| 환경              | devUrl                                |
| --------------- | ------------------------------------- |
| Android 에뮬레이터   | `http://10.0.2.2:8081/index.bundle`   |
| 실기기 (USB/Wi-Fi) | `http://<개발 PC IP>:8081/index.bundle` |


- **에뮬레이터**: Android 에뮬레이터에서 `10.0.2.2`는 호스트 PC의 `localhost`를 가리키는 특수 주소다.
- **실기기**: 개발 PC와 기기가 같은 Wi-Fi에 연결된 상태에서 PC의 로컬 IP를 사용한다. PC IP는 macOS 기준 `ifconfig | grep "inet "` 또는 시스템 환경설정 > 네트워크에서 확인할 수 있다.
- 포트 `8081`은 Metro의 기본값이다. `react-native start --port 9090` 처럼 변경한 경우 해당 포트를 사용한다.

### `localBundlePath` 값 결정 방법

OTA(CodePush 등)로 다운로드한 번들 파일의 **기기 내 절대 경로**다. `null`이면 `assetPath`의 assets 번들을 사용한다.

앱 전용 내부 저장소 경로를 사용하는 것이 권장된다 (외부 저장소 권한 불필요):

```kotlin
// 권장: context.filesDir 기반 경로 (예: /data/data/com.example.myapp/files/bundle.js)
val bundlePath = "${context.filesDir.absolutePath}/bridge_bundle.js"
```

OTA로 새 번들을 받으면 `filesDir` 하위에 파일로 저장한 뒤, 그 경로를 `SharedPreferences`에 기록해둔다. 앱 재시작 시 저장된 경로를 읽어 `localBundlePath`에 전달한다:

```kotlin
// 1) OTA 다운로드 완료 후 — 번들을 앱 내부 저장소에 저장하고 경로 기록
//    (HTTP 클라이언트로 스트림을 받아 파일로 쓴 뒤 아래 코드 실행)
val bundleFile = File(filesDir, "bridge_bundle.js")
// bundleFile.writeBytes(downloadedBytes)  ← 실제 저장 코드

val prefs = getSharedPreferences("bridge_lib", Context.MODE_PRIVATE)
prefs.edit().putString("bundle_path", bundleFile.absolutePath).apply()

// 2) Application.onCreate() — 저장된 경로 읽기
val localPath = getSharedPreferences("bridge_lib", Context.MODE_PRIVATE)
    .getString("bundle_path", null)

BridgeLibHost.init(
    application = this,
    bundleConfig = BundleConfig(
        devUrl = "http://10.0.2.2:8081/index.bundle",
        assetPath = "index.android.bundle",
        localBundlePath = localPath,   // null이면 assets 번들 사용
        isDebug = BuildConfig.DEBUG
    )
)
```

## 6. RN 화면 실행

### Activity 방식

```kotlin
// 기본 실행
BridgeLibActivity.start(context = this, moduleName = "HomeScreen")

// initialProps 전달
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

## 7. 이벤트 통신

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

## 8. OTA/CodePush 번들 설정

OTA로 새 번들이 다운로드된 후, 다음 앱 재시작 시 적용되도록 경로를 저장해둔다.  
`BridgeLibHost.init()`은 최초 1회만 적용되므로 런타임에 재호출해도 번들이 교체되지 않는다.

```kotlin
// 1) OTA 다운로드 완료 후 — 번들을 앱 내부 저장소에 저장하고 경로 기록
//    (HTTP 클라이언트로 스트림을 받아 파일로 쓴 뒤 아래 코드 실행)
val bundleFile = File(filesDir, "bridge_bundle.js")
// bundleFile.writeBytes(downloadedBytes)  ← 실제 저장 코드

val prefs = getSharedPreferences("bridge_lib", Context.MODE_PRIVATE)
prefs.edit().putString("bundle_path", bundleFile.absolutePath).apply()

// 2) Application.onCreate() — 저장된 경로 읽기
val localPath = getSharedPreferences("bridge_lib", Context.MODE_PRIVATE)
    .getString("bundle_path", null)

BridgeLibHost.init(
    application = this,
    bundleConfig = BundleConfig(
        devUrl = "http://10.0.2.2:8081/index.bundle",
        assetPath = "index.android.bundle",
        localBundlePath = localPath,
        isDebug = BuildConfig.DEBUG
    )
)
```

