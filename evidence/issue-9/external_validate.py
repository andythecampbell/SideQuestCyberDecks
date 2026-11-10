#!/usr/bin/env python3
"""Validates a generator-spike output directory with tools that are not part of the generator.

Usage: external_validate.py <output-dir>

STL checks use trimesh and ADMesh, neither of which shares code with OpenCascade.
STEP checks use the native cadquery-ocp build of OpenCascade. That is a separate binary
from the WebAssembly kernel, but the same kernel family, so it is not fully independent.
Exits non-zero if any check fails.
"""
import json
import os
import pathlib
import re
import subprocess
import sys

import numpy
import OCP
import trimesh
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepGProp import BRepGProp
from OCP.Bnd import Bnd_Box
from OCP.GProp import GProp_GProps
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPControl import STEPControl_Reader
from OCP.TopAbs import TopAbs_SHELL, TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer

out = pathlib.Path(sys.argv[1])
manifest = json.loads((out / "manifest.json").read_text())
expected = manifest["geometry"]["expected"]
dimensions = expected["dimensionsMm"]
stl_path = out / "NON-FABRICATION-synthetic-plate-r1.stl"
step_path = out / "NON-FABRICATION-synthetic-plate-r1.step"
failures = []


def check(ok, message):
    if not ok:
        failures.append(message)


# --- STL through trimesh (no shared code with the generator or OpenCascade) ---
mesh = trimesh.load_mesh(stl_path, process=True)
extents = [float(value) for value in mesh.extents]
report = {
    "stl": {
        "tool": f"trimesh {trimesh.__version__} (numpy {numpy.__version__})",
        "triangles": int(len(mesh.faces)),
        "watertight": bool(mesh.is_watertight),
        "windingConsistent": bool(mesh.is_winding_consistent),
        "bodyCount": int(mesh.body_count),
        "eulerNumber": int(mesh.euler_number),
        "boundsMm": [[float(v) for v in corner] for corner in mesh.bounds],
        "extentsMm": extents,
        "volumeMm3": float(mesh.volume),
    }
}
check(report["stl"]["watertight"], "trimesh: mesh is not watertight")
check(report["stl"]["windingConsistent"], "trimesh: winding is inconsistent")
check(report["stl"]["bodyCount"] == 1, f"trimesh: body count {report['stl']['bodyCount']}")
genus = 1 - report["stl"]["eulerNumber"] / 2
report["stl"]["genus"] = genus
check(genus == expected["throughFeatureCount"], f"trimesh: genus {genus}")
for axis, value in enumerate(extents):
    check(abs(value - dimensions[axis]) <= 1e-6, f"trimesh: extent {axis} is {value}")
check(abs(report["stl"]["volumeMm3"] - expected["volumeMm3"]) <= expected["meshVolumeToleranceMm3"], f"trimesh: volume {report['stl']['volumeMm3']}")

# --- STL through ADMesh ---
admesh = os.environ.get("ADMESH_BIN")
if admesh:
    text = subprocess.run([admesh, str(stl_path)], check=True, text=True, capture_output=True).stdout
    value_after = lambda label: re.search(rf"{label}\s*:\s*(-?[\d.]+)", text).group(1)
    final_status = lambda label: int(re.search(rf"{label}\s*:\s*\d+\s+(\d+)", text).group(1))
    span = lambda axis: float(re.search(rf"Max {axis}\s*=\s*(-?[\d.]+)", text).group(1)) - float(re.search(rf"Min {axis}\s*=\s*(-?[\d.]+)", text).group(1))
    version = subprocess.run([admesh, "--version"], text=True, capture_output=True).stdout.strip()
    report["stlAdmesh"] = {
        "tool": version,
        "sizeMm": [span("X"), span("Y"), span("Z")],
        "facets": final_status("Number of facets"),
        "disconnectedFacets": final_status("Total disconnected facets"),
        "parts": int(value_after("Number of parts")),
        "degenerateFacets": int(value_after("Degenerate facets")),
        "edgesFixed": int(value_after("Edges fixed")),
        "facetsRemoved": int(value_after("Facets removed")),
        "facetsAdded": int(value_after("Facets added")),
        "facetsReversed": int(value_after("Facets reversed")),
        "backwardsEdges": int(value_after("Backwards edges")),
        "normalsFixed": int(value_after("Normals fixed")),
        "volumeMm3": float(value_after("Volume")),
    }
    a = report["stlAdmesh"]
    for axis, value in enumerate(a["sizeMm"]):
        check(abs(value - dimensions[axis]) <= 1e-5, f"ADMesh: size {axis} is {value}")
    check(a["parts"] == 1, f"ADMesh: parts {a['parts']}")
    for key in ["disconnectedFacets", "degenerateFacets", "edgesFixed", "facetsRemoved", "facetsAdded", "facetsReversed", "backwardsEdges", "normalsFixed"]:
        check(a[key] == 0, f"ADMesh: {key} is {a[key]}")
    check(abs(a["volumeMm3"] - expected["volumeMm3"]) <= expected["meshVolumeToleranceMm3"], f"ADMesh: volume {a['volumeMm3']}")
else:
    report["stlAdmesh"] = "skipped: ADMESH_BIN is not set"
    check(False, "ADMESH_BIN is not set")

# --- STEP through native OpenCascade (separate build, same kernel family) ---
reader = STEPControl_Reader()
status = reader.ReadFile(str(step_path))
check(status == IFSelect_RetDone, f"native OCCT: read status {status}")
reader.TransferRoots()
shape = reader.OneShape()
count = lambda kind: sum(1 for _ in iter_explorer(shape, kind))


def iter_explorer(target, kind):
    explorer = TopExp_Explorer(target, kind)
    while explorer.More():
        yield explorer.Current()
        explorer.Next()


box = Bnd_Box()
BRepBndLib.AddOptimal_s(shape, box, True, False)
low, high = box.CornerMin(), box.CornerMax()
xmin, ymin, zmin, xmax, ymax, zmax = low.X(), low.Y(), low.Z(), high.X(), high.Y(), high.Z()
props = GProp_GProps()
BRepGProp.VolumeProperties_s(shape, props)
closed_shells = sum(1 for shell in iter_explorer(shape, TopAbs_SHELL) if shell.Closed())
step_text = step_path.read_text()
report["step"] = {
    "tool": f"cadquery-ocp (OCP {OCP.__version__})",
    "readStatus": str(status),
    "solids": sum(1 for _ in iter_explorer(shape, TopAbs_SOLID)),
    "shells": sum(1 for _ in iter_explorer(shape, TopAbs_SHELL)),
    "closedShells": closed_shells,
    "valid": bool(BRepCheck_Analyzer(shape).IsValid()),
    "sizeMm": [xmax - xmin, ymax - ymin, zmax - zmin],
    "boundsMm": [[xmin, ymin, zmin], [xmax, ymax, zmax]],
    "volumeMm3": props.Mass(),
    "declaredLengthUnit": "mm" if re.search(r"LENGTH_UNIT\s*\(\s*\)[^;]*SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)", step_text) else "unknown",
    "headerTimestamp": re.search(r"FILE_NAME\s*\(\s*'[^']*'\s*,\s*'([^']*)'", step_text).group(1),
    "productName": re.search(r"=\s*PRODUCT\s*\(\s*'([^']*)'", step_text).group(1),
    "description": re.search(r"FILE_DESCRIPTION\s*\(\s*\(\s*'([^']*)'", step_text).group(1),
}
s = report["step"]
check(s["solids"] == 1, f"native OCCT: {s['solids']} solids")
check(s["closedShells"] == 1, f"native OCCT: {s['closedShells']} closed shells")
check(s["valid"], "native OCCT: BRepCheck reports the shape invalid")
for axis, value in enumerate(s["sizeMm"]):
    check(abs(value - dimensions[axis]) <= 1e-6, f"native OCCT: size {axis} is {value}")
check(abs(s["volumeMm3"] - expected["volumeMm3"]) <= 1e-6, f"native OCCT: volume {s['volumeMm3']}")
check(s["declaredLengthUnit"] == "mm", "STEP does not declare millimetres")
check("NON-FABRICATION" in s["description"], "STEP description is not labelled non-fabrication")

report["expected"] = expected
report["failures"] = failures
print(json.dumps(report, indent=2))
sys.exit(1 if failures else 0)
