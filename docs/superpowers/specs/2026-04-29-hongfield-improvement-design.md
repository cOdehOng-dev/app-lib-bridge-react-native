# Hongfield 개선 설계 문서

**작성일:** 2026-04-29  
**대상 버전:** 1.0.11 →다음 버전  
**범위:** 라이브러리 내부 로직만 (배포 방식 변경 없음)

---

## 배경

Callstack의 `react-native-brownfield`와 기능 격차를 줄이되, 단일 라이브러리 구조와 낮은 복잡도를 유지한다. Expo는 지원하지 않는다.

---

## 개선 목표

1. **TypeScript 제네릭 타입** — 이벤트 페이로드 타입 안전성 확보
2. **`popToNative()`** — RN에서 네이티브로 화면 dismiss 요청
3. **Android 이벤트 큐** — RN 미준비 시 이벤트 버퍼링 후 자동 flush
4. **Android Back 버튼 제어** — `setBackEnabled(Boolean)` API
5. **iOS New Architecture** — `RCTFabricSurface` 기반으로 교체
6. **iOS `queue.sync` 데드락 수정** — `queue.async`로 교체
7. **Docs 싱크** — 신규 API 문서 반영

---

## 섹션 1: TypeScript / JS 레이어

### 변경 파일

#### `src/sendToNative.ts`
```ts
export function sendToNative<T extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  data: T = {} as T,
): void
```
- 제네릭 `T` 추가. 기존 호출 코드 변경 없이 호환.

#### `src/useBridgeEvent.ts`
```ts
export function useBridgeEvent<T extends Record<string, unknown> = Record<string, unknown>>(
  eventName: string,
  callback: (data: T) => void
): void
```
- 제네릭 `T` 추가.

#### `src/popToNative.ts` (신규)
```ts
export function popToNative(): void {
  NativeBridgeModule.popToNative();
}
```

#### `src/specs/NativeBridgeModule.ts`
```ts
export interface Spec extends TurboModule {
  sendEvent(name: string, data: Object): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
  popToNative(): void;  // 추가
}
```

#### `src/index.ts`
```ts
export { popToNative } from './popToNative';
```

---

## 섹션 2: Android 레이어

### `BridgeLibHost.kt`
- `@Synchronized` + double-check 패턴으로 `init()` 스레드 안전성 보장

### `BridgeEventBus.kt`
- `ConcurrentLinkedQueue`로 RN 미준비 시 이벤트 버퍼링
- `setModule(module)` 시 큐 자동 flush
- `send()` 더 이상 throw하지 않음
- `handlePopToNative()` 내부 메서드 추가, `popToNativeCallback` 프로퍼티 추가

### `NativeBridgeModule.kt`
- `@ReactMethod fun popToNative()` 추가 → `BridgeEventBus.handlePopToNative()` 호출

### `BridgeLibActivity.kt`
- `onPopRequested: (() -> Unit)?` 프로퍼티 추가
- `setBackEnabled(enabled: Boolean)` 메서드 추가
- `onBackPressed` 에서 `backEnabled` 플래그 확인
- `onCreate`에서 `BridgeEventBus.setPopToNativeCallback { onPopRequested?.invoke() ?: finish() }` 등록
- `onDestroy`에서 `BridgeEventBus.setPopToNativeCallback(null)` 해제

### `BridgeLibFragment.kt`
- `onPopRequested: (() -> Unit)?` 프로퍼티 추가
- `setBackEnabled(enabled: Boolean)` 메서드 추가
- `onCreateView`에서 `BridgeEventBus.setPopToNativeCallback { onPopRequested?.invoke() }` 등록
- `onDestroyView`에서 `BridgeEventBus.setPopToNativeCallback(null)` 해제

### 사용 예시
```kotlin
// popToNative
val fragment = BridgeLibFragment.newInstance("HomeScreen")
fragment.onPopRequested = { supportFragmentManager.popBackStack() }

// back 버튼 제어
fragment.setBackEnabled(false) // RN 내부 스택 소진 시까지 비활성화
```

---

## 섹션 3: iOS 레이어

### `BridgeLibViewController.swift`
- `RCTRootView(bridge:)` → `RCTFabricSurface` + `RCTSurfaceHostingView`로 교체
- `onPopRequested: (() -> Void)?` 프로퍼티 추가
- `viewDidLoad`에서 `BridgeEventEmitter.shared.setPopToNativeCallback { [weak self] in self?.onPopRequested?() }` 등록
- `viewDidDisappear`에서 `BridgeEventEmitter.shared.setPopToNativeCallback(nil)` 해제

### `BridgeEventEmitter.swift`
- `handleFromRN`: `queue.sync` → `queue.async` 교체 (데드락 방지)
- `handlePopToNative()` 내부 메서드 추가
- `popToNativeCallback: (() -> Void)?` 프로퍼티 추가

### `NativeBridgeModule.swift`
- `@objc func popToNative()` 추가 → `BridgeEventEmitter.shared.handlePopToNative()` 호출

### `NativeBridgeModuleObjc.m`
- `RCT_EXTERN_METHOD(popToNative)` 추가

### 사용 예시
```swift
let vc = BridgeLibViewController(moduleName: "HomeScreen")
vc.onPopRequested = { [weak self] in
    self?.navigationController?.popViewController(animated: true)
}
navigationController?.pushViewController(vc, animated: true)
```

---

## 섹션 4: Docs 싱크

| 파일 | 변경 내용 |
|------|-----------|
| `docs/rn-setup.md` | `useBridgeEvent` 제네릭 예시, `sendToNative` 제네릭 예시, `popToNative()` 섹션 추가 |
| `docs/android-integration.md` | `onPopRequested`, `setBackEnabled` 예시, 이벤트 큐 동작 안내 추가 |
| `docs/ios-integration.md` | `onPopRequested` 예시, 제네릭 이벤트 예시 추가 |
| `docs/build-setup.md` | 변경 없음 |

---

## 제약 조건

- 배포 방식(package.json, scripts/, bin/, dist/) 변경 없음
- Expo 관련 코드 추가 없음
- react-native-cli 전용
- 기존 API 하위 호환 유지 (`sendToNative`, `useBridgeEvent` 기존 호출 방식 그대로 동작)
