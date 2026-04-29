# Hongfield 개선 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1.0.11 대비 TypeScript 제네릭, popToNative(), Android 이벤트 큐, Android Back 제어, iOS New Architecture, iOS 데드락 수정, Docs 싱크 7가지 개선을 하위 호환 유지하며 적용한다.

**Architecture:** 각 플랫폼 레이어(TS/Android/iOS)가 동일한 `popToNative()` 흐름을 구현한다. JS가 `NativeBridgeModule.popToNative()`를 호출하면 네이티브 이벤트 버스가 등록된 콜백을 실행하고, 네이티브 컨테이너(Activity/Fragment/ViewController)가 화면 dismiss를 처리한다. 이벤트 큐는 RN 미준비 시 send()를 드롭하지 않고 버퍼링해 모듈 등록 즉시 flush한다.

**Tech Stack:** TypeScript 5.8 (제네릭), React Native 0.84 (TurboModule Spec, Codegen), Kotlin (Coroutine-free thread-safe 패턴), Swift (RCTFabricSurface, DispatchQueue barrier), Jest 29 (TS 단위 테스트)

---

## 파일 구조

| 상태 | 경로 | 변경 내용 |
|------|------|-----------|
| 수정 | `src/sendToNative.ts` | 제네릭 `T` 추가 |
| 수정 | `src/useBridgeEvent.ts` | 제네릭 `T` 추가 |
| **신규** | `src/popToNative.ts` | `popToNative()` 함수 |
| 수정 | `src/specs/NativeBridgeModule.ts` | `popToNative()` Spec 추가 |
| 수정 | `src/index.ts` | `popToNative` export 추가 |
| 수정 | `src/__tests__/sendToNative.test.ts` | 제네릭 타입 테스트 추가 |
| **신규** | `src/__tests__/popToNative.test.ts` | popToNative 테스트 |
| 수정 | `android/.../BridgeLibHost.kt` | double-check 스레드 안전 init |
| 수정 | `android/.../BridgeEventBus.kt` | 이벤트 큐 + popToNative 콜백 |
| 수정 | `android/.../NativeBridgeModule.kt` | `@ReactMethod popToNative()` 추가 |
| 수정 | `android/.../BridgeLibActivity.kt` | `onPopRequested`, `setBackEnabled`, 콜백 등록 |
| 수정 | `android/.../BridgeLibFragment.kt` | `onPopRequested`, `setBackEnabled`, 콜백 등록 |
| 수정 | `ios/BridgeLib/BridgeEventEmitter.swift` | `queue.async` 교체, `handlePopToNative()`, `setPopToNativeCallback()` |
| 수정 | `ios/BridgeLib/NativeBridgeModule.swift` | `@objc func popToNative()` 추가 |
| 수정 | `ios/BridgeLib/NativeBridgeModuleObjc.m` | `RCT_EXTERN_METHOD(popToNative)` 추가 |
| 수정 | `ios/BridgeLib/BridgeLibViewController.swift` | `RCTFabricSurface`, `onPopRequested` 콜백 |
| 수정 | `docs/rn-setup.md` | 제네릭 예시, `popToNative()` 섹션 |
| 수정 | `docs/android-integration.md` | `onPopRequested`, `setBackEnabled`, 이벤트 큐 안내 |
| 수정 | `docs/ios-integration.md` | `onPopRequested`, 제네릭 이벤트 예시 |

---

## Task 1: TypeScript — sendToNative & useBridgeEvent 제네릭 추가

**Files:**
- Modify: `src/sendToNative.ts`
- Modify: `src/useBridgeEvent.ts`
- Modify: `src/__tests__/sendToNative.test.ts`

- [ ] **Step 1: 제네릭 타입 테스트 작성**

`src/__tests__/sendToNative.test.ts`에 아래 테스트를 기존 테스트 아래에 추가한다.

```typescript
test('typed payload로 sendEvent를 호출한다', () => {
  type Payload = { userId: string; count: number };
  sendToNative<Payload>('LOGIN', { userId: 'abc', count: 1 });
  expect(NativeBridgeModule.sendEvent).toHaveBeenCalledWith('LOGIN', { userId: 'abc', count: 1 });
});

test('제네릭 미지정 시 기존 방식과 동일하게 동작한다', () => {
  sendToNative('FALLBACK', { x: 1 });
  expect(NativeBridgeModule.sendEvent).toHaveBeenCalledWith('FALLBACK', { x: 1 });
});
```

- [ ] **Step 2: 테스트 실행 → FAIL 확인**

```bash
npx jest src/__tests__/sendToNative.test.ts --no-coverage
```

예상: PASS (제네릭은 타입 수준 변경이므로 런타임 동작은 동일하나, TypeScript 컴파일 검증 포함)

- [ ] **Step 3: sendToNative.ts 제네릭 추가**

`src/sendToNative.ts` 전체를 아래로 교체한다:

```typescript
import NativeBridgeModule from './specs/NativeBridgeModule';

export function sendToNative<T extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  data: T = {} as T,
): void {
  NativeBridgeModule.sendEvent(name, data);
}
```

- [ ] **Step 4: useBridgeEvent.ts 제네릭 추가**

`src/useBridgeEvent.ts` 전체를 아래로 교체한다:

```typescript
import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import NativeBridgeModule from './specs/NativeBridgeModule';

const emitter = new NativeEventEmitter(NativeModules.NativeBridgeModule);

export function useBridgeEvent<T extends Record<string, unknown> = Record<string, unknown>>(
  eventName: string,
  callback: (data: T) => void
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    NativeBridgeModule.addListener('BridgeEvent');

    const subscription = emitter.addListener(
      'BridgeEvent',
      (event: { name: string; data: T }) => {
        if (event.name === eventName) {
          callbackRef.current(event.data);
        }
      }
    );

    return () => {
      subscription.remove();
      NativeBridgeModule.removeListeners(1);
    };
  }, [eventName]);
}
```

- [ ] **Step 5: 테스트 실행 → PASS 확인**

```bash
npx jest src/__tests__/sendToNative.test.ts --no-coverage
```

예상: PASS (5개 테스트 모두 통과)

- [ ] **Step 6: 빌드 타입 검증**

```bash
npx tsc --noEmit
```

예상: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add src/sendToNative.ts src/useBridgeEvent.ts src/__tests__/sendToNative.test.ts
git commit -m "feat: add generic type parameter to sendToNative and useBridgeEvent"
```

---

## Task 2: TypeScript — popToNative() 함수 및 Spec 추가

**Files:**
- Create: `src/popToNative.ts`
- Create: `src/__tests__/popToNative.test.ts`
- Modify: `src/specs/NativeBridgeModule.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: 테스트 파일 작성**

`src/__tests__/popToNative.test.ts`를 새로 생성한다:

```typescript
jest.mock('../specs/NativeBridgeModule', () => ({
  sendEvent: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
  popToNative: jest.fn(),
}));

import { popToNative } from '../popToNative';
import NativeBridgeModule from '../specs/NativeBridgeModule';

describe('popToNative', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('NativeBridgeModule.popToNative()를 호출한다', () => {
    popToNative();
    expect(NativeBridgeModule.popToNative).toHaveBeenCalledTimes(1);
  });

  test('인자 없이 호출된다', () => {
    popToNative();
    expect(NativeBridgeModule.popToNative).toHaveBeenCalledWith();
  });
});
```

- [ ] **Step 2: 테스트 실행 → FAIL 확인**

```bash
npx jest src/__tests__/popToNative.test.ts --no-coverage
```

예상: FAIL — `Cannot find module '../popToNative'`

- [ ] **Step 3: NativeBridgeModule Spec에 popToNative 추가**

`src/specs/NativeBridgeModule.ts` 전체를 아래로 교체한다:

```typescript
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  sendEvent(name: string, data: Object): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
  popToNative(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeBridgeModule');
```

- [ ] **Step 4: popToNative.ts 구현**

`src/popToNative.ts`를 새로 생성한다:

```typescript
import NativeBridgeModule from './specs/NativeBridgeModule';

export function popToNative(): void {
  NativeBridgeModule.popToNative();
}
```

- [ ] **Step 5: index.ts에 export 추가**

`src/index.ts`에 마지막 줄을 추가한다:

```typescript
export { BridgeLib } from './BridgeLib';
export { sendToNative } from './sendToNative';
export { useBridgeEvent } from './useBridgeEvent';
export { popToNative } from './popToNative';
```

- [ ] **Step 6: 테스트 실행 → PASS 확인**

```bash
npx jest src/__tests__/popToNative.test.ts --no-coverage
```

예상: PASS (2개 테스트 통과)

- [ ] **Step 7: 전체 테스트 + 빌드 검증**

```bash
npx jest --no-coverage && npx tsc --noEmit
```

예상: 모든 테스트 PASS, TS 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add src/popToNative.ts src/__tests__/popToNative.test.ts src/specs/NativeBridgeModule.ts src/index.ts
git commit -m "feat: add popToNative() function and TurboModule spec"
```

---

## Task 3: Android — BridgeLibHost thread-safe init + BridgeEventBus 이벤트 큐

**Files:**
- Modify: `android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibHost.kt`
- Modify: `android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeEventBus.kt`

- [ ] **Step 1: BridgeLibHost.kt — double-check 스레드 안전 init 적용**

`android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibHost.kt` 전체를 아래로 교체한다:

```kotlin
package com.bridgelib

import android.app.Application
import android.content.pm.ApplicationInfo
import com.facebook.react.ReactHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

object BridgeLibHost {

    @Volatile
    private var reactHost: ReactHost? = null

    fun init(
        application: Application,
        bundleConfig: BundleConfig = BundleConfig(),
        packages: List<ReactPackage> = emptyList(),
        jsMainModulePath: String = "index"
    ) {
        if (reactHost != null) return
        synchronized(this) {
            if (reactHost != null) return

            val isDebug = bundleConfig.isDebug
                ?: (application.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0)

            SoLoader.init(application, OpenSourceMergedSoMapping)

            reactHost = DefaultReactHost.getDefaultReactHost(
                context = application,
                packageList = packages + listOf(BridgeLibPackage()),
                jsMainModulePath = jsMainModulePath,
                jsBundleAssetPath = bundleConfig.assetPath,
                jsBundleFilePath = bundleConfig.localBundlePath
            )
        }
    }

    fun getReactHost(): ReactHost = reactHost
        ?: throw IllegalStateException(
            "BridgeLibHost가 초기화되지 않았습니다. Application.onCreate()에서 BridgeLibHost.init()을 호출하세요."
        )
}
```

- [ ] **Step 2: BridgeEventBus.kt — 이벤트 큐 + popToNative 콜백 적용**

`android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeEventBus.kt` 전체를 아래로 교체한다:

```kotlin
package com.bridgelib

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue

object BridgeEventBus {

    @Volatile
    private var moduleRef: NativeBridgeModule? = null

    private val pendingQueue = ConcurrentLinkedQueue<Pair<String, Map<String, Any?>>>()
    private val listeners = ConcurrentHashMap<String, (Map<String, Any?>) -> Unit>()

    @Volatile
    private var popToNativeCallback: (() -> Unit)? = null

    internal fun setModule(module: NativeBridgeModule?) {
        moduleRef = module
        if (module != null) flushQueue()
    }

    private fun flushQueue() {
        while (true) {
            val item = pendingQueue.poll() ?: break
            moduleRef?.emitToJS(item.first, item.second)
        }
    }

    fun send(eventName: String, data: Map<String, Any?> = emptyMap()) {
        val module = moduleRef
        if (module != null) {
            module.emitToJS(eventName, data)
        } else {
            pendingQueue.offer(Pair(eventName, data))
        }
    }

    fun on(eventName: String, listener: (Map<String, Any?>) -> Unit) {
        listeners[eventName] = listener
    }

    fun off(eventName: String) {
        listeners.remove(eventName)
    }

    internal fun handleFromRN(eventName: String, data: HashMap<String, Any?>) {
        listeners[eventName]?.invoke(data)
    }

    internal fun handlePopToNative() {
        popToNativeCallback?.invoke()
    }

    internal fun setPopToNativeCallback(callback: (() -> Unit)?) {
        popToNativeCallback = callback
    }
}
```

- [ ] **Step 3: Android 빌드 검증**

```bash
cd android && ./gradlew :bridge-lib:compileDebugKotlin && cd ..
```

예상: BUILD SUCCESSFUL

- [ ] **Step 4: 커밋**

```bash
git add android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibHost.kt \
        android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeEventBus.kt
git commit -m "feat(android): thread-safe BridgeLibHost init and event queue in BridgeEventBus"
```

---

## Task 4: Android — popToNative ReactMethod + BridgeLibActivity/BridgeLibFragment 콜백

**Files:**
- Modify: `android/bridge-lib/src/main/kotlin/com/bridgelib/NativeBridgeModule.kt`
- Modify: `android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibActivity.kt`
- Modify: `android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibFragment.kt`

- [ ] **Step 1: NativeBridgeModule.kt에 popToNative ReactMethod 추가**

`android/bridge-lib/src/main/kotlin/com/bridgelib/NativeBridgeModule.kt` 전체를 아래로 교체한다:

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
        // NativeEventEmitter 요구 사항
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // NativeEventEmitter 요구 사항
    }

    @ReactMethod
    fun popToNative() {
        BridgeEventBus.handlePopToNative()
    }

    internal fun emitToJS(eventName: String, data: Map<String, Any?>) {
        if (!reactApplicationContext.hasActiveReactInstance()) return
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
                    null -> dataMap.putNull(key)
                    else -> dataMap.putString(key, value.toString())
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

- [ ] **Step 2: BridgeLibActivity.kt — onPopRequested, setBackEnabled, 콜백 등록**

`android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibActivity.kt` 전체를 아래로 교체한다:

```kotlin
package com.bridgelib

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.facebook.react.ReactDelegate
import com.facebook.react.modules.core.DefaultHardwareBackBtnHandler

class BridgeLibActivity : AppCompatActivity(), DefaultHardwareBackBtnHandler {

    private var reactDelegate: ReactDelegate? = null

    var onPopRequested: (() -> Unit)? = null

    @Volatile private var backEnabled: Boolean = true

    fun setBackEnabled(enabled: Boolean) {
        backEnabled = enabled
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val moduleName = intent.getStringExtra(EXTRA_MODULE_NAME)
            ?: throw IllegalArgumentException(
                "BridgeLibActivity: 'bridge_lib_module_name' extra가 필요합니다."
            )
        val initialProps = intent.getBundleExtra(EXTRA_INITIAL_PROPS)

        reactDelegate = ReactDelegate(
            this,
            BridgeLibHost.getReactHost(),
            moduleName,
            initialProps
        ).also { delegate ->
            delegate.loadApp()
            setContentView(delegate.reactRootView)
        }

        BridgeEventBus.setPopToNativeCallback { onPopRequested?.invoke() ?: finish() }
    }

    override fun invokeDefaultOnBackPressed() {
        @Suppress("DEPRECATION")
        super.onBackPressed()
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (!backEnabled) return
        reactDelegate?.onBackPressed()
    }

    override fun onResume() {
        super.onResume()
        reactDelegate?.onHostResume()
    }

    override fun onPause() {
        super.onPause()
        reactDelegate?.onHostPause()
    }

    override fun onDestroy() {
        BridgeEventBus.setPopToNativeCallback(null)
        reactDelegate?.onHostDestroy()
        reactDelegate = null
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
                if (context !is android.app.Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
    }
}
```

- [ ] **Step 3: BridgeLibFragment.kt — onPopRequested, setBackEnabled, 콜백 등록**

`android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibFragment.kt` 전체를 아래로 교체한다:

```kotlin
package com.bridgelib

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.OnBackPressedCallback
import androidx.fragment.app.Fragment
import com.facebook.react.ReactDelegate
import com.facebook.react.modules.core.DefaultHardwareBackBtnHandler

class BridgeLibFragment : Fragment() {

    private var reactDelegate: ReactDelegate? = null
    private var backCallback: OnBackPressedCallback? = null

    var onPopRequested: (() -> Unit)? = null

    @Volatile private var backEnabled: Boolean = true

    fun setBackEnabled(enabled: Boolean) {
        backEnabled = enabled
        backCallback?.isEnabled = !enabled
    }

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

        val delegate = ReactDelegate(
            requireActivity(),
            BridgeLibHost.getReactHost(),
            moduleName,
            initialProps
        )
        reactDelegate = delegate
        delegate.loadApp()

        backCallback = object : OnBackPressedCallback(false) {
            override fun handleOnBackPressed() {
                // backEnabled=false 일 때 활성화되어 뒤로가기를 삼킴 (RN 내부 스택 처리)
            }
        }
        requireActivity().onBackPressedDispatcher.addCallback(viewLifecycleOwner, backCallback!!)

        BridgeEventBus.setPopToNativeCallback { onPopRequested?.invoke() }

        return checkNotNull(delegate.reactRootView) {
            "ReactDelegate.reactRootView이 null입니다."
        }
    }

    override fun onResume() {
        super.onResume()
        if (activity is DefaultHardwareBackBtnHandler) {
            reactDelegate?.onHostResume()
        }
    }

    override fun onPause() {
        super.onPause()
        reactDelegate?.onHostPause()
    }

    override fun onDestroyView() {
        BridgeEventBus.setPopToNativeCallback(null)
        reactDelegate?.unloadApp()
        reactDelegate = null
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

- [ ] **Step 4: Android 빌드 검증**

```bash
cd android && ./gradlew :bridge-lib:compileDebugKotlin && cd ..
```

예상: BUILD SUCCESSFUL

- [ ] **Step 5: 커밋**

```bash
git add android/bridge-lib/src/main/kotlin/com/bridgelib/NativeBridgeModule.kt \
        android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibActivity.kt \
        android/bridge-lib/src/main/kotlin/com/bridgelib/BridgeLibFragment.kt
git commit -m "feat(android): add popToNative ReactMethod and onPopRequested/setBackEnabled to Activity and Fragment"
```

---

## Task 5: iOS — BridgeEventEmitter 데드락 수정 + popToNative 콜백

**Files:**
- Modify: `ios/BridgeLib/BridgeEventEmitter.swift`

- [ ] **Step 1: BridgeEventEmitter.swift 교체**

`ios/BridgeLib/BridgeEventEmitter.swift` 전체를 아래로 교체한다:

```swift
import Foundation

@objc public class BridgeEventEmitter: NSObject {

    @objc public static let shared = BridgeEventEmitter()

    private let queue = DispatchQueue(label: "com.bridgelib.BridgeEventEmitter", attributes: .concurrent)
    private var listeners: [String: ([String: Any]) -> Void] = [:]
    private var popToNativeCallback: (() -> Void)?

    private override init() {}

    @objc public func send(_ eventName: String, body: [String: Any] = [:]) {
        guard let module = NativeBridgeModule.shared else {
            NSLog("[BridgeEventEmitter] React Native가 실행 중이 아닙니다. BridgeLibManager.initialize()가 호출되었는지 확인하세요.")
            return
        }
        module.emitToJS(eventName: eventName, data: body)
    }

    @objc public func on(_ eventName: String, callback: @escaping ([String: Any]) -> Void) {
        queue.async(flags: .barrier) { self.listeners[eventName] = callback }
    }

    @objc public func off(_ eventName: String) {
        queue.async(flags: .barrier) { self.listeners.removeValue(forKey: eventName) }
    }

    internal func handleFromRN(name: String, data: [String: Any]) {
        // queue.sync → queue.async: 데드락 방지
        queue.async { self.listeners[name]?(data) }
    }

    internal func setPopToNativeCallback(_ callback: (() -> Void)?) {
        queue.async(flags: .barrier) { self.popToNativeCallback = callback }
    }

    internal func handlePopToNative() {
        queue.async { self.popToNativeCallback?() }
    }
}
```

- [ ] **Step 2: iOS 빌드 검증**

```bash
xcodebuild -workspace ios/bridgelib.xcworkspace \
           -scheme BridgeLib \
           -sdk iphonesimulator \
           -destination 'generic/platform=iOS Simulator' \
           build \
           CODE_SIGNING_ALLOWED=NO 2>&1 | tail -5
```

예상: `** BUILD SUCCEEDED **`

- [ ] **Step 3: 커밋**

```bash
git add ios/BridgeLib/BridgeEventEmitter.swift
git commit -m "fix(ios): replace queue.sync with queue.async to prevent deadlock and add popToNative callback"
```

---

## Task 6: iOS — NativeBridgeModule popToNative 메서드 + Objc 브리지

**Files:**
- Modify: `ios/BridgeLib/NativeBridgeModule.swift`
- Modify: `ios/BridgeLib/NativeBridgeModuleObjc.m`

- [ ] **Step 1: NativeBridgeModule.swift에 popToNative 추가**

`ios/BridgeLib/NativeBridgeModule.swift` 전체를 아래로 교체한다:

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

    @objc func popToNative() {
        BridgeEventEmitter.shared.handlePopToNative()
    }

    func emitToJS(eventName: String, data: [String: Any]) {
        sendEvent(withName: "BridgeEvent", body: ["name": eventName, "data": data])
    }
}
```

- [ ] **Step 2: NativeBridgeModuleObjc.m에 popToNative 선언 추가**

`ios/BridgeLib/NativeBridgeModuleObjc.m` 전체를 아래로 교체한다:

```objc
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

RCT_EXTERN_MODULE(NativeBridgeModule, RCTEventEmitter)
RCT_EXTERN_METHOD(sendEvent:(NSString *)name data:(NSDictionary *)data)
RCT_EXTERN_METHOD(popToNative)
```

- [ ] **Step 3: iOS 빌드 검증**

```bash
xcodebuild -workspace ios/bridgelib.xcworkspace \
           -scheme BridgeLib \
           -sdk iphonesimulator \
           -destination 'generic/platform=iOS Simulator' \
           build \
           CODE_SIGNING_ALLOWED=NO 2>&1 | tail -5
```

예상: `** BUILD SUCCEEDED **`

- [ ] **Step 4: 커밋**

```bash
git add ios/BridgeLib/NativeBridgeModule.swift ios/BridgeLib/NativeBridgeModuleObjc.m
git commit -m "feat(ios): add popToNative method to NativeBridgeModule"
```

---

## Task 7: iOS — BridgeLibViewController New Architecture + onPopRequested

**Files:**
- Modify: `ios/BridgeLib/BridgeLibViewController.swift`

- [ ] **Step 1: BridgeLibViewController.swift 교체**

`ios/BridgeLib/BridgeLibViewController.swift` 전체를 아래로 교체한다:

```swift
import UIKit
import React
import React_RCTFabric

@objc public class BridgeLibViewController: UIViewController {

    private let moduleName: String
    private let initialProps: [String: Any]?

    /// RN 화면이 popToNative()를 호출할 때 실행될 클로저.
    /// nil이면 아무 동작도 하지 않는다.
    @objc public var onPopRequested: (() -> Void)?

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

    private func embedReactNativeView() {
        guard let bridge = BridgeLibManager.shared.getFactory().bridge,
              let surfacePresenter = bridge.surfacePresenter else {
            NSLog("[BridgeLibViewController] surfacePresenter를 가져올 수 없습니다. BridgeLibManager.initialize()가 먼저 호출되었는지 확인하세요.")
            return
        }

        let surface = RCTFabricSurface(
            surfacePresenter: surfacePresenter,
            moduleName: moduleName,
            initialProperties: initialProps ?? [:]
        )
        let hostingView = RCTSurfaceHostingView(
            surface: surface,
            sizeMeasureMode: [.widthExact, .heightExact]
        )
        hostingView.frame = view.bounds
        hostingView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(hostingView)
    }
}
```

- [ ] **Step 2: iOS 빌드 검증**

```bash
xcodebuild -workspace ios/bridgelib.xcworkspace \
           -scheme BridgeLib \
           -sdk iphonesimulator \
           -destination 'generic/platform=iOS Simulator' \
           build \
           CODE_SIGNING_ALLOWED=NO 2>&1 | tail -5
```

예상: `** BUILD SUCCEEDED **`

- [ ] **Step 3: 커밋**

```bash
git add ios/BridgeLib/BridgeLibViewController.swift
git commit -m "feat(ios): migrate to RCTFabricSurface and add onPopRequested callback"
```

---

## Task 8: Docs 업데이트

**Files:**
- Modify: `docs/rn-setup.md`
- Modify: `docs/android-integration.md`
- Modify: `docs/ios-integration.md`

- [ ] **Step 1: docs/rn-setup.md — 섹션 3,4에 제네릭 예시 추가, 섹션 5로 popToNative 추가**

`docs/rn-setup.md`의 **섹션 3** 코드블록을 아래로 교체한다 (기존 `useBridgeEvent` 예시 교체):

```typescript
import { useBridgeEvent } from '@codehong-dev/hongfield';

function HomeScreen() {
  // 기본 사용 (타입 추론)
  useBridgeEvent('USER_LOGGED_IN', (data) => {
    console.log('로그인 사용자:', data.name);
  });

  // 제네릭으로 타입 명시
  useBridgeEvent<{ name: string; role: string }>('USER_LOGGED_IN', (data) => {
    console.log('로그인 사용자:', data.name, data.role);
  });

  return <View />;
}
```

`docs/rn-setup.md`의 **섹션 4** 코드블록을 아래로 교체한다 (기존 `sendToNative` 예시 교체):

```typescript
import { sendToNative } from '@codehong-dev/hongfield';

function PaymentButton() {
  const handlePress = () => {
    // 기본 사용
    sendToNative('PAYMENT_DONE', { amount: 9900, currency: 'KRW' });

    // 제네릭으로 타입 명시
    sendToNative<{ amount: number; currency: string }>(
      'PAYMENT_DONE',
      { amount: 9900, currency: 'KRW' }
    );
  };

  return <Button onPress={handlePress} title="결제" />;
}
```

`docs/rn-setup.md`의 **섹션 4** 뒤에 새 섹션을 삽입한다:

```markdown
## 5. 네이티브 화면 닫기 (RN → 네이티브)

RN에서 네이티브 컨테이너(Activity/Fragment/ViewController)를 닫으려면 `popToNative()`를 호출한다.

```typescript
import { popToNative } from '@codehong-dev/hongfield';

function MyScreen() {
  return (
    <Button
      onPress={() => popToNative()}
      title="닫기"
    />
  );
}
```

네이티브 측에서 `onPopRequested` 콜백을 등록해야 동작한다.
- Android: `BridgeLibActivity.onPopRequested` / `BridgeLibFragment.onPopRequested` 참고
- iOS: `BridgeLibViewController.onPopRequested` 참고
```

기존 섹션 5~8은 번호를 6~9로 renumber한다.

- [ ] **Step 2: docs/android-integration.md — 섹션 5에 popToNative 예시, 섹션 6에 이벤트 큐 안내 추가**

`docs/android-integration.md`의 **섹션 5** (RN 화면 실행) 코드블록 아래에 다음을 추가한다:

```markdown
### popToNative 콜백 등록

RN이 `popToNative()`를 호출했을 때 실행될 콜백을 등록한다.

**Activity:**
```kotlin
val intent = Intent(this, BridgeLibActivity::class.java).apply {
    putExtra(BridgeLibActivity.EXTRA_MODULE_NAME, "HomeScreen")
}
startActivity(intent)

// 또는 서브클래싱 없이 직접 인스턴스 접근이 필요한 경우:
// BridgeLibActivity를 상속하고 onCreate에서 onPopRequested를 설정
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

```kotlin
// RN 내부 스택이 소진될 때까지 네이티브 뒤로가기 비활성화
fragment.setBackEnabled(false)

// 네이티브 뒤로가기 재활성화
fragment.setBackEnabled(true)
```
```

`docs/android-integration.md`의 **섹션 6** (이벤트 통신) 아래에 다음을 추가한다:

```markdown
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
```

- [ ] **Step 3: docs/ios-integration.md — 섹션 5에 onPopRequested 예시, 섹션 6에 제네릭 예시 추가**

`docs/ios-integration.md`의 **섹션 5** (RN 화면 실행) 코드블록을 아래로 교체한다:

```swift
import BridgeLib

// Push — onPopRequested 등록
let vc = BridgeLibViewController(
    moduleName: "HomeScreen",
    initialProps: ["userId": "123", "theme": "dark"]
)
vc.onPopRequested = { [weak self] in
    self?.navigationController?.popViewController(animated: true)
}
navigationController?.pushViewController(vc, animated: true)

// Modal — onPopRequested 등록
let vc = BridgeLibViewController(moduleName: "PaymentScreen")
vc.onPopRequested = { [weak self] in
    self?.dismiss(animated: true)
}
present(vc, animated: true)
```

`docs/ios-integration.md`의 **섹션 6** (이벤트 통신) 코드블록을 아래로 교체한다:

```swift
import BridgeLib

// 네이티브 → RN
BridgeEventEmitter.shared.send("USER_LOGGED_IN", body: ["name": "Oscar"])

// RN → 네이티브 리스너 (기본)
BridgeEventEmitter.shared.on("PAYMENT_DONE") { data in
    if let amount = data["amount"] as? Double {
        self.processPayment(amount: amount)
    }
}

// 제네릭 이벤트 예시 (RN 측에서 useBridgeEvent<T> 사용 시 타입 대응)
// Swift는 런타임 타입이므로 as? 캐스팅으로 검증
BridgeEventEmitter.shared.on("ORDER_UPDATED") { data in
    guard let orderId = data["orderId"] as? String,
          let status = data["status"] as? String else { return }
    self.updateOrderUI(orderId: orderId, status: status)
}

// 리스너 해제
BridgeEventEmitter.shared.off("PAYMENT_DONE")
```

- [ ] **Step 4: 커밋**

```bash
git add docs/rn-setup.md docs/android-integration.md docs/ios-integration.md
git commit -m "docs: sync new APIs - generic types, popToNative, event queue, setBackEnabled"
```

---

## Self-Review

### Spec 커버리지 확인

| 스펙 항목 | 구현 Task |
|-----------|-----------|
| TypeScript 제네릭 타입 | Task 1 |
| `popToNative()` JS/RN | Task 2 |
| Android 이벤트 큐 | Task 3 |
| Android Back 버튼 제어 `setBackEnabled` | Task 4 |
| iOS New Architecture `RCTFabricSurface` | Task 7 |
| iOS `queue.sync` 데드락 수정 | Task 5 |
| Docs 싱크 | Task 8 |

모든 스펙 항목이 Task에 대응됨.

### 타입 일관성

- `BridgeEventBus.setPopToNativeCallback` — Task 3에서 정의, Task 4에서 Activity/Fragment가 호출 ✓
- `BridgeEventEmitter.shared.setPopToNativeCallback` — Task 5에서 정의, Task 7에서 ViewController가 호출 ✓
- `BridgeEventEmitter.shared.handlePopToNative()` — Task 5에서 정의, Task 6에서 NativeBridgeModule이 호출 ✓
- `NativeBridgeModule.popToNative()` — Task 6에서 정의, `NativeBridgeModuleObjc.m`에 선언 ✓
- `Spec.popToNative()` — Task 2에서 정의, JS `popToNative()` 함수가 호출 ✓

### 하위 호환성

- `sendToNative()` 기존 호출 (`sendToNative('EVENT', {})`) — 제네릭 default 값으로 그대로 동작 ✓
- `useBridgeEvent()` 기존 호출 — 동일 ✓
- `BridgeEventBus.send()` — 기존 시그니처 유지, throw 제거하고 큐에 쌓는 방식으로 변경 ✓
