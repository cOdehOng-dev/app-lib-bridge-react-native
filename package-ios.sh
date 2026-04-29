#!/bin/bash
set -e

# ============================================================
# iOS XCFramework 빌드 스크립트
# 소비앱 프로젝트 루트에서 실행하세요.
#
# 사용법:
#   ./node_modules/@codehong-dev/hongfield/package-ios.sh [옵션]
#
# 옵션:
#   --scheme        Xcode 스킴 이름       기본값: BridgeLib
#   --configuration 빌드 구성             기본값: Release
#   --output        출력 디렉터리 경로    기본값: output/ios
# ============================================================

SCHEME="BridgeLib"
CONFIGURATION="Release"
OUTPUT=""

# 인수 파싱
while [[ $# -gt 0 ]]; do
  case $1 in
    --scheme)         SCHEME="$2";         shift 2 ;;
    --configuration)  CONFIGURATION="$2";  shift 2 ;;
    --output)         OUTPUT="$2";         shift 2 ;;
    *)
      echo "알 수 없는 옵션: $1"
      exit 1
      ;;
  esac
done

echo ""
echo "=========================================="
echo " iOS 빌드 시작"
echo " Scheme        : $SCHEME"
echo " Configuration : $CONFIGURATION"
echo " Output        : ${OUTPUT:-output/ios}"
echo "=========================================="
echo ""

# XCFramework 빌드 (JS 번들 포함)
ARGS="--scheme $SCHEME --configuration $CONFIGURATION"
if [ -n "$OUTPUT" ]; then
  ARGS="$ARGS --output $OUTPUT"
fi

if ! npx hongfield package:ios $ARGS; then
  echo ""
  echo "[ERROR] XCFramework 빌드 실패"
  exit 1
fi

echo ""
echo "=========================================="
echo " 완료"
echo " XCFramework: ${OUTPUT:-output/ios}/${SCHEME}.xcframework"
echo "=========================================="
echo ""
