import { useEffect, useMemo, useState } from "react";

// ── 色とシールの種類 ─────────────────────────────
const STICKER_COLORS = ["#F28BA8", "#7FC8B4", "#F2C94C", "#B7A3E3", "#86BDEB", "#F5A97F"];
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const LIMIT = 200; // LINE無料プランの月の上限

const uid = () => Math.random().toString(36).slice(2, 8);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
function todayStr() {
  const d = new Date();
  return ymd(d.getFullYear(), d.getMonth(), d.getDate());
}
function prettyDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  const w = WEEK[new Date(y, m - 1, d).getDay()];
  return `${m}月${d}日（${w}）`;
}

// ── 保存先とのやりとり ─────────────────────────
async function api(method, password, body) {
  const r = await fetch("/api/schedule", {
    method,
    headers: { "Content-Type": "application/json", "x-app-password": password },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `エラー (${r.status})`), { status: r.status });
  return j;
}

function loadPassword() {
  try { return localStorage.getItem("reminchan-pw") || ""; } catch { return ""; }
}
function savePassword(pw) {
  try { localStorage.setItem("reminchan-pw", pw); } catch {}
}

// ── 画面本体 ─────────────────────────────────
export default function App() {
  const [password, setPassword] = useState(loadPassword());
  const [schedule, setSchedule] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(pw) {
    setLoading(true);
    setLoginError("");
    try {
      const data = await api("GET", pw);
      savePassword(pw);
      setPassword(pw);
      setSchedule(data);
    } catch (e) {
      setLoginError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (password) login(password);
  }, []); // eslint-disable-line

  return (
    <>
      <style>{CSS}</style>
      {schedule ? (
        <Editor initial={schedule} password={password} />
      ) : (
        <Login onLogin={login} error={loginError} loading={loading} />
      )}
    </>
  );
}

function Login({ onLogin, error, loading }) {
  const [pw, setPw] = useState("");
  return (
    <main className="login">
      <img className="login-icon" src="/icon-192.png" alt="" />
      <h1 className="brand">リマインちゃん</h1>
      <p className="login-lead">パスワードを入れて開きます</p>
      <input
        className="field"
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && pw && onLogin(pw)}
        placeholder="パスワード"
        autoFocus
      />
      <button className="btn primary" disabled={!pw || loading} onClick={() => onLogin(pw)}>
        {loading ? "開いています…" : "開く"}
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  );
}

function Editor({ initial, password }) {
  const [data, setData] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState("cal");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [activeSticker, setActiveSticker] = useState(null);
  const [sheetDate, setSheetDate] = useState(null);

  function update(fn) {
    setData((d) => {
      const next = structuredClone(d);
      fn(next);
      return next;
    });
    setDirty(true);
    setStatus("");
  }

  const setById = useMemo(() => Object.fromEntries(data.sets.map((s) => [s.id, s])), [data.sets]);

  // 表示中の月に送る通数（上限200通の目安）
  const monthCount = useMemo(() => {
    const prefix = `${cursor.y}-${pad(cursor.m + 1)}`;
    let n = 0;
    for (const [date, ids] of Object.entries(data.days)) {
      if (!date.startsWith(prefix)) continue;
      for (const id of ids) n += setById[id]?.items.length || 0;
    }
    n += data.extras.filter((e) => e.date?.startsWith(prefix)).length;
    return n;
  }, [data, cursor, setById]);

  function toggleSticker(date, setId) {
    update((d) => {
      const list = d.days[date] || [];
      d.days[date] = list.includes(setId) ? list.filter((x) => x !== setId) : [...list, setId];
      if (!d.days[date].length) delete d.days[date];
    });
  }

  function onDayTap(date) {
    if (activeSticker) toggleSticker(date, activeSticker);
    else setSheetDate(date);
  }

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      const r = await api("POST", password, data);
      setDirty(false);
      setStatus(`保存しました（送信ルール ${r.rules}件）`);
    } catch (e) {
      setStatus(`保存できませんでした：${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  function moveMonth(delta) {
    setCursor(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  return (
    <div className="app">
      <header className="top">
        <img className="top-icon" src="/icon-192.png" alt="" />
        <span className="brand small">リマインちゃん</span>
        <nav className="tabs">
          <button className={tab === "cal" ? "on" : ""} onClick={() => setTab("cal")}>カレンダー</button>
          <button className={tab === "sets" ? "on" : ""} onClick={() => setTab("sets")}>シール</button>
        </nav>
      </header>

      {tab === "cal" ? (
        <section className="cal">
          <div className="month">
            <button className="round" onClick={() => moveMonth(-1)} aria-label="前の月">‹</button>
            <h2>{cursor.y}年 {cursor.m + 1}月</h2>
            <button className="round" onClick={() => moveMonth(1)} aria-label="次の月">›</button>
          </div>
          <Calendar
            y={cursor.y}
            m={cursor.m}
            data={data}
            setById={setById}
            onTap={onDayTap}
          />
          <div className={`count ${monthCount > LIMIT ? "over" : ""}`}>
            この月に送るLINE：{monthCount}通 / {LIMIT}通
          </div>

          <div className="tray">
            {data.sets.length === 0 ? (
              <p className="hint">まず「シール」タブで、シフトの種類ごとにシールを作ります</p>
            ) : (
              <>
                <p className="hint">
                  {activeSticker
                    ? "日付をタップして貼る・はがす。終わったらもう一度シールを押します"
                    : "シールを選ぶと、日付をタップして貼れます"}
                </p>
                <div className="stickers">
                  {data.sets.map((s) => (
                    <button
                      key={s.id}
                      className={`sticker ${activeSticker === s.id ? "picked" : ""}`}
                      style={{ "--c": s.color }}
                      onClick={() => setActiveSticker(activeSticker === s.id ? null : s.id)}
                    >
                      {s.name || "名前なし"}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      ) : (
        <SetsEditor data={data} update={update} />
      )}

      <footer className="savebar">
        <span className="status">{status || (dirty ? "まだ保存していない変更があります" : "")}</span>
        <button className="btn primary" disabled={!dirty || saving} onClick={save}>
          {saving ? "保存しています…" : "保存する"}
        </button>
      </footer>

      {sheetDate && (
        <DaySheet
          date={sheetDate}
          data={data}
          update={update}
          toggleSticker={toggleSticker}
          onClose={() => setSheetDate(null)}
        />
      )}
    </div>
  );
}

function Calendar({ y, m, data, setById, onTap }) {
  const first = new Date(y, m, 1).getDay();
  const last = new Date(y, m + 1, 0).getDate();
  const today = todayStr();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= last; d++) cells.push(d);

  return (
    <div className="grid">
      {WEEK.map((w, i) => (
        <div key={w} className={`wk ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}>{w}</div>
      ))}
      {cells.map((d, i) => {
        if (!d) return <div key={`e${i}`} />;
        const date = ymd(y, m, d);
        const ids = data.days[date] || [];
        const extras = data.extras.filter((e) => e.date === date).length;
        return (
          <button
            key={date}
            className={`day ${date === today ? "today" : ""} ${date < today ? "past" : ""}`}
            onClick={() => onTap(date)}
          >
            <span className="num">{d}</span>
            <span className="dots">
              {ids.map((id) =>
                setById[id] ? (
                  <span key={id} className="dot" style={{ background: setById[id].color }}>
                    {(setById[id].name || "?").slice(0, 1)}
                  </span>
                ) : null
              )}
              {extras > 0 && <span className="dot extra">＋{extras}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DaySheet({ date, data, update, toggleSticker, onClose }) {
  const ids = data.days[date] || [];
  const extras = data.extras.filter((e) => e.date === date);
  const [draft, setDraft] = useState({ time: "", title: "", body: "" });

  function addExtra() {
    update((d) => d.extras.push({ id: uid(), date, ...draft }));
    setDraft({ time: "", title: "", body: "" });
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{prettyDate(date)}</h3>
          <button className="round" onClick={onClose} aria-label="閉じる">×</button>
        </div>

        <h4>この日のシール</h4>
        {data.sets.length === 0 && <p className="hint">シールはまだありません</p>}
        <div className="stickers">
          {data.sets.map((s) => (
            <button
              key={s.id}
              className={`sticker ${ids.includes(s.id) ? "picked" : "off"}`}
              style={{ "--c": s.color }}
              onClick={() => toggleSticker(date, s.id)}
            >
              {s.name || "名前なし"}
            </button>
          ))}
        </div>

        <h4>この日だけのメッセージ</h4>
        {extras.map((ex) => (
          <div key={ex.id} className="row-item">
            <span className="time">{ex.time}</span>
            <span className="msg">{ex.title}{ex.body && <small>{ex.body}</small>}</span>
            <button
              className="link danger"
              onClick={() => update((d) => { d.extras = d.extras.filter((e) => e.id !== ex.id); })}
            >
              消す
            </button>
          </div>
        ))}
        <div className="add">
          <input className="field time-in" type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
          <input className="field" placeholder="メッセージ（例：書類を持っていく）" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <input className="field" placeholder="ひとこと（なくてもOK）" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          <button className="btn" disabled={!draft.time || !draft.title} onClick={addExtra}>この日に追加する</button>
        </div>
      </div>
    </div>
  );
}

function SetsEditor({ data, update }) {
  function addSet() {
    update((d) =>
      d.sets.push({
        id: uid(),
        name: "",
        color: STICKER_COLORS[d.sets.length % STICKER_COLORS.length],
        items: [{ time: "", title: "", body: "" }],
      })
    );
  }
  function removeSet(id) {
    if (!confirm("このシールを消しますか？ カレンダーに貼った分もはがれます")) return;
    update((d) => {
      d.sets = d.sets.filter((s) => s.id !== id);
      for (const k of Object.keys(d.days)) {
        d.days[k] = d.days[k].filter((x) => x !== id);
        if (!d.days[k].length) delete d.days[k];
      }
    });
  }

  return (
    <section className="sets">
      <p className="hint">シール1枚＝その日に送るメッセージのまとまりです。「早番」「遅番」のように作ります。</p>
      {data.sets.map((s, si) => (
        <article key={s.id} className="set" style={{ "--c": s.color }}>
          <div className="set-head">
            <input
              className="field name"
              placeholder="シールの名前（例：早番）"
              value={s.name}
              onChange={(e) => update((d) => { d.sets[si].name = e.target.value; })}
            />
            <div className="swatches">
              {STICKER_COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${s.color === c ? "on" : ""}`}
                  style={{ background: c }}
                  aria-label="色を選ぶ"
                  onClick={() => update((d) => { d.sets[si].color = c; })}
                />
              ))}
            </div>
          </div>
          {s.items.map((it, ii) => (
            <div key={ii} className="item">
              <input
                className="field time-in"
                type="time"
                value={it.time}
                onChange={(e) => update((d) => { d.sets[si].items[ii].time = e.target.value; })}
              />
              <input
                className="field"
                placeholder="メッセージ（例：早番です。8:30出勤）"
                value={it.title}
                onChange={(e) => update((d) => { d.sets[si].items[ii].title = e.target.value; })}
              />
              <input
                className="field"
                placeholder="ひとこと（なくてもOK）"
                value={it.body}
                onChange={(e) => update((d) => { d.sets[si].items[ii].body = e.target.value; })}
              />
              <button
                className="link danger"
                onClick={() => update((d) => { d.sets[si].items.splice(ii, 1); })}
              >
                この時刻を消す
              </button>
            </div>
          ))}
          <div className="set-foot">
            <button className="link" onClick={() => update((d) => { d.sets[si].items.push({ time: "", title: "", body: "" }); })}>
              ＋ 時刻を足す
            </button>
            <button className="link danger" onClick={() => removeSet(s.id)}>シールを消す</button>
          </div>
        </article>
      ))}
      <button className="btn wide" onClick={addSet}>＋ 新しいシールを作る</button>
    </section>
  );
}

// ── 見た目 ───────────────────────────────────
const CSS = `
:root {
  --paper: #FFF6F1;
  --card: #FFFFFF;
  --ink: #45343F;
  --soft: #8C7682;
  --line: #EBD9D5;
  --rose: #E4668C;
  --danger: #C4435A;
  box-sizing: border-box;
  padding-top: env(safe-area-inset-top, 0px);
}
*, *::before, *::after { box-sizing: inherit; }
html, body { margin: 0; background: var(--paper); color: var(--ink); }
body { font-family: "Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Hiragino Sans", sans-serif; font-weight: 500; -webkit-text-size-adjust: 100%; }
button, input { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 3px solid var(--rose); outline-offset: 2px; }

.brand { font-weight: 900; letter-spacing: .02em; font-size: 28px; margin: 0; }
.brand.small { font-size: 18px; }
.hint { color: var(--soft); font-size: 13px; line-height: 1.6; margin: 8px 0; }
.error { color: var(--danger); font-size: 14px; }

.login { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px; }
.login-icon { width: 112px; height: 112px; border-radius: 28px; }
.login-lead { color: var(--soft); margin: 0; }
.login .field { max-width: 280px; text-align: center; }

.app { max-width: 560px; overflow-x: hidden; margin: 0 auto; padding: 0 14px calc(96px + env(safe-area-inset-bottom, 0px)); }
.top { display: flex; align-items: center; gap: 8px; padding: 12px 0; }
.top-icon { width: 34px; height: 34px; border-radius: 10px; }
.tabs { margin-left: auto; display: flex; background: #F6E6E1; border-radius: 999px; padding: 3px; }
.tabs button { border: 0; background: none; padding: 7px 14px; border-radius: 999px; font-size: 14px; font-weight: 700; color: var(--soft); }
.tabs button.on { background: var(--card); color: var(--ink); box-shadow: 0 1px 0 var(--line); }

.month { display: flex; align-items: center; justify-content: space-between; margin: 6px 0 10px; }
.month h2 { font-size: 22px; font-weight: 900; margin: 0; }
.round { width: 38px; height: 38px; border-radius: 50%; border: 1.5px solid var(--line); background: var(--card); font-size: 20px; line-height: 1; }

.grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.wk { text-align: center; font-size: 12px; color: var(--soft); padding-bottom: 2px; }
.wk.sun { color: #D06A7F; } .wk.sat { color: #5E8FC4; }
.day { position: relative; min-width: 0; min-height: 66px; overflow: hidden; border: 0; border-radius: 12px; background: var(--card); padding: 4px 3px; display: flex; flex-direction: column; align-items: center; gap: 2px; box-shadow: inset 0 0 0 1px var(--line); }
.day.today { box-shadow: inset 0 0 0 2.5px var(--rose); }
.day.past { opacity: .45; }
.num { font-size: 13px; font-weight: 700; }
.dots { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px; }
.dot { min-width: 20px; height: 20px; padding: 0 3px; border-radius: 999px; font-size: 11px; font-weight: 900; color: #fff; display: inline-flex; align-items: center; justify-content: center; text-shadow: 0 1px 0 rgba(0,0,0,.12); }
.dot.extra { background: var(--ink); font-size: 10px; }

.count { text-align: right; font-size: 12px; color: var(--soft); margin-top: 8px; }
.count.over { color: var(--danger); font-weight: 700; }

.tray { margin-top: 10px; }
.stickers { display: flex; flex-wrap: wrap; gap: 8px; }
.sticker { border: 0; background: var(--c); color: #fff; font-weight: 900; font-size: 15px; padding: 9px 16px; border-radius: 999px; text-shadow: 0 1px 0 rgba(0,0,0,.15); box-shadow: 0 3px 0 color-mix(in srgb, var(--c) 70%, #000); transition: transform .12s; }
.sticker.picked { transform: translateY(-3px) rotate(-3deg); outline: 3px solid var(--ink); outline-offset: 2px; }
.sticker.off { background: var(--card); color: var(--soft); text-shadow: none; box-shadow: inset 0 0 0 2px var(--c); }
.sheet .sticker.picked { transform: none; outline: none; }

.field { width: 100%; padding: 11px 12px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--card); font-size: 16px; }
.time-in { width: 120px; flex: none; }
.btn { border: 0; border-radius: 999px; padding: 12px 20px; font-weight: 900; background: #F6E6E1; }
.btn.primary { background: var(--rose); color: #fff; }
.btn:disabled { opacity: .45; cursor: default; }
.btn.wide { width: 100%; margin-top: 12px; }
.link { border: 0; background: none; padding: 6px 0; font-size: 14px; font-weight: 700; color: var(--rose); }
.link.danger { color: var(--danger); }

.savebar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 10px; justify-content: flex-end; padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px)); background: rgba(255,246,241,.94); border-top: 1px solid var(--line); backdrop-filter: blur(6px); }
.status { font-size: 13px; color: var(--soft); flex: 1; }

.backdrop { position: fixed; inset: 0; background: rgba(69,52,63,.35); display: flex; align-items: flex-end; justify-content: center; z-index: 10; }
.sheet { width: 100%; max-width: 560px; max-height: 85vh; overflow-y: auto; background: var(--paper); border-radius: 24px 24px 0 0; padding: 16px 16px calc(24px + env(safe-area-inset-bottom, 0px)); }
.sheet-head { display: flex; justify-content: space-between; align-items: center; }
.sheet h3 { font-size: 20px; font-weight: 900; margin: 0; }
.sheet h4 { font-size: 14px; margin: 18px 0 8px; }
.row-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--line); }
.row-item .time { font-weight: 900; }
.row-item .msg { flex: 1; display: flex; flex-direction: column; }
.row-item small { color: var(--soft); }
.add { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }

.set { background: var(--card); border-radius: 20px; padding: 14px; margin: 12px 0; box-shadow: inset 6px 0 0 var(--c), inset 0 0 0 1px var(--line); }
.set-head { display: flex; flex-direction: column; gap: 8px; }
.name { font-weight: 900; font-size: 18px; }
.swatches { display: flex; gap: 8px; }
.swatch { width: 28px; height: 28px; border-radius: 50%; border: 0; }
.swatch.on { outline: 3px solid var(--ink); outline-offset: 2px; }
.item { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; border-bottom: 1px dashed var(--line); }
.set-foot { display: flex; justify-content: space-between; margin-top: 6px; }

@media (max-width: 440px) {
  .grid { gap: 3px; }
  .day { min-height: 58px; border-radius: 10px; padding: 3px 1px; }
  .dot { min-width: 16px; height: 16px; padding: 0 2px; font-size: 10px; }
  .brand.small { font-size: 16px; }
  .tabs button { padding: 6px 11px; font-size: 13px; }
}
@media (prefers-reduced-motion: reduce) { .sticker { transition: none; } }
`;
