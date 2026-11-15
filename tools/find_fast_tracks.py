import json

with open('tools/tracks_842pm.json') as f:
    tracks = json.load(f)

print(f"Total tracks in file: {len(tracks)}")
veh_tracks = [t for t in tracks if t['hits'] >= 4 and any(c in ['car', 'truck/bus'] for c in t['classes_seen'])]
print(f"Vehicle tracks: {len(veh_tracks)}")

for t in sorted(veh_tracks, key=lambda x: x['first_t']):
    dur = t['last_t'] - t['first_t']
    print(f"Track #{t['id']}: class={t['class']} ({t['classes_seen']}) hits={t['hits']} dur={dur:.2f}s ({t['first_t']}s - {t['last_t']}s) size={t['max_w']}x{t['max_h']}")
