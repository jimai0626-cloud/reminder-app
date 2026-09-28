// リマインちゃんの予定を GitHub に読み書きする窓口。
// Vercel の環境変数:
//   GITHUB_TOKEN  … reminder-app の Contents を読み書きできる合言葉
//   APP_PASSWORD  … 画面を開くときのパスワード（自分で決めたもの）

const OWNER = "jimai0626-cloud";
const REPO = "reminder-app";
const BRANCH = "main";
const SCHEDULE_PATH = "bot/schedule.json";
const RULES_PATH = "bot/rules.json";

const EMPTY = { sets: [], days: {}, extras: [] };

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "reminchan",
  };
}

async function readFile(path) {
  const r = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`,
    { headers: ghHeaders() }
  );
  if (r.status === 404) return { sha: null, text: null };
  if (!r.ok) throw new Error(`GitHubの読み込みに失敗しました (${r.status})`);
  const j = await r.json();
  return { sha: j.sha, text: Buffer.from(j.content, "base64").toString("utf8") };
}

async function writeFile(path, text, sha, message) {
  const body = {
    message,
    content: Buffer.from(text, "utf8").toString("base64"),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const r = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,
    { method: "PUT", headers: { ...ghHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!r.ok) throw new Error(`GitHubへの保存に失敗しました (${r.status})`);
}

function todayJST() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

// 画面の予定(schedule) → 送信スクリプトが読む rules.json に変換する
export function buildRules(schedule) {
  const from = todayJST();
  const rules = [];
  for (const set of schedule.sets) {
    const dates = Object.keys(schedule.days)
      .filter((d) => d >= from && (schedule.days[d] || []).includes(set.id))
      .sort();
    if (!dates.length) continue;
    set.items.forEach((item, i) => {
      if (!item.time || !item.title) return;
      rules.push({
        id: `set-${set.id}-${i}`,
        label: `${set.name} ${item.time}`,
        time: item.time,
        dates,
        message: { title: item.title, body: item.body || "" },
      });
    });
  }
  for (const ex of schedule.extras) {
    if (!ex.date || ex.date < from || !ex.time || !ex.title) continue;
    rules.push({
      id: `extra-${ex.id}`,
      label: `単発 ${ex.date} ${ex.time}`,
      time: ex.time,
      dates: [ex.date],
      message: { title: ex.title, body: ex.body || "" },
    });
  }
  return rules;
}

function isValidSchedule(s) {
  return s && Array.isArray(s.sets) && Array.isArray(s.extras) && typeof s.days === "object";
}

export default async function handler(req, res) {
  if (!process.env.GITHUB_TOKEN || !process.env.APP_PASSWORD) {
    return res.status(500).json({ error: "Vercelの環境変数 GITHUB_TOKEN と APP_PASSWORD を設定してください" });
  }
  if (req.headers["x-app-password"] !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: "パスワードが違います" });
  }
  try {
    if (req.method === "GET") {
      const { text } = await readFile(SCHEDULE_PATH);
      return res.status(200).json(text ? JSON.parse(text) : EMPTY);
    }
    if (req.method === "POST") {
      const schedule = req.body;
      if (!isValidSchedule(schedule)) return res.status(400).json({ error: "データの形が正しくありません" });
      const rules = buildRules(schedule);
      const cur = await readFile(SCHEDULE_PATH);
      await writeFile(SCHEDULE_PATH, JSON.stringify(schedule, null, 2) + "\n", cur.sha, "リマインちゃん: 予定を更新 [skip ci]");
      const curRules = await readFile(RULES_PATH);
      await writeFile(RULES_PATH, JSON.stringify(rules, null, 2) + "\n", curRules.sha, "リマインちゃん: 送信ルールを更新 [skip ci]");
      return res.status(200).json({ ok: true, rules: rules.length });
    }
    return res.status(405).json({ error: "使えない操作です" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
