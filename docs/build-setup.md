# 빌드 설정 및 자동 Import 트러블슈팅

## 문제: IDE에서 `sendToNative` 자동 import가 안 되는 경우

### 원인

TypeScript LSP(IDE의 자동 import 기능)는 패키지의 `package.json`에 있는 `"types"` 필드가 가리키는 `.d.ts` 파일에서 심볼 목록을 읽습니다.

기존 설정은 아래처럼 `.ts` 소스 파일을 직접 가리키고 있었고, `"types"` 필드가 없었습니다.

```json
// 기존 (문제 있는 상태)
{
  "main": "src/index.ts"
}
```

이 경우 IDE가 타입 정보를 찾지 못해 `sendToNative`, `useBridgeEvent`, `BridgeLib` 등의 자동 import 제안이 동작하지 않습니다.

---

## 해결: 빌드 파이프라인 추가

### 변경된 파일 구조

```
app-lib-bridge-react-native/
├── src/                  # TypeScript 소스
├── dist/                 # 빌드 결과물 (자동 생성)
│   ├── index.js
│   ├── index.d.ts        # IDE가 이 파일에서 타입 정보를 읽음
│   ├── sendToNative.js
│   ├── sendToNative.d.ts
│   └── ...
├── tsconfig.json         # 앱 실행용 (기존)
└── tsconfig.lib.json     # 라이브러리 빌드 전용 (신규)
```

### 추가된 `tsconfig.lib.json`

소스 파일(`src/`)을 컴파일해 `dist/`에 `.js` + `.d.ts`를 생성하는 설정입니다.

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "module": "CommonJS",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["src/**/__tests__", "node_modules"]
}
```

### 변경된 `package.json`

```json
{
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.lib.json"
  },
  "files": [
    "dist/",
    "src/"
  ]
}
```

| 필드 | 역할 |
|------|------|
| `"main"` | 런타임에 로드할 JS 진입점 |
| `"types"` | IDE가 타입 정보를 읽는 `.d.ts` 진입점 |
| `"files"` | npm publish 시 포함할 파일 목록 |

---

## 빌드 실행

```bash
npm run build
```

소스를 수정할 때마다 빌드를 다시 실행해야 변경 사항이 반영됩니다.

---

## IDE 재시작

빌드 후에도 자동 import가 동작하지 않으면 TypeScript 서버를 재시작합니다.

- **VS Code / Cursor**: `Cmd+Shift+P` → `TypeScript: Restart TS Server`
- **WebStorm / IntelliJ**: `File` → `Invalidate Caches`

---

## 자동 import 추천이 뜨지 않는 경우

### 원인

VS Code / Cursor의 `includePackageJsonAutoImports` 기본값은 `"auto"` 입니다.
이 모드는 **프로젝트 내에서 이미 한 번 이상 import된 패키지만** 자동 추천 대상에 포함합니다.

라이브러리를 처음 추가하거나 모든 import가 제거된 상태에서는 아무리 입력해도 추천이 뜨지 않습니다.

### 해결

`settings.json`에 아래 설정을 추가합니다.

```json
"typescript.preferences.includePackageJsonAutoImports": "on"
```

`"on"` 으로 설정하면 `package.json`에 등록된 모든 패키지가 import 여부와 관계없이 항상 자동 추천 대상이 됩니다.

**VS Code / Cursor 기준:**
`Cmd+Shift+P` → `Open User Settings (JSON)` → 위 설정 추가 후 `TypeScript: Restart TS Server`
