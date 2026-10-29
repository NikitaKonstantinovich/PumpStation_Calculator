CREATE TABLE IF NOT EXISTS component_calculator_source_revision (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT OR IGNORE INTO component_calculator_source_revision(id,revision) VALUES(1,0);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS component_calc_imports_insert AFTER INSERT ON catalog_imports BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS component_calc_imports_update AFTER UPDATE ON catalog_imports BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS component_calc_imports_delete AFTER DELETE ON catalog_imports BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS component_calc_catalogs_insert AFTER INSERT ON component_catalogs BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS component_calc_catalogs_update AFTER UPDATE ON component_catalogs BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS component_calc_catalogs_delete AFTER DELETE ON component_catalogs BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS component_calc_families_insert AFTER INSERT ON component_families BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS component_calc_families_update AFTER UPDATE ON component_families BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS component_calc_families_delete AFTER DELETE ON component_families BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS component_calc_components_insert AFTER INSERT ON components BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS component_calc_components_update AFTER UPDATE ON components BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS component_calc_components_delete AFTER DELETE ON components BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS component_calc_attributes_insert AFTER INSERT ON attribute_definitions BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS component_calc_attributes_update AFTER UPDATE ON attribute_definitions BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS component_calc_attributes_delete AFTER DELETE ON attribute_definitions BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS component_calc_values_insert AFTER INSERT ON component_attribute_values BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS component_calc_values_update AFTER UPDATE ON component_attribute_values BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS component_calc_values_delete AFTER DELETE ON component_attribute_values BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS component_calc_prices_insert AFTER INSERT ON component_prices BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS component_calc_prices_update AFTER UPDATE ON component_prices BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS component_calc_prices_delete AFTER DELETE ON component_prices BEGIN UPDATE component_calculator_source_revision SET revision=revision+1 WHERE id=1; END;
