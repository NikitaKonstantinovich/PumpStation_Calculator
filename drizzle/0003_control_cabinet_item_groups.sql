ALTER TABLE `control_cabinet_items` ADD COLUMN `component_group` text DEFAULT 'dynamic' NOT NULL;
--> statement-breakpoint
UPDATE `control_cabinet_items`
SET `component_group` = CASE WHEN `sort_order` >= 8 THEN 'static' ELSE 'dynamic' END;
--> statement-breakpoint
CREATE INDEX `idx_control_cabinet_items_group`
ON `control_cabinet_items` (`cabinet_id`,`component_group`,`sort_order`);
