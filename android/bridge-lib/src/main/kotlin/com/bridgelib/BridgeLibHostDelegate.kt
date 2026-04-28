package com.bridgelib

import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHostDelegate

class BridgeLibHostDelegate(
    private val bundleConfig: BundleConfig,
    packages: List<ReactPackage>
) : DefaultReactHostDelegate(
    jsMainModulePath = "index",
    reactPackages = packages + listOf(BridgeLibPackage())
) {
    override val jsBundleAssetPath: String
        get() = bundleConfig.assetPath
}
