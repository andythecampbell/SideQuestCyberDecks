#!/usr/bin/env python3
"""Applies one exact-string source mutation, refusing if the target text is absent or ambiguous."""
import sys

path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
old = old.encode().decode("unicode_escape") if "\\n" in old else old
new = new.encode().decode("unicode_escape") if "\\n" in new else new
text = open(path, encoding="utf-8").read()
if text.count(old) != 1:
    sys.exit(f"mutation target found {text.count(old)} times in {path}: {old!r}")
open(path, "w", encoding="utf-8").write(text.replace(old, new))
