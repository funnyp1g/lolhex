"""
Scrape champion builds data from aramgg.com RSC payloads.
Stores 3-item core builds, starting items, and situational items per champion.
"""
import json
import re
import urllib.request
import time
import sys

ARAMGG_RSC = 'https://aramgg.com/zh-CN/champion/{}'
CHAMPIONS_STATS = 'https://aramgg.com/data/champions-stats.json'
OUTPUT = 'C:/Users/Administrator/Desktop/lol_hex/data-export/champion-builds.json'
DELAY = 0.3  # seconds between requests

def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode('utf-8'))

def fetch_rsc_text(champion_id):
    """Fetch champion page as RSC text."""
    url = ARAMGG_RSC.format(champion_id)
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0',
        'RSC': '1'
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read().decode('utf-8')

def extract_builds(text):
    """Extract builds JSON array from RSC text using bracket matching."""
    start_marker = '"builds":['
    idx = text.find(start_marker)
    if idx < 0:
        return None

    idx += len(start_marker) - 1  # point to opening [
    depth = 1
    end = idx
    for i in range(idx + 1, len(text)):
        if text[i] == '[':
            depth += 1
        elif text[i] == ']':
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    builds_json = text[idx:end]
    try:
        return json.loads(builds_json)
    except json.JSONDecodeError:
        return None

def main():
    print("Fetching champion list...")
    champions = fetch_json(CHAMPIONS_STATS)
    champion_ids = [c['championId'] for c in champions]
    print(f"Found {len(champion_ids)} champions: {champion_ids[:10]}...")

    all_builds = {}
    success = 0
    failed = []

    for i, cid in enumerate(champion_ids):
        try:
            print(f"[{i+1}/{len(champion_ids)}] Champion {cid}...", end=' ')
            text = fetch_rsc_text(cid)
            builds = extract_builds(text)
            if builds is not None:
                all_builds[cid] = builds
                num_builds = len(builds)
                total_core = sum(len(b.get('coreItems', [])) for b in builds)
                print(f"OK ({num_builds} builds, {total_core} core items)")
                success += 1
            else:
                print("No builds found")
                failed.append(cid)

            time.sleep(DELAY)
        except Exception as e:
            print(f"ERROR: {e}")
            failed.append(cid)
            time.sleep(1)

    # Save output
    output = {
        'scraped_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'total_champions': len(champion_ids),
        'success': success,
        'failed': failed,
        'builds': all_builds
    }

    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False)

    print(f"\nDone! {success}/{len(champion_ids)} champions scraped.")
    print(f"Failed: {failed}")
    print(f"Saved to: {OUTPUT}")

if __name__ == '__main__':
    main()
