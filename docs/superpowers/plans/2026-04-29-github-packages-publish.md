# GitHub Packages 배포 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@codehong-dev/hongfield` 패키지를 GitHub Packages에 자동 배포하는 3-workflow CI/CD 시스템을 구축한다.

**Architecture:** 기존 `codehong-lib-react-native-widget` 레포의 release / snapshot / manual 3-workflow 구조를 그대로 따른다. `package.json`이 레포 루트에 있으므로 `working-directory` 지정 없이 루트에서 `npm publish`를 실행한다.

**Tech Stack:** GitHub Actions, GitHub Packages (npm registry), Node.js 20

---

## 파일 목록

- Modify: `package.json` — 패키지명 스코프 추가, publishConfig 추가
- Create: `.github/workflows/publish-release.yml`
- Create: `.github/workflows/publish-snapshot.yml`
- Create: `.github/workflows/publish-manual.yml`
- Modify: `docs/rn-setup.md` — 설치 섹션 업데이트

---

### Task 1: package.json에 GitHub Packages 배포 설정 추가

**Files:**
- Modify: `package.json`

- [ ] **Step 1: `name` 필드에 org 스코프 추가, `publishConfig` 추가**

`package.json`의 `name`과 `publishConfig`를 아래와 같이 수정한다:

```json
{
  "name": "@codehong-dev/hongfield",
  "version": "1.0.0",
  "description": "Native-React Native bridge library for Android and iOS",
  "private": false,
  "main": "src/index.ts",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  },
  "bin": {
    "hongfield": "bin/bridge-lib.js"
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
    "commander": "^12.1.0"
  },
  "peerDependencies": {
    "react": ">=19.0.0",
    "react-native": ">=0.84.0",
    "react-native-safe-area-context": ">=4.0.0"
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
    "@react-native/new-app-screen": "0.84.1",
    "@react-native/typescript-config": "0.84.1",
    "@types/jest": "^29.5.13",
    "@types/react": "^19.2.0",
    "@types/react-test-renderer": "^19.1.0",
    "eslint": "^8.19.0",
    "jest": "^29.6.3",
    "prettier": "2.8.8",
    "react": "19.2.3",
    "react-native": "0.84.1",
    "react-native-safe-area-context": "^5.5.2",
    "react-test-renderer": "19.2.3",
    "typescript": "^5.8.3"
  },
  "engines": {
    "node": ">= 22.11.0"
  }
}
```

- [ ] **Step 2: 확인**

```bash
node -e "const p = require('./package.json'); console.log(p.name, p.publishConfig)"
```

Expected:
```
@codehong-dev/hongfield { registry: 'https://npm.pkg.github.com' }
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add GitHub Packages publishConfig and scoped package name"
```

---

### Task 2: Release 워크플로우 생성

**Files:**
- Create: `.github/workflows/publish-release.yml`

- [ ] **Step 1: `.github/workflows/` 디렉토리 생성 확인**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: `publish-release.yml` 작성**

```yaml
name: Publish hongfield(릴리즈 배포)

# 트리거 1: master 브랜치 머지 → package.json version 그대로 정식 배포
# 트리거 2: v* 태그 push (예: v1.0.0) → 태그 버전으로 정식 배포
on:
  push:
    branches:
      - master
    paths:
      - 'src/**'
    tags:
      - 'v*'

jobs:
  publish-release:
    runs-on: ubuntu-latest

    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://npm.pkg.github.com'
          scope: '@codehong-dev'

      # 태그 push면 태그에서 버전 파싱, 브랜치 push면 package.json version 사용
      - name: Resolve version
        id: version
        run: |
          if [[ "${GITHUB_REF}" == refs/tags/* ]]; then
            echo "VERSION=${GITHUB_REF_NAME#v}" >> $GITHUB_OUTPUT
            echo "SOURCE=tag" >> $GITHUB_OUTPUT
          else
            echo "VERSION=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT
            echo "SOURCE=package.json" >> $GITHUB_OUTPUT
          fi

      # 태그 push일 때만 package.json 버전 동기화
      - name: Sync package.json version (tag only)
        if: startsWith(github.ref, 'refs/tags/')
        run: npm version ${{ steps.version.outputs.VERSION }} --no-git-tag-version

      # latest dist-tag로 정식 배포
      - name: Publish release
        run: npm publish --tag latest
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Summary
        run: |
          echo "## Released" >> $GITHUB_STEP_SUMMARY
          echo "- **Version**: ${{ steps.version.outputs.VERSION }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Source**: ${{ steps.version.outputs.SOURCE }}" >> $GITHUB_STEP_SUMMARY
          echo "- **dist-tag**: latest" >> $GITHUB_STEP_SUMMARY
```

- [ ] **Step 3: YAML 문법 검증**

```bash
node -e "
const fs = require('fs');
const yaml = require('js-yaml');
try {
  yaml.load(fs.readFileSync('.github/workflows/publish-release.yml', 'utf8'));
  console.log('YAML valid');
} catch(e) { console.error(e.message); }
" 2>/dev/null || python3 -c "
import yaml, sys
with open('.github/workflows/publish-release.yml') as f:
    yaml.safe_load(f)
print('YAML valid')
"
```

Expected: `YAML valid`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/publish-release.yml
git commit -m "feat: add release publish workflow for GitHub Packages"
```

---

### Task 3: Snapshot 워크플로우 생성

**Files:**
- Create: `.github/workflows/publish-snapshot.yml`

- [ ] **Step 1: `publish-snapshot.yml` 작성**

```yaml
name: Publish hongfield(스냅샷 배포)

# 트리거 1: develop 브랜치 머지 → package.json version 기반 스냅샷 배포
# 트리거 2: feature/** 브랜치 머지 → package.json version 기반 스냅샷 배포
# 트리거 3: snap_v* 태그 push (예: snap_v1.0.0) → 태그 버전 기반 스냅샷 배포
# 버전 형식: {base}-SNAPSHOT.{YYYYMMDDHHMMSS}  예) 1.0.0-SNAPSHOT.20260429143000
on:
  push:
    branches:
      - develop
      - 'feature/**'
    paths:
      - 'src/**'
    tags:
      - 'snap_v*'

jobs:
  publish-snapshot:
    runs-on: ubuntu-latest

    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://npm.pkg.github.com'
          scope: '@codehong-dev'

      # 태그 push면 태그에서 base 버전 파싱, 브랜치 push면 package.json version 사용
      - name: Resolve base version
        id: base
        run: |
          if [[ "${GITHUB_REF}" == refs/tags/* ]]; then
            echo "BASE=${GITHUB_REF_NAME#snap_v}" >> $GITHUB_OUTPUT
            echo "SOURCE=tag" >> $GITHUB_OUTPUT
          else
            echo "BASE=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT
            echo "SOURCE=package.json" >> $GITHUB_OUTPUT
          fi

      # SNAPSHOT 버전 생성 (예: 1.0.0-SNAPSHOT.20260429143000)
      - name: Generate snapshot version
        id: snapshot
        run: |
          TIMESTAMP=$(date -u +"%Y%m%d%H%M%S")
          echo "VERSION=${{ steps.base.outputs.BASE }}-SNAPSHOT.${TIMESTAMP}" >> $GITHUB_OUTPUT

      # package.json에 스냅샷 버전 적용
      - name: Set snapshot version
        run: npm version ${{ steps.snapshot.outputs.VERSION }} --no-git-tag-version

      # snapshot dist-tag로 배포
      - name: Publish snapshot
        run: npm publish --tag snapshot
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Summary
        run: |
          echo "## Snapshot Published" >> $GITHUB_STEP_SUMMARY
          echo "- **Version**: ${{ steps.snapshot.outputs.VERSION }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Source**: ${{ steps.base.outputs.SOURCE }}" >> $GITHUB_STEP_SUMMARY
          echo "- **dist-tag**: snapshot" >> $GITHUB_STEP_SUMMARY
```

- [ ] **Step 2: YAML 문법 검증**

```bash
python3 -c "
import yaml
with open('.github/workflows/publish-snapshot.yml') as f:
    yaml.safe_load(f)
print('YAML valid')
"
```

Expected: `YAML valid`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish-snapshot.yml
git commit -m "feat: add snapshot publish workflow for GitHub Packages"
```

---

### Task 4: Manual 워크플로우 생성

**Files:**
- Create: `.github/workflows/publish-manual.yml`

- [ ] **Step 1: `publish-manual.yml` 작성**

```yaml
name: Publish hongfield(수동 배포)

# GitHub Actions 탭에서 직접 실행하는 수동 배포
on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Base version (e.g. 1.0.0)'
        required: true
        type: string
      publish_type:
        description: 'Publish type'
        required: true
        type: choice
        options:
          - release
          - snapshot
        default: snapshot

jobs:
  publish:
    runs-on: ubuntu-latest

    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://npm.pkg.github.com'
          scope: '@codehong-dev'

      # snapshot이면 타임스탬프 suffix 붙이기
      - name: Resolve final version
        id: final
        run: |
          if [ "${{ inputs.publish_type }}" = "snapshot" ]; then
            TIMESTAMP=$(date -u +"%Y%m%d%H%M%S")
            echo "VERSION=${{ inputs.version }}-SNAPSHOT.${TIMESTAMP}" >> $GITHUB_OUTPUT
            echo "TAG=snapshot" >> $GITHUB_OUTPUT
          else
            echo "VERSION=${{ inputs.version }}" >> $GITHUB_OUTPUT
            echo "TAG=latest" >> $GITHUB_OUTPUT
          fi

      - name: Set version
        run: npm version ${{ steps.final.outputs.VERSION }} --no-git-tag-version

      - name: Publish
        run: npm publish --tag ${{ steps.final.outputs.TAG }}
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Summary
        run: |
          echo "## Published" >> $GITHUB_STEP_SUMMARY
          echo "- **Type**: ${{ inputs.publish_type }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Version**: ${{ steps.final.outputs.VERSION }}" >> $GITHUB_STEP_SUMMARY
          echo "- **dist-tag**: ${{ steps.final.outputs.TAG }}" >> $GITHUB_STEP_SUMMARY
```

- [ ] **Step 2: YAML 문법 검증**

```bash
python3 -c "
import yaml
with open('.github/workflows/publish-manual.yml') as f:
    yaml.safe_load(f)
print('YAML valid')
"
```

Expected: `YAML valid`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish-manual.yml
git commit -m "feat: add manual publish workflow for GitHub Packages"
```

---

### Task 5: docs/rn-setup.md 설치 섹션 업데이트

**Files:**
- Modify: `docs/rn-setup.md`

- [ ] **Step 1: 섹션 1 (패키지 설치)을 아래 내용으로 교체**

`## 1. 패키지 설치` 섹션 전체를:

```markdown
## 1. 패키지 설치

### .npmrc 설정 (최초 1회)

프로젝트 루트에 `.npmrc` 파일을 생성한다:

```
@codehong-dev:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

`YOUR_GITHUB_TOKEN`은 GitHub → Settings → Developer settings → Personal access tokens에서 `read:packages` 권한으로 발급한다.

### 패키지 설치

```bash
# npm
npm install @codehong-dev/hongfield

# yarn
yarn add @codehong-dev/hongfield

# 또는 로컬 경로로 참조 (npm)
npm install /path/to/app-lib-bridge-react-native

# 또는 로컬 경로로 참조 (yarn)
yarn add /path/to/app-lib-bridge-react-native
```
```

으로 교체한다.

- [ ] **Step 2: `import from 'hongfield'` → `import from '@codehong-dev/hongfield'` 일괄 치환**

```bash
sed -i '' "s|from 'hongfield'|from '@codehong-dev/hongfield'|g" docs/rn-setup.md
```

- [ ] **Step 3: 확인**

```bash
grep "hongfield" docs/rn-setup.md
```

Expected: `@codehong-dev/hongfield` 형태만 존재, 스코프 없는 `'hongfield'` 없음

- [ ] **Step 4: Commit**

```bash
git add docs/rn-setup.md
git commit -m "docs: update install instructions for GitHub Packages scoped package"
```

---

## 검증 체크리스트

- [ ] `package.json` → `name`이 `@codehong-dev/hongfield`
- [ ] `package.json` → `publishConfig.registry`가 `https://npm.pkg.github.com`
- [ ] `.github/workflows/publish-release.yml` 존재, YAML valid
- [ ] `.github/workflows/publish-snapshot.yml` 존재, YAML valid
- [ ] `.github/workflows/publish-manual.yml` 존재, YAML valid
- [ ] `docs/rn-setup.md` → `.npmrc` 설정 섹션 포함
- [ ] GitHub 레포 push 후 Actions 탭에서 워크플로우 3개 확인
