import { useEffect, useState } from "react";
import {
  isRunningAsInstalledApp,
  subscribeToPush,
  getExistingSubscription,
} from "./lib/push-client.js";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export default function App() {
  const [installed, setInstalled] = useState(true);
  const [subscriptionJson, setSubscriptionJson] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setInstalled(isRunningAsInstalledApp());
    getExistingSubscription().then((sub) => {
      if (sub) setSubscriptionJson(JSON.stringify(sub.toJSON(), null, 2));
    });
  }, []);

  async function handleSubscribe() {
    setBusy(true);
    setStatus("");
    try {
      if (!VAPID_PUBLIC_KEY) {
        throw new Error(
          "VITE_VAPID_PUBLIC_KEY が設定されていません（Vercelの環境変数を確認してください）"
        );
      }
      const sub = await subscribeToPush(VAPID_PUBLIC_KEY);
      setSubscriptionJson(JSON.stringify(sub.toJSON(), null, 2));
      setStatus("通知を許可しました。下のコードをGitHub Secretsにコピーしてください。");
    } catch (err) {
      setStatus(`エラー: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(subscriptionJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatus("コピーに失敗しました。手動で選択してコピーしてください。");
    }
  }

  return (
    <div style={styles.wrap}>
      <h1 style={styles.title}>リマインドちゃん</h1>

      {!installed && (
        <div style={styles.notice}>
          iPhoneでは、まずSafariの共有ボタン→「ホーム画面に追加」でアプリ化してから、
          ホーム画面のアイコンから開き直してください。ブラウザのタブのままでは通知が届きません。
        </div>
      )}

      {installed && (
        <div style={styles.card}>
          <p style={styles.status}>
            通知の設定: {subscriptionJson ? "許可済み ✅" : "未設定"}
          </p>
          <button
            style={styles.button}
            onClick={handleSubscribe}
            disabled={busy}
          >
            {busy
              ? "設定中…"
              : subscriptionJson
              ? "もう一度、購読情報を作り直す"
              : "通知をオンにする"}
          </button>
          {status && <p style={styles.statusMsg}>{status}</p>}
        </div>
      )}

      {subscriptionJson && (
        <div style={styles.card}>
          <p style={styles.stepLabel}>
            ↓このコードをコピーして、GitHubの Secrets に
            <code style={styles.code}>PUSH_SUBSCRIPTION</code>
            という名前で貼り付けてください（README参照）。
          </p>
          <textarea
            style={styles.textarea}
            readOnly
            value={subscriptionJson}
            onFocus={(e) => e.target.select()}
          />
          <button style={styles.copyButton} onClick={handleCopy}>
            {copied ? "コピーしました ✅" : "コピーする"}
          </button>
        </div>
      )}

      <p style={styles.hint}>
        通知が来たらFitbitアプリの「通知」設定がオンになっていることを確認してください（自動でミラーリングされます）。
      </p>
    </div>
  );
}

const styles = {
  wrap: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif",
    padding: "24px 16px",
    maxWidth: 420,
    margin: "0 auto",
  },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 16 },
  notice: {
    background: "#FFF3CD",
    border: "1px solid #FFE69C",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    lineHeight: 1.6,
    marginBottom: 16,
  },
  card: {
    background: "#F5F5F7",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  status: { fontSize: 15, marginBottom: 12 },
  button: {
    width: "100%",
    padding: "12px 16px",
    fontSize: 16,
    fontWeight: 600,
    color: "#fff",
    background: "#4F46E5",
    border: "none",
    borderRadius: 10,
  },
  statusMsg: { marginTop: 10, fontSize: 13, color: "#555" },
  stepLabel: { fontSize: 13, lineHeight: 1.6, marginBottom: 8 },
  code: {
    background: "#e5e5ea",
    padding: "2px 6px",
    borderRadius: 4,
    margin: "0 4px",
    fontSize: 12,
  },
  textarea: {
    width: "100%",
    height: 110,
    fontSize: 11,
    fontFamily: "monospace",
    padding: 8,
    borderRadius: 8,
    border: "1px solid #ccc",
    boxSizing: "border-box",
    marginBottom: 8,
  },
  copyButton: {
    width: "100%",
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 600,
    color: "#4F46E5",
    background: "#fff",
    border: "1px solid #4F46E5",
    borderRadius: 10,
  },
  hint: { fontSize: 12, color: "#888", marginTop: 8, lineHeight: 1.6 },
};
