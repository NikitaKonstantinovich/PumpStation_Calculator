const modelStatuses = new Set(["imported", "preserved", "imported_or_alias", "imported_CDM_380v", "imported_EVR_380v_round_DIN_configuration", "imported_VANDJORD_CRV_380V", "imported_end_suction_380V", "imported_horizontal_three_phase380", "imported_remaining_inline_380V"]);
const relations = new Set(["exact_factory_article_380_execution", "exact_model_and_factory_article", "exact_source_factory_or_explicit_phase_material_mapping", "reviewed_source_execution_380V"]);
import { spacingReference } from "./node-spacing-reference.mjs";
import { reviewedSpacingBinding, reviewedSpacingIssues, reconcileReviewedAliases } from "./node-spacing-reviewed.mjs";
/** These tables certify identity, not the applicability of model geometry to every motor. */
export function spacingEvidenceReader(optional) {
  const models = optional("legacy_model_map"), variants = optional("legacy_variant_links");
  return (variant, model, motor, ratings, context = {}) => {
    const modelLinks = models.filter(r => String(r.model_id) === String(model.id) && modelStatuses.has(r.status));
    const executionLinks = variants.filter(r => String(r.variant_id) === String(variant.id) && relations.has(r.relation) && r.source_id);
    const originalLinks = [...executionLinks.map(r => ({legacyId:String(r.legacy_id),scope:["exact_factory_article_380_execution","exact_model_and_factory_article"].includes(r.relation)?"execution":"model",relation:r.relation,source:r.source_id})), ...modelLinks.filter(r => !executionLinks.some(e => String(e.legacy_id) === String(r.legacy_id))).map(r => ({legacyId:String(r.legacy_id),scope:"model",relation:r.status,source:"legacy_model_map:"+r.legacy_id}))];
    const reviewed = reviewedSpacingBinding({...context,variant,model,motor});
    const links = reconcileReviewedAliases(originalLinks, reviewed);
    const motorKey = JSON.stringify([motor?.power_kw ?? null,motor?.frequency_hz ?? null,motor?.phase_count ?? null,motor?.speed_rpm ?? null,motor?.efficiency_class ?? null,motor?.protection_class ?? null,ratings.map(r=>[r.voltageV,r.currentA,r.connectionScheme])]);
    const reference = spacingReference({...context,variant,model,motor,links,motorKey});
    const issues = reviewedSpacingIssues({...context,variant,model,motor});
    if (!links.length) issues.push("В снимке нет подтверждённого соответствия старому каталогу");
    return {modelId:String(model.id),links,motorKey,...(links !== originalLinks ? {identityAliases:originalLinks} : {}),...(reference ? {reference} : {}),issues};
  };
}
