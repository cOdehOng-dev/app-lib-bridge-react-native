package com.bridgelib

import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHostDelegate

class BridgeLibHostDelegate(
    private val bundleConfig: BundleConfig,
    packages: List<ReactPackage>,
    jsMainModulePath: String = "index"
) : DefaultReactHostDelegate(
    jsMainModulePath = jsMainModulePath,
    reactPackages = packages + listOf(BridgeLibPackage())
) {
    // localBundlePath: OTA 다운로드 번들. null이면 assetPath 사용
    // Debug 모드의 Metro 연결은 DefaultReactHostDelegate가 내부적으로 처리
    override val jsBundleAssetPath: String
        get() = bundleConfig.localBundlePath ?: bundleConfig.assetPath
}
