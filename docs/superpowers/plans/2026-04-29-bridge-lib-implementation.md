# bridge-lib Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** React Native 0.84.1 신규 아키텍처 기반으로, 네이티브(Android/iOS) 호스트 앱과 React Native 앱을 양방향으로 연동하는 라이브러리(AAR + XCFramework + npm 패키지 + CLI)를 구축한다.

**Architecture:** RN TypeScript 패키지(`src/`)는 TurboModule Codegen spec을 정의하고 이벤트 훅/유틸을 제공한다. Android 라이브러리 모듈(`android/bridge-lib/`)은 AAR로 빌드되어 네이티브 앱에 포함되며, iOS 라이브러리(`ios/BridgeLib/`)는 XCFramework로 빌드된다. CLI(`bin/bridge-lib.js`)가 빌드·배포 명령을 제공한다.

**Tech Stack:** React Native 0.84.1, TypeScript, Kotlin, Swift/Objective-C++, Gradle (maven-publish), xcodebuild, commander (CLI)

---

## File Map

```
# 신규 생성 파일
src/specs/NativeBridgeModule.ts          ← TurboModule Codegen 스펙
src/BridgeLib.ts                         ← 번들 모드 유틸리티
src/sendToNative.ts                      ← RN → 네이티브 이벤트 전송
src/useBridgeEvent.ts                    ← 네이티브 → RN 이벤트 구독 훅
src/index.ts                             ← 패키지 진입점

android/bridge-lib/build.gradle          ← 라이브러리 모듈 빌드 설정
android/bridge-lib/src/main/AndroidManifest.xml
android/bridge-lib/src/main/kotlin/com/bridgelib/BundleConfig.kt
android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibPackage.kt
android/bridge-lib/src/main/kotlin/com/bridgelib/NativeBridgeModule.kt
android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeEventBus.kt
android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibHostDelegate.kt
android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibHost.kt
android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibActivity.kt
android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibFragment.kt

ios/BridgeLib/BundleConfig.swift
ios/BridgeLib/NativeBridgeModule.swift   ← RCTEventEmitter 구현 (Swift)
ios/BridgeLib/NativeBridgeModuleObjc.m   ← RCT_EXTERN_MODULE 등록
ios/BridgeLib/BridgeEventEmitter.swift   ← 네이티브 ↔ RN 이벤트 관리자
ios/BridgeLib/BridgeLibManager.swift     ← RCTReactNativeFactory 초기화
ios/BridgeLib/BridgeLibViewController.swift

bin/bridge-lib.js                        ← CLI 진입점
scripts/packageAndroid.js
scripts/publishAndroid.js
scripts/packageIos.js

docs/rn-setup.md
docs/android-integration.md
docs/ios-integration.md

# 수정 파일
package.json                             ← bin, codegenConfig, commander 추가
android/settings.gradle                  ← bridge-lib 모듈 include 추가
```

---

### Task 1: package.json 업데이트 및 commander 설치

**Files:**
- Modify: `package.json`

- [ ] **Step 1: package.json 업데이트**

`package.json`을 다음으로 교체한다:

```json
{
  "name": "bridge-lib",
  "version": "1.0.0",
  "description": "Native-React Native bridge library for Android and iOS",
  "private": false,
  "main": "src/index.ts",
  "bin": {
    "bridge-lib": "bin/bridge-lib.js"
  },
  "files": [
    "src/",
    "bin/",
    "scripts/",
    "android/bridge-lib/",
    "ios/BridgeLib/"
  ],
  "codegenConfig": {
    "name": "NativeBridgeModuleSpec",
    "type": "modules",
    "jsSrcsDir": "src/specs"
  },
  "scripts": {
    "android": "react-native run-android",
    "ios": "react-native run-ios",
    "lint": "eslint .",
    "start": "react-native start",
    "test": "jest"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "react": "19.2.3",
    "react-native": "0.84.1",
    "@react-native/new-app-screen": "0.84.1",
    "react-native-safe-area-context": "^5.5.2"
  },
  "devDependencies": {
    "@babel/core": "^7.25.2",
    "@babel/preset-env": "^7.25.3",
    "@babel/runtime": "^7.25.0",
    "@react-native-community/cli": "20.1.0",
    "@react-native-community/cli-platform-android": "20.1.0",
    "@react-native-community/cli-platform-ios": "20.1.0",
    "@react-native/babel-preset": "0.84.1",
    "@react-native/eslint-config": "0.84.1",
    "@react-native/metro-config": "0.84.1",
    "@react-native/typescript-config": "0.84.1",
    "@types/jest": "^29.5.13",
    "@types/react": "^19.2.0",
    "@types/react-test-renderer": "^19.1.0",
    "eslint": "^8.19.0",
    "jest": "^29.6.3",
    "prettier": "2.8.8",
    "react-test-renderer": "19.2.3",
    "typescript": "^5.8.3"
  },
  "engines": {
    "node": ">= 22.11.0"
  }
}
```

- [ ] **Step 2: commander 설치**

```bash
npm install
```

Expected: `commander` 설치 완료, `node_modules/commander` 폴더 생성

- [ ] **Step 3: 커밋**

```bash
git add package.json package-lock.json
git commit -m "chore: add commander, codegenConfig, bin entry to package.json"
```

---

### Task 2: TurboModule TypeScript 스펙 정의

**Files:**
- Create: `src/specs/NativeBridgeModule.ts`

- [ ] **Step 1: 디렉터리 생성**

```bash
mkdir -p src/specs
```

- [ ] **Step 2: NativeBridgeModule.ts 작성**

`src/specs/NativeBridgeModule.ts`:

```typescript
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  sendEvent(name: string, data: Object): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeBridgeModule');
```

- [ ] **Step 3: 커밋**

```bash
git add src/specs/NativeBridgeModule.ts
git commit -m "feat: add NativeBridgeModule TurboModule spec"
```

---

### Task 3: RN TypeScript 유틸리티 패키지 작성

**Files:**
- Create: `src/BridgeLib.ts`
- Create: `src/sendToNative.ts`
- Create: `src/useBridgeEvent.ts`
- Create: `src/index.ts`
- Create: `src/__tests__/sendToNative.test.ts`
- Create: `src/__tests__/BridgeLib.test.ts`

- [ ] **Step 1: 테스트 파일 작성 (TDD - 먼저 실패 확인)**

`src/__tests__/BridgeLib.test.ts`:

```typescript
import { BridgeLib } from '../BridgeLib';

describe('BridgeLib', () => {
  test('bundleMode는 테스트 환경에서 dev이다', () => {
    expect(BridgeLib.bundleMode).toBe('dev');
  });

  test('version이 정의되어 있다', () => {
    expect(typeof BridgeLib.version).toBe('string');
  });
});
```

`src/__tests__/sendToNative.test.ts`:

```typescript
jest.mock('../specs/NativeBridgeModule', () => ({
  sendEvent: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
}));

import { sendToNative } from '../sendToNative';
import NativeBridgeModule from '../specs/NativeBridgeModule';

describe('sendToNative', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('NativeBridgeModule.sendEvent를 이벤트명과 데이터로 호출한다', () => {
    sendToNative('TEST_EVENT', { key: 'value' });
    expect(NativeBridgeModule.sendEvent).toHaveBeenCalledWith('TEST_EVENT', { key: 'value' });
  });

  test('data 미전달 시 빈 객체로 호출한다', () => {
    sendToNative('TEST_EVENT');
    expect(NativeBridgeModule.sendEvent).toHaveBeenCalledWith('TEST_EVENT', {});
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm test -- --testPathPattern="src/__tests__"
```

Expected: `Cannot find module '../BridgeLib'` 에러로 FAIL

- [ ] **Step 3: BridgeLib.ts 구현**

`src/BridgeLib.ts`:

```typescript
type BundleMode = 'dev' | 'assets' | 'remote';

function resolveBundleMode(): BundleMode {
  if (__DEV__) return 'dev';
  return 'assets';
}

export const BridgeLib = {
  bundleMode: resolveBundleMode() as BundleMode,
  version: '1.0.0',
} as const;
```

- [ ] **Step 4: sendToNative.ts 구현**

`src/sendToNative.ts`:

```typescript
import NativeBridgeModule from './specs/NativeBridgeModule';

export function sendToNative(
  name: string,
  data: Record<string, unknown> = {}
): void {
  NativeBridgeModule.sendEvent(name, data);
}
```

- [ ] **Step 5: useBridgeEvent.ts 구현**

`src/useBridgeEvent.ts`:

```typescript
import { useEffect } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import NativeBridgeModule from './specs/NativeBridgeModule';

const emitter = new NativeEventEmitter(NativeModules.NativeBridgeModule);

export function useBridgeEvent(
  eventName: string,
  callback: (data: Record<string, unknown>) => void
): void {
  useEffect(() => {
    NativeBridgeModule.addListener('BridgeEvent');

    const subscription = emitter.addListener(
      'BridgeEvent',
      (event: { name: string; data: Record<string, unknown> }) => {
        if (event.name === eventName) {
          callback(event.data);
        }
      }
    );

    return () => {
      subscription.remove();
      NativeBridgeModule.removeListeners(1);
    };
  }, [eventName, callback]);
}
```

- [ ] **Step 6: index.ts 진입점 작성**

`src/index.ts`:

```typescript
export { BridgeLib } from './BridgeLib';
export { sendToNative } from './sendToNative';
export { useBridgeEvent } from './useBridgeEvent';
export { default as NativeBridgeModule } from './specs/NativeBridgeModule';
```

- [ ] **Step 7: 테스트 통과 확인**

```bash
npm test -- --testPathPattern="src/__tests__"
```

Expected: 3개 테스트 PASS

- [ ] **Step 8: 커밋**

```bash
git add src/
git commit -m "feat: add RN TypeScript package (BridgeLib, sendToNative, useBridgeEvent)"
```

---

### Task 4: Android bridge-lib 모듈 스캐폴딩

**Files:**
- Create: `android/bridge-lib/build.gradle`
- Create: `android/bridge-lib/src/main/AndroidManifest.xml`

- [ ] **Step 1: 디렉터리 생성**

```bash
mkdir -p android/bridge-lib/src/main/kotlin/com/bridgelib
```

- [ ] **Step 2: build.gradle 작성**

`android/bridge-lib/build.gradle`:

```groovy
plugins {
    id 'com.android.library'
    id 'org.jetbrains.kotlin.android'
    id 'maven-publish'
}

android {
    namespace 'com.bridgelib.lib'
    compileSdk rootProject.ext.compileSdkVersion

    defaultConfig {
        minSdk rootProject.ext.minSdkVersion
        targetSdk rootProject.ext.targetSdkVersion
    }

    buildTypes {
        release {
            minifyEnabled false
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = '17'
    }
}

dependencies {
    implementation 'com.facebook.react:react-android'
    implementation 'com.facebook.react:hermes-android'
    implementation 'androidx.appcompat:appcompat:1.7.0'
}

afterEvaluate {
    publishing {
        publications {
            release(MavenPublication) {
                from components.release
                groupId 'com.bridgelib'
                artifactId 'bridge-lib'
                version '1.0.0'
            }
        }
        repositories {
            maven {
                url = uri(findProperty('mavenRepoPath') ?: "${System.properties['user.home']}/.m2/repository")
            }
        }
    }
}
```

- [ ] **Step 3: AndroidManifest.xml 작성**

`android/bridge-lib/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application>
        <activity
            android:name="com.bridgelib.BridgeLibActivity"
            android:configChanges="keyboard|keyboardHidden|orientation|screenLayout|screenSize|smallestScreenSize|uiMode"
            android:exported="false"
            android:windowSoftInputMode="adjustResize" />
    </application>
</manifest>
```

- [ ] **Step 4: 커밋**

```bash
git add android/bridge-lib/
git commit -m "feat: scaffold android bridge-lib library module"
```

---

### Task 5: Android BundleConfig.kt

**Files:**
- Create: `android/bridge-lib/src/main/kotlin/com/bridgelib/BundleConfig.kt`

- [ ] **Step 1: BundleConfig.kt 작성**

`android/bridge-lib/src/main/kotlin/com/bridgelib/BundleConfig.kt`:

```kotlin
package com.bridgelib

/**
 * @param devUrl 개발 서버 URL (Metro). isDebug=true 시 사용
 * @param assetPath assets에 포함된 번들 파일명 (예: index.android.bundle)
 * @param localBundlePath OTA로 다운로드된 번들의 로컬 파일 경로. null이면 assetPath 사용
 * @param isDebug 호스트 앱의 BuildConfig.DEBUG 값을 전달
 */
data class BundleConfig(
    val devUrl: String,
    val assetPath: String,
    val localBundlePath: String? = null,
    val isDebug: Boolean = false
)
```

- [ ] **Step 2: 커밋**

```bash
git add android/bridge-lib/src/main/kotlin/com/bridgelib/BundleConfig.kt
git commit -m "feat: add Android BundleConfig"
```

---

### Task 6: Android NativeBridgeModule + BridgeLibPackage

**Files:**
- Create: `android/bridge-lib/src/main/kotlin/com/bridgelib/NativeBridgeModule.kt`
- Create: `android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibPackage.kt`

- [ ] **Step 1: NativeBridgeModule.kt 작성**

`android/bridge-lib/src/main/kotlin/com/bridgelib/NativeBridgeModule.kt`:

```kotlin
package com.bridgelib

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class NativeBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NativeBridgeModule"
    }

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        BridgeEventBus.setModule(this)
    }

    override fun invalidate() {
        BridgeEventBus.setModule(null)
        super.invalidate()
    }

    @ReactMethod
    fun sendEvent(name: String, data: ReadableMap) {
        BridgeEventBus.handleFromRN(name, data.toHashMap())
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // NativeEventEmitter 요구 사항 — 구독 추적은 JS 레이어에서 처리
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // NativeEventEmitter 요구 사항
    }

    internal fun emitToJS(eventName: String, data: Map<String, Any?>) {
        val params = Arguments.createMap().apply {
            putString("name", eventName)
            val dataMap = Arguments.createMap()
            data.forEach { (key, value) ->
                when (value) {
                    is String -> dataMap.putString(key, value)
                    is Int -> dataMap.putInt(key, value)
                    is Double -> dataMap.putDouble(key, value)
                    is Boolean -> dataMap.putBoolean(key, value)
                    is Long -> dataMap.putDouble(key, value.toDouble())
                    else -> dataMap.putString(key, value?.toString())
                }
            }
            putMap("data", dataMap)
        }
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("BridgeEvent", params)
    }
}
```

- [ ] **Step 2: BridgeLibPackage.kt 작성**

`android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibPackage.kt`:

```kotlin
package com.bridgelib

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class BridgeLibPackage : ReactPackage {

    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> = listOf(NativeBridgeModule(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> = emptyList()
}
```

- [ ] **Step 3: 커밋**

```bash
git add android/bridge-lib/src/main/kotlin/com/bridgelib/NativeBridgeModule.kt \
        android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibPackage.kt
git commit -m "feat: add Android NativeBridgeModule and BridgeLibPackage"
```

---

### Task 7: Android BridgeEventBus.kt

**Files:**
- Create: `android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeEventBus.kt`

- [ ] **Step 1: BridgeEventBus.kt 작성**

`android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeEventBus.kt`:

```kotlin
package com.bridgelib

object BridgeEventBus {

    @Volatile
    private var moduleRef: NativeBridgeModule? = null

    private val listeners = mutableMapOf<String, (Map<String, Any?>) -> Unit>()

    internal fun setModule(module: NativeBridgeModule?) {
        moduleRef = module
    }

    /**
     * 네이티브 → RN으로 이벤트 전송
     */
    fun send(eventName: String, data: Map<String, Any?> = emptyMap()) {
        checkNotNull(moduleRef) {
            "React Native is not running. BridgeLibHost.init()가 호출되었는지 확인하세요."
        }.emitToJS(eventName, data)
    }

    /**
     * RN → 네이티브 이벤트 리스너 등록
     */
    fun on(eventName: String, listener: (Map<String, Any?>) -> Unit) {
        listeners[eventName] = listener
    }

    /**
     * RN → 네이티브 이벤트 리스너 해제
     */
    fun off(eventName: String) {
        listeners.remove(eventName)
    }

    internal fun handleFromRN(eventName: String, data: HashMap<String, Any?>) {
        listeners[eventName]?.invoke(data)
    }
}
```

- [ ] **Step 2: 커밋**

```bash
git add android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeEventBus.kt
git commit -m "feat: add Android BridgeEventBus"
```

---

### Task 8: Android BridgeLibHostDelegate + BridgeLibHost

**Files:**
- Create: `android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibHostDelegate.kt`
- Create: `android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibHost.kt`

- [ ] **Step 1: BridgeLibHostDelegate.kt 작성**

`android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibHostDelegate.kt`:

```kotlin
package com.bridgelib

import android.content.Context
import com.facebook.react.ReactPackage
import com.facebook.react.common.assets.ReactFontManager
import com.facebook.react.defaults.DefaultReactHostDelegate
import com.facebook.react.runtime.JSCInstance
import com.facebook.react.runtime.JSEngineResolutionAlgorithm
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

class BridgeLibHostDelegate(
    private val bundleConfig: BundleConfig,
    packages: List<ReactPackage>
) : DefaultReactHostDelegate(
    jsMainModulePath = "index",
    reactPackages = packages + listOf(BridgeLibPackage())
) {
    override val jsBundleAssetPath: String
        get() = bundleConfig.assetPath
}
```

- [ ] **Step 2: BridgeLibHost.kt 작성**

`android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibHost.kt`:

```kotlin
package com.bridgelib

import android.app.Application
import com.facebook.react.ReactHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

object BridgeLibHost {

    @Volatile
    private var reactHost: ReactHost? = null

    /**
     * Application.onCreate()에서 1회 호출
     * @param packages 자동링크 패키지 포함 시 PackageList(this).packages 전달
     */
    fun init(
        application: Application,
        bundleConfig: BundleConfig,
        packages: List<ReactPackage> = emptyList()
    ) {
        if (reactHost != null) return

        SoLoader.init(application, OpenSourceMergedSoMapping)

        val delegate = BridgeLibHostDelegate(bundleConfig, packages)
        reactHost = DefaultReactHost.getDefaultReactHost(
            context = application,
            reactHostDelegate = delegate
        )
    }

    fun getReactHost(): ReactHost = reactHost
        ?: throw IllegalStateException(
            "BridgeLibHost가 초기화되지 않았습니다. Application.onCreate()에서 BridgeLibHost.init()을 호출하세요."
        )
}
```

- [ ] **Step 3: 커밋**

```bash
git add android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibHostDelegate.kt \
        android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibHost.kt
git commit -m "feat: add Android BridgeLibHost with custom bundle loading"
```

---

### Task 9: Android BridgeLibActivity.kt

**Files:**
- Create: `android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibActivity.kt`

- [ ] **Step 1: BridgeLibActivity.kt 작성**

`android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibActivity.kt`:

```kotlin
package com.bridgelib

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.facebook.react.ReactRootView

class BridgeLibActivity : AppCompatActivity() {

    private var reactRootView: ReactRootView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val moduleName = intent.getStringExtra(EXTRA_MODULE_NAME)
            ?: throw IllegalArgumentException(
                "BridgeLibActivity: 'bridge_lib_module_name' extra가 필요합니다."
            )
        val initialProps = intent.getBundleExtra(EXTRA_INITIAL_PROPS)

        reactRootView = ReactRootView(this).also { view ->
            view.startReactApplication(
                BridgeLibHost.getReactHost(),
                moduleName,
                initialProps
            )
            setContentView(view)
        }
    }

    override fun onDestroy() {
        reactRootView?.unmountReactApplication()
        reactRootView = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_MODULE_NAME = "bridge_lib_module_name"
        const val EXTRA_INITIAL_PROPS = "bridge_lib_initial_props"

        fun start(
            context: Context,
            moduleName: String,
            initialProps: Bundle? = null
        ) {
            val intent = Intent(context, BridgeLibActivity::class.java).apply {
                putExtra(EXTRA_MODULE_NAME, moduleName)
                initialProps?.let { putExtra(EXTRA_INITIAL_PROPS, it) }
            }
            context.startActivity(intent)
        }
    }
}
```

- [ ] **Step 2: 커밋**

```bash
git add android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibActivity.kt
git commit -m "feat: add Android BridgeLibActivity"
```

---

### Task 10: Android BridgeLibFragment.kt

**Files:**
- Create: `android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibFragment.kt`

- [ ] **Step 1: BridgeLibFragment.kt 작성**

`android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibFragment.kt`:

```kotlin
package com.bridgelib

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.facebook.react.ReactRootView

class BridgeLibFragment : Fragment() {

    private var reactRootView: ReactRootView? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val moduleName = arguments?.getString(ARG_MODULE_NAME)
            ?: throw IllegalArgumentException(
                "BridgeLibFragment: 'bridge_lib_module_name' argument가 필요합니다."
            )
        val initialProps = arguments?.getBundle(ARG_INITIAL_PROPS)

        return ReactRootView(requireContext()).also { view ->
            reactRootView = view
            view.startReactApplication(
                BridgeLibHost.getReactHost(),
                moduleName,
                initialProps
            )
        }
    }

    override fun onDestroyView() {
        reactRootView?.unmountReactApplication()
        reactRootView = null
        super.onDestroyView()
    }

    companion object {
        const val ARG_MODULE_NAME = "bridge_lib_module_name"
        const val ARG_INITIAL_PROPS = "bridge_lib_initial_props"

        fun newInstance(
            moduleName: String,
            initialProps: Bundle? = null
        ): BridgeLibFragment = BridgeLibFragment().apply {
            arguments = Bundle().apply {
                putString(ARG_MODULE_NAME, moduleName)
                initialProps?.let { putBundle(ARG_INITIAL_PROPS, it) }
            }
        }
    }
}
```

- [ ] **Step 2: 커밋**

```bash
git add android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibFragment.kt
git commit -m "feat: add Android BridgeLibFragment"
```

---

### Task 11: Android settings.gradle 업데이트

**Files:**
- Modify: `android/settings.gradle`

- [ ] **Step 1: settings.gradle에 bridge-lib 모듈 추가**

`android/settings.gradle`의 `include ':app'` 라인 아래에 다음을 추가:

```groovy
pluginManagement { includeBuild("../node_modules/@react-native/gradle-plugin") }
plugins { id("com.facebook.react.settings") }
extensions.configure(com.facebook.react.ReactSettingsExtension){ ex -> ex.autolinkLibrariesFromCommand() }
rootProject.name = 'app-lib-bridge-react-native'
include ':app'
include ':bridge-lib'
project(':bridge-lib').projectDir = new File(rootProject.projectDir, 'bridge-lib')
includeBuild('../node_modules/@react-native/gradle-plugin')
```

- [ ] **Step 2: Gradle sync 확인**

```bash
cd android && ./gradlew :bridge-lib:tasks --all | grep -E "(assemble|publish)" && cd ..
```

Expected: `assembleRelease`, `assembleDebug`, `publishToMavenLocal` 태스크 목록 출력

- [ ] **Step 3: 커밋**

```bash
git add android/settings.gradle
git commit -m "feat: include bridge-lib module in Android settings.gradle"
```

---

### Task 12: iOS BundleConfig.swift

**Files:**
- Create: `ios/BridgeLib/BundleConfig.swift`

- [ ] **Step 1: 디렉터리 생성**

```bash
mkdir -p ios/BridgeLib
```

- [ ] **Step 2: BundleConfig.swift 작성**

`ios/BridgeLib/BundleConfig.swift`:

```swift
import Foundation
import React

@objc public class BundleConfig: NSObject {
    @objc public let devURL: URL
    @objc public let assetName: String
    @objc public let localBundleURL: URL?

    /// - Parameters:
    ///   - devURL: Metro 개발 서버 URL (DEBUG 빌드에서 사용)
    ///   - assetName: 앱 번들 내 .jsbundle 파일명 (확장자 제외, 예: "main")
    ///   - localBundleURL: OTA로 다운로드된 번들의 로컬 파일 URL. nil이면 assetName 사용
    @objc public init(
        devURL: URL,
        assetName: String,
        localBundleURL: URL? = nil
    ) {
        self.devURL = devURL
        self.assetName = assetName
        self.localBundleURL = localBundleURL
    }

    func resolvedURL() -> URL? {
        #if DEBUG
        return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
        #else
        if let localURL = localBundleURL {
            return localURL
        }
        return Bundle.main.url(forResource: assetName, withExtension: "jsbundle")
        #endif
    }
}
```

- [ ] **Step 3: 커밋**

```bash
git add ios/BridgeLib/BundleConfig.swift
git commit -m "feat: add iOS BundleConfig"
```

---

### Task 13: iOS NativeBridgeModule (Swift + ObjC)

**Files:**
- Create: `ios/BridgeLib/NativeBridgeModule.swift`
- Create: `ios/BridgeLib/NativeBridgeModuleObjc.m`

- [ ] **Step 1: NativeBridgeModule.swift 작성**

`ios/BridgeLib/NativeBridgeModule.swift`:

```swift
import Foundation
import React

@objc(NativeBridgeModule)
class NativeBridgeModule: RCTEventEmitter {

    @objc static weak var shared: NativeBridgeModule?

    override init() {
        super.init()
        NativeBridgeModule.shared = self
    }

    override class func requiresMainQueueSetup() -> Bool { true }

    override func supportedEvents() -> [String] {
        return ["BridgeEvent"]
    }

    override func startObserving() {}
    override func stopObserving() {}

    @objc func sendEvent(_ name: String, data: NSDictionary) {
        BridgeEventEmitter.shared.handleFromRN(
            name: name,
            data: data as? [String: Any] ?? [:]
        )
    }

    func emitToJS(eventName: String, data: [String: Any]) {
        sendEvent(withName: "BridgeEvent", body: ["name": eventName, "data": data])
    }
}
```

- [ ] **Step 2: NativeBridgeModuleObjc.m 작성**

`ios/BridgeLib/NativeBridgeModuleObjc.m`:

```objc
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

RCT_EXTERN_MODULE(NativeBridgeModule, RCTEventEmitter)
RCT_EXTERN_METHOD(sendEvent:(NSString *)name data:(NSDictionary *)data)
```

- [ ] **Step 3: 커밋**

```bash
git add ios/BridgeLib/NativeBridgeModule.swift ios/BridgeLib/NativeBridgeModuleObjc.m
git commit -m "feat: add iOS NativeBridgeModule (Swift + ObjC registration)"
```

---

### Task 14: iOS BridgeEventEmitter.swift

**Files:**
- Create: `ios/BridgeLib/BridgeEventEmitter.swift`

- [ ] **Step 1: BridgeEventEmitter.swift 작성**

`ios/BridgeLib/BridgeEventEmitter.swift`:

```swift
import Foundation

@objc public class BridgeEventEmitter: NSObject {

    @objc public static let shared = BridgeEventEmitter()

    private var listeners: [String: ([String: Any]) -> Void] = [:]

    private override init() {}

    /// 네이티브 → RN 이벤트 전송
    @objc public func send(_ eventName: String, body: [String: Any] = [:]) {
        guard let module = NativeBridgeModule.shared else {
            NSLog("[BridgeEventEmitter] React Native가 실행 중이 아닙니다. BridgeLibManager.initialize()가 호출되었는지 확인하세요.")
            return
        }
        module.emitToJS(eventName: eventName, data: body)
    }

    /// RN → 네이티브 이벤트 리스너 등록
    @objc public func on(_ eventName: String, callback: @escaping ([String: Any]) -> Void) {
        listeners[eventName] = callback
    }

    /// RN → 네이티브 이벤트 리스너 해제
    @objc public func off(_ eventName: String) {
        listeners.removeValue(forKey: eventName)
    }

    internal func handleFromRN(name: String, data: [String: Any]) {
        listeners[name]?(data)
    }
}
```

- [ ] **Step 2: 커밋**

```bash
git add ios/BridgeLib/BridgeEventEmitter.swift
git commit -m "feat: add iOS BridgeEventEmitter"
```

---

### Task 15: iOS BridgeLibManager.swift

**Files:**
- Create: `ios/BridgeLib/BridgeLibFactoryDelegate.swift`
- Create: `ios/BridgeLib/BridgeLibManager.swift`

- [ ] **Step 1: BridgeLibFactoryDelegate.swift 작성**

`ios/BridgeLib/BridgeLibFactoryDelegate.swift`:

```swift
import Foundation
import React_RCTAppDelegate

class BridgeLibFactoryDelegate: RCTDefaultReactNativeFactoryDelegate {

    private let bundleConfig: BundleConfig

    init(bundleConfig: BundleConfig) {
        self.bundleConfig = bundleConfig
        super.init()
    }

    override func bundleURL() -> URL? {
        return bundleConfig.resolvedURL()
    }
}
```

- [ ] **Step 2: BridgeLibManager.swift 작성**

`ios/BridgeLib/BridgeLibManager.swift`:

```swift
import Foundation
import React_RCTAppDelegate

@objc public class BridgeLibManager: NSObject {

    @objc public static let shared = BridgeLibManager()

    private(set) var factory: RCTReactNativeFactory?
    private var delegate: BridgeLibFactoryDelegate?

    private override init() {}

    /// AppDelegate.application(_:didFinishLaunchingWithOptions:)에서 1회 호출
    @objc public func initialize(bundleConfig: BundleConfig) {
        guard factory == nil else { return }
        let factoryDelegate = BridgeLibFactoryDelegate(bundleConfig: bundleConfig)
        self.delegate = factoryDelegate
        self.factory = RCTReactNativeFactory(delegate: factoryDelegate)
    }

    internal func getFactory() -> RCTReactNativeFactory {
        guard let factory = factory else {
            fatalError(
                "BridgeLibManager가 초기화되지 않았습니다. AppDelegate에서 BridgeLibManager.shared.initialize(bundleConfig:)를 호출하세요."
            )
        }
        return factory
    }
}
```

- [ ] **Step 3: 커밋**

```bash
git add ios/BridgeLib/BridgeLibFactoryDelegate.swift ios/BridgeLib/BridgeLibManager.swift
git commit -m "feat: add iOS BridgeLibManager with RCTReactNativeFactory"
```

---

### Task 16: iOS BridgeLibViewController.swift

**Files:**
- Create: `ios/BridgeLib/BridgeLibViewController.swift`

- [ ] **Step 1: BridgeLibViewController.swift 작성**

`ios/BridgeLib/BridgeLibViewController.swift`:

```swift
import UIKit
import React

@objc public class BridgeLibViewController: UIViewController {

    private let moduleName: String
    private let initialProps: [String: Any]?

    /// - Parameters:
    ///   - moduleName: AppRegistry.registerComponent()에 등록된 컴포넌트 이름
    ///   - initialProps: RN 컴포넌트에 전달할 초기 props
    @objc public init(moduleName: String, initialProps: [String: Any]? = nil) {
        self.moduleName = moduleName
        self.initialProps = initialProps
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) 미지원. init(moduleName:initialProps:)를 사용하세요.")
    }

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        embedReactNativeView()
    }

    private func embedReactNativeView() {
        guard let bridge = BridgeLibManager.shared.getFactory().bridge else {
            NSLog("[BridgeLibViewController] RCTBridge를 가져올 수 없습니다. BridgeLibManager.initialize()가 먼저 호출되었는지 확인하세요.")
            return
        }

        let rootView = RCTRootView(
            bridge: bridge,
            moduleName: moduleName,
            initialProperties: initialProps
        )
        rootView.frame = view.bounds
        rootView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(rootView)
    }
}
```

- [ ] **Step 2: 커밋**

```bash
git add ios/BridgeLib/BridgeLibViewController.swift
git commit -m "feat: add iOS BridgeLibViewController"
```

---

### Task 17: CLI 도구 작성

**Files:**
- Create: `bin/bridge-lib.js`
- Create: `scripts/packageAndroid.js`
- Create: `scripts/publishAndroid.js`
- Create: `scripts/packageIos.js`

- [ ] **Step 1: 디렉터리 생성**

```bash
mkdir -p bin scripts
```

- [ ] **Step 2: scripts/packageAndroid.js 작성**

`scripts/packageAndroid.js`:

```javascript
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function findRootDir() {
  let dir = process.cwd();
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('package.json을 찾을 수 없습니다.');
}

function packageAndroid({ variant = 'Release', moduleName = 'bridge-lib' } = {}) {
  const rootDir = findRootDir();
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const androidDir = path.join(rootDir, 'android');

  console.log(`\n[bridge-lib] Android AAR 빌드 시작: ${moduleName} (${variant})`);

  try {
    execSync(`${gradlew} :bridge-lib:assemble${variant}`, {
      cwd: androidDir,
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('[bridge-lib] 빌드 실패:', err.message);
    process.exit(1);
  }

  const aarSrc = path.join(
    androidDir,
    'bridge-lib',
    'build',
    'outputs',
    'aar',
    `bridge-lib-${variant.toLowerCase()}.aar`
  );
  const outputDir = path.join(rootDir, 'output', 'android');
  const aarDest = path.join(outputDir, `${moduleName}-${variant.toLowerCase()}.aar`);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(aarSrc, aarDest);

  console.log(`[bridge-lib] ✓ AAR 생성 완료: ${aarDest}\n`);
}

module.exports = packageAndroid;
```

- [ ] **Step 3: scripts/publishAndroid.js 작성**

`scripts/publishAndroid.js`:

```javascript
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function findRootDir() {
  let dir = process.cwd();
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('package.json을 찾을 수 없습니다.');
}

function publishAndroid({ moduleName = 'bridge-lib', repo } = {}) {
  const rootDir = findRootDir();
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const androidDir = path.join(rootDir, 'android');
  const repoPath = repo || path.join(os.homedir(), '.m2', 'repository');

  console.log(`\n[bridge-lib] Maven 배포 시작 → ${repoPath}`);

  try {
    execSync(
      `${gradlew} :bridge-lib:publishToMavenLocal -PmavenRepoPath=${repoPath}`,
      { cwd: androidDir, stdio: 'inherit' }
    );
  } catch (err) {
    console.error('[bridge-lib] Maven 배포 실패:', err.message);
    process.exit(1);
  }

  console.log(`[bridge-lib] ✓ Maven 배포 완료: ${repoPath}/com/bridgelib/bridge-lib/\n`);
}

module.exports = publishAndroid;
```

- [ ] **Step 4: scripts/packageIos.js 작성**

`scripts/packageIos.js`:

```javascript
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function findRootDir() {
  let dir = process.cwd();
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('package.json을 찾을 수 없습니다.');
}

function packageIos({ scheme = 'BridgeLib', configuration = 'Release', output } = {}) {
  const rootDir = findRootDir();
  const outputDir = output || path.join(rootDir, 'output', 'ios');
  const archivesDir = path.join(outputDir, 'archives');
  const xcframeworkPath = path.join(outputDir, `${scheme}.xcframework`);

  const workspace = path.join(rootDir, 'ios', 'app-lib-bridge-react-native.xcworkspace');
  const simulatorArchive = path.join(archivesDir, `${scheme}-simulator.xcarchive`);
  const deviceArchive = path.join(archivesDir, `${scheme}-device.xcarchive`);

  fs.mkdirSync(archivesDir, { recursive: true });

  console.log(`\n[bridge-lib] iOS XCFramework 빌드 시작: ${scheme} (${configuration})`);

  const run = (cmd) => execSync(cmd, { cwd: rootDir, stdio: 'inherit' });

  try {
    console.log('[bridge-lib] 1/3 시뮬레이터 아카이브 빌드...');
    run([
      'xcodebuild archive',
      `-workspace "${workspace}"`,
      `-scheme ${scheme}`,
      `-configuration ${configuration}`,
      `-destination "generic/platform=iOS Simulator"`,
      `-archivePath "${simulatorArchive}"`,
      'SKIP_INSTALL=NO',
      'BUILD_LIBRARY_FOR_DISTRIBUTION=YES',
    ].join(' '));

    console.log('[bridge-lib] 2/3 디바이스 아카이브 빌드...');
    run([
      'xcodebuild archive',
      `-workspace "${workspace}"`,
      `-scheme ${scheme}`,
      `-configuration ${configuration}`,
      `-destination "generic/platform=iOS"`,
      `-archivePath "${deviceArchive}"`,
      'SKIP_INSTALL=NO',
      'BUILD_LIBRARY_FOR_DISTRIBUTION=YES',
    ].join(' '));

    console.log('[bridge-lib] 3/3 XCFramework 생성...');
    run([
      'xcodebuild -create-xcframework',
      `-framework "${simulatorArchive}/Products/Library/Frameworks/${scheme}.framework"`,
      `-framework "${deviceArchive}/Products/Library/Frameworks/${scheme}.framework"`,
      `-output "${xcframeworkPath}"`,
    ].join(' '));

  } catch (err) {
    console.error('[bridge-lib] iOS 빌드 실패:', err.message);
    process.exit(1);
  }

  console.log(`[bridge-lib] ✓ XCFramework 생성 완료: ${xcframeworkPath}\n`);
}

module.exports = packageIos;
```

- [ ] **Step 5: bin/bridge-lib.js 작성**

`bin/bridge-lib.js`:

```javascript
#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const packageAndroid = require('../scripts/packageAndroid');
const publishAndroid = require('../scripts/publishAndroid');
const packageIos = require('../scripts/packageIos');

program
  .name('bridge-lib')
  .description('bridge-lib 빌드 및 배포 CLI')
  .version('1.0.0');

program
  .command('package:android')
  .description('Android AAR 빌드')
  .option('--variant <variant>', '빌드 variant (Debug | Release)', 'Release')
  .option('--module-name <name>', '출력 파일명', 'bridge-lib')
  .action((options) => {
    packageAndroid({ variant: options.variant, moduleName: options.moduleName });
  });

program
  .command('publish:android')
  .description('Android AAR을 로컬 Maven에 배포')
  .option('--module-name <name>', '모듈 이름', 'bridge-lib')
  .option('--repo <path>', 'Maven 저장소 경로 (기본: ~/.m2/repository)')
  .action((options) => {
    publishAndroid({ moduleName: options.moduleName, repo: options.repo });
  });

program
  .command('package:ios')
  .description('iOS XCFramework 빌드')
  .option('--scheme <scheme>', 'Xcode 스킴 이름', 'BridgeLib')
  .option('--configuration <config>', '빌드 구성 (Debug | Release)', 'Release')
  .option('--output <path>', '출력 디렉터리 경로')
  .action((options) => {
    packageIos({
      scheme: options.scheme,
      configuration: options.configuration,
      output: options.output,
    });
  });

program.parse(process.argv);
```

- [ ] **Step 6: bin/bridge-lib.js 실행 권한 부여**

```bash
chmod +x bin/bridge-lib.js
```

- [ ] **Step 7: CLI 도움말 동작 확인**

```bash
node bin/bridge-lib.js --help
```

Expected:
```
Usage: bridge-lib [options] [command]

bridge-lib 빌드 및 배포 CLI

Options:
  -V, --version     output the version number
  -h, --help        display help for command

Commands:
  package:android   Android AAR 빌드
  publish:android   Android AAR을 로컬 Maven에 배포
  package:ios       iOS XCFramework 빌드
  help [command]    display help for command
```

- [ ] **Step 8: 커밋**

```bash
git add bin/ scripts/
git commit -m "feat: add CLI tools (package:android, publish:android, package:ios)"
```

---

### Task 18: 문서 작성

**Files:**
- Create: `docs/rn-setup.md`
- Create: `docs/android-integration.md`
- Create: `docs/ios-integration.md`

- [ ] **Step 1: docs/rn-setup.md 작성**

`docs/rn-setup.md`:

````markdown
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
````

- [ ] **Step 2: docs/android-integration.md 작성**

`docs/android-integration.md`:

````markdown
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
````

- [ ] **Step 3: docs/ios-integration.md 작성**

`docs/ios-integration.md`:

````markdown
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

OTA로 번들이 다운로드된 후:

```swift
BridgeLibManager.shared.initialize(
    bundleConfig: BundleConfig(
        devURL: URL(string: "http://localhost:8081/index.bundle")!,
        assetName: "main",
        localBundleURL: URL(fileURLWithPath: "/path/to/downloaded/bundle.js")
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
````

- [ ] **Step 4: 커밋**

```bash
git add docs/rn-setup.md docs/android-integration.md docs/ios-integration.md
git commit -m "docs: add rn-setup, android-integration, ios-integration guides"
```

---

## 스펙 커버리지 검토

| 스펙 요구사항 | 구현 태스크 |
|---|---|
| RN TypeScript 패키지 (TurboModule spec) | Task 2, 3 |
| Android AAR 라이브러리 | Task 4~11 |
| iOS XCFramework | Task 12~16 |
| 네이티브 ↔ RN 양방향 이벤트 | Task 6, 7, 13, 14 |
| 번들 로딩 전략 (dev/assets/OTA) | Task 5, 8, 12 |
| CLI package:android | Task 17 |
| CLI publish:android | Task 17 |
| CLI package:ios | Task 17 |
| 문서 3종 | Task 18 |
