package com.bridgelib

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.OnBackPressedCallback
import androidx.fragment.app.Fragment
import com.facebook.react.ReactDelegate
import com.facebook.react.modules.core.DefaultHardwareBackBtnHandler

class BridgeLibFragment : Fragment() {

    private var reactDelegate: ReactDelegate? = null
    private var backCallback: OnBackPressedCallback? = null

    var onPopRequested: (() -> Unit)? = null

    @Volatile private var backEnabled: Boolean = true

    fun setBackEnabled(enabled: Boolean) {
        backEnabled = enabled
        backCallback?.isEnabled = !enabled
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val moduleName = arguments?.getString(ARG_MODULE_NAME)
            ?: throw IllegalArgumentException(
                "BridgeLibFragment: 'bridge_lib_module_name' argument가 필요합니다."
            )
        val initialProps = arguments?.getBundle(ARG_INITIAL_PROPS)

        val delegate = ReactDelegate(
            requireActivity(),
            BridgeLibHost.getReactHost(),
            moduleName,
            initialProps
        )
        reactDelegate = delegate
        delegate.loadApp()

        backCallback = object : OnBackPressedCallback(false) {
            override fun handleOnBackPressed() {
                // backEnabled=false 일 때 활성화되어 뒤로가기를 삼킴 (RN 내부 스택 처리)
            }
        }
        requireActivity().onBackPressedDispatcher.addCallback(viewLifecycleOwner, backCallback!!)

        BridgeEventBus.setPopToNativeCallback { onPopRequested?.invoke() }

        return checkNotNull(delegate.reactRootView) {
            "ReactDelegate.reactRootView이 null입니다."
        }
    }

    override fun onResume() {
        super.onResume()
        if (activity is DefaultHardwareBackBtnHandler) {
            reactDelegate?.onHostResume()
        }
    }

    override fun onPause() {
        super.onPause()
        reactDelegate?.onHostPause()
    }

    override fun onDestroyView() {
        BridgeEventBus.setPopToNativeCallback(null)
        reactDelegate?.unloadApp()
        reactDelegate = null
        super.onDestroyView()
    }

    companion object {
        const val ARG_MODULE_NAME = "bridge_lib_module_name"
        const val ARG_INITIAL_PROPS = "bridge_lib_initial_props"

        fun newInstance(
            moduleName: String,
            initialProps: Bundle? = null
        ): BridgeLibFragment = BridgeLibFragment().apply {
            arguments = Bundle().apply {
                putString(ARG_MODULE_NAME, moduleName)
                initialProps?.let { putBundle(ARG_INITIAL_PROPS, it) }
            }
        }
    }
}
