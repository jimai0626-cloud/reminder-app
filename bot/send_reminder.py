"""
cron-job.org が数分おきに GitHub Actions を起動し、このスクリプトが実行される。
「今このルールは送るべきか」を判定し、該当するものだけ ntfy 経由でiPhoneに通知する。
(iPhoneの ntfy アプリが受け取り → Fitbit が転送して腕が震える)

ルールの条件は3種類あり、上から優先的に判定される:

1. dates（毎月バラバラなシフトなど、特定の日付だけ鳴らしたい場合）
   "dates": ["2026-10-03", "2026-10-07", "2026-10-15"]
   このリストに今日の日付が入っている日だけ有効。指定した場合、
   activeWeekdays / rotationGroup は無視される。

2. activeWeekdays（毎週決まった曜日に鳴らしたい場合）
   0=日曜, 1=月曜, ... 6=土曜
   "activeWeekdays": [1, 2, 3, 4, 5]

3. rotationGroup（2週間おきの当番のような、周期的な条件の場合）
   "rotationGroup": {
     "anchorDate": "2026-09-01",  # この日を周期0番目とする基準日
     "groupSize": 2,               # 周期の長さ（例: 2週間ローテーションなら2）
     "activeIndex": 0              # 何番目の周期で有効か
   }

何も指定しなければ「毎日」有効。

同じ通知が何度も鳴らないよう、送信済みの記録を bot/sent.json に残す。
"""

import json
import os
import urllib.request
from datetime import date, datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))
BOT_DIR = os.path.dirname(os.path.abspath(__file__))
RULES_PATH = os.path.join(BOT_DIR, "rules.json")
LAST_RUN_PATH = os.path.join(BOT_DIR, "last-run.json")
SENT_PATH = os.path.join(BOT_DIR, "sent.json")

NTFY_URL = "https://ntfy.sh"

# 指定時刻の何分前から何分後までを「送る対象」にするか。
# 起動役の実行が多少ずれても取りこぼさないよう、後ろ側を広めにとっている。
MINUTES_BEFORE = 2
MINUTES_AFTER = 10


def to_js_weekday(d: date) -> int:
    """Pythonのweekday()(月=0)を、rules.jsonで使う 日=0 の数え方に変換する。"""
    return (d.weekday() + 1) % 7


def is_reminder_active_today(rule: dict, now: datetime) -> bool:
    today = now.date()

    dates = rule.get("dates")
    if dates is not None:
        return today.isoformat() in dates

    active_weekdays = rule.get("activeWeekdays")
    if active_weekdays is not None and to_js_weekday(today) not in active_weekdays:
        return False

    rotation = rule.get("rotationGroup")
    if rotation:
        anchor = datetime.strptime(rotation["anchorDate"], "%Y-%m-%d").date()
        diff_days = (today - anchor).days
        cycle_index = diff_days % rotation["groupSize"]
        if cycle_index != rotation["activeIndex"]:
            return False

    return True


def is_within_fire_window(rule: dict, now: datetime) -> bool:
    hour, minute = (int(x) for x in rule["time"].split(":"))
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    delta = (now - target).total_seconds()
    return -MINUTES_BEFORE * 60 <= delta <= MINUTES_AFTER * 60


def get_due_reminders(rules: list, now: datetime) -> list:
    return [
        rule
        for rule in rules
        if is_reminder_active_today(rule, now) and is_within_fire_window(rule, now)
    ]


def sent_key(rule: dict, now: datetime) -> str:
    return f"{rule['id']}|{now.date().isoformat()}|{rule['time']}"


def load_rules() -> list:
    with open(RULES_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_sent(now: datetime) -> list:
    """送信済みの記録を読み込む。3日より古いものは捨てる。"""
    try:
        with open(SENT_PATH, encoding="utf-8") as f:
            keys = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []
    limit = (now.date() - timedelta(days=3)).isoformat()
    return [k for k in keys if k.split("|")[1] >= limit]


def save_sent(keys: list) -> None:
    with open(SENT_PATH, "w", encoding="utf-8") as f:
        json.dump(keys, f, ensure_ascii=False, indent=2)


def send_ntfy(topic: str, rule: dict) -> None:
    payload = json.dumps(
        {
            "topic": topic,
            "title": rule["message"]["title"],
            "message": rule["message"]["body"],
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        NTFY_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        response.read()


def write_last_run(result: dict) -> None:
    with open(LAST_RUN_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)


def main() -> None:
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    now = datetime.now(JST)
    rules = load_rules()
    sent = load_sent(now)

    result = {
        "checked_at": now.isoformat(),
        "checked_rules": len(rules),
        "sent": 0,
        "skipped_already_sent": 0,
        "failed": 0,
        "note": "",
    }

    if not topic:
        result["note"] = "NTFY_TOPIC が未設定です（GitHubのSecretsを確認してください）"
        write_last_run(result)
        print(json.dumps(result, ensure_ascii=False))
        return

    for rule in get_due_reminders(rules, now):
        key = sent_key(rule, now)
        if key in sent:
            result["skipped_already_sent"] += 1
            continue
        try:
            send_ntfy(topic, rule)
            sent.append(key)
            result["sent"] += 1
        except Exception as exc:  # 送信に失敗しても、他のルールの処理は続ける
            result["failed"] += 1
            print(f"送信失敗: {rule.get('id')}: {exc}")

    save_sent(sent)
    write_last_run(result)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
