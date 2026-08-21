CREATE TABLE `attribute_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`family_id` integer NOT NULL,
	`source_column` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`header_path_json` text DEFAULT '[]' NOT NULL,
	`data_type` text NOT NULL,
	`unit` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `component_families`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_attribute_definitions_family_column` ON `attribute_definitions` (`family_id`,`source_column`);--> statement-breakpoint
CREATE INDEX `idx_attribute_definitions_family_sort` ON `attribute_definitions` (`family_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `catalog_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_file` text NOT NULL,
	`source_sha256` text NOT NULL,
	`source_size_bytes` integer NOT NULL,
	`source_modified_at` text NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`default_currency` text(3) DEFAULT 'RUB' NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	CONSTRAINT "ck_catalog_imports_sha256_length" CHECK(length("catalog_imports"."source_sha256") = 64),
	CONSTRAINT "ck_catalog_imports_source_size" CHECK("catalog_imports"."source_size_bytes" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_catalog_imports_sha256` ON `catalog_imports` (`source_sha256`);--> statement-breakpoint
CREATE INDEX `idx_catalog_imports_active_imported_at` ON `catalog_imports` (`is_active`,`imported_at`);--> statement-breakpoint
CREATE TABLE `component_attribute_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`component_id` integer NOT NULL,
	`attribute_definition_id` integer NOT NULL,
	`formula_rule_id` integer,
	`value_type` text NOT NULL,
	`text_value` text,
	`numeric_value` real,
	`boolean_value` integer,
	`date_value` text,
	`json_value` text,
	`number_format` text,
	`comment` text,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attribute_definition_id`) REFERENCES `attribute_definitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`formula_rule_id`) REFERENCES `formula_rules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_component_attribute_values_component_attribute` ON `component_attribute_values` (`component_id`,`attribute_definition_id`);--> statement-breakpoint
CREATE INDEX `idx_component_attribute_values_text` ON `component_attribute_values` (`attribute_definition_id`,`text_value`);--> statement-breakpoint
CREATE INDEX `idx_component_attribute_values_number` ON `component_attribute_values` (`attribute_definition_id`,`numeric_value`);--> statement-breakpoint
CREATE TABLE `component_catalogs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer NOT NULL,
	`source_id` text NOT NULL,
	`name` text NOT NULL,
	`source_sheet` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `catalog_imports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_component_catalogs_import_source` ON `component_catalogs` (`import_id`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_component_catalogs_import_sort` ON `component_catalogs` (`import_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `component_data_sources` (
	`component_id` integer NOT NULL,
	`data_source_id` integer NOT NULL,
	`role` text DEFAULT 'reference' NOT NULL,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`data_source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_component_data_sources_link` ON `component_data_sources` (`component_id`,`data_source_id`,`role`);--> statement-breakpoint
CREATE INDEX `idx_component_data_sources_source` ON `component_data_sources` (`data_source_id`);--> statement-breakpoint
CREATE TABLE `component_families` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`catalog_id` integer NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`source_range` text NOT NULL,
	`source_urls_json` text DEFAULT '[]' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`catalog_id`) REFERENCES `component_catalogs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_component_families_catalog_source` ON `component_families` (`catalog_id`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_component_families_catalog_sort` ON `component_families` (`catalog_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `component_prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`component_id` integer NOT NULL,
	`attribute_definition_id` integer,
	`label` text NOT NULL,
	`amount_microunits` integer NOT NULL,
	`scale` integer DEFAULT 1000000 NOT NULL,
	`currency` text(3) DEFAULT 'RUB' NOT NULL,
	`source_column` text,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attribute_definition_id`) REFERENCES `attribute_definitions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_component_prices_amount" CHECK("component_prices"."amount_microunits" > 0),
	CONSTRAINT "ck_component_prices_scale" CHECK("component_prices"."scale" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_component_prices_component` ON `component_prices` (`component_id`);--> statement-breakpoint
CREATE INDEX `idx_component_prices_currency_amount` ON `component_prices` (`currency`,`amount_microunits`);--> statement-breakpoint
CREATE TABLE `components` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`family_id` integer NOT NULL,
	`source_id` text NOT NULL,
	`source_row` integer NOT NULL,
	`display_name` text,
	`manufacturer` text,
	`model` text,
	`article` text,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `component_families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_components_source_row" CHECK("components"."source_row" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_components_family_source` ON `components` (`family_id`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_components_family_row` ON `components` (`family_id`,`source_row`);--> statement-breakpoint
CREATE INDEX `idx_components_manufacturer_model` ON `components` (`manufacturer`,`model`);--> statement-breakpoint
CREATE TABLE `data_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`source_type` text DEFAULT 'reference' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_data_sources_url` ON `data_sources` (`url`);--> statement-breakpoint
CREATE TABLE `data_validations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer NOT NULL,
	`sheet` text DEFAULT 'Исходные данные' NOT NULL,
	`source_range` text NOT NULL,
	`validation_type` text NOT NULL,
	`operator` text,
	`formula1` text,
	`formula2` text,
	`allow_blank` integer DEFAULT false NOT NULL,
	`extension` text,
	FOREIGN KEY (`import_id`) REFERENCES `catalog_imports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_data_validations_import_range` ON `data_validations` (`import_id`,`sheet`,`source_range`);--> statement-breakpoint
CREATE INDEX `idx_data_validations_sheet_range` ON `data_validations` (`sheet`,`source_range`);--> statement-breakpoint
CREATE TABLE `external_workbook_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer NOT NULL,
	`relationship_id` text NOT NULL,
	`target` text NOT NULL,
	`target_mode` text,
	FOREIGN KEY (`import_id`) REFERENCES `catalog_imports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_external_workbook_links_target` ON `external_workbook_links` (`import_id`,`target`);--> statement-breakpoint
CREATE TABLE `formula_dependencies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`formula_rule_id` integer NOT NULL,
	`target_sheet` text NOT NULL,
	`target_address` text NOT NULL,
	`is_external` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`formula_rule_id`) REFERENCES `formula_rules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_formula_dependencies_target` ON `formula_dependencies` (`formula_rule_id`,`target_sheet`,`target_address`);--> statement-breakpoint
CREATE INDEX `idx_formula_dependencies_lookup` ON `formula_dependencies` (`target_sheet`,`target_address`);--> statement-breakpoint
CREATE TABLE `formula_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer NOT NULL,
	`source_id` text NOT NULL,
	`sheet` text NOT NULL,
	`address` text NOT NULL,
	`formula` text NOT NULL,
	`cached_value_text` text,
	`cached_value_number` real,
	FOREIGN KEY (`import_id`) REFERENCES `catalog_imports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_formula_rules_import_source` ON `formula_rules` (`import_id`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_formula_rules_import_cell` ON `formula_rules` (`import_id`,`sheet`,`address`);--> statement-breakpoint
CREATE INDEX `idx_formula_rules_sheet_address` ON `formula_rules` (`sheet`,`address`);--> statement-breakpoint
CREATE TABLE `relation_fields` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`relation_record_id` integer NOT NULL,
	`formula_rule_id` integer,
	`source_column` text NOT NULL,
	`header_path_json` text DEFAULT '[]' NOT NULL,
	`value_type` text NOT NULL,
	`text_value` text,
	`numeric_value` real,
	`boolean_value` integer,
	`date_value` text,
	`json_value` text,
	`number_format` text,
	`source_url` text,
	`comment` text,
	FOREIGN KEY (`relation_record_id`) REFERENCES `relation_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`formula_rule_id`) REFERENCES `formula_rules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_relation_fields_record_column` ON `relation_fields` (`relation_record_id`,`source_column`);--> statement-breakpoint
CREATE INDEX `idx_relation_fields_text` ON `relation_fields` (`source_column`,`text_value`);--> statement-breakpoint
CREATE INDEX `idx_relation_fields_number` ON `relation_fields` (`source_column`,`numeric_value`);--> statement-breakpoint
CREATE TABLE `relation_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`relation_table_id` integer NOT NULL,
	`source_id` text NOT NULL,
	`source_row` integer NOT NULL,
	FOREIGN KEY (`relation_table_id`) REFERENCES `relation_tables`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_relation_records_source_row" CHECK("relation_records"."source_row" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_relation_records_table_source` ON `relation_records` (`relation_table_id`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_relation_records_table_row` ON `relation_records` (`relation_table_id`,`source_row`);--> statement-breakpoint
CREATE TABLE `relation_tables` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer NOT NULL,
	`source_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`source_sheet` text NOT NULL,
	`source_range` text NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `catalog_imports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_relation_tables_import_source` ON `relation_tables` (`import_id`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_relation_tables_kind` ON `relation_tables` (`import_id`,`kind`);--> statement-breakpoint
CREATE TABLE `workbook_defined_names` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer NOT NULL,
	`name` text NOT NULL,
	`value` text,
	`local_sheet_id` integer,
	`is_hidden` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `catalog_imports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_workbook_defined_names_scope` ON `workbook_defined_names` (`import_id`,`name`,`local_sheet_id`);