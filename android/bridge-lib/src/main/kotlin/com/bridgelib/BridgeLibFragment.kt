package com.bridgelib

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.facebook.react.ReactRootView

class BridgeLibFragment : Fragment() {

    private var reactRootView: ReactRootView? = null

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

        return ReactRootView(requireContext()).also { view ->
            reactRootView = view
            view.startReactApplication(
                BridgeLibHost.getReactHost(),
                moduleName,
                initialProps
            )
        }
    }

    override fun onDestroyView() {
        reactRootView?.unmountReactApplication()
        reactRootView = null
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
