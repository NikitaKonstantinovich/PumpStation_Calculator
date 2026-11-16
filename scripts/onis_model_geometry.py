"""Measure ONIS STEP connection faces and apply rigid display coordinates only.

MV inline faces are PORT_A/PORT_B until flow direction is independently reviewed.
MH axial suction and radial discharge are identified geometrically, never by DN.
"""
import collections
import math


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def transform_point(rotation, origin, point):
    return [dot(row, [point[i]-origin[i] for i in range(3)]) for row in rotation]


def annular_faces(shape):
    from OCP.BRepAdaptor import BRepAdaptor_Surface, BRepAdaptor_Curve
    from OCP.GeomAbs import GeomAbs_Plane, GeomAbs_Circle
    from OCP.TopAbs import TopAbs_FACE, TopAbs_EDGE, TopAbs_WIRE, TopAbs_REVERSED
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    result = []
    faces = TopExp_Explorer(shape, TopAbs_FACE)
    while faces.More():
        face = TopoDS.Face(faces.Current()); faces.Next()
        surface = BRepAdaptor_Surface(face, True)
        if surface.GetType() != GeomAbs_Plane:
            continue
        direction = surface.Plane().Axis().Direction()
        normal = [direction.X(), direction.Y(), direction.Z()]
        axis = max(range(3), key=lambda i: abs(normal[i]))
        if abs(normal[axis]) < .99999:
            continue
        if face.Orientation() == TopAbs_REVERSED:
            normal = [-n for n in normal]
        edges = TopExp_Explorer(face, TopAbs_EDGE); circles = collections.defaultdict(set)
        while edges.More():
            curve = BRepAdaptor_Curve(TopoDS.Edge(edges.Current())); edges.Next()
            if curve.GetType() == GeomAbs_Circle and curve.Circle().Radius() >= 8:
                circle = curve.Circle(); p = circle.Location()
                circles[tuple(round(v, 5) for v in [p.X(), p.Y(), p.Z()])].add(round(circle.Radius(), 4))
        wires = TopExp_Explorer(face, TopAbs_WIRE); count = 0
        while wires.More():
            count += 1; wires.Next()
        for center, radii in circles.items():
            radii = sorted(radii)
            if count >= 2 and len(radii) >= 2 and radii[-1]-radii[0] >= 1:
                result.append(dict(center=list(center), normal=normal, axis=axis, radii=radii))
    return result


def display_frame(series, bounds, candidates):
    spans = [bounds[i+3]-bounds[i] for i in range(3)]
    shaft = max(range(3), key=lambda i: spans[i])
    if series == 'MV':
        pairs = []
        for a in candidates:
            k = a['axis']
            if k == shaft or a['normal'][k] > -.999 or a['radii'][0] < 10:
                continue
            for b in candidates:
                if b['axis'] != k or b['normal'][k] < .999 or abs(a['radii'][0]-b['radii'][0]) > .05:
                    continue
                if any(abs(a['center'][j]-b['center'][j]) > .05 for j in range(3) if j != k):
                    continue
                span = b['center'][k]-a['center'][k]
                h = a['center'][shaft]
                if span > 150 and min(h-bounds[shaft], bounds[shaft+3]-h) < spans[shaft]*.3:
                    pairs.append((span, a, b))
        if not pairs:
            raise ValueError('No unambiguous MV inline connection pair')
        span, a, b = max(pairs, key=lambda row: row[0])
        if any(abs(s-span) < .01 and math.dist(a['center'], other['center']) > .1 for s, other, _ in pairs):
            raise ValueError('Multiple MV connection axes')
        x = [-v for v in a['normal']]
        up = [0, 0, 0]
        up[shaft] = 1 if bounds[shaft+3]-a['center'][shaft] > a['center'][shaft]-bounds[shaft] else -1
        roles = ['port-a', 'port-b']
        warning = 'Направление потока MV не подтверждено по исходному STEP: PORT_A/PORT_B не назначены входом и выходом; автоматическая обвязка требует проверки направления.'
    elif series == 'MH':
        # The axial end opening is close to a bounding end and is a small pipe
        # annulus, not a motor cover or the internal impeller stack.
        inlet = [c for c in candidates if c['axis'] == shaft and 10 <= c['radii'][0] <= 40
                 and c['radii'][-1] <= 55 and c['radii'][-1]-c['radii'][0] <= 5
                 and abs(c['center'][shaft]-bounds[shaft+(3 if c['normal'][shaft] > 0 else 0)]) < 1]
        unique = {tuple(c['center']): c for c in inlet}
        if len(unique) != 1:
            raise ValueError('MH axial inlet face is ambiguous')
        a = next(iter(unique.values()))
        outlets = [c for c in candidates if c['axis'] != shaft and 10 <= c['radii'][0] <= 40
                   and c['radii'][-1] <= 55 and c['radii'][-1]-c['radii'][0] <= 5
                   and (c['center'][c['axis']]-a['center'][c['axis']])*c['normal'][c['axis']] > 30
                   and all(abs(c['center'][j]-a['center'][j]) < .05 for j in range(3) if j not in (shaft, c['axis']))]
        if not outlets:
            raise ValueError('MH radial discharge face not found')
        b = max(outlets, key=lambda c: abs(c['center'][c['axis']]-a['center'][c['axis']]))
        x, up = [-v for v in a['normal']], b['normal']
        roles = ['inlet', 'outlet']
        warning = 'MH: вход — осевое отверстие, выход — радиальный патрубок вверх; монтажное исполнение и резьбовое зацепление требуют проверки.'
    else:
        raise ValueError('Unsupported ONIS series')
    rotation = [x, cross(up, x), up]
    if abs(dot(rotation[0], cross(rotation[1], rotation[2]))-1) > 1e-6:
        raise ValueError('Display transform is not a rigid right-handed rotation')
    ports = [dict(id=role, point=transform_point(rotation, a['center'], c['center']),
                  axis=[dot(row, c['normal']) for row in rotation], provisional=True)
             for role, c in zip(roles, [a, b])]
    return dict(rotation=rotation, translation=[-dot(row, a['center']) for row in rotation],
                origin=a['center'], ports=ports, warning=warning, sourceFaces=[a, b])
