# GitHub Packages 배포 시스템 설계

## 목표

`@codehong-dev/hongfield` 패키지를 GitHub Packages에 자동 배포하는 CI/CD 시스템을 구축한다.
기존 `codehong-lib-react-native-widget` 레포의 3-workflow 구조를 그대로 따른다.

## 아키텍처

패키지는 레포 루트에 위치(`package.json` 루트)하며, 별도 `working-directory` 지정 없이 루트에서 `npm publish`를 실행한다.

## 변경 파일

| 파일 | 작업 |
|---|---|
| `package.json` | `name` → `@codehong-dev/hongfield`, `publishConfig` 추가 |
| `.github/workflows/publish-release.yml` | 신규 생성 |
| `.github/workflows/publish-snapshot.yml` | 신규 생성 |
| `.github/workflows/publish-manual.yml` | 신규 생성 |
| `docs/rn-setup.md` | 설치 방법 업데이트 (scoped 패키지명, `.npmrc`) |

## 워크플로우 상세

### 1. Release (`publish-release.yml`)

- **트리거 A**: `master` 브랜치 push + `src/**` 경로 변경
- **트리거 B**: `v*` 태그 push (예: `v1.0.0`)
- **동작**: `package.json` version 또는 태그에서 버전 파싱 → `npm publish --tag latest`
- **dist-tag**: `latest`

### 2. Snapshot (`publish-snapshot.yml`)

- **트리거 A**: `develop` 또는 `feature/**` 브랜치 push + `src/**` 경로 변경
- **트리거 B**: `snap_v*` 태그 push (예: `snap_v1.0.0`)
- **동작**: base 버전에 타임스탬프 suffix 추가 → `npm publish --tag snapshot`
- **버전 형식**: `1.0.0-SNAPSHOT.20260429143000`
- **dist-tag**: `snapshot`

### 3. Manual (`publish-manual.yml`)

- **트리거**: GitHub Actions 탭에서 수동 실행 (`workflow_dispatch`)
- **입력**: `version` (문자열), `publish_type` (`release` | `snapshot`)
- **동작**: publish_type에 따라 latest 또는 snapshot dist-tag로 배포

## package.json 변경

```json
{
  "name": "@codehong-dev/hongfield",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

## 소비자 설정 (.npmrc)

사용하는 프로젝트 루트에 `.npmrc` 추가:

```
@codehong-dev:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

이후 `package.json`에서:

```json
"@codehong-dev/hongfield": "^1.0.0"
```

## 공통 워크플로우 설정

- `runs-on`: `ubuntu-latest`
- `node-version`: `20`
- `registry-url`: `https://npm.pkg.github.com`
- `scope`: `@codehong-dev`
- `NODE_AUTH_TOKEN`: `${{ secrets.GITHUB_TOKEN }}`
- `permissions`: `contents: read`, `packages: write`
