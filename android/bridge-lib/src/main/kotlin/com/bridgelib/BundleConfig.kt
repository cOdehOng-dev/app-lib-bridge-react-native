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
