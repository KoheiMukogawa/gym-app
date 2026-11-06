import Capacitor

/// アプリの中に置いた部品（プラグイン）を登録する。SceneDelegate がこの画面を最初に出す。
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthPlugin())
    }
}
