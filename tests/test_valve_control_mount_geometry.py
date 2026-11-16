"""Check mounting-hole clearance against actual, unscaled native STL triangles."""
import json
import math
from pathlib import Path
import struct
import unittest

ROOT = Path(__file__).resolve().parents[1]

def rotate(p, rotation):
    x,y,z = [v*math.pi/180 for v in rotation]
    u=p[0]*math.cos(z)-p[1]*math.sin(z);v=p[0]*math.sin(z)+p[1]*math.cos(z)
    w=-u*math.sin(y)+p[2]*math.cos(y)
    return [u*math.cos(y)+p[2]*math.sin(y),v*math.cos(x)-w*math.sin(x),v*math.sin(x)+w*math.cos(x)]

def world(p, position, rotation):
    return [a+b for a,b in zip(rotate(p,rotation),position)]

def triangles(asset, position, rotation):
    data=(ROOT/'public'/asset['meshUrl'].lstrip('/')).read_bytes()
    result=[]
    for i in range(struct.unpack_from('<I',data,80)[0]):
        result.append([world(struct.unpack_from('<fff',data,84+i*50+12+j*12),position,rotation)[:2] for j in range(3)])
    return result

def inside(p, mesh):
    for a,b,c in mesh:
        den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-5: continue
        u=((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/den
        v=((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/den
        if min(u,v,1-u-v)>1e-6: return True
    return False

class MountGeometry(unittest.TestCase):
    def test_all_switch_fastening_holes_fit_real_bracket_slots(self):
        data=json.loads((ROOT/'data/valve-control-mounts.json').read_text(encoding='utf8'))
        for row in data['rows']:
            mesh=triangles(row['bracket'],row['bracketPosition'],row['bracketRotation'])
            for position,rotation in zip(row['switchPositions'],row['switchRotations']):
                for x in [-10.5,10.5]:
                    for y in [-28,28]:
                        point=world([x,y,0],position,rotation)
                        self.assertFalse(inside(point,mesh),f'DN{row["dn"]}: hole center intersects plate')
                        # A complete Ø4.2 fastening-hole projection clears the actual slot.
                        for i in range(24):
                            angle=i*math.tau/24
                            self.assertFalse(inside([point[0]+2.1*math.cos(angle),point[1]+2.1*math.sin(angle)],mesh),f'DN{row["dn"]}: fastening circle intersects plate')
                        # Hole must be in a real bracket leg, not in space outside it.
                        self.assertTrue(any(inside([point[0]+4*math.cos(i*math.tau/24),point[1]+4*math.sin(i*math.tau/24)],mesh) for i in range(24)))

if __name__=='__main__': unittest.main()
