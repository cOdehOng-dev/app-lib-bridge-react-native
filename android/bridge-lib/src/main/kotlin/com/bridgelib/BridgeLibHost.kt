package com.bridgelib

import android.app.Application
import com.facebook.react.ReactHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

object BridgeLibHost {

    @Volatile
    private var reactHost: ReactHost? = null

    fun init(
        application: Application,
        bundleConfig: BundleConfig,
        packages: List<ReactPackage> = emptyList()
    ) {
        if (reactHost != null) return

        SoLoader.init(application, OpenSourceMergedSoMapping)

        val delegate = BridgeLibHostDelegate(bundleConfig, packages)
        reactHost = DefaultReactHost.getDefaultReactHost(
            context = application,
            reactHostDelegate = delegate
        )
    }

    fun getReactHost(): ReactHost = reactHost
        ?: throw IllegalStateException(
            "BridgeLibHost가 초기화되지 않았습니다. Application.onCreate()에서 BridgeLibHost.init()을 호출하세요."
        )
}
