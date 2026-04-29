#!/bin/bash
set -e

# ============================================================
# Android AAR 빌드 및 로컬 Maven 배포 스크립트
# 소비앱 프로젝트 루트에서 실행하세요.
#
# 사용법:
#   ./node_modules/@codehong-dev/hongfield/package-android.sh [옵션]
#
# 옵션:
#   --variant     빌드 variant (Debug | Release)  기본값: Release
#   --module-name 출력 파일명                      기본값: bridge-lib
#   --repo        Maven 저장소 경로                기본값: ~/.m2/repository
#   --skip-maven  Maven 배포 건너뜀
# ============================================================

VARIANT="Release"
MODULE_NAME="bridge-lib"
MAVEN_REPO=""
SKIP_MAVEN=false

# 인수 파싱
while [[ $# -gt 0 ]]; do
  case $1 in
    --variant)      VARIANT="$2";      shift 2 ;;
    --module-name)  MODULE_NAME="$2";  shift 2 ;;
    --repo)         MAVEN_REPO="$2";   shift 2 ;;
    --skip-maven)   SKIP_MAVEN=true;   shift ;;
    *)
      echo "알 수 없는 옵션: $1"
      exit 1
      ;;
  esac
done

echo ""
echo "=========================================="
echo " Android 빌드 시작"
echo " Variant    : $VARIANT"
echo " Module     : $MODULE_NAME"
echo " Skip Maven : $SKIP_MAVEN"
echo "=========================================="
echo ""

# 1. AAR 빌드 (JS 번들 포함)
if ! npx hongfield package:android --variant "$VARIANT" --module-name "$MODULE_NAME"; then
  echo ""
  echo "[ERROR] AAR 빌드 실패"
  exit 1
fi

# 2. 로컬 Maven 배포
if [ "$SKIP_MAVEN" = false ]; then
  echo ""
  echo "[INFO] 로컬 Maven 배포 중..."

  MAVEN_ARGS="--module-name $MODULE_NAME"
  if [ -n "$MAVEN_REPO" ]; then
    MAVEN_ARGS="$MAVEN_ARGS --repo $MAVEN_REPO"
  fi

  if ! npx hongfield publish:android $MAVEN_ARGS; then
    echo ""
    echo "[ERROR] Maven 배포 실패"
    exit 1
  fi
fi

echo ""
echo "=========================================="
echo " 완료"
echo " AAR: output/android/${MODULE_NAME}-$(echo $VARIANT | tr '[:upper:]' '[:lower:]').aar"
if [ "$SKIP_MAVEN" = false ]; then
  echo " Maven: ${MAVEN_REPO:-~/.m2/repository}"
fi
echo "=========================================="
echo ""
