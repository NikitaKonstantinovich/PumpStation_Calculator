import { corePrepareInsertionTemplate } from "../model-editor/insertion-template";
import { coreBuildCollectorTemplate } from "../model-editor/collector-template";
import { coreSelectInsertVariants } from "../component-insert-variants";
import { coreSelectAutomaticTransducer } from "../pressure-transducers";
import { corePumpCardCurves } from "../pump-card-data";
import { corePumpCardSections } from "../pump-card-data";
import { corePumpIssues } from "../diagnostics";
import { coreCollectProjectIssues } from "../diagnostics";
import { coreFinalizeStation } from "../station-specification";
import { coreStationOptions } from "../station-specification";
import { coreStationLines } from "../station-specification";
import { coreStationCollectors } from "../station-specification";
import { corePrepareStation } from "../station-specification";
import { coreStationComposition } from "../station-specification";
import { coreRefreshSuctionSpecification } from "../station-hydraulic-calculation";
import { coreBuildValveSpecItems } from "../station-hydraulic-calculation";
import { coreSelectValveComponent } from "../station-hydraulic-calculation";
import { coreGetCircuitDnConfig } from "../station-hydraulic-calculation";
import { coreAssessSpecification } from "../specification-readiness";
import { coreSpecificationLineTotal } from "../specification-readiness";
import { coreGenerateInsertCandidates } from "../component-insert-calculations";
import { coreDischargeInstrumentPressure } from "../instrument-pressure";
import { coreStationInstrumentPressure } from "../instrument-pressure";
import { coreComponentPressureLimit } from "../suction-pressure";
import { coreResolveCollector } from "../collector-project";
import { coreResolveNippleRule } from "../collector-nipple-rules";
import { coreCollectorPressureChecks } from "../collector-calculations";
import { coreFlangeKinds } from "../collector-calculations";
import { coreBranchLength } from "../collector-calculations";
import { coreCatalogueDiscount } from "../pump-catalog";
import { coreCataloguePriceRub } from "../pump-catalog";
import { corePreferredOperatingPoint } from "../pump-selection";
import { coreUsablePump } from "../pump-catalog";
import { coreInterpolateCurve } from "../pump-catalog";
import { coreInletPressureBar } from "../dn-defaults";
import { coreRecommendedDn } from "../dn-defaults";
import { coreFlowVelocity } from "../dn-defaults";
import { coreResolvePort } from "../pump-ports";
import { coreMatchesPumpFilters } from "../pump-filters";
import { coreSelectionHeadAtFlow } from "../pump-catalog";
import { coreOperatingPoint } from "../pump-catalog";
import { coreCataloguePurchasePriceRub } from "../pump-catalog";
import { coreEvaluatePumpCandidates } from "../pump-selection";
import { coreFrequencyAdjustedPump } from "../pump-frequency";
import { coreCheckInletPressure } from "../dn-defaults";
import { coreResolveDnConnection } from "../dn-defaults";
import { coreSuctionHydraulics } from "../dn-defaults";
import { coreDischargeHydraulics } from "../dn-defaults";
import { coreCollectorRecommendation } from "../collector-project";
import { coreCollectorFlow } from "../collector-calculations";
import { coreCalculateCollector } from "../collector-calculations";
import { coreSelectLineReducer } from "../line-insertion";
import { coreSelectLineInsertion } from "../line-insertion";
import { coreSelectGasket } from "../sealing-selection";
import { coreJointFastenerLength } from "../joint-fastener-length";
import { coreSelectHydraulicProduct } from "../hydraulic-option-selection";
import { coreTankMounting } from "../tank-mounting";
import { coreFrameConstructionForPumpMass } from "../frame-selection";
import { coreProjectFrameSelection } from "../frame-selection";
import { coreProjectControlCabinetItem, coreSmartCabinetSupportsPower } from "../control-cabinet-selection";
import { coreBuildHydraulicOptions } from "../hydraulic-option-assembly";
import { coreBuildSuctionSpec } from "../suction-spec";
import { coreBuildDischargeSpec } from "../discharge-spec";
import { coreGenerateInsertCalculations } from "../component-insert-calculations";
import { coreBuildAssembly } from "../model-editor/model";

// Importing this module registers the complete library of pure engineering operations.
export const nativeOperations = {
  prepareInsertionTemplate: corePrepareInsertionTemplate,
  buildCollectorTemplate: coreBuildCollectorTemplate,
  selectInsertVariants: coreSelectInsertVariants,
  selectAutomaticTransducer: coreSelectAutomaticTransducer,
  pumpCardCurves: corePumpCardCurves,
  pumpCardSections: corePumpCardSections,
  pumpIssues: corePumpIssues,
  collectProjectIssues: coreCollectProjectIssues,
  finalizeStation: coreFinalizeStation,
  stationOptions: coreStationOptions,
  stationLines: coreStationLines,
  stationCollectors: coreStationCollectors,
  prepareStation: corePrepareStation,
  stationComposition: coreStationComposition,
  refreshSuctionSpecification: coreRefreshSuctionSpecification,
  buildValveSpecItems: coreBuildValveSpecItems,
  selectValveComponent: coreSelectValveComponent,
  getCircuitDnConfig: coreGetCircuitDnConfig,
  assessSpecification: coreAssessSpecification,
  specificationLineTotal: coreSpecificationLineTotal,
  generateInsertCandidates: coreGenerateInsertCandidates,
  dischargeInstrumentPressure: coreDischargeInstrumentPressure,
  stationInstrumentPressure: coreStationInstrumentPressure,
  componentPressureLimit: coreComponentPressureLimit,
  resolveCollector: coreResolveCollector,
  resolveNippleRule: coreResolveNippleRule,
  collectorPressureChecks: coreCollectorPressureChecks,
  flangeKinds: coreFlangeKinds,
  branchLength: coreBranchLength,
  catalogueDiscount: coreCatalogueDiscount,
  cataloguePriceRub: coreCataloguePriceRub,
  preferredOperatingPoint: corePreferredOperatingPoint,
  usablePump: coreUsablePump,
  interpolateCurve: coreInterpolateCurve,
  inletPressureBar: coreInletPressureBar,
  recommendedDn: coreRecommendedDn,
  flowVelocity: coreFlowVelocity,
  resolvePort: coreResolvePort,
  matchesPumpFilters: coreMatchesPumpFilters,
  selectionHeadAtFlow: coreSelectionHeadAtFlow,
  operatingPoint: coreOperatingPoint,
  cataloguePurchasePriceRub: coreCataloguePurchasePriceRub,
  evaluatePumpCandidates: coreEvaluatePumpCandidates,
  frequencyAdjustedPump: coreFrequencyAdjustedPump,
  checkInletPressure: coreCheckInletPressure,
  resolveDnConnection: coreResolveDnConnection,
  suctionHydraulics: coreSuctionHydraulics,
  dischargeHydraulics: coreDischargeHydraulics,
  collectorRecommendation: coreCollectorRecommendation,
  collectorFlow: coreCollectorFlow,
  calculateCollector: coreCalculateCollector,
  selectLineReducer: coreSelectLineReducer,
  selectLineInsertion: coreSelectLineInsertion,
  selectGasket: coreSelectGasket,
  jointFastenerLength: coreJointFastenerLength,
  selectHydraulicProduct: coreSelectHydraulicProduct,
  tankMounting: coreTankMounting,
  frameConstructionForPumpMass: coreFrameConstructionForPumpMass,
  projectFrameSelection: coreProjectFrameSelection,
  smartCabinetSupportsPower: coreSmartCabinetSupportsPower,
  projectControlCabinetItem: coreProjectControlCabinetItem,
  buildHydraulicOptions: coreBuildHydraulicOptions,
  buildSuctionSpec: coreBuildSuctionSpec,
  buildDischargeSpec: coreBuildDischargeSpec,
  generateInsertCalculations: coreGenerateInsertCalculations,
  buildAssembly: coreBuildAssembly
};
