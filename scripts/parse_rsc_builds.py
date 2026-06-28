import json, re

for champ_id in ['1', '2', '22']:
    path = f'C:/Users/Administrator/Desktop/lol_hex/temp_rsc_{champ_id}.txt'
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()

    # Find start of builds array
    start_marker = '"builds":['
    idx = text.find(start_marker)
    if idx < 0:
        print(f"\n=== Champion {champ_id} === No builds found")
        continue

    idx += len(start_marker)

    # Manual bracket matching to find the full JSON array
    depth = 1
    end = idx
    for i in range(idx, len(text)):
        if text[i] == '[':
            depth += 1
        elif text[i] == ']':
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    builds_json = text[idx-1:end]  # include the opening [

    try:
        builds = json.loads(builds_json)
        print(f"\n=== Champion {champ_id} ===")
        print(f"Builds count: {len(builds)}")
        for bi, build in enumerate(builds):
            tags = build.get('tags', [])
            games = build.get('games', '?')
            wr = build.get('winRate', '?')
            pr = build.get('pickRate', '?')
            print(f"  Build {bi+1}: tags={tags} | Games={games} | WR={round(wr*100,1) if isinstance(wr,float) else wr}% | PR={round(pr*100,1) if isinstance(pr,float) else pr}%")

            core_items = build.get('coreItems', [])
            print(f"    Core items ({len(core_items)}):")
            for ci in core_items:
                ids = ci.get('itemIds', [])
                names = ci.get('itemNames', [])
                ci_wr = ci.get('winRate', '?')
                ci_games = ci.get('games', '?')
                print(f"      IDs={ids} | Names={names} | WR={round(ci_wr*100,1) if isinstance(ci_wr,float) else ci_wr}% | Games={ci_games}")

            starters = build.get('startingItems', [])
            print(f"    Starting items: {starters}")

            sits = build.get('situationalItems', [])
            print(f"    Situational items ({len(sits)}): {sits}")

            # Print all other keys
            other_keys = set(build.keys()) - {'coreItems','startingItems','situationalItems','tags','games','winRate','pickRate','patch'}
            if other_keys:
                print(f"    Other keys: {other_keys}")
                for k in other_keys:
                    print(f"      {k}: {build[k]}")
    except json.JSONDecodeError as e:
        print(f"  JSON error: {e}")
        print(f"  First 300 chars: {builds_json[:300]}")
