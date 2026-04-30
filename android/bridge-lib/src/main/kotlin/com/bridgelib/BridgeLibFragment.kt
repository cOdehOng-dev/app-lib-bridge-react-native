package com.bridgelib

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.OnBackPressedCallback
import androidx.fragment.app.Fragment
import com.facebook.react.interfaces.fabric.ReactSurface
import com.facebook.react.modules.core.DefaultHardwareBackBtnHandler

class BridgeLibFragment : Fragment() {

    private var reactSurface: ReactSurface? = null
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

        val host = BridgeLibHost.getReactHost()
        val surface = host.createSurface(requireContext(), moduleName, initialProps)
        reactSurface = surface
        surface.start()

        backCallback = object : OnBackPressedCallback(false) {
            override fun handleOnBackPressed() {
                // backEnabled=false: 뒤로가기를 RN JS BackHandler에 위임. JS 스택 소진 시 아무 동작 없음.
                BridgeLibHost.getReactHost().onBackPressed()
            }
        }
        requireActivity().onBackPressedDispatcher.addCallback(viewLifecycleOwner, backCallback!!)

        BridgeEventBus.setPopToNativeCallback { onPopRequested?.invoke() }

        return checkNotNull(surface.view) { "ReactSurface.view가 null입니다." }
    }

    override fun onResume() {
        super.onResume()
        val activity = activity ?: return
        val backHandler = activity as? DefaultHardwareBackBtnHandler ?: return
        BridgeLibHost.getReactHost().onHostResume(activity, backHandler)
    }

    override fun onPause() {
        super.onPause()
        BridgeLibHost.getReactHost().onHostPause(activity)
    }

    override fun onDestroyView() {
        BridgeEventBus.setPopToNativeCallback(null)
        reactSurface?.stop()
        reactSurface = null
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
