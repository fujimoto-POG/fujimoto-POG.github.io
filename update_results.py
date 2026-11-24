#!/usr/bin/env python3
import json
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path
import urllib.request
import urllib.error

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Referer': 'https://race.netkeiba.com/',
}

VENUE_MAP = {
    '01': '札幌', '02': '函館', '03': '福島', '04': '新潟',
    '05': '東京', '06': '中山', '07': '中京', '08': '京都',
    '09': '阪神', '10': '小倉',
}

def fetch(url, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                try:
                    return raw.decode('utf-8')
                except UnicodeDecodeError:
                    return raw.decode('euc-jp', errors='replace')
        except urllib.error.HTTPError as e:
            print(f"HTTP {e.code}: {url}", file=sys.stderr)
            if e.code == 404:
                return None
            if i < retries - 1:
                time.sleep(2 ** i)
        except Exception as e:
            print(f"Error: {url}: {e}", file=sys.stderr)
            if i < retries - 1:
                time.sleep(2 ** i)
    return None

def clean_html(s):
    text = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', text).strip()

def get_pog_horses(seed_js_path):
    content = Path(seed_js_path).read_text(encoding='utf-8')
    match = re.search(r'window\.POG_SEED\s*=\s*(\[.*?\]);', content, re.DOTALL)
    if not match:
        raise ValueError("seed.js に POG_SEED が見つかりません")
    horses = json.loads(match.group(1))
    return {h['name']: h for h in horses}

def get_race_ids_for_date(date_str):
    url = f"https://race.netkeiba.com/top/race_list.html?kaisai_date={date_str}"
    html = fetch(url)
    if not html:
        return []
    race_ids = re.findall(r'race_id=(\d{12})', html)
    return list(dict.fromkeys(race_ids))

def get_race_results(race_id):
    url = f"https://db.netkeiba.com/race/{race_id}/"
    html = fetch(url)
    if not html:
        return None, []

    race_name_match = re.search(r'<h1[^>]*class="[^"]*RaceName[^"]*"[^>]*>([^<]+)</h1>', html)
    if not race_name_match:
        race_name_match = re.search(r'<h1[^>]*>([^<]+)</h1>', html)
    race_name = clean_html(race_name_match.group(1)) if race_name_match else ''

    table_match = re.search(
        r'<table[^>]*class="[^"]*race_table_01[^"]*"[^>]*>(.*?)</table>',
        html, re.DOTALL
    )
    if not table_match:
        return race_name, []

    table_html = table_match.group(1)
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_html, re.DOTALL)

    results = []
    for row in rows[1:]:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
        if len(cells) < 25:
            continue
        place_text = clean_html(cells[0])
        if not place_text.isdigit():
            continue
        place = int(place_text)
        horse_name = clean_html(cells[3])
        if not horse_name:
            continue
        try:
            popularity = int(clean_html(cells[17]))
        except (ValueError, IndexError):
            popularity = 0
        try:
            prize_text = clean_html(cells[24]).replace(',', '')
            prize_yen = int(float(prize_text) * 10000) if prize_text else 0
        except (ValueError, IndexError):
            prize_yen = 0
        results.append({'place': place, 'name': horse_name, 'popularity': popularity, 'prize': prize_yen})

    return race_name, results

def venue_name(race_id):
    return VENUE_MAP.get(race_id[4:6], race_id[4:6])

def result_key(horse_name, date_str, race_id):
    formatted_date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
    return f"{horse_name}|{formatted_date}|{venue_name(race_id)}|{int(race_id[10:12])}"

def main():
    base_dir = Path(__file__).parent.parent
    seed_js_path = base_dir / 'seed.js'
    pog_data_path = base_dir / 'pog-data.json'

    pog_horses = get_pog_horses(seed_js_path)
    print(f"POG馬数: {len(pog_horses)}頭")

    with open(pog_data_path, encoding='utf-8') as f:
        pog_data = json.load(f)

    covered_through = pog_data.get('coveredThrough', '')
    if covered_through:
        start_date = date.fromisoformat(covered_through) + timedelta(days=1)
    else:
        start_date = date.today() - timedelta(days=7)

    end_date = date.today()

    if start_date > end_date:
        print("すでに最新の状態です")
        return

    print(f"対象期間: {start_date} ～ {end_date}")

    existing_keys = {r.get('key', '') for r in pog_data.get('results', [])}
    new_results = []

    current = start_date
    while current <= end_date:
        date_str = current.strftime('%Y%m%d')
        race_ids = get_race_ids_for_date(date_str)
        if race_ids:
            print(f"{date_str}: {len(race_ids)}レース")

        for race_id in race_ids:
            race_name, results = get_race_results(race_id)
            if not results:
                time.sleep(0.5)
                continue

            formatted_date = current.strftime('%Y-%m-%d')
            venue = venue_name(race_id)
            race_num = int(race_id[10:12])
            full_race_name = f"{venue}{race_num}R {race_name}" if race_name else f"{venue}{race_num}R"

            for result in results:
                if result['name'] not in pog_horses:
                    continue
                key = result_key(result['name'], date_str, race_id)
                if key in existing_keys:
                    continue
                entry = {
                    'name': result['name'],
                    'date': formatted_date,
                    'race': full_race_name,
                    'place': result['place'],
                    'popularity': result['popularity'],
                    'pointChange': result['prize'],
                    'resultSource': f"https://db.netkeiba.com/race/{race_id}/",
                    'key': key,
                }
                new_results.append(entry)
                existing_keys.add(key)
                print(f"  {result['name']} {result['place']}着 ({full_race_name}) 賞金{result['prize']:,}円")

            time.sleep(0.5)

        current += timedelta(days=1)
        time.sleep(0.3)

    if new_results:
        pog_data['results'] = new_results + pog_data.get('results', [])
        print(f"\n{len(new_results)}件の新しい成績を追加しました")
    else:
        print("\n新しい成績はありませんでした")

    today_str = date.today().isoformat()
    pog_data['checkedAt'] = today_str
    pog_data['coveredThrough'] = end_date.isoformat()
    if not pog_data.get('coveredSince'):
        pog_data['coveredSince'] = start_date.isoformat()

    with open(pog_data_path, 'w', encoding='utf-8') as f:
        json.dump(pog_data, f, ensure_ascii=False, separators=(',', ':'))

    print(f"pog-data.json を更新しました (coveredThrough: {end_date.isoformat()})")

if __name__ == '__main__':
    main()
