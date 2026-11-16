"""Read the selected 1500 mm stand STEP pair and publish meshes without scaling."""
import argparse
import hashlib
import json
import struct
from pathlib import Path

from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Cylinder
from OCP.TopAbs import TopAbs_FACE
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.StlAPI import StlAPI_Writer


def bounds(shape):
    box = Bnd_Box()
    (getattr(BRepBndLib, 'AddOptimal_s', None) or BRepBndLib.AddOptimal)(shape, box, False, False)
    lo, hi = box.CornerMin(), box.CornerMax()
    return [round(v, 6) for v in [lo.X(), lo.Y(), lo.Z(), hi.X(), hi.Y(), hi.Z()]]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('repository', type=Path)
    args = parser.parse_args()
    frontend = Path(__file__).resolve().parents[1]
    assets = {}
    for asset_key, side, label, height in [('left','left','левая',1500),('right','right','правая',1500),('left1800','left','левая',1800),('right1800','right','правая',1800)]:
        suffix = ' 1800х400 WD' if height == 1800 else ''
        source = f'Equipment/FabricatedParts/3D/Стойки под шкафы/Стойка {label}{suffix}.STEP'
        path = args.repository / source
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        reader = STEPControl_Reader()
        if reader.ReadFile(str(path)) != IFSelect_RetDone:
            raise ValueError(f'Cannot read {source}')
        reader.TransferRoots()
        shape = reader.OneShape()
        box = bounds(shape)
        # The two base slots have 9 mm semicircular ends, 9 mm apart.
        slots = {}
        cabinet_points = []
        faces = TopExp_Explorer(shape, TopAbs_FACE)
        while faces.More():
            face = (getattr(TopoDS, 'Face_s', None) or TopoDS.Face)(faces.Current())
            surface = BRepAdaptor_Surface(face)
            if surface.GetType() == GeomAbs_Cylinder:
                cylinder = surface.Cylinder()
                point, axis = cylinder.Location(), cylinder.Axis().Direction()
                if abs(axis.X()) > .99999 and abs(cylinder.Radius() - 5.5) < 1e-5:
                    p = [bounds(face)[0],round(point.Y(),6),round(point.Z(),6)]
                    if p not in cabinet_points: cabinet_points.append(p)
                if abs(axis.Y()) > .99999 and abs(cylinder.Radius() - 4.5) < 1e-5 and point.Y() < 30:
                    key = round(point.X(), 5)
                    row = slots.setdefault(key, {'ends': set(), 'bottom': []})
                    row['ends'].add(round(point.Z(), 5))
                    row['bottom'].append(bounds(face)[1])
            faces.Next()
        if len(slots) != 2:
            raise ValueError('Expected two base slots')
        points = []
        for x, row in sorted(slots.items()):
            z = sorted(row['ends'])
            if len(z) != 2 or abs(z[1] - z[0] - 9) > 1e-5:
                raise ValueError('Unexpected base slot length')
            points.append([x, min(row['bottom']), sum(z) / 2])
        if abs(points[1][0] - points[0][0] - 350) > 1e-5 or points[0][1:] != points[1][1:]:
            raise ValueError('Unexpected stand mounting pitch/plane')
        mesh = frontend / 'public/model-assets' / f'model-{digest}-v1.stl'
        # Keep an already published native mesh immutable: the same STEP may
        # have been tessellated by the library converter at another tolerance.
        if not mesh.exists():
            BRepMesh_IncrementalMesh(shape, .15, False, .15, False)
            writer = StlAPI_Writer()
            writer.ASCIIMode = False
            if not writer.Write(shape, str(mesh)):
                raise ValueError('STL export failed')
        data = mesh.read_bytes()
        count = int.from_bytes(data[80:84], 'little')
        if not count or len(data) != 84 + 50 * count:
            raise ValueError('Invalid binary STL')
        vertices = [struct.unpack_from('<9f', data, 84 + i * 50 + 12) for i in range(count)]
        mesh_box = [fn(row[j] for row in vertices for j in range(axis, 9, 3))
                    for fn in (min, max) for axis in range(3)]
        if any(abs(a - b) > .001 for a, b in zip(mesh_box, box)):
            raise ValueError('Existing mesh does not preserve the native STEP bounds')
        # 1800 mm stands have additional rows: use the native 958 mm pair.
        cabinet_points = sorted(cabinet_points, key=lambda p:p[1])
        if height == 1800:
            cabinet_points = [p for p in cabinet_points if abs(p[1]-815)<.001 or abs(p[1]-1773)<.001]
        if len(cabinet_points)!=2 or abs(cabinet_points[1][1]-cabinet_points[0][1]-(958 if height==1800 else 558))>.001:
            raise ValueError('Unexpected cabinet mounting rows')
        assets[asset_key] = dict(componentId=f'frame-hardware-stand-{side}'+('-1800' if height==1800 else ''), source=source, sourceHash=digest,
                            meshUrl=f'/model-assets/{mesh.name}', meshHash=hashlib.sha256(data).hexdigest(),
                            bounds=box, heightMm=height, cabinetPoints=cabinet_points, mountingPoints=points,
                            mountingCenter=[sum(p[i] for p in points) / 2 for i in range(3)])
    target = frontend / 'data/frame-stand-models.json'
    target.write_text(json.dumps(dict(version=1, revision='frame-stands-v2', assets=assets), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key:asset['bounds'] for key,asset in assets.items()}))


if __name__ == '__main__':
    main()
