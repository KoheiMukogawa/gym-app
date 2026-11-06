import Capacitor
import HealthKit

/// ヘルスケアの体重と体脂肪率を読むだけの部品（書き込みはしない）。
/// 日付ごとにまとめる処理はWeb側（src/features/body/nativeHealth.ts）で行い、ここはサンプルをそのまま返す。
@objc(HealthPlugin)
public class HealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthPlugin"
    public let jsName = "Health"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readBodyMetrics", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()
    private let bodyMass = HKQuantityType.quantityType(forIdentifier: .bodyMass)!
    private let bodyFat = HKQuantityType.quantityType(forIdentifier: .bodyFatPercentage)!

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    /// 読み取りの許可を求める。iOSは読み取りを許可されたかどうかを教えないので、結果は「たずねた」ことだけ。
    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("この端末ではヘルスケアを使えません", "UNAVAILABLE")
            return
        }
        store.requestAuthorization(toShare: nil, read: [bodyMass, bodyFat]) { _, error in
            if let error = error {
                call.reject(error.localizedDescription, "AUTHORIZATION_FAILED")
                return
            }
            call.resolve()
        }
    }

    /// startDate〜endDate（ミリ秒）のサンプル。体重はkg、体脂肪率は%（0.15ではなく15）。
    @objc func readBodyMetrics(_ call: CAPPluginCall) {
        guard let start = call.getDouble("startDate"), let end = call.getDouble("endDate") else {
            call.reject("期間を指定してください", "INVALID_RANGE")
            return
        }
        let predicate = HKQuery.predicateForSamples(
            withStart: Date(timeIntervalSince1970: start / 1000),
            end: Date(timeIntervalSince1970: end / 1000),
            options: []
        )
        // 2つの問い合わせを順に行い、結果の配列を同時に書き換えないようにする
        read(bodyMass, unit: .gramUnit(with: .kilo), scale: 1, predicate: predicate) { weights, error in
            if let error = error {
                call.reject(error.localizedDescription, "READ_FAILED")
                return
            }
            self.read(self.bodyFat, unit: .percent(), scale: 100, predicate: predicate) { fats, error in
                if let error = error {
                    call.reject(error.localizedDescription, "READ_FAILED")
                    return
                }
                call.resolve(["weights": weights, "fats": fats])
            }
        }
    }

    private func read(_ type: HKQuantityType, unit: HKUnit, scale: Double, predicate: NSPredicate,
                      completion: @escaping ([[String: Double]], Error?) -> Void) {
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
            if let error = error as? HKError, error.code == .errorNoData {
                completion([], nil)
                return
            }
            if let error = error {
                completion([], error)
                return
            }
            let rows = (samples as? [HKQuantitySample] ?? []).map { sample in
                ["time": sample.startDate.timeIntervalSince1970 * 1000, "value": sample.quantity.doubleValue(for: unit) * scale]
            }
            completion(rows, nil)
        }
        store.execute(query)
    }
}
