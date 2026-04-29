# @codehong-dev/hongfield

Android / iOS Native와 React Native 사이의 브리지 라이브러리입니다.

## Requirements

- React >= 19.0.0
- React Native >= 0.84.0
- react-native-safe-area-context >= 4.0.0

## Installation

이 패키지는 [GitHub Packages](https://github.com/cOdehOng-dev/app-lib-bridge-react-native/packages)에 배포되어 있습니다.

### 1. GitHub CLI 설치 및 로그인

[GitHub CLI](https://cli.github.com)가 없다면 먼저 설치합니다.

```bash
# macOS
brew install gh

# 로그인
gh auth login
```

### 2. .npmrc 설정

아래 명령어를 실행하면 레지스트리와 토큰이 글로벌에 자동 설정됩니다.

```bash
echo "@codehong-dev:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=$(gh auth token)" >> ~/.npmrc
```

### 3. 패키지 설치

```bash
npm install @codehong-dev/hongfield
# 또는
yarn add @codehong-dev/hongfield
```

## Usage

```ts
import { BridgeLib, sendToNative, useBridgeEvent } from '@codehong-dev/hongfield';
```
