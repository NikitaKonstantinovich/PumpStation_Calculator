// Synthetic, explicitly sourced engineering data. Never imported into production.
export const extensionInput = { dnFrom: 50, dnTo: 50, materials: ["aisi304"], withSensorNipple: false, includeEccentric: true };
export function extensionCatalog(material = "aisi304") {
  const source = "TEST ONLY verified dimensions / assembly";
  const dimensions = Object.fromEntries(["outerDiameter", "outerDiameterSmall", "wallThickness", "wallThicknessSmall", "lengthMm", "thicknessMm", "boreDiameterMm", "cylindricalLengthLargeMm", "cylindricalLengthSmallMm"].map(key => [key, source]));
  const part = (id, kind, dn, extra = {}) => ({ id, kind, name: id, material, dn, dnSmall: null, pn: 25, geometry: "straight",
    outerDiameter: dn === 50 ? 60.3 : 42.4, outerDiameterSmall: null, wallThickness: 3, wallThicknessSmall: null,
    lengthMm: null, thicknessMm: null, thread: null, threadGender: null, standard: "TEST ONLY", price: 100,
    source, dimensionSources: { ...dimensions }, warnings: [], ...extra });
  return { version: "extension-fixture", nominalDns: [32, 50], materials: [material], issues: [],
    parts: [part("ext-pipe", "pipe", 50, { price: 1000 }),
      part("ext-reducer", "reducer", 50, { geometry: "concentric", dnSmall: 32, outerDiameterSmall: 42.4, wallThicknessSmall: 3, lengthMm: 76, cylindricalLengthLargeMm: 15, cylindricalLengthSmallMm: 13, price: 730 }),
      part("ext-left", "weldFlange", 50, { thicknessMm: 20, boreDiameterMm: 61.1, price: 2710 }),
      part("ext-right", "weldFlange", 32, { thicknessMm: 18, boreDiameterMm: 43.1, price: 1847 })],
    standardBolts: [95, 110, 130].map(lengthMm => ({ id: `ext-bolt-${lengthMm}`, diameterMm: 16, lengthMm, source })),
    paintingRates: [{ id: "ext-paint", dn: 50, material: "st20", pricePerMeter: 450, source, warnings: [] }],
    engineering: { connectionPairs: [{ left: "flanged", right: "flanged", source }], endRules: [],
      straightLength: { model: "017W-line-spec", basis: "standard-bolt", source }, sensorNipple: null, looseFlangeInBom: { include: false, source },
      flangeAssembly: { faceOffsetMm: 5, clearanceFactor: 1.1, fastenerModels: ["017W-line-spec", "010C-line-spec"], source },
      reducerExtension: { side: "left", weldFactor: 2, weldGapMm: 0, source },
      boltReferences: [50, 32].flatMap(dn => ["017W-line-spec", "010C-line-spec"].map(model => {
        const standardLengthMm = model === "010C-line-spec" ? 130 : dn === 50 ? 110 : 95;
        return { dn, pn: 25, material, model, threadDiameterMm: 16, minimumLengthMm: standardLengthMm - 1, standardLengthMm, componentId: `ext-bolt-${standardLengthMm}`, endPartId: dn === 50 ? "ext-left" : "ext-right", source };
      })) },
  };
}
