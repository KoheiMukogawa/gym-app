import Capacitor
import UIKit

/// アプリの中に置いた部品（プラグイン）を登録する。
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthPlugin())
    }
}

/// アプリの外枠。SceneDelegate がこの画面を最初に出す。
/// Web表示を時計や電池の表示の下から置き、上端はアプリの背景と同じ色で埋める
/// （ホーム画面に追加したWeb版と同じ見え方。CapacitorのWeb表示は画面全体になる作りなので、外から位置を決める）。
/// 下端は画面の端まで使い、ホームインジケーターの分はWeb側（env(safe-area-inset-bottom)）が避ける。
class RootViewController: UIViewController {
    private let bridgeController = MainViewController()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 10 / 255, green: 10 / 255, blue: 11 / 255, alpha: 1)
        addChild(bridgeController)
        let content: UIView = bridgeController.view
        content.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(content)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            content.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            content.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        bridgeController.didMove(toParent: self)
    }

    // 背景が黒なので、時計などは白で出す
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}
