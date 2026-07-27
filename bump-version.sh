#!/bin/bash
cd "$(dirname "$0")"
python3 << 'PYEOF'
import re, glob

try:
    v = int(open('.asset-version').read().strip())
except:
    v = 1

new_v = v + 1
open('.asset-version', 'w').write(str(new_v))
print(f"Bumping version {v} -> {new_v}")

files = glob.glob('**/*.html', recursive=True)
files = list(set(files))

pattern = re.compile(r'(/assets/[^"\']+?)(\?v=\d+)?(["\'])')
replaced = 0

for f in files:
    try:
        s = open(f).read()
    except:
        continue
    new_s = pattern.sub(lambda m: f"{m.group(1)}?v={new_v}{m.group(3)}", s)
    if new_s != s:
        open(f, 'w').write(new_s)
        replaced += 1
        print(f"  updated: {f}")

print(f"Done. {replaced} files updated to v={new_v}")

# Write version.json for PWA update detection
with open('version.json', 'w') as vf:
    vf.write('{"version": ' + str(new_v) + '}')
print(f"version.json updated to {new_v}")
PYEOF
