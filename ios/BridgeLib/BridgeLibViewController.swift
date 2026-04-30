import UIKit
import React
import React_RCTFabric

@objc public protocol RNEventListener: AnyObject {
    func onEvent(eventName: String, data: [String: Any])
}

@objc public class BridgeLibViewController: UIViewController {

    private let moduleName: String
    private let initialProps: [String: Any]?

    /// RN 화면이 popToNative()를 호출할 때 실행될 클로저.
    /// nil이면 아무 동작도 하지 않는다.
    @objc public var onPopRequested: (() -> Void)?

    /// RN에서 sendToNative로 발생하는 모든 이벤트를 수신하는 리스너.
    @objc public weak var eventListener: RNEventListener?

    /// - Parameters:
    ///   - moduleName: AppRegistry.registerComponent()에 등록된 컴포넌트 이름
    ///   - initialProps: RN 컴포넌트에 전달할 초기 props
    @objc public init(moduleName: String, initialProps: [String: Any]? = nil) {
        self.moduleName = moduleName
        self.initialProps = initialProps
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) 미지원. init(moduleName:initialProps:)를 사용하세요.")
    }

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        embedReactNativeView()
        BridgeEventEmitter.shared.setPopToNativeCallback { [weak self] in
            self?.onPopRequested?()
        }
        BridgeEventEmitter.shared.setGlobalEventListener { [weak self] name, data in
            self?.eventListener?.onEvent(eventName: name, data: data)
        }
    }

    public override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        BridgeEventEmitter.shared.setPopToNativeCallback(nil)
        BridgeEventEmitter.shared.setGlobalEventListener(nil)
    }

    private func embedReactNativeView() {
        guard let bridge = BridgeLibManager.shared.getFactory().bridge,
              let surfacePresenter = bridge.surfacePresenter else {
            assertionFailure("[BridgeLibViewController] surfacePresenter를 가져올 수 없습니다. BridgeLibManager.initialize()가 먼저 호출되었는지 확인하세요.")
            NSLog("[BridgeLibViewController] surfacePresenter를 가져올 수 없습니다. BridgeLibManager.initialize()가 먼저 호출되었는지 확인하세요.")
            return
        }

        let surface = RCTFabricSurface(
            surfacePresenter: surfacePresenter,
            moduleName: moduleName,
            initialProperties: initialProps ?? [:]
        )
        let hostingView = RCTSurfaceHostingView(
            surface: surface,
            sizeMeasureMode: [.widthExact, .heightExact]
        )
        hostingView.frame = view.bounds
        hostingView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(hostingView)
    }
}
