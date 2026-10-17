import Foundation
import UserNotifications

enum Notify {
    static func ask() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    static func post(id: String, title: String, body: String, link: URL? = nil) {
        let c = UNMutableNotificationContent()
        c.title = title
        c.body = body
        if let link { c.userInfo = ["link": link.absoluteString] }
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: nil))
    }
}

// Opens the change-log entry when a notification is clicked.
final class NotificationOpener: NSObject, UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler done: @escaping () -> Void) {
        if let s = response.notification.request.content.userInfo["link"] as? String, let url = URL(string: s) {
            DispatchQueue.main.async { Links.open(url) }
        }
        done()
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
        done([.banner])
    }
}
