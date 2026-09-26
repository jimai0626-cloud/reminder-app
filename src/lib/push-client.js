// iOSでpushが使えるのは「ホーム画面に追加してから起動した」スタンドアロン表示のときだけ。
// ブラウザのタブで開いているだけでは Notification.requestPermission() が機能しないため、
// 先にこの判定でユーザーに案内を出す。
export function isRunningAsInstalledApp() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  // iOS以外（Android/デスクトップ）はタブのままでも動く場合があるため true 扱い
  return !isIOS || isStandalone;
}

function urlBase64ToUint8Array(base64String) {
  // コピペ時に紛れ込みがちな改行・空白・全角文字などを先に取り除く。
  // base64url で使われる文字（英数字・- ・ _）だけを残す。
  const cleaned = base64String.trim().replace(/[^A-Za-z0-9\-_]/g, "");
  const padding = "=".repeat((4 - (cleaned.length % 4)) % 4);
  const base64 = (cleaned + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// 通知許可をリクエストし、push購読情報を作る。
// このアプリには専用サーバーが無いので、購読情報はどこにも自動送信しない。
// 呼び出し側（App.jsx）が画面に表示し、ユーザー自身がGitHub Secretsへ貼り付ける。
// iOS Safariの制約上、ユーザーのタップ（クリックハンドラ）の中から直接呼び出すこと。
export async function subscribeToPush(vapidPublicKey) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("このブラウザはpush通知に対応していません");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("通知が許可されませんでした");
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  return subscription;
}

export async function getExistingSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}
