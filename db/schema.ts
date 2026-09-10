import { relations, sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: text("email_verified_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("uq_users_email").on(table.email)]);

export const collectors = sqliteTable("collectors", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  type: text("type", { enum: ["suction", "discharge"] }).notNull(),
  configurationJson: text("configuration_json").notNull(),
  calculationJson: text("calculation_json").notNull(),
  cachedPriceMicrounits: integer("cached_price_microunits").notNull(),
  weldLengthMm: real("weld_length_mm").notNull(),
  weldCostMicrounits: integer("weld_cost_microunits").notNull(),
  source: text("source").notNull(),
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  priceUpdatedAt: text("price_updated_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("uq_collectors_code").on(table.code), check("ck_collectors_price", sql`${table.cachedPriceMicrounits} >= 0`)]);

export const collectorItems = sqliteTable("collector_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  collectorId: text("collector_id").notNull().references(() => collectors.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  // Stable source identifier from the imported binding catalogue (not a browser row index).
  componentSourceId: text("component_source_id"),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  quantity: real("quantity").notNull(),
  unit: text("unit").notNull(),
  unitPriceMicrounits: integer("unit_price_microunits").notNull(),
  costMicrounits: integer("cost_microunits").notNull(),
  source: text("source"),
  sortOrder: integer("sort_order").notNull(),
}, table => [uniqueIndex("uq_collector_items_role").on(table.collectorId, table.role)]);

export const authTokens = sqliteTable("auth_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  purpose: text("purpose", { enum: ["verify_email", "reset_password"] }).notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  uniqueIndex("uq_auth_tokens_hash").on(table.tokenHash),
  index("idx_auth_tokens_user_purpose").on(table.userId, table.purpose),
]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  uniqueIndex("uq_sessions_token_hash").on(table.tokenHash),
  index("idx_sessions_user_id").on(table.userId),
]);

export const userProjects = sqliteTable("user_projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  configJson: text("config_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("idx_user_projects_user_updated").on(table.userId, table.updatedAt)]);

export const catalogImports = sqliteTable("catalog_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceFile: text("source_file").notNull(),
  sourceSha256: text("source_sha256").notNull(),
  sourceSizeBytes: integer("source_size_bytes").notNull(),
  sourceModifiedAt: text("source_modified_at").notNull(),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  defaultCurrency: text("default_currency", { length: 3 }).notNull().default("RUB"),
  schemaVersion: integer("schema_version").notNull().default(1),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
}, table => [
  uniqueIndex("uq_catalog_imports_sha256").on(table.sourceSha256),
  index("idx_catalog_imports_active_imported_at").on(table.isActive, table.importedAt),
  check("ck_catalog_imports_sha256_length", sql`length(${table.sourceSha256}) = 64`),
  check("ck_catalog_imports_source_size", sql`${table.sourceSizeBytes} > 0`),
]);

export const formulaRules = sqliteTable("formula_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id").notNull().references(() => catalogImports.id, { onDelete: "cascade" }),
  sourceId: text("source_id").notNull(),
  sheet: text("sheet").notNull(),
  address: text("address").notNull(),
  formula: text("formula").notNull(),
  cachedValueText: text("cached_value_text"),
  cachedValueNumber: real("cached_value_number"),
}, table => [
  uniqueIndex("uq_formula_rules_import_source").on(table.importId, table.sourceId),
  uniqueIndex("uq_formula_rules_import_cell").on(table.importId, table.sheet, table.address),
  index("idx_formula_rules_sheet_address").on(table.sheet, table.address),
]);

export const formulaDependencies = sqliteTable("formula_dependencies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  formulaRuleId: integer("formula_rule_id").notNull().references(() => formulaRules.id, { onDelete: "cascade" }),
  targetSheet: text("target_sheet").notNull(),
  targetAddress: text("target_address").notNull(),
  isExternal: integer("is_external", { mode: "boolean" }).notNull().default(false),
}, table => [
  uniqueIndex("uq_formula_dependencies_target").on(table.formulaRuleId, table.targetSheet, table.targetAddress),
  index("idx_formula_dependencies_lookup").on(table.targetSheet, table.targetAddress),
]);

export const componentCatalogs = sqliteTable("component_catalogs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id").notNull().references(() => catalogImports.id, { onDelete: "cascade" }),
  sourceId: text("source_id").notNull(),
  name: text("name").notNull(),
  sourceSheet: text("source_sheet").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, table => [
  uniqueIndex("uq_component_catalogs_import_source").on(table.importId, table.sourceId),
  index("idx_component_catalogs_import_sort").on(table.importId, table.sortOrder),
]);

export const componentFamilies = sqliteTable("component_families", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  catalogId: integer("catalog_id").notNull().references(() => componentCatalogs.id, { onDelete: "cascade" }),
  sourceId: text("source_id").notNull(),
  title: text("title").notNull(),
  sourceRange: text("source_range").notNull(),
  sourceUrlsJson: text("source_urls_json", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  sortOrder: integer("sort_order").notNull().default(0),
}, table => [
  uniqueIndex("uq_component_families_catalog_source").on(table.catalogId, table.sourceId),
  index("idx_component_families_catalog_sort").on(table.catalogId, table.sortOrder),
]);

export const attributeDefinitions = sqliteTable("attribute_definitions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  familyId: integer("family_id").notNull().references(() => componentFamilies.id, { onDelete: "cascade" }),
  sourceColumn: text("source_column").notNull(),
  key: text("key").notNull(),
  label: text("label").notNull(),
  headerPathJson: text("header_path_json", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  dataType: text("data_type", { enum: ["text", "number", "boolean", "date", "json"] }).notNull(),
  unit: text("unit"),
  sortOrder: integer("sort_order").notNull().default(0),
}, table => [
  uniqueIndex("uq_attribute_definitions_family_column").on(table.familyId, table.sourceColumn),
  index("idx_attribute_definitions_family_sort").on(table.familyId, table.sortOrder),
]);

export const components = sqliteTable("components", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  familyId: integer("family_id").notNull().references(() => componentFamilies.id, { onDelete: "cascade" }),
  sourceId: text("source_id").notNull(),
  sourceRow: integer("source_row").notNull(),
  displayName: text("display_name"),
  manufacturer: text("manufacturer"),
  model: text("model"),
  article: text("article"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
}, table => [
  uniqueIndex("uq_components_family_source").on(table.familyId, table.sourceId),
  index("idx_components_family_row").on(table.familyId, table.sourceRow),
  index("idx_components_manufacturer_model").on(table.manufacturer, table.model),
  check("ck_components_source_row", sql`${table.sourceRow} > 0`),
]);

export const componentAttributeValues = sqliteTable("component_attribute_values", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  componentId: integer("component_id").notNull().references(() => components.id, { onDelete: "cascade" }),
  attributeDefinitionId: integer("attribute_definition_id").notNull().references(() => attributeDefinitions.id, { onDelete: "cascade" }),
  formulaRuleId: integer("formula_rule_id").references(() => formulaRules.id, { onDelete: "set null" }),
  valueType: text("value_type", { enum: ["text", "number", "boolean", "date", "json"] }).notNull(),
  textValue: text("text_value"),
  numericValue: real("numeric_value"),
  booleanValue: integer("boolean_value", { mode: "boolean" }),
  dateValue: text("date_value"),
  jsonValue: text("json_value", { mode: "json" }).$type<unknown>(),
  numberFormat: text("number_format"),
  comment: text("comment"),
}, table => [
  uniqueIndex("uq_component_attribute_values_component_attribute").on(table.componentId, table.attributeDefinitionId),
  index("idx_component_attribute_values_text").on(table.attributeDefinitionId, table.textValue),
  index("idx_component_attribute_values_number").on(table.attributeDefinitionId, table.numericValue),
]);

export const componentPrices = sqliteTable("component_prices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  componentId: integer("component_id").notNull().references(() => components.id, { onDelete: "cascade" }),
  attributeDefinitionId: integer("attribute_definition_id").references(() => attributeDefinitions.id, { onDelete: "set null" }),
  label: text("label").notNull(),
  amountMicrounits: integer("amount_microunits").notNull(),
  scale: integer("scale").notNull().default(1_000_000),
  currency: text("currency", { length: 3 }).notNull().default("RUB"),
  sourceColumn: text("source_column"),
}, table => [
  index("idx_component_prices_component").on(table.componentId),
  index("idx_component_prices_currency_amount").on(table.currency, table.amountMicrounits),
  check("ck_component_prices_amount", sql`${table.amountMicrounits} > 0`),
  check("ck_component_prices_scale", sql`${table.scale} > 0`),
]);

export const dataSources = sqliteTable("data_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull(),
  title: text("title"),
  sourceType: text("source_type", { enum: ["product", "price-list", "reference", "external-workbook"] }).notNull().default("reference"),
}, table => [
  uniqueIndex("uq_data_sources_url").on(table.url),
]);

export const componentDataSources = sqliteTable("component_data_sources", {
  componentId: integer("component_id").notNull().references(() => components.id, { onDelete: "cascade" }),
  dataSourceId: integer("data_source_id").notNull().references(() => dataSources.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["product", "price", "documentation", "reference"] }).notNull().default("reference"),
}, table => [
  uniqueIndex("uq_component_data_sources_link").on(table.componentId, table.dataSourceId, table.role),
  index("idx_component_data_sources_source").on(table.dataSourceId),
]);

export const relationTables = sqliteTable("relation_tables", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id").notNull().references(() => catalogImports.id, { onDelete: "cascade" }),
  sourceId: text("source_id").notNull(),
  kind: text("kind", { enum: ["dependency", "input"] }).notNull(),
  title: text("title").notNull(),
  sourceSheet: text("source_sheet").notNull(),
  sourceRange: text("source_range").notNull(),
}, table => [
  uniqueIndex("uq_relation_tables_import_source").on(table.importId, table.sourceId),
  index("idx_relation_tables_kind").on(table.importId, table.kind),
]);

export const relationRecords = sqliteTable("relation_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  relationTableId: integer("relation_table_id").notNull().references(() => relationTables.id, { onDelete: "cascade" }),
  sourceId: text("source_id").notNull(),
  sourceRow: integer("source_row").notNull(),
}, table => [
  uniqueIndex("uq_relation_records_table_source").on(table.relationTableId, table.sourceId),
  index("idx_relation_records_table_row").on(table.relationTableId, table.sourceRow),
  check("ck_relation_records_source_row", sql`${table.sourceRow} > 0`),
]);

export const relationFields = sqliteTable("relation_fields", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  relationRecordId: integer("relation_record_id").notNull().references(() => relationRecords.id, { onDelete: "cascade" }),
  formulaRuleId: integer("formula_rule_id").references(() => formulaRules.id, { onDelete: "set null" }),
  sourceColumn: text("source_column").notNull(),
  headerPathJson: text("header_path_json", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  valueType: text("value_type", { enum: ["text", "number", "boolean", "date", "json"] }).notNull(),
  textValue: text("text_value"),
  numericValue: real("numeric_value"),
  booleanValue: integer("boolean_value", { mode: "boolean" }),
  dateValue: text("date_value"),
  jsonValue: text("json_value", { mode: "json" }).$type<unknown>(),
  numberFormat: text("number_format"),
  sourceUrl: text("source_url"),
  comment: text("comment"),
}, table => [
  uniqueIndex("uq_relation_fields_record_column").on(table.relationRecordId, table.sourceColumn),
  index("idx_relation_fields_text").on(table.sourceColumn, table.textValue),
  index("idx_relation_fields_number").on(table.sourceColumn, table.numericValue),
]);

export const dataValidations = sqliteTable("data_validations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id").notNull().references(() => catalogImports.id, { onDelete: "cascade" }),
  sheet: text("sheet").notNull().default("Исходные данные"),
  sourceRange: text("source_range").notNull(),
  validationType: text("validation_type").notNull(),
  operator: text("operator"),
  formula1: text("formula1"),
  formula2: text("formula2"),
  allowBlank: integer("allow_blank", { mode: "boolean" }).notNull().default(false),
  extension: text("extension"),
}, table => [
  uniqueIndex("uq_data_validations_import_range").on(table.importId, table.sheet, table.sourceRange),
  index("idx_data_validations_sheet_range").on(table.sheet, table.sourceRange),
]);

export const workbookDefinedNames = sqliteTable("workbook_defined_names", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id").notNull().references(() => catalogImports.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  value: text("value"),
  localSheetId: integer("local_sheet_id"),
  isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(false),
}, table => [
  uniqueIndex("uq_workbook_defined_names_scope").on(table.importId, table.name, table.localSheetId),
]);

export const externalWorkbookLinks = sqliteTable("external_workbook_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id").notNull().references(() => catalogImports.id, { onDelete: "cascade" }),
  relationshipId: text("relationship_id").notNull(),
  target: text("target").notNull(),
  targetMode: text("target_mode"),
}, table => [
  uniqueIndex("uq_external_workbook_links_target").on(table.importId, table.target),
]);

export const controlComponents = sqliteTable("control_components", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  manufacturer: text("manufacturer"),
  article: text("article"),
  name: text("name").notNull(),
  componentType: text("component_type"),
  attributesJson: text("attributes_json", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  currentPriceMicrounits: integer("current_price_microunits"),
  currency: text("currency", { length: 3 }).notNull().default("RUB"),
  sourceFile: text("source_file").notNull(),
  sourceSheet: text("source_sheet").notNull(),
  sourceRow: integer("source_row").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  index("idx_control_components_category").on(table.category),
  index("idx_control_components_article").on(table.article),
]);

export const controlCabinets = sqliteTable("control_cabinets", {
  id: text("id").primaryKey(),
  configurationKey: text("configuration_key").notNull(),
  stationType: text("station_type", { enum: ["fire", "utility", "combined", "smart"] }).notNull(),
  name: text("name").notNull(),
  pumpCount: integer("pump_count").notNull(),
  pumpPowerKw: real("pump_power_kw").notNull(),
  breakerCurrentA: real("breaker_current_a").notNull(),
  incomingSwitchCurrentA: real("incoming_switch_current_a").notNull(),
  contactorCount: integer("contactor_count").notNull(),
  vfdCount: integer("vfd_count").notNull(),
  vfdPowerKw: real("vfd_power_kw").notNull(),
  enclosureDimensions: text("enclosure_dimensions").notNull(),
  assemblyKitType: text("assembly_kit_type").notNull(),
  laborHours: real("labor_hours").notNull(),
  laborRate: real("labor_rate").notNull(),
  cachedTotalMicrounits: integer("cached_total_microunits").notNull(),
  source: text("source").notNull(),
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  priceUpdatedAt: text("price_updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  uniqueIndex("uq_control_cabinets_configuration").on(table.configurationKey),
  index("idx_control_cabinets_lookup").on(table.stationType, table.pumpCount, table.pumpPowerKw),
]);

export const controlCabinetItems = sqliteTable("control_cabinet_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cabinetId: text("cabinet_id").notNull().references(() => controlCabinets.id, { onDelete: "cascade" }),
  componentId: text("component_id").notNull().references(() => controlComponents.id, { onDelete: "restrict" }),
  role: text("role").notNull(),
  componentGroup: text("component_group", { enum: ["dynamic", "static"] }).notNull().default("dynamic"),
  quantity: real("quantity").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, table => [
  uniqueIndex("uq_control_cabinet_items_role").on(table.cabinetId, table.role),
  index("idx_control_cabinet_items_component").on(table.componentId),
  index("idx_control_cabinet_items_group").on(table.cabinetId, table.componentGroup, table.sortOrder),
]);

export const catalogImportsRelations = relations(catalogImports, ({ many }) => ({
  catalogs: many(componentCatalogs),
  formulas: many(formulaRules),
  relationTables: many(relationTables),
  dataValidations: many(dataValidations),
  definedNames: many(workbookDefinedNames),
  externalLinks: many(externalWorkbookLinks),
}));

export const componentCatalogsRelations = relations(componentCatalogs, ({ one, many }) => ({
  import: one(catalogImports, { fields: [componentCatalogs.importId], references: [catalogImports.id] }),
  families: many(componentFamilies),
}));

export const componentFamiliesRelations = relations(componentFamilies, ({ one, many }) => ({
  catalog: one(componentCatalogs, { fields: [componentFamilies.catalogId], references: [componentCatalogs.id] }),
  attributes: many(attributeDefinitions),
  components: many(components),
}));

export const componentsRelations = relations(components, ({ one, many }) => ({
  family: one(componentFamilies, { fields: [components.familyId], references: [componentFamilies.id] }),
  attributes: many(componentAttributeValues),
  prices: many(componentPrices),
  sources: many(componentDataSources),
}));

export const formulaRulesRelations = relations(formulaRules, ({ one, many }) => ({
  import: one(catalogImports, { fields: [formulaRules.importId], references: [catalogImports.id] }),
  dependencies: many(formulaDependencies),
}));

export const relationTablesRelations = relations(relationTables, ({ one, many }) => ({
  import: one(catalogImports, { fields: [relationTables.importId], references: [catalogImports.id] }),
  records: many(relationRecords),
}));

export const relationRecordsRelations = relations(relationRecords, ({ one, many }) => ({
  table: one(relationTables, { fields: [relationRecords.relationTableId], references: [relationTables.id] }),
  fields: many(relationFields),
}));

export const controlComponentsRelations = relations(controlComponents, ({ many }) => ({
  cabinetItems: many(controlCabinetItems),
}));

export const controlCabinetsRelations = relations(controlCabinets, ({ one, many }) => ({
  createdBy: one(users, { fields: [controlCabinets.createdByUserId], references: [users.id] }),
  items: many(controlCabinetItems),
}));

export const controlCabinetItemsRelations = relations(controlCabinetItems, ({ one }) => ({
  cabinet: one(controlCabinets, { fields: [controlCabinetItems.cabinetId], references: [controlCabinets.id] }),
  component: one(controlComponents, { fields: [controlCabinetItems.componentId], references: [controlComponents.id] }),
}));
