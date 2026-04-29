package com.bridgelib

/**
 * @param assetPath assets에 포함된 번들 파일명. 기본값: "index.android.bundle"
 * @param localBundlePath OTA로 다운로드된 번들의 로컬 파일 경로. null이면 assetPath 사용
 * @param isDebug 디버그 여부. 기본값: ApplicationInfo 플래그에서 자동 감지
 */
data class BundleConfig(
    val assetPath: String = "index.android.bundle",
    val localBundlePath: String? = null,
    val isDebug: Boolean? = null
)
