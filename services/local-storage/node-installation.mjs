import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../../data/vertical-pump-installation-reviewed.json', import.meta.url), 'utf8'));
const rows = new Map(manifest.rows.map(row => [row.variantId, row]));

/** These facts enrich a complete execution, never another motor/connection variant. */
export function catalogInstallation({variant,model,motor,manufacturer,series}, bindings=rows) {
  const row=bindings.get(String(variant.id));
  if (!row || row.modelId!==String(model.id) || row.designation!==variant.designation ||
      row.article!==variant.manufacturer_article || row.manufacturer!==manufacturer || row.series!==series ||
      !Object.entries(row.motor).every(([k,v])=>(motor?.[k]??null)===v) ||
      !row.evidence?.length || row.evidence.some(e=>!e?.sha256||!e.path)) return null;
  return structuredClone({...row,version:manifest.version});
}

export function installationMounting(mounting, review) {
  if (!review || !mounting?.frameV1) return mounting;
  const patch=review.mounting, frame={...mounting.frameV1};
  if (patch.clampHeightMm>0) frame.clampHeightMm=patch.clampHeightMm;
  if (patch.footThicknessMm>0) frame.footThicknessMm=patch.footThicknessMm;
  if (patch.boltDiameterMm>0) frame.boltDiameterMm=patch.boltDiameterMm;
  if (patch.minimumBaseWidthMm>0) frame.bounds={...frame.bounds,
    minX:Math.min(frame.bounds.minX,-patch.minimumBaseWidthMm/2),maxX:Math.max(frame.bounds.maxX,patch.minimumBaseWidthMm/2)};
  if (patch.holeDiameterMm>0) frame.holes=frame.holes.map(h=>({...h,diameterMm:patch.holeDiameterMm}));
  if (review.dimensions.flange_face_to_face>0) frame.flangeFaceToFaceMm=review.dimensions.flange_face_to_face;
  if(patch.assumption)frame.note=[frame.note,patch.assumption].filter(Boolean).join(' ');
  if(patch.boltSelectionNote)frame.note=[frame.note,patch.boltSelectionNote].filter(Boolean).join(' ');
  const changed=patch.clampHeightMm>0||patch.holeDiameterMm>0||patch.boltDiameterMm>0;
  if(changed)frame.fastenerSource=[review.ports.inlet.installation_source,patch.assumption,patch.boltSelectionNote].filter(Boolean).join(' ');
  return {...mounting,frameV1:frame,...(changed?{fastenersV1:{...mounting.fastenersV1,
    ...(patch.clampHeightMm>0?{clampHeightMm:patch.clampHeightMm}:{}),
    ...(patch.holeDiameterMm>0?{holeDiameterMm:patch.holeDiameterMm}:{}),
    ...(patch.boltDiameterMm>0?{boltDiameterMm:patch.boltDiameterMm}:{}),
    ...(patch.assumption?{assumption:patch.assumption,ownerAccepted:patch.ownerAccepted}:{})}}:{}),
    frameAssessment:{...mounting.frameAssessment,installationVersion:review.version,
      ...(frame.boltDiameterMm>0&&frame.clampHeightMm>0?{fastenerStatus:patch.assumption?'owner_accepted_assumption':'dimensions_ready'}:{})}};
}
