# Android 네이티브 연동 가이드

## 1. AAR 빌드

bridge-lib 레포에서:

```bash
npx bridge-lib package:android --variant Release --module-name reactnativeapp
```

결과물: `output/android/reactnativeapp-release.aar`

## 2. 로컬 Maven 배포 (선택)

```bash
npx bridge-lib publish:android --module-name reactnativeapp
```

## 3. 호스트 앱에 AAR 추가

### 방법 A: 파일 직접 추가

`app/libs/` 폴더에 AAR 복사 후 `build.gradle`에 추가:

```groovy
dependencies {
    implementation fileTree(dir: 'libs', include: ['*.aar'])
    // React Native 의존성
    implementation 'com.facebook.react:react-android:0.84.1'
    implementation 'com.facebook.react:hermes-android:0.84.1'
}
```

### 방법 B: 로컬 Maven 사용

```groovy
repositories {
    maven { url "${System.properties['user.home']}/.m2/repository" }
}

dependencies {
    implementation 'com.bridgelib:bridge-lib:1.0.0'
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

OTA로 새 번들이 다운로드된 후:

```kotlin
// 다음 앱 재시작 시 적용
BridgeLibHost.init(
    application = this,
    bundleConfig = BundleConfig(
        devUrl = "http://10.0.2.2:8081/index.bundle",
        assetPath = "index.android.bundle",
        localBundlePath = "/data/data/com.example/files/bundle.js",  // 다운로드 경로
        isDebug = BuildConfig.DEBUG
    )
)
```
