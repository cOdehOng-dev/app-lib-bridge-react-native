import UIKit
import React

@objc public class BridgeLibViewController: UIViewController {

    private let moduleName: String
    private let initialProps: [String: Any]?

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
    }

    private func embedReactNativeView() {
        guard let bridge = BridgeLibManager.shared.getFactory().bridge else {
            assertionFailure("[BridgeLibViewController] RCTBridge를 가져올 수 없습니다. BridgeLibManager.initialize()가 먼저 호출되었는지 확인하세요.")
            NSLog("[BridgeLibViewController] RCTBridge를 가져올 수 없습니다. BridgeLibManager.initialize()가 먼저 호출되었는지 확인하세요.")
            return
        }

        let rootView = RCTRootView(
            bridge: bridge,
            moduleName: moduleName,
            initialProperties: initialProps
        )
        rootView.frame = view.bounds
        rootView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(rootView)
    }
}
