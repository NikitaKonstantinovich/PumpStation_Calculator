// Required native arguments from the TypeScript operation contracts. Nullable input is intentional.
export const requiredInputs:Record<string,readonly string[]> = {
  buildCollectorTemplate: ["card","data","pumps","side"],
  prepareInsertionTemplate: ["row","context"],
  smartCabinetSupportsPower: ["cabinet", "power"],
  "resolvePort": [],
  "matchesPumpFilters": [
    "row"
  ],
  "selectionHeadAtFlow": [
    "pump",
    "flow"
  ],
  "operatingPoint": [
    "pump",
    "count",
    "input"
  ],
  "cataloguePurchasePriceRub": [
    "pump",
    "settings"
  ],
  "evaluatePumpCandidates": [
    "catalogue",
    "input",
    "settings"
  ],
  "frequencyAdjustedPump": [
    "pump",
    "frequencyHz"
  ],
  "checkInletPressure": [
    "element"
  ],
  "resolveDnConnection": [
    "settings"
  ],
  "suctionHydraulics": [
    "entity",
    "input",
    "settings"
  ],
  "dischargeHydraulics": [
    "entity",
    "input",
    "settings"
  ],
  "collectorRecommendation": [
    "project",
    "type"
  ],
  "collectorFlow": [
    "c"
  ],
  "calculateCollector": [
    "c",
    "catalog"
  ],
  "selectLineReducer": [
    "items",
    "catalog",
    "material",
    "pumpDn",
    "valveDn",
    "pn"
  ],
  "selectLineInsertion": [
    "items",
    "dn",
    "pn",
    "material"
  ],
  "selectGasket": [
    "items",
    "dn",
    "pn"
  ],
  "jointFastenerLength": [
    "grip",
    "nut",
    "washer",
    "ends"
  ],
  "selectHydraulicProduct": [
    "items",
    "need"
  ],
  "tankMounting": [
    "items",
    "volume"
  ],
  "frameConstructionForPumpMass": [],
  "projectFrameSelection": [
    "project"
  ],
  "projectControlCabinetItem": [
    "controlCabinets",
    "smartCabinets",
    "settings",
    "pump",
    "totalPumpCount"
  ],
  "buildHydraulicOptions": [
    "project"
  ],
  "buildSuctionSpec": [
    "project",
    "database",
    "catalog"
  ],
  "buildDischargeSpec": [
    "project",
    "database",
    "catalog"
  ],
  "generateInsertCalculations": [
    "request",
    "catalog"
  ],
  "buildAssembly": [
    "project",
    "pumps",
    "profiles"
  ],
  "flowVelocity": [
    "flow",
    "dn"
  ],
  "recommendedDn": [
    "flow"
  ],
  "inletPressureBar": [],
  "interpolateCurve": [
    "points",
    "flow"
  ],
  "usablePump": [
    "pump"
  ],
  "preferredOperatingPoint": [
    "deltaQPercent",
    "deltaHPercent"
  ],
  "cataloguePriceRub": [
    "pump",
    "settings"
  ],
  "catalogueDiscount": [
    "pump",
    "settings"
  ],
  "branchLength": [],
  "flangeKinds": [
    "material",
    "dn",
    "pn"
  ],
  "collectorPressureChecks": [
    "c"
  ],
  "resolveNippleRule": [
    "context"
  ],
  "resolveCollector": [
    "recommended",
    "state"
  ],
  "componentPressureLimit": [],
  "stationInstrumentPressure": [
    "project"
  ],
  "dischargeInstrumentPressure": [
    "project"
  ],
  "generateInsertCandidates": [
    "request",
    "originalCatalog"
  ],
  "specificationLineTotal": [
    "item"
  ],
  "assessSpecification": [
    "project"
  ],
  "getCircuitDnConfig": [
    "entity",
    "input",
    "settings"
  ],
  "selectValveComponent": [
    "items",
    "kind",
    "dn",
    "connection",
    "pn",
    "color",
    "collectorMaterial"
  ],
  "buildValveSpecItems": [
    "database",
    "entity",
    "input",
    "secondaryInput",
    "settings"
  ],
  "refreshSuctionSpecification": [
    "project"
  ],
  "stationComposition": [
    "project",
    "resources"
  ],
  "prepareStation": [
    "project",
    "resources"
  ],
  "stationCollectors": [
    "work"
  ],
  "stationLines": [
    "work"
  ],
  "stationOptions": [
    "work"
  ],
  "finalizeStation": [
    "work"
  ],
  "collectProjectIssues": [
    "project",
    "catalogue",
    "cabinets"
  ],
  "pumpIssues": [
    "input",
    "tool",
    "catalogue"
  ],
  "pumpCardSections": [
    "pump"
  ],
  "pumpCardCurves": [
    "pump"
  ],
  "selectAutomaticTransducer": [
    "items"
  ],
  "selectInsertVariants": [
    "rows",
    "coreRows",
    "catalog"
  ]
};
