import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// 以前の通知用の仕組み(サービスワーカー)が残っていたら外す
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
}

createRoot(document.getElementById("root")).render(<App />);
