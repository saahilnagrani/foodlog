#!/usr/bin/env python3
"""Write data.json byte-for-byte the way the app's JSON.stringify(data, null, 2) does.

Both Claude (Python) and the app (browser, via the GitHub Contents API) write
data.json.  If the two writers disagree on formatting, every app commit rewrites
the whole file and the diff is useless.  This module is the single definition of
the format:

  * 2-space indent, ", " / ": " separators   (same as json.dump(indent=2))
  * whole numbers as ints        20.0 -> 20   (JS has no int/float split)
  * raw UTF-8, not \\uXXXX escapes             (ensure_ascii=False)
  * no trailing newline                        (JSON.stringify adds none)

Use it instead of json.dump:

    from tools.fmt_data import load, save
    d = load(); ...; save(d)

Run it with no arguments to normalise data.json in place.
"""
import json
import os
import sys

PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data.json')


def jsnum(o):
    """Recursively turn whole floats into ints, the way JS numbers serialise."""
    if isinstance(o, bool):
        return o
    if isinstance(o, float):
        return int(o) if o.is_integer() else o
    if isinstance(o, list):
        return [jsnum(v) for v in o]
    if isinstance(o, dict):
        return {k: jsnum(v) for k, v in o.items()}
    return o


def dumps(data):
    return json.dumps(jsnum(data), indent=2, ensure_ascii=False)


def load(path=PATH):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save(data, path=PATH):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(dumps(data))


if __name__ == '__main__':
    p = sys.argv[1] if len(sys.argv) > 1 else PATH
    before = open(p, encoding='utf-8').read()
    after = dumps(json.loads(before))
    if before == after:
        print('already normalised:', p)
    else:
        open(p, 'w', encoding='utf-8').write(after)
        print('normalised:', p)
