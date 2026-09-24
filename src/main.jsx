import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// service worker を登録（iOSはホーム画面追加後のスタンドアロン起動でのみpushが有効）
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
