import json

with open('C:/Users/Administrator/Desktop/lol_hex/temp_items.json', 'r', encoding='utf-8') as f:
    items = json.load(f)

completed = set()
components = set()

for item in items:
    fid = item.get('id', 0)
    pfrom = item.get('from', [])
    pto = item.get('to', [])
    price_total = item.get('priceTotal', 0)
    req_champ = item.get('requiredChampion', '')
    is_ench = item.get('isEnchantment', False)

    # Skip champion-specific, enchantments, and items with no store presence
    if req_champ or is_ench:
        continue

    # A completed item: has a recipe (built from components) and is at end of tree
    # Simple heuristic: has 'from' items (it's built from something)
    if pfrom and price_total >= 700:
        completed.add(fid)

print("Completed item count:", len(completed))
print("Sample completed IDs:", sorted(list(completed))[:30])

# Save as JSON for use in cloud function
with open('C:/Users/Administrator/Desktop/lol_hex/data-export/completed-item-ids.json', 'w') as f:
    json.dump(sorted(list(completed)), f)

print("Saved to data-export/completed-item-ids.json")
