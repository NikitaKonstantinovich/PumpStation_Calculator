"""Add a rigid, named STEP assembly instance without rewriting source geometry."""
from __future__ import annotations
import hashlib
from pathlib import Path
import re

ENTITY=re.compile(rb'(?ms)^\s*#(\d+)\s*=\s*(.*?);')


def args_of(body:bytes):
    start=body.find(b'(')
    if start<0: raise ValueError('Entity has no arguments')
    text=body[start+1:].strip()
    if not text.endswith(b')'): raise ValueError('Invalid entity argument ending')
    text=text[:-1]
    parts=[]; level=0; quote=False; last=0;i=0
    while i<len(text):
        c=text[i]
        if c==39:
            if quote and i+1<len(text) and text[i+1]==39: i+=2;continue
            quote=not quote
        elif not quote:
            if c==40: level+=1
            elif c==41: level-=1
            elif c==44 and level==0: parts.append(text[last:i].strip());last=i+1
        i+=1
    if quote or level: raise ValueError('Unbalanced STEP entity')
    parts.append(text[last:].strip())
    return parts


def ref(value:bytes):
    match=re.fullmatch(rb'#(\d+)',value.strip())
    if not match:raise ValueError('Expected entity reference')
    return int(match[1])


def wrap_step(raw:bytes, rotation, translation, name:str):
    if raw.count(b'END-ISO-10303-21;')!=1: raise ValueError('Incomplete STEP source')
    entities={int(m[1]):m[2].strip() for m in ENTITY.finditer(raw)}
    if not entities: raise ValueError('No STEP entities')
    forms={i:args_of(e) for i,e in entities.items() if re.match(rb'PRODUCT_DEFINITION(?:\s*\()',e)}
    children=set()
    for i,e in entities.items():
        if re.match(rb'NEXT_ASSEMBLY_USAGE_OCCURRENCE\s*\(',e): children.add(ref(args_of(e)[4]))
    representations=[]
    for i,e in entities.items():
        if not re.match(rb'SHAPE_DEFINITION_REPRESENTATION\s*\(',e):continue
        a=args_of(e)
        pds=entities[ref(a[0])]
        if not re.match(rb'PRODUCT_DEFINITION_SHAPE\s*\(',pds):continue
        pd=ref(args_of(pds)[2])
        if pd not in forms or pd in children:continue
        rep=ref(a[1]); rep_args=args_of(entities[rep])
        context=ref(rep_args[-1])
        representations.append((pd,rep,context))
    if len({p for p,r,c in representations})!=len(representations):raise ValueError('Multiple shape representations for one root')
    if not representations:raise ValueError('No unambiguous STEP root')
    # All catalogue models are millimetres. Mixed-unit assemblies require a separate rule.
    for pd,rep,ctx in representations:
        if not re.search(rb'GLOBAL_UNIT_ASSIGNED_CONTEXT',entities[ctx]):raise ValueError('Root context has no explicit units')
    n=max(entities)+1
    added=[]
    def add(text):
        nonlocal n
        result=n;n+=1
        added.append(f'#{result}={text};'.encode('ascii'))
        return result
    def xyz(v):return '('+','.join(f'{float(x):.15g}' if float(x)!=int(float(x)) else f'{int(float(x))}.' for x in v)+')'
    def axis(title,origin,z,x):
        point=add(f"CARTESIAN_POINT('',{xyz(origin)})")
        dz=add(f"DIRECTION('',{xyz(z)})")
        dx=add(f"DIRECTION('',{xyz(x)})")
        return add(f"AXIS2_PLACEMENT_3D('{title}',#{point},#{dz},#{dx})")
    identity=axis('NORMALIZED_ORIGIN',(0,0,0),(0,0,1),(1,0,0))
    placed=axis('SOURCE_TO_INLET',translation,[rotation[i][2] for i in range(3)],[rotation[i][0] for i in range(3)])
    old_pd,old_rep,old_context=representations[0]
    old_form=entities[ref(forms[old_pd][2])]
    old_product=entities[ref(args_of(old_form)[2])]
    product_contexts=args_of(old_product)[3].decode('ascii')
    label=name.replace("'","''").encode('ascii',errors='replace').decode('ascii')
    product=add(f"PRODUCT('{label}','{label}','Rigid coordinate normalization',{product_contexts})")
    formation=add(f"PRODUCT_DEFINITION_FORMATION('','',#{product})")
    product_definition=add(f"PRODUCT_DEFINITION('normalized_design','',#{formation},{forms[old_pd][-1].decode('ascii')})")
    pds=add(f"PRODUCT_DEFINITION_SHAPE('','',#{product_definition})")
    representation=add(f"SHAPE_REPRESENTATION('INLET_ZERO_Z_UP',(#{identity},#{placed}),#{old_context})")
    add(f"SHAPE_DEFINITION_REPRESENTATION(#{pds},#{representation})")
    add(f"PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(#{product}))")
    for index,(pd,rep,ctx) in enumerate(representations,1):
        occurrence=add(f"NEXT_ASSEMBLY_USAGE_OCCURRENCE('NORMALIZED_{index}','Source pump instance','',#{product_definition},#{pd},$)")
        usage=add(f"PRODUCT_DEFINITION_SHAPE('Placement','Rigid normalized source placement',#{occurrence})")
        transform=add(f"ITEM_DEFINED_TRANSFORMATION('','',#{identity},#{placed})")
        relationship=add(f"(REPRESENTATION_RELATIONSHIP('','',#{rep},#{representation}) REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#{transform}) SHAPE_REPRESENTATION_RELATIONSHIP())")
        add(f"CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#{relationship},#{usage})")
    terminator=re.search(rb'ENDSEC;\s*END-ISO-10303-21;\s*$',raw)
    if not terminator:raise ValueError('Unsupported STEP section layout')
    comment=(f"\n/* Rigid normalization; source SHA256 {hashlib.sha256(raw).hexdigest()}; original entity definitions preserved. */\n").encode('ascii')
    result=raw[:terminator.start()]+comment+b'\n'.join(added)+b'\n'+raw[terminator.start():]
    return result,{'originalEntityCount':len(entities),'addedEntityCount':len(added),'sourceRootCount':len(representations),'originalGeometryDefinitionsPreserved':True}
