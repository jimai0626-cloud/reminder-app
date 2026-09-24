"""
GitHub Actionsが数分おきに実行するスクリプト。
「今このルールは送るべきか」を判定し、該当するものだけpush通知を送る。

曜日の数字は 0=日曜, 1=月曜, ... 6=土曜（rules.jsonでもこの数字を使う）。

rotationGroup を使うと「2週間おきの当番」のような周期的な条件も表現できる:
  "rotationGroup": {
    "anchorDate": "2026-09-01",  # この日を周期0番目とする基準日
    "groupSize": 2,               # 周期の長さ（例: 2週間ローテーションなら2）
    "activeIndex": 0              # 何番目の周期で有効か
  }
"""

import json
import os
from datetime import date, datetime, timedelta, timezone

from pywebpush import WebPushException, webpush

JST = timezone(timedelta(hours=9))
BOT_DIR = os.path.dirname(os.path.abspath(__file__))
RULES_PATH = os.path.join(BOT_DIR, "rules.json")
LAST_RUN_PATH = os.path.join(BOT_DIR, "last-run.json")
PRIVATE_KEY_PATH = os.path.join(BOT_DIR, "vapid_private_key.pem")


def to_js_weekday(d: date) -> int:
    """Pythonのweekday()(月=0)を、rules.jsonで使う 日=0 の数え方に変換する。"""
    return (d.weekday() + 1) % 7


def is_reminder_active_today(rule: dict, now: datetime) -> bool:
    today = now.date()

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


def is_within_fire_window(rule: dict, now: datetime, window_minutes: int = 5) -> bool:
    hour, minute = (int(x) for x in rule["time"].split(":"))
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return abs((now - target).total_seconds()) <= window_minutes * 60


def get_due_reminders(rules: list, now: datetime, window_minutes: int = 5) -> list:
    return [
        rule
        for rule in rules
        if is_reminder_active_today(rule, now)
        and is_within_fire_window(rule, now, window_minutes)
    ]


def load_rules() -> list:
    with open(RULES_PATH, encoding="utf-8") as f:
        return json.load(f)


def write_private_key_file() -> str:
    """GitHub Secretsに入れたPEM文字列を、pywebpushが読めるファイルとして書き出す。"""
    pem = os.environ["VAPID_PRIVATE_KEY_PEM"]
    with open(PRIVATE_KEY_PATH, "w", encoding="utf-8") as f:
        f.write(pem)
    return PRIVATE_KEY_PATH


def send_reminder(subscription_info: dict, rule: dict, private_key_path: str) -> None:
    payload = json.dumps(
        {
            "title": rule["message"]["title"],
            "body": rule["message"]["body"],
            "tag": rule["id"],
        }
    )
    vapid_subject = os.environ.get("VAPID_SUBJECT", "mailto:example@example.com")

    webpush(
        subscription_info=subscription_info,
        data=payload,
        vapid_private_key=private_key_path,
        vapid_claims={"sub": vapid_subject},
    )


def main() -> None:
    subscription_raw = os.environ.get("PUSH_SUBSCRIPTION")
    now = datetime.now(JST)
    rules = load_rules()

    result = {
        "checked_at": now.isoformat(),
        "checked_rules": len(rules),
        "sent": 0,
        "failed": 0,
        "note": "",
    }

    if not subscription_raw:
        result["note"] = "PUSH_SUBSCRIPTION が未設定（まだ購読していない）"
        write_last_run(result)
        print(result["note"])
        return

    subscription_info = json.loads(subscription_raw)
    due = get_due_reminders(rules, now, window_minutes=5)
    private_key_path = write_private_key_file()

    for rule in due:
        try:
            send_reminder(subscription_info, rule, private_key_path)
            result["sent"] += 1
        except WebPushException as exc:
            result["failed"] += 1
            print(f"送信失敗: {rule.get('id')}: {exc}")

    write_last_run(result)
    print(json.dumps(result, ensure_ascii=False))


def write_last_run(result: dict) -> None:
    # 実行のたびにこのファイルを更新してリポジトリにコミットすることで、
    # GitHubの「60日間動きが無いと自動停止する」仕様に引っかからないようにしている。
    with open(LAST_RUN_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
