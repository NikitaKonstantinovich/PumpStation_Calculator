CREATE TABLE `control_components` (
  `id` text PRIMARY KEY NOT NULL,
  `category` text NOT NULL,
  `manufacturer` text,
  `article` text,
  `name` text NOT NULL,
  `component_type` text,
  `attributes_json` text DEFAULT '{}' NOT NULL,
  `current_price_microunits` integer,
  `currency` text DEFAULT 'RUB' NOT NULL,
  `source_file` text NOT NULL,
  `source_sheet` text NOT NULL,
  `source_row` integer NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_control_components_category` ON `control_components` (`category`);
--> statement-breakpoint
CREATE INDEX `idx_control_components_article` ON `control_components` (`article`);
--> statement-breakpoint
CREATE TABLE `control_cabinets` (
  `id` text PRIMARY KEY NOT NULL,
  `configuration_key` text NOT NULL,
  `station_type` text NOT NULL,
  `name` text NOT NULL,
  `pump_count` integer NOT NULL,
  `pump_power_kw` real NOT NULL,
  `breaker_current_a` real NOT NULL,
  `incoming_switch_current_a` real NOT NULL,
  `contactor_count` integer NOT NULL,
  `vfd_count` integer NOT NULL,
  `vfd_power_kw` real NOT NULL,
  `enclosure_dimensions` text NOT NULL,
  `assembly_kit_type` text NOT NULL,
  `labor_hours` real NOT NULL,
  `labor_rate` real NOT NULL,
  `cached_total_microunits` integer NOT NULL,
  `source` text NOT NULL,
  `created_by_user_id` text REFERENCES `users`(`id`) ON DELETE set null,
  `price_updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_control_cabinets_configuration` ON `control_cabinets` (`configuration_key`);
--> statement-breakpoint
CREATE INDEX `idx_control_cabinets_lookup` ON `control_cabinets` (`station_type`,`pump_count`,`pump_power_kw`);
--> statement-breakpoint
CREATE TABLE `control_cabinet_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `cabinet_id` text NOT NULL REFERENCES `control_cabinets`(`id`) ON DELETE cascade,
  `component_id` text NOT NULL REFERENCES `control_components`(`id`) ON DELETE restrict,
  `role` text NOT NULL,
  `quantity` real NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_control_cabinet_items_role` ON `control_cabinet_items` (`cabinet_id`,`role`);
--> statement-breakpoint
CREATE INDEX `idx_control_cabinet_items_component` ON `control_cabinet_items` (`component_id`);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e5bf2e84c85c1aeefa','PLCIO','ОВЕН','МВ110-224.16Д','Модуль дискретных входов МВ110. 16DI','-','{"TYPE":"-"}',5573000000,'RUB','PLCIO.xlsx','PLCIO',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5898ed659d412a4ad6','PLCIO','ОВЕН','МУ110-224.6У','Модуль аналоговых выходов МУ110. 8AO','-','{"TYPE":"-"}',5575000000,'RUB','PLCIO.xlsx','PLCIO',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f7c8ad00c4c514fc76','PLCIO','ОВЕН','СП310-Р','Панель оператора, 10"','-','{"TYPE":"-"}',5576000000,'RUB','PLCIO.xlsx','PLCIO',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d98aecc7ea84289b11','PLCIO','ОВЕН','ПЛК210-02-CS','Контроллер, 24DI, 12DO','-','{"TYPE":"-"}',5577000000,'RUB','PLCIO.xlsx','PLCIO',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4d81fb254ad486a22b','PLCIO','ОВЕН','МВ110-224.32Д','Модуль дискретных входов МВ110. 32DI','-','{"TYPE":"-"}',5578000000,'RUB','PLCIO.xlsx','PLCIO',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-99a655383d9bd65ba6','PLCIO','ОВЕН','МВ110-224.8АС','Модуль аналоговых входов МВ110.  8AI','-','{"TYPE":"-"}',5579000000,'RUB','PLCIO.xlsx','PLCIO',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-011db61004d3573bd1','PLCIO','ОВЕН','МУ110-224.8Р','Модуль дискретных выходов МУ110. 8Р','-','{"TYPE":"-"}',5580000000,'RUB','PLCIO.xlsx','PLCIO',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-68c8966ff7491c1790','PLCIO','ОВЕН','МУ110-224.16Р','Модуль дискретных выходов МУ110. 16Р','-','{"TYPE":"-"}',5581000000,'RUB','PLCIO.xlsx','PLCIO',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cca7353bc4c9ebe75c','PLCIO','ОВЕН','СПК110','Сенсорный панельный контроллер, СПК110 2ХDB9,Eth','24VDC','{"TYPE":"-","MISCELLANEOUS1":"2ХDB9,Eth,","ASSEMBLYCODE":"СПК110"}',5582000000,'RUB','PLCIO.xlsx','PLCIO',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4b24a38beadfb1e19f','PLCIO','ОВЕН','Адаптер_СПК110','Адаптер СПК110','-','{"TYPE":"-","ASSEMBLYLIST":"СПК110"}',5583000000,'RUB','PLCIO.xlsx','PLCIO',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-115d5b5b5c6517dafd','PLCIO','ОВЕН','МВ210-212','Модуль дискретного ввода, 32DI','-','{"TYPE":"-"}',5584000000,'RUB','PLCIO.xlsx','PLCIO',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6266b9e92e3f16c65d','PLCIO','ОВЕН','МУ210-402','Модуль дискретного вывода, 16DO','-','{"TYPE":"-"}',5585000000,'RUB','PLCIO.xlsx','PLCIO',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-330502b410417cebc5','PLCIO','ОВЕН','МВ210-101','Модуль аналогового ввода, 8AI','-','{"TYPE":"-"}',5586000000,'RUB','PLCIO.xlsx','PLCIO',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6344454b181920eb23','PLCIO','ОВЕН','МУ210-502','Модуль аналогового вывода, 6AO','-','{"TYPE":"-"}',5587000000,'RUB','PLCIO.xlsx','PLCIO',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f46ca0001c3d00ac80','PLCIO','ОВЕН','СП315-Р','Панель оператора, 15"','-','{"TYPE":"-"}',5588000000,'RUB','PLCIO.xlsx','PLCIO',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-603672a10e5772170f','PLCIO','ОВЕН','МВ210-202','Модуль дискретного ввода, 20DI','-','{"TYPE":"-"}',5589000000,'RUB','PLCIO.xlsx','PLCIO',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f7b9c827443c050855','PLCIO','ОВЕН','МУ210-401','Модуль дискретного вывода, 8DO','-','{"TYPE":"-"}',5590000000,'RUB','PLCIO.xlsx','PLCIO',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8fa97f499079942aeb','PLCIO','ОВЕН','ПР103-230.1610.01.1.0','Программируемое реле','ПР103','{"TYPE":"16DI, 10DO","MISCELLANEOUS1":"RS-485","MISCELLANEOUS2":"Ethernet"}',5591000000,'RUB','PLCIO.xlsx','PLCIO',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6a56ddec74a46e0612','PLCIO','Weintek','cMT2158X','Панель оператора, 15"','-','{"TYPE":"-"}',5592000000,'RUB','PLCIO.xlsx','PLCIO',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2f35b14829c72211b1','PLCIO','ОВЕН','ПЛК210-12-CS','Контроллер, 24DI, 12DO','-','{"TYPE":"-"}',5593000000,'RUB','PLCIO.xlsx','PLCIO',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8cb0184ba8ecab3106','PLCIO','ОВЕН','МВ110-224.16ДН','Модуль дискретных входов МВ110. 16DI','-','{"TYPE":"-"}',5594000000,'RUB','PLCIO.xlsx','PLCIO',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0037a6810e0d65e6c7','PLCIO','ОВЕН','МВ110-224.8А','Модуль аналоговых входов МВ110. 8AI','-','{"TYPE":"-"}',5595000000,'RUB','PLCIO.xlsx','PLCIO',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3c65840ea67b2eaf41','PLCIO','ОВЕН','МУ110-224.8И','Модуль аналоговых выходов МУ110. 8AO','-','{"TYPE":"-"}',5596000000,'RUB','PLCIO.xlsx','PLCIO',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2c425f84d5d261a59c','PLCIO','Weintek','cMT2108X','Панель оператора, 10"','-','{"TYPE":"-"}',5597000000,'RUB','PLCIO.xlsx','PLCIO',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8edc791ce8e0f832db','PLCIO','ОВЕН','ПР102-24.2416.03.2','Программируемое реле','ПР102','{"TYPE":"24DI, 16DO","MISCELLANEOUS1":"RS-485","MISCELLANEOUS2":"Ethernet"}',5598000000,'RUB','PLCIO.xlsx','PLCIO',26);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7f61200c9813ecaa98','PLCIO','ОВЕН','ПРМ-24.2','Модуль расширения','ПРМ','{"TYPE":"4AI, 4DO"}',5599000000,'RUB','PLCIO.xlsx','PLCIO',27);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c1e9c3e5655a7508ee','PLCIO','ONI','ETG-CP-070','Панель оператора ETG 7” серии','ETG 7','{"TYPE":"-"}',5600000000,'RUB','PLCIO.xlsx','PLCIO',28);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-11bee7db3ba6bef388','Автоматический_выключатель','Dekraft','21220DEK','Выключатель автоматический защиты двигвателя, ВА-431-0.1A-0.16A','ВА-431','{"кол-во полюсов":3,"номинал, А":0.16,"номинал-мин":"0,1"}',3261060000,'RUB','Автоматический_выключатель.xlsm','dekraft',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-95e0b9a4bcd972bb13','Автоматический_выключатель','Dekraft','21221DEK','Выключатель автоматический защиты двигвателя, ВА-431-0.16A-0.25A','ВА-431','{"кол-во полюсов":3,"номинал, А":0.25,"номинал-мин":0.16}',3261060000,'RUB','Автоматический_выключатель.xlsm','dekraft',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a8c2448739a67949e9','Автоматический_выключатель','Dekraft','12296DEK','Выключатель автоматический, ВА-103-3P-001A-C','ВА-103','{"кол-во полюсов":3,"номинал, А":1}',1690920000,'RUB','Автоматический_выключатель.xlsm','dekraft',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ec49e58e1349d24b5c','Автоматический_выключатель','Dekraft','12280DEK','Выключатель автоматический, ВА-103-2P-001A-C','ВА-103','{"кол-во полюсов":2,"номинал, А":1}',972830000,'RUB','Автоматический_выключатель.xlsm','dekraft',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b25a6f92ddfa81e305','Автоматический_выключатель','Dekraft','12264DEK','Выключатель автоматический, ВА-103-1P-001A-C','ВА-103','{"кол-во полюсов":1,"номинал, А":1}',445790000,'RUB','Автоматический_выключатель.xlsm','dekraft',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ba0229c7aab11e9707','Автоматический_выключатель','Dekraft','21225DEK','Выключатель автоматический защиты двигвателя, ВА-431-1,0A-1,6A','ВА-431','{"кол-во полюсов":3,"номинал, А":1.6,"номинал-мин":1}',3310470000,'RUB','Автоматический_выключатель.xlsm','dekraft',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-305c7d596cfc6d1722','Автоматический_выключатель','Dekraft','12297DEK','Выключатель автоматический, ВА-103-3P-002A-C','ВА-103','{"кол-во полюсов":"3","номинал, А":2}',1690920000,'RUB','Автоматический_выключатель.xlsm','dekraft',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6da54c41aedddb9db8','Автоматический_выключатель','Dekraft','12281DEK','Выключатель автоматический, ВА-103-2P-002A-C','ВА-103','{"кол-во полюсов":2,"номинал, А":2}',939890000,'RUB','Автоматический_выключатель.xlsm','dekraft',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-68d0e5bd1387f14d1a','Автоматический_выключатель','Dekraft','12265DEK','Выключатель автоматический, ВА-103-1P-002A-C','ВА-103','{"кол-во полюсов":1,"номинал, А":2}',451280000,'RUB','Автоматический_выключатель.xlsm','dekraft',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8a0dcc92436b981f16','Автоматический_выключатель','Dekraft','21226DEK','Выключатель автоматический защиты двигвателя, ВА-431-1,6A-2,5A','ВА-431','{"кол-во полюсов":3,"номинал, А":2.5,"номинал-мин":1.6}',3310470000,'RUB','Автоматический_выключатель.xlsm','dekraft',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-819d44700718fae92a','Автоматический_выключатель','Dekraft','12298DEK','Выключатель автоматический, ВА-103-3P-003A-C','ВА-103','{"кол-во полюсов":"3","номинал, А":3}',1729350000,'RUB','Автоматический_выключатель.xlsm','dekraft',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-373e4eeea3e0154762','Автоматический_выключатель','Dekraft','12282DEK','Выключатель автоматический, ВА-103-2P-003A-C','ВА-103','{"кол-во полюсов":2,"номинал, А":3}',939890000,'RUB','Автоматический_выключатель.xlsm','dekraft',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-497e33de80e28772a0','Автоматический_выключатель','Dekraft','12266DEK','Выключатель автоматический, ВА-103-1P-003A-C','ВА-103','{"кол-во полюсов":1,"номинал, А":3}',438650000,'RUB','Автоматический_выключатель.xlsm','dekraft',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2dae8264a496b67fa2','Автоматический_выключатель','Dekraft','21227DEK','Выключатель автоматический защиты двигвателя, ВА-431-2,5A-4A','ВА-431','{"кол-во полюсов":3,"номинал, А":4,"номинал-мин":2.5}',3326940000,'RUB','Автоматический_выключатель.xlsm','dekraft',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-eeedb6f8b463bf80e9','Автоматический_выключатель','Dekraft','12299DEK','Выключатель автоматический, ВА-103-3P-004A-C','ВА-103','{"кол-во полюсов":"3","номинал, А":4}',1636020000,'RUB','Автоматический_выключатель.xlsm','dekraft',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c42ae4f2e6b9e03dbb','Автоматический_выключатель','Dekraft','12283DEK','Выключатель автоматический, ВА-103-2P-004A-C','ВА-103','{"кол-во полюсов":2,"номинал, А":4}',953060000,'RUB','Автоматический_выключатель.xlsm','dekraft',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6451c3fe48817a3121','Автоматический_выключатель','Dekraft','12267DEK','Выключатель автоматический, ВА-103-1P-004A-C','ВА-103','{"кол-во полюсов":1,"номинал, А":4}',439750000,'RUB','Автоматический_выключатель.xlsm','dekraft',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c563c20be75ab39bfa','Автоматический_выключатель','Dekraft','12300DEK','Выключатель автоматический, ВА-103-3P-005A-C','ВА-103','{"кол-во полюсов":"3","номинал, А":5}',1273680000,'RUB','Автоматический_выключатель.xlsm','dekraft',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2e712c945c830b1b97','Автоматический_выключатель','Dekraft','12284DEK','Выключатель автоматический, ВА-103-2P-005A-C','ВА-103','{"кол-во полюсов":2,"номинал, А":5}',824600000,'RUB','Автоматический_выключатель.xlsm','dekraft',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a28acc7cecef55f37e','Автоматический_выключатель','Dekraft','12268DEK','Выключатель автоматический, ВА-103-1P-005A-C','ВА-103','{"кол-во полюсов":1,"номинал, А":5}',364540000,'RUB','Автоматический_выключатель.xlsm','dekraft',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-dbb4e864212026115a','Автоматический_выключатель','Dekraft','12301DEK','Выключатель автоматический, ВА-103-3P-006A-C','ВА-103','{"кол-во полюсов":3,"номинал, А":6}',1339560000,'RUB','Автоматический_выключатель.xlsm','dekraft',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7282d3f4012753124c','Автоматический_выключатель','Dekraft','12285DEK','Выключатель автоматический, ВА-103-2P-006A-C','ВА-103','{"кол-во полюсов":2,"номинал, А":6}',782330000,'RUB','Автоматический_выключатель.xlsm','dekraft',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-37ac98a67ec3d32b33','Автоматический_выключатель','Dekraft','12269DEK','Выключатель автоматический, ВА-103-1P-006A-C','ВА-103','{"кол-во полюсов":1,"номинал, А":6}',329950000,'RUB','Автоматический_выключатель.xlsm','dekraft',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8396b177b40fe88180','Автоматический_выключатель','Dekraft','12400DEK','Выключатель автоматический, ВА-103-1N-006A-C','ВА-103','{"кол-во полюсов":2,"номинал, А":6}',603900000,'RUB','Автоматический_выключатель.xlsm','dekraft',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4f58f2189ef27ab952','Автоматический_выключатель','Dekraft','16227DEK','Выключатель Диф. автоматический, ДИФ-103','ДИФ-103','{"кол-во полюсов":"1+N","номинал, А":6}',NULL,'RUB','Автоматический_выключатель.xlsm','dekraft',26);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-242743bc0e3d541cb9','Автоматический_выключатель','Dekraft','16050DEK','Выключатель Диф. автоматический, ДИФ103-4.5кА-1N-006A-030-C','ДИФ-103','{"кол-во полюсов":2,"номинал, А":6}',1668960000,'RUB','Автоматический_выключатель.xlsm','dekraft',27);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d74e5f12b0b34a254c','Автоматический_выключатель','Dekraft','15155DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":6}',1056280000,'RUB','Автоматический_выключатель.xlsm','dekraft',28);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c5a7d2833b4560ccf8','Автоматический_выключатель','Dekraft','15136DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":6}',2366190000,'RUB','Автоматический_выключатель.xlsm','dekraft',29);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cfa3f492304b4cc357','Автоматический_выключатель','Dekraft','15050DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":6}',2300310000,'RUB','Автоматический_выключатель.xlsm','dekraft',30);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-953076832f08ff9dbb','Автоматический_выключатель','Dekraft','15071DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":6}',3200670000,'RUB','Автоматический_выключатель.xlsm','dekraft',31);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f9c03ff4b89e18e6cb','Автоматический_выключатель','Dekraft','21228DEK','Выключатель автоматический защиты двигвателя, ВА-431-4A-6,3A','ВА-431','{"кол-во полюсов":3,"номинал, А":6.3,"номинал-мин":4}',3337920000,'RUB','Автоматический_выключатель.xlsm','dekraft',32);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-23d12eac88b88ace1c','Автоматический_выключатель','Dekraft','12302DEK','Выключатель автоматический, ВА-103-3P-008A-C','ВА-103','{"кол-во полюсов":"3","номинал, А":8}',1339560000,'RUB','Автоматический_выключатель.xlsm','dekraft',33);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-eea05ed52c75f978e6','Автоматический_выключатель','Dekraft','12286DEK','Выключатель автоматический, ВА-103-2P-008A-C','ВА-103','{"кол-во полюсов":2,"номинал, А":8}',782330000,'RUB','Автоматический_выключатель.xlsm','dekraft',34);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6dffb8e7150bf89c67','Автоматический_выключатель','Dekraft','12270DEK','Выключатель автоматический, ВА-103-1P-008A-C','ВА-103','{"кол-во полюсов":1,"номинал, А":8}',329950000,'RUB','Автоматический_выключатель.xlsm','dekraft',35);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-75ae17184d8014d88c','Автоматический_выключатель','Dekraft','12303DEK','Выключатель автоматический, ВА-103-3P-010А-C','ВА-103','{"кол-во полюсов":3,"номинал, А":10}',1410930000,'RUB','Автоматический_выключатель.xlsm','dekraft',36);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2c6b78ee1e6e363f3e','Автоматический_выключатель','Dekraft','12287DEK','Выключатель автоматический, ВА-103-2P-010А-C','ВА-103','{"кол-во полюсов":2,"номинал, А":10}',723030000,'RUB','Автоматический_выключатель.xlsm','dekraft',37);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-39736887ef0778de12','Автоматический_выключатель','Dekraft','12271DEK','Выключатель автоматический, ВА-103-1P-010А-C','ВА-103','{"кол-во полюсов":1,"номинал, А":10}',322260000,'RUB','Автоматический_выключатель.xlsm','dekraft',38);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ab81872ea69db66ee2','Автоматический_выключатель','Dekraft','16051DEK','Выключатель Диф. автоматический, ДИФ-103','ДИФ-103','{"кол-во полюсов":"1+N","номинал, А":10}',1652490000,'RUB','Автоматический_выключатель.xlsm','dekraft',39);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-522b0b681c623d6aec','Автоматический_выключатель','Dekraft','16051DEK','Выключатель Диф. автоматический, ДИФ103-4.5кА-1N-010A-030-C','ДИФ-103','{"кол-во полюсов":2,"номинал, А":10}',1652490000,'RUB','Автоматический_выключатель.xlsm','dekraft',40);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d9b4768c7d4b500b82','Автоматический_выключатель','Dekraft','21229DEK','Выключатель автоматический защиты двигвателя, ВА-431-6,0A-10,0A','ВА-431','{"кол-во полюсов":3,"номинал, А":10,"номинал-мин":6}',3337920000,'RUB','Автоматический_выключатель.xlsm','dekraft',41);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d18800c05e437d0d9b','Автоматический_выключатель','Dekraft','15156DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":10}',1031020000,'RUB','Автоматический_выключатель.xlsm','dekraft',42);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-24c21de581847f1818','Автоматический_выключатель','Dekraft','15137DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":10}',2366190000,'RUB','Автоматический_выключатель.xlsm','dekraft',43);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3076a94ea5d84498fa','Автоматический_выключатель','Dekraft','15051DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":10}',2141100000,'RUB','Автоматический_выключатель.xlsm','dekraft',44);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-71df87e59c08fd2f93','Автоматический_выключатель','Dekraft','15072DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":10}',2953620000,'RUB','Автоматический_выключатель.xlsm','dekraft',45);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5ccc7973dfc384743d','Автоматический_выключатель','Dekraft','12304DEK','Выключатель автоматический, ВА-103-3P-013A-C','ВА-103','{"кол-во полюсов":"3","номинал, А":13,"номинал-мин":4}',1410930000,'RUB','Автоматический_выключатель.xlsm','dekraft',46);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-186bc20dcc33d4debb','Автоматический_выключатель','Dekraft','12272DEK','Выключатель автоматический, ВА-103-1P-013A-C','ВА-103','{"кол-во полюсов":1,"номинал, А":13,"номинал-мин":350}',329950000,'RUB','Автоматический_выключатель.xlsm','dekraft',47);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1da6ff9e05c5354830','Автоматический_выключатель','Dekraft','12288DEK','Выключатель автоматический, ВА-103-2P-013A-C','ВА-103','{"кол-во полюсов":2,"номинал, А":13}',782330000,'RUB','Автоматический_выключатель.xlsm','dekraft',48);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b44b5045f9d3bcb561','Автоматический_выключатель','Dekraft','21230DEK','Выключатель автоматический защиты двигвателя, ВА-431-9,0A-14,0A','ВА-431','{"кол-во полюсов":3,"номинал, А":14}',3337920000,'RUB','Автоматический_выключатель.xlsm','dekraft',49);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0f417128222c499e95','Автоматический_выключатель','Dekraft','12305DEK','Выключатель автоматический, ВА-103-3P-016А-C','ВА-103','{"кол-во полюсов":3,"номинал, А":16}',1383480000,'RUB','Автоматический_выключатель.xlsm','dekraft',50);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c56a228407704c7529','Автоматический_выключатель','Dekraft','12289DEK','Выключатель автоматический, ВА-103-2P-016А-C','ВА-103','{"кол-во полюсов":2,"номинал, А":16}',753780000,'RUB','Автоматический_выключатель.xlsm','dekraft',51);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c8c6caa20c59ca2a39','Автоматический_выключатель','Dekraft','12273DEK','Выключатель автоматический, ВА-103-1P-016А-C','ВА-103','{"кол-во полюсов":1,"номинал, А":16}',311280000,'RUB','Автоматический_выключатель.xlsm','dekraft',52);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3c3334c5327d4d1ca9','Автоматический_выключатель','Dekraft','16052DEK','Выключатель Диф. автоматический, ДИФ103-4.5кА-1N-016A-030-C','ДИФ-103','{"кол-во полюсов":2,"номинал, А":16}',1421910000,'RUB','Автоматический_выключатель.xlsm','dekraft',53);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9b3bd089b631bab6b9','Автоматический_выключатель','Dekraft','15157DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":16}',983260000,'RUB','Автоматический_выключатель.xlsm','dekraft',54);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5ad259994d7b0cfaa0','Автоматический_выключатель','Dekraft','15138DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":16}',3381840000,'RUB','Автоматический_выключатель.xlsm','dekraft',55);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ce4a577ad32ee3907b','Автоматический_выключатель','Dekraft','15052DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":16}',1976400000,'RUB','Автоматический_выключатель.xlsm','dekraft',56);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-480285fb5a425ca21c','Автоматический_выключатель','Dekraft','15073DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":16}',2750490000,'RUB','Автоматический_выключатель.xlsm','dekraft',57);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7255a9392530ca61b9','Автоматический_выключатель','Dekraft','21231DEK','Выключатель автоматический защиты двигвателя, ВА-431-13,0A-18,0A','ВА-431','{"кол-во полюсов":3,"номинал, А":18}',3376350000,'RUB','Автоматический_выключатель.xlsm','dekraft',58);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1da00677d3aa1cde5f','Автоматический_выключатель','Dekraft','12306DEK','Выключатель автоматический, ВА-103-3P-020А-C','ВА-103','{"кол-во полюсов":3,"номинал, А":20}',1394460000,'RUB','Автоматический_выключатель.xlsm','dekraft',59);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b45cb7e381263f4a55','Автоматический_выключатель','Dekraft','12290DEK','Выключатель автоматический, ВА-103-2P-020А-C','ВА-103','{"кол-во полюсов":2,"номинал, А":20}',676920000,'RUB','Автоматический_выключатель.xlsm','dekraft',60);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-33af19edb6cbabac05','Автоматический_выключатель','Dekraft','12274DEK','Выключатель автоматический, ВА-103-1P-020А-C','ВА-103','{"кол-во полюсов":1,"номинал, А":20}',345870000,'RUB','Автоматический_выключатель.xlsm','dekraft',61);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-31eeeea76107cde507','Автоматический_выключатель','Dekraft','15158DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":20}',1017850000,'RUB','Автоматический_выключатель.xlsm','dekraft',62);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b4ee3e2c2a8e2a520d','Автоматический_выключатель','Dekraft','15139DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":20}',3140280000,'RUB','Автоматический_выключатель.xlsm','dekraft',63);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-85b48fcda9a9b645f0','Автоматический_выключатель','Dekraft','15053DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":20}',2080710000,'RUB','Автоматический_выключатель.xlsm','dekraft',64);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-00e87f7a7a922dce88','Автоматический_выключатель','Dekraft','15074DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":20}',2882250000,'RUB','Автоматический_выключатель.xlsm','dekraft',65);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-27d9f1dc2a36906a52','Автоматический_выключатель','Dekraft','21232DEK','Выключатель автоматический защиты двигвателя, ВА-431-17,0A-23,0A','ВА-431','{"кол-во полюсов":3,"номинал, А":23}',3392820000,'RUB','Автоматический_выключатель.xlsm','dekraft',66);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7d6e217d91f16f7e08','Автоматический_выключатель','Dekraft','12307DEK','Выключатель автоматический, ВА-103-3P-25А-C','ВА-103','{"кол-во полюсов":3,"номинал, А":25}',1207800000,'RUB','Автоматический_выключатель.xlsm','dekraft',67);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cc61fb9b8dc57bd808','Автоматический_выключатель','Dekraft','12292DEK','Выключатель автоматический, ВА-103-2P-25А-C','ВА-103','{"кол-во полюсов":2,"номинал, А":25}',828440000,'RUB','Автоматический_выключатель.xlsm','dekraft',68);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4a16610a8d7638cdbe','Автоматический_выключатель','Dekraft','12276DEK','Выключатель автоматический, ВА-103-1P-025А-C','ВА-103','{"кол-во полюсов":1,"номинал, А":25}',378810000,'RUB','Автоматический_выключатель.xlsm','dekraft',69);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a7322be56ba90b7f0a','Автоматический_выключатель','Dekraft','21233DEK','Выключатель автоматический защиты двигвателя, ВА-431-20,0A-25,0A','ВА-431','{"кол-во полюсов":3,"номинал, А":25}',3392820000,'RUB','Автоматический_выключатель.xlsm','dekraft',70);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d00c1b79c8520e8638','Автоматический_выключатель','Dekraft','15159DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":25}',983260000,'RUB','Автоматический_выключатель.xlsm','dekraft',71);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-952afe86c4c4f02554','Автоматический_выключатель','Dekraft','15140DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":25}',2909700000,'RUB','Автоматический_выключатель.xlsm','dekraft',72);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0a793c28998346dc6b','Автоматический_выключатель','Dekraft','15054DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":25}',1976400000,'RUB','Автоматический_выключатель.xlsm','dekraft',73);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0ac2020563eb1a0e2e','Автоматический_выключатель','Dekraft','15075DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":25}',2750490000,'RUB','Автоматический_выключатель.xlsm','dekraft',74);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-06e20d92dae6b167c2','Автоматический_выключатель','Dekraft','12308DEK','Выключатель автоматический, ВА-103-3P-032А-C','ВА-103','{"кол-во полюсов":3,"номинал, А":32}',1295640000,'RUB','Автоматический_выключатель.xlsm','dekraft',75);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c4928fb8ba33d8216e','Автоматический_выключатель','Dekraft','12291DEK','Выключатель автоматический, ВА-103-2P-032А-C','ВА-103','{"кол-во полюсов":2,"номинал, А":32}',775740000,'RUB','Автоматический_выключатель.xlsm','dekraft',76);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b588790766b58aa837','Автоматический_выключатель','Dekraft','12275DEK','Выключатель автоматический, ВА-103-1P-032А-C','ВА-103','{"кол-во полюсов":1,"номинал, А":32}',335440000,'RUB','Автоматический_выключатель.xlsm','dekraft',77);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-177ca85e3cf11b0628','Автоматический_выключатель','Dekraft','21234DEK','Выключатель автоматический защиты двигвателя, ВА-431-24,0A-32,0A','ВА-431','{"кол-во полюсов":3,"номинал, А":32}',3464190000,'RUB','Автоматический_выключатель.xlsm','dekraft',78);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e92d4fc01019c8d66d','Автоматический_выключатель','Dekraft','15160DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":32}',994240000,'RUB','Автоматический_выключатель.xlsm','dekraft',79);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7e566f1ccb03e21d38','Автоматический_выключатель','Dekraft','15141DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":32}',3046950000,'RUB','Автоматический_выключатель.xlsm','dekraft',80);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c4ac77d15e3a999d4a','Автоматический_выключатель','Dekraft','15055DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":32}',2108160000,'RUB','Автоматический_выключатель.xlsm','dekraft',81);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e1e40d70b4d2f396af','Автоматический_выключатель','Dekraft','15076DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":32}',2931660000,'RUB','Автоматический_выключатель.xlsm','dekraft',82);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3bd9cae9e571a84fb3','Автоматический_выключатель','Dekraft','12309DEK','Выключатель автоматический, ВА-103-3P-40А-C','ВА-103','{"кол-во полюсов":3,"номинал, А":40}',1372500000,'RUB','Автоматический_выключатель.xlsm','dekraft',83);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-be922b92408a91bdbc','Автоматический_выключатель','Dekraft','12293DEK','Выключатель автоматический, ВА-103-2P-40А-C','ВА-103','{"кол-во полюсов":2,"номинал, А":40}',819110000,'RUB','Автоматический_выключатель.xlsm','dekraft',84);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a96d4a25e73667501d','Автоматический_выключатель','Dekraft','12277DEK','Выключатель автоматический, ВА-103-1P-040А-C','ВА-103','{"кол-во полюсов":1,"номинал, А":40}',379910000,'RUB','Автоматический_выключатель.xlsm','dekraft',85);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-36ec874fb11fa319e6','Автоматический_выключатель','Dekraft','21240DEK','Выключатель автоматический защиты двигвателя, ВА-432-25,0A-40,0A','ВА-432','{"кол-во полюсов":3,"номинал, А":40}',10046700000,'RUB','Автоматический_выключатель.xlsm','dekraft',86);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fd0e5390bb69f4312a','Автоматический_выключатель','Dekraft','15161DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":40}',1017850000,'RUB','Автоматический_выключатель.xlsm','dekraft',87);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d67e30e4f27f4938d3','Автоматический_выключатель','Dekraft','15142DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":40}',2909700000,'RUB','Автоматический_выключатель.xlsm','dekraft',88);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0e02dfbcccf7d8bd71','Автоматический_выключатель','Dekraft','15056DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":40}',2168550000,'RUB','Автоматический_выключатель.xlsm','dekraft',89);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-606756053103850ad5','Автоматический_выключатель','Dekraft','15077DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":40}',3003030000,'RUB','Автоматический_выключатель.xlsm','dekraft',90);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2291b365716f7aedfd','Автоматический_выключатель','Dekraft','12310DEK','Выключатель автоматический, ВА-103-3P-50А-C','ВА-103','{"кол-во полюсов":3,"номинал, А":50}',1410930000,'RUB','Автоматический_выключатель.xlsm','dekraft',91);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a5e168297e0fd2c25e','Автоматический_выключатель','Dekraft','12294DEK','Выключатель автоматический, ВА-103-2P-50А-C','ВА-103','{"кол-во полюсов":2,"номинал, А":50}',834480000,'RUB','Автоматический_выключатель.xlsm','dekraft',92);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d7de5e44fae83d18c3','Автоматический_выключатель','Dekraft','12278DEK','Выключатель автоматический, ВА-103-1P-050А-C','ВА-103','{"кол-во полюсов":1,"номинал, А":50}',409550000,'RUB','Автоматический_выключатель.xlsm','dekraft',93);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b8758eeaca2b82804a','Автоматический_выключатель','Dekraft','15162DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":50}',1213290000,'RUB','Автоматический_выключатель.xlsm','dekraft',94);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c88495ad157773b5b3','Автоматический_выключатель','Dekraft','15143DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":50}',3118320000,'RUB','Автоматический_выключатель.xlsm','dekraft',95);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5117f8c5c497713d31','Автоматический_выключатель','Dekraft','15057DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":50}',2541870000,'RUB','Автоматический_выключатель.xlsm','dekraft',96);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-47848f84dbb069d260','Автоматический_выключатель','Dekraft','15078DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":50}',3502620000,'RUB','Автоматический_выключатель.xlsm','dekraft',97);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-859b5165f9e8e44551','Автоматический_выключатель','Dekraft','12311DEK','Выключатель автоматический, ВА-103-3P-63А-C','ВА-103','{"кол-во полюсов":3,"номинал, А":63}',1504260000,'RUB','Автоматический_выключатель.xlsm','dekraft',98);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-be4b3faa2f68af35b0','Автоматический_выключатель','Dekraft','12295DEK','Выключатель автоматический, ВА-103-2P-63А-C','ВА-103','{"кол-во полюсов":2,"номинал, А":63}',888280000,'RUB','Автоматический_выключатель.xlsm','dekraft',99);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5179f47de32dab4f58','Автоматический_выключатель','Dekraft','12279DEK','Выключатель автоматический, ВА-103-1P-063А-C','ВА-103','{"кол-во полюсов":1,"номинал, А":63}',391990000,'RUB','Автоматический_выключатель.xlsm','dekraft',100);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e2f2f987319c87f593','Автоматический_выключатель','Dekraft','21241DEK','Выключатель автоматический защиты двигвателя, ВА-432-40,0A-63,0A','ВА-432','{"кол-во полюсов":3,"номинал, А":63}',10046700000,'RUB','Автоматический_выключатель.xlsm','dekraft',101);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c4939e65f315056125','Автоматический_выключатель','Dekraft','15163DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":2,"номинал, А":63}',1240740000,'RUB','Автоматический_выключатель.xlsm','dekraft',102);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2ac797b54b3e64f19d','Автоматический_выключатель','Dekraft','15058DEK','Выключатель Диф. автоматический, ДИФ-101','ДИФ-101','{"кол-во полюсов":4,"номинал, А":63}',2541870000,'RUB','Автоматический_выключатель.xlsm','dekraft',103);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ff4c750e550655c491','Автоматический_выключатель','Dekraft','13020DEK','Выключатель автоматический, ВА-201','ВА-201','{"кол-во полюсов":3,"номинал, А":80}',3595950000,'RUB','Автоматический_выключатель.xlsm','dekraft',104);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-134f219292fbd6201a','Автоматический_выключатель','Dekraft','21242DEK','Выключатель автоматический защиты двигвателя, ВА-432-63,0A-80,0A','ВА-432','{"кол-во полюсов":3,"номинал, А":80}',10046700000,'RUB','Автоматический_выключатель.xlsm','dekraft',105);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cb991876790f962429','Автоматический_выключатель','Dekraft','22810DEK','Выключатель автоматический защиты двигателя, ВА-303M-3P-0100A','ВА-303M','{"кол-во полюсов":3,"номинал, А":100}',8289900000,'RUB','Автоматический_выключатель.xlsm','dekraft',106);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-448ed56efa7cd4cce1','Автоматический_выключатель','Dekraft','13021DEK','Выключатель автоматический, ВА-201','ВА-201','{"кол-во полюсов":3,"номинал, А":100}',3579480000,'RUB','Автоматический_выключатель.xlsm','dekraft',107);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-aa5cf4e92a9a61f455','Автоматический_выключатель','Dekraft','13031DEK','Выключатель автоматический, ВА-201','ВА-201','{"кол-во полюсов":3,"номинал, А":125}',4155930000,'RUB','Автоматический_выключатель.xlsm','dekraft',108);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d58ebfcff99802b9b6','Автоматический_выключатель','Dekraft','22812DEK','Выключатель автоматический защиты двигателя, ВА-303M-3P-0160A','ВА-303M','{"кол-во полюсов":3,"номинал, А":160}',9497700000,'RUB','Автоматический_выключатель.xlsm','dekraft',109);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-159e9aad9cf0c6c2ac','Автоматический_выключатель','Dekraft','22752DEK','Выключатель автоматический, ВА-303-3P-0160A','ВА-303','{"кол-во полюсов":3,"номинал, А":160}',8235000000,'RUB','Автоматический_выключатель.xlsm','dekraft',110);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ad19d54062d18b222c','Автоматический_выключатель','Dekraft','22753DEK','Выключатель автоматический, ВА-303-3P-0180A','ВА-303','{"кол-во полюсов":3,"номинал, А":180}',10266300000,'RUB','Автоматический_выключатель.xlsm','dekraft',111);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-acfc83511b6b70a926','Автоматический_выключатель','Dekraft','22813DEK','Выключатель автоматический защиты двигателя, ВА-303M-3P-0180A','ВА-303M','{"кол-во полюсов":3,"номинал, А":180}',12407400000,'RUB','Автоматический_выключатель.xlsm','dekraft',112);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-20ef8b566518e7730d','Автоматический_выключатель','Dekraft','22754DEK','Выключатель автоматический, ВА-303-3P-0200A','ВА-303','{"кол-во полюсов":3,"номинал, А":200}',10266300000,'RUB','Автоматический_выключатель.xlsm','dekraft',113);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f792b8ee71ada563d7','Автоматический_выключатель','Dekraft','22814DEK','Выключатель автоматический защиты двигателя, ВА-303M-3P-0200A','ВА-303M','{"кол-во полюсов":3,"номинал, А":200}',12407400000,'RUB','Автоматический_выключатель.xlsm','dekraft',114);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7b8c28fa7105561d60','Автоматический_выключатель','Dekraft','22755DEK','Выключатель автоматический, ВА-303-3P-0225A','ВА-303','{"кол-во полюсов":3,"номинал, А":225}',10321200000,'RUB','Автоматический_выключатель.xlsm','dekraft',115);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b5438bf360e95bb318','Автоматический_выключатель','Dekraft','22815DEK','Выключатель автоматический защиты двигателя, ВА-303M-3P-0225A','ВА-303M','{"кол-во полюсов":3,"номинал, А":225}',12407400000,'RUB','Автоматический_выключатель.xlsm','dekraft',116);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7f1fecf1e4b8a34e5f','Автоматический_выключатель','Dekraft','22756DEK','Выключатель автоматический, ВА-303-3P-0250A','ВА-303','{"кол-во полюсов":3,"номинал, А":250}',10321200000,'RUB','Автоматический_выключатель.xlsm','dekraft',117);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-88cb4872b27606dbfd','Автоматический_выключатель','Dekraft','22816DEK','Выключатель автоматический защиты двигателя, ВА-303M-3P-0250A','ВА-303M','{"кол-во полюсов":3,"номинал, А":250}',12407400000,'RUB','Автоматический_выключатель.xlsm','dekraft',118);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fe9169d1e53402fdd7','Автоматический_выключатель','Dekraft','22760DEK','Выключатель автоматический, ВА-305-3P-0315A','ВА-305','{"кол-во полюсов":3,"номинал, А":315}',22563900000,'RUB','Автоматический_выключатель.xlsm','dekraft',119);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-629d4d1d224023d00e','Автоматический_выключатель','Dekraft','22820DEK','Выключатель автоматический защиты двигателя, ВА-305М-3P-0315A','ВА-305M','{"кол-во полюсов":3,"номинал, А":315}',24759900000,'RUB','Автоматический_выключатель.xlsm','dekraft',120);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-90042fa0ca91c43529','Автоматический_выключатель','Dekraft','22761DEK','Выключатель автоматический, ВА-305-3P-0350A','ВА-305','{"кол-во полюсов":3,"номинал, А":350}',22563900000,'RUB','Автоматический_выключатель.xlsm','dekraft',121);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-da07e349d767431a04','Автоматический_выключатель','Dekraft','22821DEK','Выключатель автоматический защиты двигателя, ВА-305М-3P-0350A','ВА-305M','{"кол-во полюсов":3,"номинал, А":350}',24759900000,'RUB','Автоматический_выключатель.xlsm','dekraft',122);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4f56def96ef0a09b1c','Автоматический_выключатель','Dekraft','22822DEK','Выключатель автоматический защиты двигателя, ВА-305M-3P-0400A','ВА-305M','{"кол-во полюсов":3,"номинал, А":400}',24759900000,'RUB','Автоматический_выключатель.xlsm','dekraft',123);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fa1ca1c9d79c8d832e','Автоматический_выключатель','Dekraft','22762DEK','Выключатель автоматический, ВА-305-3P-0400A','ВА-305','{"кол-во полюсов":3,"номинал, А":400}',22563900000,'RUB','Автоматический_выключатель.xlsm','dekraft',124);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a51deadaa6404dbe46','Автоматический_выключатель','Dekraft','22823DEK','Выключатель автоматический защиты двигателя, ВА-305M-3P-0500A','ВА-305M','{"кол-во полюсов":3,"номинал, А":500}',41669100000,'RUB','Автоматический_выключатель.xlsm','dekraft',125);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7e205ff25efb6e212e','Автоматический_выключатель','Dekraft','22763DEK','Выключатель автоматический, ВА-305-3P-0500A','ВА-305','{"кол-во полюсов":3,"номинал, А":500}',38045700000,'RUB','Автоматический_выключатель.xlsm','dekraft',126);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f8503d37f64c690a72','Автоматический_выключатель','Dekraft','22824DEK','Выключатель автоматический защиты двигателя, ВА-305M-3P-0630A','ВА-305M','{"кол-во полюсов":3,"номинал, А":630}',41669100000,'RUB','Автоматический_выключатель.xlsm','dekraft',127);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5b6fd32febeaae1c63','Автоматический_выключатель','Dekraft','22765DEK','Выключатель автоматический, ВА-306-3P-0630A','ВА-306','{"кол-во полюсов":3,"номинал, А":630}',34038000000,'RUB','Автоматический_выключатель.xlsm','dekraft',128);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a0f17e09fb2c81bbc8','Автоматический_выключатель','Dekraft','22508DEK','Выключатель автоматический, ВА-336Е-3Р-800А','ВА-336Е','{"кол-во полюсов":3,"номинал, А":800}',131760000000,'RUB','Автоматический_выключатель.xlsm','dekraft',129);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-aab5c2cc9357a2848e','Автоматический_выключатель','Dekraft','27049DEK','Выключатель автоматический, ВА-731-3P-1250A-D-M','ВА-731','{"кол-во полюсов":3,"номинал, А":1250}',497760000000,'RUB','Автоматический_выключатель.xlsm','dekraft',130);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-45efe225bc6da1d1d8','Автоматический_выключатель','Dekraft','22510DEK','Выключатель автоматический, ВА-338Е-3Р-1600А','ВА-338Е','{"кол-во полюсов":3,"номинал, А":1600}',272670000000,'RUB','Автоматический_выключатель.xlsm','dekraft',131);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2b7b35565690a9d564','Автоматический_выключатель','Dekraft','21222DEK','Выключатель автоматический защиты двигвателя, ВА-431-0.25A-0.4A','ВА-431','{"кол-во полюсов":3,"номинал, А":"0,4","номинал-мин":0.25}',3261060000,'RUB','Автоматический_выключатель.xlsm','dekraft',132);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2ecc5b263120579834','Автоматический_выключатель','Dekraft','21223DEK','Выключатель автоматический защиты двигвателя, ВА-431-0.4A-0.63A','ВА431','{"кол-во полюсов":3,"номинал, А":"0,63","номинал-мин":0.4}',3261060000,'RUB','Автоматический_выключатель.xlsm','dekraft',133);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8e2b17c9f45fe34125','Автоматический_выключатель','Dekraft','21224DEK','Выключатель автоматический защиты двигвателя, ВА-431-0.63A-1,0A','ВА431','{"кол-во полюсов":3,"номинал, А":"1,0","номинал-мин":0.63}',3057930000,'RUB','Автоматический_выключатель.xlsm','dekraft',134);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3a41b435d12abc8272','Автоматический_выключатель','Dekraft','21269DEK','Вспомогательный контакт фронтальный, ДК-431F 1NO, 1NC','ДК-431F','{"кол-во полюсов":"-","номинал, А":"1НО+1НЗ"}',1180350000,'RUB','Автоматический_выключатель.xlsm','dekraft',135);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f1f4e75394d87235a0','Автоматический_выключатель','Dekraft','22854DEK','Вспомогательный контакт боковой левый, ДК-302-2НО2НЗ-L','ДК-302','{"кол-во полюсов":"-","номинал, А":"2NOC"}',1416420000,'RUB','Автоматический_выключатель.xlsm','dekraft',136);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d3d2a91e02aac989da','Автоматический_выключатель','Dekraft','22860DEK','Контакт дополнительный левый 2НО2НЗ ВА-305','2НО2НЗ','{"кол-во полюсов":"-","номинал, А":"2NOC"}',2448540000,'RUB','Автоматический_выключатель.xlsm','dekraft',137);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cf36d20651a2aa0d84','Автоматический_выключатель','Dekraft','28186DEK','Контакт дополнительный сигнальный левый ДК-СК-333','ДК-СК-333','{"кол-во полюсов":"-","номинал, А":"2NOC"}',3821040000,'RUB','Автоматический_выключатель.xlsm','dekraft',138);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1db343ef958f27a250','Автоматический_выключатель','Dekraft','22577DEK','Контакт дополнительный и сигнальный левый ВА-333E','ДК-СК-333E','{"кол-во полюсов":"-","номинал, А":"2NOC"}',2921900000,'RUB','Автоматический_выключатель.xlsm','dekraft',139);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-bd1d474f0c542149ec','Автоматический_выключатель','Dekraft','21270DEK','Вспомогательный контакт боковой, ДК-431 2NO','ДК-431','{"кол-во полюсов":"-","номинал, А":"2НО"}',1174860000,'RUB','Автоматический_выключатель.xlsm','dekraft',140);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1672b52771bf59975e','Автоматический_выключатель','Dekraft','18100DEK','Вспомогательный контакт (вкл./выкл.), ДК-101','-','{"кол-во полюсов":"-"}',1066300000,'RUB','Автоматический_выключатель.xlsm','dekraft',141);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-636af4d2e3ff0aabbc','Автоматический_выключатель','Dekraft','18101DEK','Вспомогательный контакт (норма/авария), СК-101','-','{"кол-во полюсов":"-"}',1323720000,'RUB','Автоматический_выключатель.xlsm','dekraft',142);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-afe4eeeb32aa2ed27c','Автоматический_выключатель','Dekraft','22526DEK','Шины выносные комп. 6 шт. ВА-338E 3P','3п','{"кол-во полюсов":"-"}',42575700000,'RUB','Автоматический_выключатель.xlsm','dekraft',143);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a22d2eef7174f9a029','Автоматический_выключатель','Dekraft','22524DEK','Шины выносные комп. 3 шт. ВА-336E 3P','3п','{"кол-во полюсов":"-"}',13602270000,'RUB','Автоматический_выключатель.xlsm','dekraft',144);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-06cf174c890661a70d','Автоматический_выключатель','Dekraft','22522DEK','Шины выносные комп. 3 шт. ВА-335E 3P','3п','{"кол-во полюсов":"-"}',5934980000,'RUB','Автоматический_выключатель.xlsm','dekraft',145);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-dfd1f002b28d26a724','Автоматический_выключатель','Dekraft','22945DEK','Шины выносные комп. 3 шт. ВА-303 3P','3п','{"кол-во полюсов":"-"}',2096730000,'RUB','Автоматический_выключатель.xlsm','dekraft',146);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-06916fa0483a070952','Автоматический_выключатель','Dekraft','28236DEK','Шины выносные для ВА-335 комп. 3 шт. 3P ШВ-335','3п','{"кол-во полюсов":"-"}',8619190000,'RUB','Автоматический_выключатель.xlsm','dekraft',147);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-847f0ec42c580656fe','Автоматический_выключатель','Dekraft','28173DEK','Шины выносные для ВА-332 комп. 3 шт. 3P ШВ-332','3п','{"кол-во полюсов":"-"}',1937790000,'RUB','Автоматический_выключатель.xlsm','dekraft',148);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-11beb1c92e5167542f','Автоматический_выключатель','Dekraft','28193DEK','Шины выносные для ВА-333 комп. 3 шт. 3P ШВ-333','3п','{"кол-во полюсов":"-"}',3747210000,'RUB','Автоматический_выключатель.xlsm','dekraft',149);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6b1027fe933896bb01','Автоматический_выключатель','Dekraft','22947DEK','Шины выносные комп. 3 шт. ВА-305 3P','3п','{"кол-во полюсов":"-"}',4706930000,'RUB','Автоматический_выключатель.xlsm','dekraft',150);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fbf23d2e7b4dd95631','Автоматический_выключатель','Dekraft','22949DEK','Шины выносные комп. 3 шт. ВА-306 3P','3п','{"кол-во полюсов":"-"}',9047090000,'RUB','Автоматический_выключатель.xlsm','dekraft',151);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4338c6a66e63366793','Автоматический_выключатель','Dekraft','22565DEK','Контакт дополнительный левый 2НО2НЗ ВА-336E','2NO 2NC','{"кол-во полюсов":"-"}',3690310000,'RUB','Автоматический_выключатель.xlsm','dekraft',152);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-45c83e8f0b9a56d2d0','Автоматический_выключатель','Dekraft','22583DEK','Контакт дополнительный и сигнальный левый ВА-336E','1NO 1NC','{"кол-во полюсов":"-"}',3269420000,'RUB','Автоматический_выключатель.xlsm','dekraft',153);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3c27a7ee432cdf47c0','Автоматический_выключатель','Dekraft','22580DEK','Контакт дополнительный и сигнальный левый ВА-335E','1NO 1NC','{"кол-во полюсов":"-"}',3208420000,'RUB','Автоматический_выключатель.xlsm','dekraft',154);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-01c8b0bf4ba5af4588','Автоматический_выключатель','Dekraft','22840DEK','Дополнительный контакт левый (вкл./выкл.), ДК-302','ДК-302','{"кол-во полюсов":"1 NO 1 NC"}',913270000,'RUB','Автоматический_выключатель.xlsm','dekraft',155);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c5af631b408330440b','Автоматический_выключатель','Dekraft','22883DEK','Контакт дополнительный и сигнальный, ДК-СК-303','ДК-СК-303','{"кол-во полюсов":"2NO, 2NC"}',1784970000,'RUB','Автоматический_выключатель.xlsm','dekraft',156);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fb4bdf3b43085f1c9a','Автоматический_выключатель','Dekraft','22880DEK','Контакт дополнительный и сигнальный, ДК-СК-302','ДК-СК-302','{"кол-во полюсов":"2NO, 2NC"}',1369290000,'RUB','Автоматический_выключатель.xlsm','dekraft',157);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-51670d77cb7040cf8c','Автоматический_выключатель','Dekraft','28227DEK','Контакт дополнительный сигнальный левый ДК-СК-335','ДК-СК-335','{"кол-во полюсов":"2NO, 2NC"}',4095640000,'RUB','Автоматический_выключатель.xlsm','dekraft',158);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8243b57a28bb92aab9','Автоматический_выключатель','Dekraft','22843DEK','Дополнительный контакт левый (вкл./выкл.), ДК-303, 1NO, 1NC','ДК-303','{"кол-во полюсов":"1 NO 1 NC"}',1178570000,'RUB','Автоматический_выключатель.xlsm','dekraft',159);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-dcfb38060a3a0a0134','Автоматический_выключатель','Dekraft','22886DEK','Контакт дополнительный и сигнальный левый ДК-СК-305','ДК-СК-305','{"кол-во полюсов":"2NO, 2NC"}',2036110000,'RUB','Автоматический_выключатель.xlsm','dekraft',160);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ec7753da872b708dea','Автоматический_выключатель','Dekraft','28167DEK','Контакт дополнительный сигнальный левый ДК-СК-332','ДК-СК-332','{"кол-во полюсов":"2NO, 2NC"}',3429340000,'RUB','Автоматический_выключатель.xlsm','dekraft',161);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ce67f6e7d5aed2aa10','Автоматический_выключатель','Dekraft','22857DEK','Дополнительный контакт левый (вкл./выкл.), ДК-303, 2NO, 2NC','ДК-303','{"кол-во полюсов":"2NO, 2NC"}',1845000000,'RUB','Автоматический_выключатель.xlsm','dekraft',162);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ce3e48b270e0d0177a','Автоматический_выключатель','CHINT','495184','Выключатель автоматический защиты двигвателя NS2-25X 4-6.3А','NS2-25X','{"кол-во полюсов":"3","номинал, А":6.3}',4114760000,'RUB','Автоматический_выключатель.xlsm','Chint',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0132e38d2d0d2ed388','Автоматический_выключатель','Chint','819932','Выключатель Диф. автоматический, АВДТ NXBLE-63 1P+N C16 30мА тип AС 6кА','NXBLE-63','{"кол-во полюсов":1,"номинал, А":16}',20793090000,'RUB','Автоматический_выключатель.xlsm','Chint',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5ee181f780ece6182a','Автоматический_выключатель','CHINT','814020','Выключатель автоматический NXB-63 (H) (АВ) С 63А 1P 6kA','NXB-63 (H)','{"кол-во полюсов":"1","номинал, А":63}',7319050000,'RUB','Автоматический_выключатель.xlsm','Chint',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d8c8bcc0d10fd57d16','Автоматический_выключатель','CHINT','814086','Выключатель автоматический NXB-63 (H) (АВ) С 1А 2P 6kA','NXB-63 (H)','{"кол-во полюсов":"2","номинал, А":"1","номинал-мин":320}',1560550000,'RUB','Автоматический_выключатель.xlsm','Chint',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b5fad7218f12115cbe','Автоматический_выключатель','CHINT','814164','Выключатель автоматический NXB-63 (H) (АВ) С 1А 3P 6kA','NXB-63 (H)','{"кол-во полюсов":"3","номинал, А":"1","номинал-мин":400}',2445530000,'RUB','Автоматический_выключатель.xlsm','Chint',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f3ab4c4f6389583fac','Автоматический_выключатель','CHINT','814008','Выключатель автоматический NXB-63 (H) (АВ) С 1А 1P 6kA','NXB-63 (H)','{"кол-во полюсов":"1","номинал, А":"1","номинал-мин":500}',799360000,'RUB','Автоматический_выключатель.xlsm','Chint',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f87dcb6e2fe76e587b','Автоматический_выключатель','CHINT','814091','Выключатель автоматический NXB-63 (H) (АВ) С 10А 2P 6kA','NXB-63 (H)','{"кол-во полюсов":"2","номинал, А":"10"}',1508580000,'RUB','Автоматический_выключатель.xlsm','Chint',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-424edce022fe351707','Автоматический_выключатель','CHINT','814169','Выключатель автоматический NXB-63 (H) (АВ) С 10А 3P 6kA','NXB-63 (H)','{"кол-во полюсов":"3","номинал, А":"10","номинал-мин":0.1}',2382610000,'RUB','Автоматический_выключатель.xlsm','Chint',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-350634f31166107e16','Автоматический_выключатель','CHINT','814013','Выключатель автоматический NXB-63 (H) (АВ) С 10А 1P 6kA','NXB-63 (H)','{"кол-во полюсов":"1","номинал, А":"10","номинал-мин":0.16}',720460000,'RUB','Автоматический_выключатель.xlsm','Chint',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-49be0bcfa90bd233b2','Автоматический_выключатель','CHINT','816141','Выключатель автоматический NXB-125 (H) (АВ) С 10А 3P 10kA','NXB-125','{"кол-во полюсов":"3","номинал, А":"100","номинал-мин":1}',3582660000,'RUB','Автоматический_выключатель.xlsm','Chint',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-eec6e19715ca05092b','Автоматический_выключатель','CHINT','845708','Выключатель автоматический NXMS-1000H/3P, (АВ) С 1000А 3P 70kA','NXB','{"кол-во полюсов":"3","номинал, А":"1000","номинал-мин":1.6}',94169260000,'RUB','Автоматический_выключатель.xlsm','Chint',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c7660f1dd45e7ad357','Автоматический_выключатель','CHINT','816143','Выключатель автоматический NXB-125 (H) (АВ) С 125А 3P 10kA','NXB-125','{"кол-во полюсов":"3","номинал, А":"125","номинал-мин":4}',3654360000,'RUB','Автоматический_выключатель.xlsm','Chint',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e1fdd6e58e97820c2a','Автоматический_выключатель','CHINT','201719','Выключатель автоматический NXMS-1250H/3P, (АВ) С 1250А 3P 70kA','NXB','{"кол-во полюсов":"3","номинал, А":"1250","номинал-мин":6}',204763520000,'RUB','Автоматический_выключатель.xlsm','Chint',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b9fbffbb3852ce794a','Автоматический_выключатель','CHINT','814092','Выключатель автоматический NXB-63 (H) (АВ) С 16А 2P 6kA','NXB-63 (H)','{"кол-во полюсов":"2","номинал, А":"16","номинал-мин":9}',3243160000,'RUB','Автоматический_выключатель.xlsm','Chint',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-add05f06901a45eb10','Автоматический_выключатель','CHINT','814170','Выключатель автоматический NXB-63 (H) (АВ) С 16А 3P 6kA','NXB-63 (H)','{"кол-во полюсов":"3","номинал, А":"16","номинал-мин":13}',2423620000,'RUB','Автоматический_выключатель.xlsm','Chint',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5a0ac4eea854d79274','Автоматический_выключатель','CHINT','814014','Выключатель автоматический NXB-63 (H) (АВ) С 16А 1P 6kA','NXB-63 (H)','{"кол-во полюсов":"1","номинал, А":"16","номинал-мин":17}',705360000,'RUB','Автоматический_выключатель.xlsm','Chint',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-27b68ec5fe757fe730','Автоматический_выключатель','CHINT','264748','Выключатель автоматический NXMS-160F/3P, (АВ) С 160А 3P 36kA','NXB','{"кол-во полюсов":"3","номинал, А":"160","номинал-мин":20}',26888820000,'RUB','Автоматический_выключатель.xlsm','Chint',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-239bd72940051f05e5','Автоматический_выключатель','CHINT','201720','Выключатель автоматический NXMS-1600H/3P, (АВ) С 1600А 3P 70kA','NXB','{"кол-во полюсов":"3","номинал, А":"1600","номинал-мин":24}',232620950000,'RUB','Автоматический_выключатель.xlsm','Chint',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d7a41dc6bb157e8625','Автоматический_выключатель','CHINT','814087','Выключатель автоматический NXB-63 (H) (АВ) С 2А 2P 6kA','NXB-63 (H)','{"кол-во полюсов":"2","номинал, А":"2","номинал-мин":25}',1560550000,'RUB','Автоматический_выключатель.xlsm','Chint',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b977a5b404b3bb3d86','Автоматический_выключатель','CHINT','814165','Выключатель автоматический NXB-63 (H) (АВ) С 2А 3P 6kA','NXB-63 (H)','{"кол-во полюсов":"3","номинал, А":"2","номинал-мин":40}',2582810000,'RUB','Автоматический_выключатель.xlsm','Chint',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c5bd31fe18cbca094e','Автоматический_выключатель','CHINT','814009','Выключатель автоматический NXB-63 (H) (АВ) С 2А 1P 6kA','NXB-63 (H)','{"кол-во полюсов":"1","номинал, А":"2","номинал-мин":63}',784720000,'RUB','Автоматический_выключатель.xlsm','Chint',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5a3da7d30fecdaaedf','Автоматический_выключатель','CHINT','814093','Выключатель автоматический NXB-63 (H) (АВ) С 20А 2P 6kA','NXB-63 (H)','{"кол-во полюсов":"2","номинал, А":"20"}',1522570000,'RUB','Автоматический_выключатель.xlsm','Chint',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5ed7c7819ce65c82bf','Автоматический_выключатель','CHINT','814171','Выключатель автоматический NXB-63 (H) (АВ) С 20А 3P 6kA','NXB-63 (H)','{"кол-во полюсов":"3","номинал, А":"20"}',1333610000,'RUB','Автоматический_выключатель.xlsm','Chint',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e80d7f81c04afac26d','Автоматический_выключатель','CHINT','814015','Выключатель автоматический NXB-63 (H) (АВ) С 20А 1P 6kA','NXB-63 (H)','{"кол-во полюсов":"1","номинал, А":"20"}',723910000,'RUB','Автоматический_выключатель.xlsm','Chint',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9bc271e2448cef4050','Автоматический_выключатель','CHINT','264754','Выключатель автоматический NXMS-250F/3P, (АВ) С 200А 3P 36kA','NXB','{"кол-во полюсов":"3","номинал, А":"200"}',30082260000,'RUB','Автоматический_выключатель.xlsm','Chint',26);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cde7d1e7851c8ced89','Автоматический_выключатель','CHINT','814094','Выключатель автоматический NXB-63 (H) (АВ) С 25А 2P 6kA','NXB-63 (H)','{"кол-во полюсов":"2","номинал, А":"25"}',1494150000,'RUB','Автоматический_выключатель.xlsm','Chint',27);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-17dbfd5b9a186a3d4a','Автоматический_выключатель','CHINT','814172','Выключатель автоматический NXB-63 (H) (АВ) С 25А 3P 6kA','NXB-63 (H)','{"кол-во полюсов":"3","номинал, А":"25"}',2489580000,'RUB','Автоматический_выключатель.xlsm','Chint',28);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-48ed313af5ef83486e','Автоматический_выключатель','CHINT','814016','Выключатель автоматический NXB-63 (H) (АВ) С 25А 1P 6kA','NXB-63 (H)','{"кол-во полюсов":"1","номинал, А":"25"}',728900000,'RUB','Автоматический_выключатель.xlsm','Chint',29);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-47b8d2cafee0cb2c35','Автоматический_выключатель','CHINT','264755','Выключатель автоматический NXMS-250F/3P, (АВ) С 250А 3P 36kA','NXB','{"кол-во полюсов":"3","номинал, А":"250"}',42310000,'RUB','Автоматический_выключатель.xlsm','Chint',30);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d96a3d0d3f4178f5d8','Автоматический_выключатель','CHINT','814088','Выключатель автоматический NXB-63 (H) (АВ) С 3А 2P 6kA','NXB-63 (H)','{"кол-во полюсов":"2","номинал, А":"3"}',1560550000,'RUB','Автоматический_выключатель.xlsm','Chint',31);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c210f5d497b671faac','Автоматический_выключатель','CHINT','814166','Выключатель автоматический NXB-63 (H) (АВ) С 3А 3P 6kA','NXB-63 (H)','{"кол-во полюсов":"3","номинал, А":"3"}',2582810000,'RUB','Автоматический_выключатель.xlsm','Chint',32);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-54aa1deb2dfee94241','Автоматический_выключатель','CHINT','814010','Выключатель автоматический NXB-63 (H) (АВ) С 3А 1P 6kA','NXB-63 (H)','{"кол-во полюсов":"1","номинал, А":"3"}',669150000,'RUB','Автоматический_выключатель.xlsm','Chint',33);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3e1f8a52e12f08c6a1','Автоматический_выключатель','CHINT','814095','Выключатель автоматический NXB-63 (H) (АВ) С 32А 2P 6kA','NXB-63 (H)','{"кол-во полюсов":"2","номинал, А":"32"}',1575740000,'RUB','Автоматический_выключатель.xlsm','Chint',34);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-996e20aa6b537de344','Автоматический_выключатель','CHINT','814173','Выключатель автоматический NXB-63 (H) (АВ) С 32А 3P 6kA','NXB-63 (H)','{"кол-во полюсов":"3","номинал, А":"32"}',1400000000,'RUB','Автоматический_выключатель.xlsm','Chint',35);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-dcc28838a2396ed4bd','Автоматический_выключатель','CHINT','814017','Выключатель автоматический NXB-63 (H) (АВ) С 32А 1P 6kA','NXB-63 (H)','{"кол-во полюсов":"1","номинал, А":"32"}',809290000,'RUB','Автоматический_выключатель.xlsm','Chint',36);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9ed12f602c8abc9eef','Автоматический_выключатель','CHINT','814089','Выключатель автоматический NXB-63 (H) (АВ) С 4А 2P 6kA','NXB-63 (H)','{"кол-во полюсов":"2","номинал, А":"4"}',894470000,'RUB','Автоматический_выключатель.xlsm','Chint',37);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9032ae90e62741a278','Автоматический_выключатель','CHINT','814167','Выключатель автоматический NXB-63 (H) (АВ) С 4А 3P 6kA','NXB-63 (H)','{"кол-во полюсов":"3","номинал, А":"4"}',2582810000,'RUB','Автоматический_выключатель.xlsm','Chint',38);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a86c1e2033b620aaaa','Автоматический_выключатель','CHINT','814011','Выключатель автоматический NXB-63 (H) (АВ) С 4А 1P 6kA','NXB-63 (H)','{"кол-во полюсов":"1","номинал, А":"4"}',669150000,'RUB','Автоматический_выключатель.xlsm','Chint',39);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6096ac4ac701aff27a','Автоматический_выключатель','CHINT','814096','Выключатель автоматический NXB-63 (H) (АВ) С 40А 2P 6kA','NXB-63 (H)','{"кол-во полюсов":"2","номинал, А":"40"}',1693640000,'RUB','Автоматический_выключатель.xlsm','Chint',40);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-59bb082bfd2a29a41c','Автоматический_выключатель','CHINT','814174','Выключатель автоматический NXB-63 (H) (АВ) С 40А 3P 6kA','NXB-63 (H)','{"кол-во полюсов":"3","номинал, А":"40"}',2719660000,'RUB','Автоматический_выключатель.xlsm','Chint',41);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0c53952e8f6d35a38b','Автоматический_выключатель','CHINT','814018','Выключатель автоматический NXB-63 (H) (АВ) С 40А 1P 6kA','NXB-63 (H)','{"кол-во полюсов":"1","номинал, А":"40"}',854290000,'RUB','Автоматический_выключатель.xlsm','Chint',42);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-36487d586ac9b1f4fc','Автоматический_выключатель','CHINT','845726','Выключатель автоматический NXMS-400H/3P, (АВ) С 400А 3P 70kA','NXB','{"кол-во полюсов":"3","номинал, А":"400"}',129880000,'RUB','Автоматический_выключатель.xlsm','Chint',43);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fa14d1b910f48bf890','Автоматический_выключатель','CHINT','814097','Выключатель автоматический NXB-63 (H) (АВ) С 50А 2P 6kA','NXB-63 (H)','{"кол-во полюсов":"2","номинал, А":"50"}',1809440000,'RUB','Автоматический_выключатель.xlsm','Chint',44);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6a053a4ea75eaa5844','Автоматический_выключатель','CHINT','814175','Выключатель автоматический NXB-63 (H) (АВ) С 50А 3P 6kA','NXB-63 (H)','{"кол-во полюсов":"3","номинал, А":"50"}',2804790000,'RUB','Автоматический_выключатель.xlsm','Chint',45);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3053f79948dba3e23c','Автоматический_выключатель','CHINT','814019','Выключатель автоматический NXB-63 (H) (АВ) С 50А 1P 6kA','NXB-63 (H)','{"кол-во полюсов":"1","номинал, А":"50"}',483000000,'RUB','Автоматический_выключатель.xlsm','Chint',46);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c86e778794e46424cd','Автоматический_выключатель','CHINT','814090','Выключатель автоматический NXB-63 (H) (АВ) С 6А 2P 6kA','NXB-63 (H)','{"кол-во полюсов":"2","номинал, А":"6"}',1531360000,'RUB','Автоматический_выключатель.xlsm','Chint',47);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9629eaa06e05c99cf9','Автоматический_выключатель','CHINT','814168','Выключатель автоматический NXB-63 (H) (АВ) С 6А 3P 6kA','NXB-63 (H)','{"кол-во полюсов":"3","номинал, А":"6"}',2559050000,'RUB','Автоматический_выключатель.xlsm','Chint',48);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4c8411a701da9ea337','Автоматический_выключатель','CHINT','814012','Выключатель автоматический NXB-63 (H) (АВ) С 6А 1P 6kA','NXB-63 (H)','{"кол-во полюсов":"1","номинал, А":"6"}',735280000,'RUB','Автоматический_выключатель.xlsm','Chint',49);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f320342d572108aedb','Автоматический_выключатель','CHINT','814098','Выключатель автоматический NXB-63 (H) (АВ) С 63А 2P 6kA','NXB-63 (H)','{"кол-во полюсов":"2","номинал, А":"63"}',1643320000,'RUB','Автоматический_выключатель.xlsm','Chint',50);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-03c54aee42eb0ad417','Автоматический_выключатель','CHINT','814176','Выключатель автоматический NXB-63 (H) (АВ) С 63А 3P 6kA','NXB-63 (H)','{"кол-во полюсов":"3","номинал, А":"63"}',2866260000,'RUB','Автоматический_выключатель.xlsm','Chint',51);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5e5c32df02934a3429','Автоматический_выключатель','CHINT','845730','Выключатель автоматический NXMS-630H/3P, (АВ) С 630А 3P 70kA','NXB','{"кол-во полюсов":"3","номинал, А":"630"}',72046670000,'RUB','Автоматический_выключатель.xlsm','Chint',52);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c418f0c84eaae52c22','Автоматический_выключатель','CHINT','816139','Выключатель автоматический NXB-125 (H) (АВ) С 80А 3P 10kA','NXB-125','{"кол-во полюсов":"3","номинал, А":"80"}',3654360000,'RUB','Автоматический_выключатель.xlsm','Chint',53);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-62ddabb8dcadeb5c31','Автоматический_выключатель','CHINT','845707','Выключатель автоматический NXMS-1000H/3P, (АВ) С 800А 3P 70kA','NXB','{"кол-во полюсов":"3","номинал, А":"800"}',94169260000,'RUB','Автоматический_выключатель.xlsm','Chint',54);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e568e034ef4add2d1e','Автоматический_выключатель','CHINT','495968','Вспомогательный контакт поперечный, NS2,  1NO, 1NC','NS2','{"кол-во полюсов":"-","номинал, А":"1НО+1НЗ"}',589630000,'RUB','Автоматический_выключатель.xlsm','Chint',55);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-73af4e4e37bc754ad9','Автоматический_выключатель','CHINT','814990','Сигнальный контакт AL-X1 для NXB-63 (R)','NXB-63 (R)','{"кол-во полюсов":"Сигнальный контакт","номинал, А":"AL-X1"}',51358190000,'RUB','Автоматический_выключатель.xlsm','Chint',56);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3b9f6e695932740069','Автоматический_выключатель','CHINT','495072','Выключатель автоматический защиты двигвателя, NS2-25 0.1A-0.16A','NS2-25','{"кол-во полюсов":3,"номинал, А":0.16,"номинал-мин":"0,1"}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',57);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-257c3b7f8fc8bd04bf','Автоматический_выключатель','CHINT','495073','Выключатель автоматический защиты двигвателя, NS2-25 0.16A-0.25A','NS2-25','{"кол-во полюсов":3,"номинал, А":0.25,"номинал-мин":0.16}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',58);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2dab698ea89b9d01cd','Автоматический_выключатель','CHINT','495074','Выключатель автоматический защиты двигвателя, NS2-25 0.25A-0.4A','NS2-25','{"кол-во полюсов":3,"номинал, А":"0,4","номинал-мин":0.25}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',59);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9766a1f9c35af112a6','Автоматический_выключатель','CHINT','495075','Выключатель автоматический защиты двигвателя, NS2-25 0.4A-0.63A','NS2-25','{"кол-во полюсов":3,"номинал, А":"0,63","номинал-мин":0.4}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',60);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-52452886d53a5af468','Автоматический_выключатель','CHINT','495076','Выключатель автоматический защиты двигвателя, NS2-25 0.63A-1,0A','NS2-25','{"кол-во полюсов":3,"номинал, А":"1,0","номинал-мин":0.63}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',61);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-39cc3782b6dc63ee6c','Автоматический_выключатель','CHINT','495077','Выключатель автоматический защиты двигвателя, NS2-25 1,0A-1,6A','NS2-25','{"кол-во полюсов":3,"номинал, А":1.6,"номинал-мин":1}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',62);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b4d645174b78f789bf','Автоматический_выключатель','CHINT','495078','Выключатель автоматический защиты двигвателя, NS2-25 1,6A-2,5A','NS2-25','{"кол-во полюсов":3,"номинал, А":2.5,"номинал-мин":1.6}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',63);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cfae5ff0fe85df56f7','Автоматический_выключатель','CHINT','495079','Выключатель автоматический защиты двигвателя, NS2-25 2,5A-4A','NS2-25','{"кол-во полюсов":3,"номинал, А":4,"номинал-мин":2.5}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',64);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-68a276ab3bd09c1843','Автоматический_выключатель','CHINT','495080','Выключатель автоматический защиты двигвателя, NS2-25 4A-6,3A','NS2-25','{"кол-во полюсов":3,"номинал, А":6.3,"номинал-мин":4}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',65);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f39b591e3a76e5e688','Автоматический_выключатель','CHINT','495081','Выключатель автоматический защиты двигвателя, NS2-25 6,0A-10,0A','NS2-25','{"кол-во полюсов":3,"номинал, А":10,"номинал-мин":6}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',66);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d68507e595cf540166','Автоматический_выключатель','CHINT','495082','Выключатель автоматический защиты двигвателя, NS2-25 9,0A-14,0A','NS2-25','{"кол-во полюсов":3,"номинал, А":14}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',67);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3ec6452d584f75787c','Автоматический_выключатель','CHINT','495083','Выключатель автоматический защиты двигвателя, NS2-25 13,0A-18,0A','NS2-25','{"кол-во полюсов":3,"номинал, А":18}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',68);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ec47976218695d476e','Автоматический_выключатель','CHINT','495086','Выключатель автоматический защиты двигвателя, NS2-25 16,0A-25,0A','NS2-25','{"кол-во полюсов":3,"номинал, А":"25"}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',69);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2c7700f6a04c6faef8','Автоматический_выключатель','CHINT','495087','Выключатель автоматический защиты двигвателя, NS2-25 25,0A-40,0A','NS2-25','{"кол-во полюсов":3,"номинал, А":"40"}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',70);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2a47241d19955955c2','Автоматический_выключатель','CHINT','495088','Выключатель автоматический защиты двигвателя, NS2-25 40,0A-63,0A','NS2-25','{"кол-во полюсов":3,"номинал, А":"63"}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',71);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-870b8ab13ac97c564c','Автоматический_выключатель','CHINT','495089','Выключатель автоматический защиты двигвателя, NS2-25 56,0A-80,0A','NS2-25','{"кол-во полюсов":3,"номинал, А":"80"}',NULL,'RUB','Автоматический_выключатель.xlsm','Chint',72);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d82071573888316e20','Автоматический_выключатель','EKF','M636110C','Автоматический выключатель 1P 10А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"10"}',241020000,'RUB','Автоматический_выключатель.xlsm','EKF',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-651ed97303b6062a5e','Автоматический_выключатель','EKF','M636113C','Автоматический выключатель 1P 13А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"13"}',299440000,'RUB','Автоматический_выключатель.xlsm','EKF',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4b669b17dd158342fb','Автоматический_выключатель','EKF','M636116C','Автоматический выключатель 1P 16А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"16"}',228000000,'RUB','Автоматический_выключатель.xlsm','EKF',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4c08ba8d126d839a20','Автоматический_выключатель','EKF','M636101C','Автоматический выключатель 1P 1А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"1"}',300490000,'RUB','Автоматический_выключатель.xlsm','EKF',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9a3567d9c91a0c7b64','Автоматический_выключатель','EKF','M636120C','Автоматический выключатель 1P 20А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"20"}',244960000,'RUB','Автоматический_выключатель.xlsm','EKF',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-79aa6b0043d38ab01a','Автоматический_выключатель','EKF','M636125C','Автоматический выключатель 1P 25А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"25"}',230010000,'RUB','Автоматический_выключатель.xlsm','EKF',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5ffd4b56fca654eec6','Автоматический_выключатель','EKF','M636102C','Автоматический выключатель 1P 2А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"2"}',300490000,'RUB','Автоматический_выключатель.xlsm','EKF',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4bedfd83f99fd194a8','Автоматический_выключатель','EKF','M636132C','Автоматический выключатель 1P 32А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"32"}',278120000,'RUB','Автоматический_выключатель.xlsm','EKF',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-aaa1f99a5cf3ecd318','Автоматический_выключатель','EKF','M636103C','Автоматический выключатель 1P 3А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"3"}',282760000,'RUB','Автоматический_выключатель.xlsm','EKF',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5d098c3737f181226f','Автоматический_выключатель','EKF','M636140C','Автоматический выключатель 1P 40А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"40"}',293560000,'RUB','Автоматический_выключатель.xlsm','EKF',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2ecd7a7e36a665447b','Автоматический_выключатель','EKF','M636104C','Автоматический выключатель 1P 4А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"4"}',271350000,'RUB','Автоматический_выключатель.xlsm','EKF',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-68f987e8ee4f3136bc','Автоматический_выключатель','EKF','M636150C','Автоматический выключатель 1P 50А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"50"}',282700000,'RUB','Автоматический_выключатель.xlsm','EKF',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ee12c96599ea5d3199','Автоматический_выключатель','EKF','M636105C','Автоматический выключатель 1P 5А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"5"}',318920000,'RUB','Автоматический_выключатель.xlsm','EKF',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e331f113dd370dfe46','Автоматический_выключатель','EKF','M636163C','Автоматический выключатель 1P 63А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"63"}',300510000,'RUB','Автоматический_выключатель.xlsm','EKF',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e228ecc77932bdf7f3','Автоматический_выключатель','EKF','M636106C','Автоматический выключатель 1P 6А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"6"}',244000000,'RUB','Автоматический_выключатель.xlsm','EKF',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1d7af1f28b82dc6ddd','Автоматический_выключатель','EKF','M636108C','Автоматический выключатель 1P 8А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"1","номинал, А":"8"}',298490000,'RUB','Автоматический_выключатель.xlsm','EKF',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3c17f4d7d043940cd4','Автоматический_выключатель','EKF','M636210C','Автоматический выключатель 2P 10А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"10"}',568510000,'RUB','Автоматический_выключатель.xlsm','EKF',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0b791ad43a86117335','Автоматический_выключатель','EKF','M636213C','Автоматический выключатель 2P 13А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"13"}',597910000,'RUB','Автоматический_выключатель.xlsm','EKF',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-39ae27e103c6a3b75f','Автоматический_выключатель','EKF','M636216C','Автоматический выключатель 2P 16А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"16"}',511350000,'RUB','Автоматический_выключатель.xlsm','EKF',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-299f68735c3a05edd7','Автоматический_выключатель','EKF','M636201C','Автоматический выключатель 2P 1А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"1"}',594580000,'RUB','Автоматический_выключатель.xlsm','EKF',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-815f595207bf23fb47','Автоматический_выключатель','EKF','M636220C','Автоматический выключатель 2P 20А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"20"}',597910000,'RUB','Автоматический_выключатель.xlsm','EKF',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d047e4db86b7f67562','Автоматический_выключатель','EKF','M636225C','Автоматический выключатель 2P 25А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"25"}',569890000,'RUB','Автоматический_выключатель.xlsm','EKF',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-057c9f9c853f416f8b','Автоматический_выключатель','EKF','M636202C','Автоматический выключатель 2P 2А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"2"}',569950000,'RUB','Автоматический_выключатель.xlsm','EKF',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-dfd4c9e540663725f8','Автоматический_выключатель','EKF','M636232C','Автоматический выключатель 2P 32А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"32"}',534000000,'RUB','Автоматический_выключатель.xlsm','EKF',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-be0d685b0df16d0305','Автоматический_выключатель','EKF','M636203C','Автоматический выключатель 2P 3А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"3"}',599410000,'RUB','Автоматический_выключатель.xlsm','EKF',26);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-61f17b8f9d76921d02','Автоматический_выключатель','EKF','M636240C','Автоматический выключатель 2P 40А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"40"}',605640000,'RUB','Автоматический_выключатель.xlsm','EKF',27);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-443a2e3a54e7caf471','Автоматический_выключатель','EKF','M636204C','Автоматический выключатель 2P 4А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"4"}',549290000,'RUB','Автоматический_выключатель.xlsm','EKF',28);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-253367a39e69b4a918','Автоматический_выключатель','EKF','M636250C','Автоматический выключатель 2P 50А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"50"}',681240000,'RUB','Автоматический_выключатель.xlsm','EKF',29);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d590af00e88cbd6df4','Автоматический_выключатель','EKF','M636205C','Автоматический выключатель 2P 5А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"5"}',633130000,'RUB','Автоматический_выключатель.xlsm','EKF',30);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a4df86f6082f7f9e78','Автоматический_выключатель','EKF','M636263C','Автоматический выключатель 2P 63А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"63"}',627590000,'RUB','Автоматический_выключатель.xlsm','EKF',31);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-846e3c45ac8e0bf352','Автоматический_выключатель','EKF','M636206C','Автоматический выключатель 2P 6А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"6"}',615010000,'RUB','Автоматический_выключатель.xlsm','EKF',32);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-40ce9a9db6b54f9bfe','Автоматический_выключатель','EKF','M636208C','Автоматический выключатель 2P 8А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"2","номинал, А":"8"}',570690000,'RUB','Автоматический_выключатель.xlsm','EKF',33);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2aebfbd0dee2fb7cd8','Автоматический_выключатель','EKF','M636310C','Автоматический выключатель 3P 10А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"10"}',967230000,'RUB','Автоматический_выключатель.xlsm','EKF',34);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9dc249a71c0e521994','Автоматический_выключатель','EKF','M636313C','Автоматический выключатель 3P 13А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"13"}',909780000,'RUB','Автоматический_выключатель.xlsm','EKF',35);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0cc243bd109271cd3d','Автоматический_выключатель','EKF','M636316C','Автоматический выключатель 3P 16А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"16"}',967230000,'RUB','Автоматический_выключатель.xlsm','EKF',36);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-94e009794c2bd5ff00','Автоматический_выключатель','EKF','M636301C','Автоматический выключатель 3P 1А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"1"}',944380000,'RUB','Автоматический_выключатель.xlsm','EKF',37);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-962383a07074366057','Автоматический_выключатель','EKF','M636320C','Автоматический выключатель 3P 20А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"20"}',956070000,'RUB','Автоматический_выключатель.xlsm','EKF',38);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7e4be6a711ca4e0a7b','Автоматический_выключатель','EKF','M636325C','Автоматический выключатель 3P 25А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"25"}',937000000,'RUB','Автоматический_выключатель.xlsm','EKF',39);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6a58114967e8c41fd1','Автоматический_выключатель','EKF','M636302C','Автоматический выключатель 3P 2А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"2"}',1019190000,'RUB','Автоматический_выключатель.xlsm','EKF',40);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-82d0b59b757ad53a4f','Автоматический_выключатель','EKF','M636332C','Автоматический выключатель 3P 32А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"32"}',967230000,'RUB','Автоматический_выключатель.xlsm','EKF',41);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b383f791cd6c3ccb49','Автоматический_выключатель','EKF','M636303C','Автоматический выключатель 3P 3А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"3"}',1019190000,'RUB','Автоматический_выключатель.xlsm','EKF',42);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-44b277775c65762019','Автоматический_выключатель','EKF','M636340C','Автоматический выключатель 3P 40А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"40"}',1034290000,'RUB','Автоматический_выключатель.xlsm','EKF',43);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8fa20f0ba7bec5574a','Автоматический_выключатель','EKF','M636304C','Автоматический выключатель 3P 4А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"4"}',1004930000,'RUB','Автоматический_выключатель.xlsm','EKF',44);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-afef8ebc840750757f','Автоматический_выключатель','EKF','M636350C','Автоматический выключатель 3P 50А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"50"}',1213860000,'RUB','Автоматический_выключатель.xlsm','EKF',45);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a40e5e445764c36490','Автоматический_выключатель','EKF','M636305C','Автоматический выключатель 3P 5А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"5"}',1017380000,'RUB','Автоматический_выключатель.xlsm','EKF',46);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-529b56837e30a666f2','Автоматический_выключатель','EKF','M636363C','Автоматический выключатель 3P 63А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"63"}',1157650000,'RUB','Автоматический_выключатель.xlsm','EKF',47);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e68fa0997e457d617b','Автоматический_выключатель','EKF','M636306C','Автоматический выключатель 3P 6А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"6"}',1059420000,'RUB','Автоматический_выключатель.xlsm','EKF',48);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c91fbf807a29d3adfc','Автоматический_выключатель','EKF','M636308C','Автоматический выключатель 3P 8А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"3","номинал, А":"8"}',955250000,'RUB','Автоматический_выключатель.xlsm','EKF',49);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-848ef8f5172cf6b445','Автоматический_выключатель','EKF','M636410C','Автоматический выключатель 4P 10А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"10"}',1324470000,'RUB','Автоматический_выключатель.xlsm','EKF',50);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b31465ec4d7ff283b4','Автоматический_выключатель','EKF','M636413C','Автоматический выключатель 4P 13А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"13"}',1293960000,'RUB','Автоматический_выключатель.xlsm','EKF',51);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7873f9e518e516457e','Автоматический_выключатель','EKF','M636416C','Автоматический выключатель 4P 16А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"16"}',1367080000,'RUB','Автоматический_выключатель.xlsm','EKF',52);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-eca252feae100ad990','Автоматический_выключатель','EKF','M636401C','Автоматический выключатель 4P 1А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"1"}',1333960000,'RUB','Автоматический_выключатель.xlsm','EKF',53);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b40ea71d273fb2aec4','Автоматический_выключатель','EKF','M636420C','Автоматический выключатель 4P 20А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"20"}',1354110000,'RUB','Автоматический_выключатель.xlsm','EKF',54);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-73de69ebf1b8ba94fa','Автоматический_выключатель','EKF','M636425C','Автоматический выключатель 4P 25А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"25"}',1280000000,'RUB','Автоматический_выключатель.xlsm','EKF',55);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cae4e6691e216e1e0d','Автоматический_выключатель','EKF','M636402C','Автоматический выключатель 4P 2А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"2"}',1266530000,'RUB','Автоматический_выключатель.xlsm','EKF',56);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f5e825716c688343e2','Автоматический_выключатель','EKF','M636432C','Автоматический выключатель 4P 32А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"32"}',1183910000,'RUB','Автоматический_выключатель.xlsm','EKF',57);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5465b6f15c48f1773a','Автоматический_выключатель','EKF','M636403C','Автоматический выключатель 4P 3А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"3"}',1307830000,'RUB','Автоматический_выключатель.xlsm','EKF',58);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e37e7f38839e52b200','Автоматический_выключатель','EKF','M636440C','Автоматический выключатель 4P 40А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"40"}',1332030000,'RUB','Автоматический_выключатель.xlsm','EKF',59);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-79b8b749e1758287a2','Автоматический_выключатель','EKF','M636404C','Автоматический выключатель 4P 4А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"4"}',1371890000,'RUB','Автоматический_выключатель.xlsm','EKF',60);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f1fe8423ce7b5d5991','Автоматический_выключатель','EKF','M636450C','Автоматический выключатель 4P 50А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"50"}',1272180000,'RUB','Автоматический_выключатель.xlsm','EKF',61);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9a6b32cd28e36122b7','Автоматический_выключатель','EKF','M636405C','Автоматический выключатель 4P 5А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"5"}',1541920000,'RUB','Автоматический_выключатель.xlsm','EKF',62);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b729dca4b93a7574e7','Автоматический_выключатель','EKF','M636463C','Автоматический выключатель 4P 63А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"63"}',1408390000,'RUB','Автоматический_выключатель.xlsm','EKF',63);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2746750527622cf1ac','Автоматический_выключатель','EKF','M636406C','Автоматический выключатель 4P 6А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"6"}',1512500000,'RUB','Автоматический_выключатель.xlsm','EKF',64);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9f3aa53a1ff144a98c','Автоматический_выключатель','EKF','M636408C','Автоматический выключатель 4P 8А (C) 6кА ВА 47-63N EKF PROxima','ВА 47-63N','{"кол-во полюсов":"4","номинал, А":"8"}',1409820000,'RUB','Автоматический_выключатель.xlsm','EKF',65);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1cd9d5d58e1f81c953','Автоматический_выключатель','EKF','mcb47100-3-80C-pro','Автоматический выключатель 3P 80А (C) 10kA ВА 47-100 EKF PROxima','ВА 47-100','{"кол-во полюсов":3,"номинал, А":80}',2026660000,'RUB','Автоматический_выключатель.xlsm','EKF',66);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-893a22dca09cb8cf08','Автоматический_выключатель','EKF','mcb47100-3-100C-pro','Автоматический выключатель 3P 100А (C) 10kA ВА 47-100 EKF PROxima','ВА 47-100','{"кол-во полюсов":3,"номинал, А":100}',2174540000,'RUB','Автоматический_выключатель.xlsm','EKF',67);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-06b971a9d2455c7c96','Автоматический_выключатель','EKF','mcb47100-3-125C-pro','Автоматический выключатель 3P 125А (C) 10kA ВА 47-100 EKF PROxima','ВА 47-100','{"кол-во полюсов":3,"номинал, А":125}',2942010000,'RUB','Автоматический_выключатель.xlsm','EKF',68);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c59ea77e5027889f73','Автоматический_выключатель','EKF','mccb-23-160-TR-av','Автоматический выключатель AV POWER-2/3 160А 35kA TR','AV Power','{"кол-во полюсов":3,"номинал, А":160}',11655550000,'RUB','Автоматический_выключатель.xlsm','EKF',69);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d21276745effd29645','Автоматический_выключатель','EKF','mccb-23-200-TR-av','Автоматический выключатель AV POWER-2/3 200А 35kA TR','AV Power','{"кол-во полюсов":3,"номинал, А":200}',8422480000,'RUB','Автоматический_выключатель.xlsm','EKF',70);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e8dc21ef30eafa57ce','Автоматический_выключатель','EKF','mccb-23-225-TR-av','Автоматический выключатель AV POWER-2/3 225А 35kA TR','AV Power','{"кол-во полюсов":3,"номинал, А":225}',7693720000,'RUB','Автоматический_выключатель.xlsm','EKF',71);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ee2ab41fd7a27a5980','Автоматический_выключатель','EKF','mccb-23-250-TR-av','Автоматический выключатель AV POWER-2/3 250А 35kA TR','AV Power','{"кол-во полюсов":3,"номинал, А":250}',9918300000,'RUB','Автоматический_выключатель.xlsm','EKF',72);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ec6e9894151f4e337b','Автоматический_выключатель','EKF','mccb-33-315-TR-av','Автоматический выключатель AV POWER-3/3 315А 35kA TR','AV Power','{"кол-во полюсов":3,"номинал, А":315}',20044920000,'RUB','Автоматический_выключатель.xlsm','EKF',73);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f33abac906fa97b1a7','Автоматический_выключатель','EKF','mccb99-630-400m','Выключатель автоматический ВА-99М  630/400А 3P 50кА EKF PROxima','ВА-99М','{"кол-во полюсов":3,"номинал, А":400}',29764100000,'RUB','Автоматический_выключатель.xlsm','EKF',74);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9a9746bbbff1d7aa99','Автоматический_выключатель','EKF','mccb99-630-500m','Выключатель автоматический ВА-99М  630/500А 3P 50кА EKF PROxima','ВА-99М','{"кол-во полюсов":3,"номинал, А":500}',30989700000,'RUB','Автоматический_выключатель.xlsm','EKF',75);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6a60a7cda8a6c2fc9c','Автоматический_выключатель','EKF','mccb99-630-630me','Выключатель автоматический ВА-99М  630/630А 3P 65кА с электронным расцепителем EKF PROxima','ВА-99М','{"кол-во полюсов":3,"номинал, А":630}',50425630000,'RUB','Автоматический_выключатель.xlsm','EKF',76);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-be216f6267c5952a78','Автоматический_выключатель','EKF','mccb99-800-800me','Выключатель автоматический ВА-99М  800/800А 3P 75кА с электронным расцепителем EKF PROxima','ВА-99М','{"кол-во полюсов":3,"номинал, А":630}',74836620000,'RUB','Автоматический_выключатель.xlsm','EKF',77);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c57c477aa6ec72a3ed','Автоматический_выключатель','EKF','mccb99C-1250-1000','Выключатель автоматический ВА-99C (Compact NS) 1250/1000А 3P 50кА EKF PROxima','ВА-99C','{"кол-во полюсов":3,"номинал, А":1000}',155104380000,'RUB','Автоматический_выключатель.xlsm','EKF',78);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e2d8997ac4b99ffcaa','Автоматический_выключатель','EKF','mccb99C-1250-1250','Выключатель автоматический ВА-99C (Compact NS) 1250/1250А 3P 50кА EKF PROxima','ВА-99C','{"кол-во полюсов":3,"номинал, А":1250}',155104380000,'RUB','Автоматический_выключатель.xlsm','EKF',79);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-eea9d4b937c3cb7cd5','Автоматический_выключатель','EKF','mccb99C-1250-1600','Выключатель автоматический ВА-99C (Compact NS) 1250/1600А 3P 50кА EKF PROxima','ВА-99C','{"кол-во полюсов":3,"номинал, А":1600}',155847680000,'RUB','Автоматический_выключатель.xlsm','EKF',80);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7a647389a53da4c446','Автоматический_выключатель','Systeme electric','C9F36106','Выключатель автоматический City9 Set, (АВ) С 6А 1P 6kA','City9 Set','{"кол-во полюсов":1,"номинал, А":6}',443600000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cc76228ae6fe396fae','Автоматический_выключатель','Systeme electric','C9F36110','Выключатель автоматический City9 Set, (АВ) С 10А 1P 6kA','City9 Set','{"кол-во полюсов":1,"номинал, А":10}',390720000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9b130b2467fdafd80b','Автоматический_выключатель','Systeme electric','C9F36116','Выключатель автоматический City9 Set, (АВ) С 16А 1P 6kA','City9 Set','{"кол-во полюсов":1,"номинал, А":16}',363350000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ff52fc30dcacf847f8','Автоматический_выключатель','Systeme electric','C9F36120','Выключатель автоматический City9 Set, (АВ) С 20А 1P 6kA','City9 Set','{"кол-во полюсов":1,"номинал, А":20}',408770000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-268ed46280d14c2254','Автоматический_выключатель','Systeme electric','C9F36125','Выключатель автоматический City9 Set, (АВ) С 25А 1P 6kA','City9 Set','{"кол-во полюсов":1,"номинал, А":25}',413130000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d54c54bdf623743b56','Автоматический_выключатель','Systeme electric','C9F36132','Выключатель автоматический City9 Set, (АВ) С 32А 1P 6kA','City9 Set','{"кол-во полюсов":1,"номинал, А":32}',438020000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-74e0f5d285457999d5','Автоматический_выключатель','Systeme electric','C9F36140','Выключатель автоматический City9 Set, (АВ) С 40А 1P 6kA','City9 Set','{"кол-во полюсов":1,"номинал, А":40}',497740000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-28b60a639208e24424','Автоматический_выключатель','Systeme electric','C9F36150','Выключатель автоматический City9 Set, (АВ) С 50А 1P 6kA','City9 Set','{"кол-во полюсов":1,"номинал, А":50}',648310000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ee6c074047de87d268','Автоматический_выключатель','Systeme electric','C9F36163','Выключатель автоматический City9 Set, (АВ) С 63А 1P 6kA','City9 Set','{"кол-во полюсов":1,"номинал, А":63}',726690000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ca0b00526258bae368','Автоматический_выключатель','Systeme electric','C9F36206','Выключатель автоматический City9 Set, (АВ) С 6А 2P 6kA','City9 Set','{"кол-во полюсов":2,"номинал, А":6}',1096890000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0da90b0d8145cfc256','Автоматический_выключатель','Systeme electric','C9F36210','Выключатель автоматический City9 Set, (АВ) С 10А 2P 6kA','City9 Set','{"кол-во полюсов":2,"номинал, А":10}',994230000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0cd567d4f66386ab9a','Автоматический_выключатель','Systeme electric','C9F36216','Выключатель автоматический City9 Set, (АВ) С 16А 2P 6kA','City9 Set','{"кол-во полюсов":2,"номинал, А":16}',936370000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8f5bc1f9629b9ac7a2','Автоматический_выключатель','Systeme electric','C9F36220','Выключатель автоматический City9 Set, (АВ) С 20А 2P 6kA','City9 Set','{"кол-во полюсов":2,"номинал, А":20}',1025340000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-bd9e89c019eed30056','Автоматический_выключатель','Systeme electric','C9F36225','Выключатель автоматический City9 Set, (АВ) С 25А 2P 6kA','City9 Set','{"кол-во полюсов":2,"номинал, А":25}',996730000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ae3fc633922c045fa4','Автоматический_выключатель','Systeme electric','C9F36232','Выключатель автоматический City9 Set, (АВ) С 32А 2P 6kA','City9 Set','{"кол-во полюсов":2,"номинал, А":32}',1070760000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c054567ab183bd3b38','Автоматический_выключатель','Systeme electric','C9F36240','Выключатель автоматический City9 Set, (АВ) С 40А 2P 6kA','City9 Set','{"кол-во полюсов":2,"номинал, А":40}',1157870000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4b0ef32832de21d103','Автоматический_выключатель','Systeme electric','C9F36250','Выключатель автоматический City9 Set, (АВ) С 50А 2P 6kA','City9 Set','{"кол-во полюсов":2,"номинал, А":50}',1530550000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-93c7ef34fced3c30fb','Автоматический_выключатель','Systeme electric','C9F36263','Выключатель автоматический City9 Set, (АВ) С 63А 2P 6kA','City9 Set','{"кол-во полюсов":2,"номинал, А":63}',1673640000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-52843418f98310f8fb','Автоматический_выключатель','Systeme electric','C9F36306','Выключатель автоматический City9 Set, (АВ) С 6А 3P 6kA','City9 Set','{"кол-во полюсов":3,"номинал, А":6}',1648760000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-939d56c2fd14019ce4','Автоматический_выключатель','Systeme electric','C9F36310','Выключатель автоматический City9 Set, (АВ) С 10А 3P 6kA','City9 Set','{"кол-во полюсов":3,"номинал, А":10}',1431000000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-910077b108d3e08a08','Автоматический_выключатель','Systeme electric','C9F36316','Выключатель автоматический City9 Set, (АВ) С 16А 3P 6kA','City9 Set','{"кол-во полюсов":3,"номинал, А":16}',1356340000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-efa8a417f8d53cf858','Автоматический_выключатель','Systeme electric','C9F36320','Выключатель автоматический City9 Set, (АВ) С 20А 3P 6kA','City9 Set','{"кол-во полюсов":3,"номинал, А":20}',1567880000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-aa24e7618c93236adb','Автоматический_выключатель','Systeme electric','C9F36325','Выключатель автоматический City9 Set, (АВ) С 25А 3P 6kA','City9 Set','{"кол-во полюсов":3,"номинал, А":25}',1505660000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-25c9fdd0c6235b0f78','Автоматический_выключатель','Systeme electric','C9F36332','Выключатель автоматический City9 Set, (АВ) С 32А 3P 6kA','City9 Set','{"кол-во полюсов":3,"номинал, А":32}',1580330000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e9a2d232b0ecbeba8f','Автоматический_выключатель','Systeme electric','C9F36340','Выключатель автоматический City9 Set, (АВ) С 40А 3P 6kA','City9 Set','{"кол-во полюсов":3,"номинал, А":40}',1754530000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',26);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d4989a902ca6016bcc','Автоматический_выключатель','Systeme electric','C9F36350','Выключатель автоматический City9 Set, (АВ) С 50А 3P 6kA','City9 Set','{"кол-во полюсов":3,"номинал, А":50}',2295820000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',27);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cab5394886fc3593d5','Автоматический_выключатель','Systeme electric','C9F36363','Выключатель автоматический City9 Set, (АВ) С 63А 3P 6kA','City9 Set','{"кол-во полюсов":3,"номинал, А":63}',2389150000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',28);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2caa91bea3aaf56079','Автоматический_выключатель','Systeme electric','SPC100F080L3DF','Выключатель автоматический SystemePact CCB, (АВ) С 80А 3P 36kA','','{"кол-во полюсов":3,"номинал, А":80}',56861400000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',29);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a646fa84f03b5c40b0','Автоматический_выключатель','Systeme electric','SPC100F100L3DF','Выключатель автоматический SystemePact CCB, (АВ) С 100А 3P 36kA','','{"кол-во полюсов":3,"номинал, А":100}',58451070000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',30);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1be4221ca57cc3fac8','Автоматический_выключатель','Systeme electric','SPC160F125L3DF','Выключатель автоматический SystemePact CCB, (АВ) С 125А 3P 36kA','','{"кол-во полюсов":3,"номинал, А":125}',77404870000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',31);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f9c0805c0af60711fe','Автоматический_выключатель','Systeme electric','SPC160F160L3DF','Выключатель автоматический SystemePact CCB, (АВ) С 160А 3P 36kA','','{"кол-во полюсов":3,"номинал, А":160}',94830140000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',32);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5e2f0c1d03852cd558','Автоматический_выключатель','Systeme electric','SPC250F200L3DF','Выключатель автоматический SystemePact CCB, (АВ) С 200А 3P 36kA','','{"кол-во полюсов":3,"номинал, А":200}',109076060000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',33);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0dc4b0bac6290ca631','Автоматический_выключатель','Systeme electric','SPC250F250L3DF','Выключатель автоматический SystemePact CCB, (АВ) С 250А 3P 36kA','','{"кол-во полюсов":3,"номинал, А":250}',140013550000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',34);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-08b3c8f6b53cc805fc','Автоматический_выключатель','Systeme electric','SPC400F32013M3DF','Выключатель автоматический SystemePact CCB, (АВ) С 320А 3P 36kA','','{"кол-во полюсов":3,"номинал, А":320}',308152090000,'RUB','Автоматический_выключатель.xlsm','Systeme electric',35);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9a2f54da0c357dd368','Блоки питания','ОВЕН','БП15Б-Д2-12','Блок питания, 12VDC, 15 Вт','12VDC/1,2A','{"Мощность. Вт":"15 Вт","Напряжение":12,"IP":20}',4453510000,'RUB','Блоки питания.xlsx','ОВЕН',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-91533a4d2eed3fc69a','Блоки питания','ОВЕН','БП30Б-Д3-12','Блок питания, 12VDC, 30 Вт','12VDC/2,4A','{"Мощность. Вт":"30 Вт","Напряжение":12,"IP":20}',5246370000,'RUB','Блоки питания.xlsx','ОВЕН',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-dadd70e6e53edf7119','Блоки питания','ОВЕН','БП60Б-Д4-12','Блок питания, 12VDC, 60 Вт','12VDC/4,5A','{"Мощность. Вт":"60 Вт","Напряжение":12,"IP":20}',6832480000,'RUB','Блоки питания.xlsx','ОВЕН',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0116ca9d1329493e7c','Блоки питания','Овен','БП15Б-Д2-24','Блок питания, 24VDC, 15 Вт','24VDC/0,63A','{"Мощность. Вт":"15 Вт","Напряжение":24,"IP":20}',4453510000,'RUB','Блоки питания.xlsx','ОВЕН',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fda03eca6d58e12d41','Блоки питания','Овен','БП30Б-Д3-24','Блок питания, 24VDC, 30 Вт','24VDC/1,25A','{"Мощность. Вт":"30 Вт","Напряжение":24,"IP":20}',5246370000,'RUB','Блоки питания.xlsx','ОВЕН',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-81f33348cfb9c9f6af','Блоки питания','Овен','БП60Б-Д4-24','Блок питания, 24VDC, 60 Вт','24VDC/2,5A','{"Мощность. Вт":"60 Вт","Напряжение":24,"IP":20}',6832480000,'RUB','Блоки питания.xlsx','ОВЕН',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-083b25ae1a113f9416','Блоки питания','MeanWell','NDR-240-24','Блок питания, 24VDC, 240 Вт','NDR','{"Мощность. Вт":240,"Напряжение":24}',3915350000,'RUB','Блоки питания.xlsx','MeanWell',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d933a1f93703d4d30f','Блоки питания','MeanWell','NDR-120-24','Блок питания, 24VDC, 120 Вт','NDR','{"Мощность. Вт":120,"Напряжение":24}',2129640000,'RUB','Блоки питания.xlsx','MeanWell',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e2b707951503f1adcf','Блоки питания','MeanWell','NDR-75-24','Блок питания, 24VDC, 75 Вт','NDR','{"Мощность. Вт":75,"Напряжение":24}',1561440000,'RUB','Блоки питания.xlsx','MeanWell',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-885e8ebdffb7bf2439','Блоки питания','MeanWell','HDR-15-24','Блок питания, 24VDC, 15 Вт','HDR','{"Мощность. Вт":15,"Напряжение":24}',847900000,'RUB','Блоки питания.xlsx','MeanWell',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b74ad39eea46b3e7a0','Блоки питания','MeanWell','MDR-10-24','Блок питания, 24VDC, 10 Вт','MDR','{"Мощность. Вт":10,"Напряжение":24}',1455680000,'RUB','Блоки питания.xlsx','MeanWell',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-dfbe0169a998a4a128','Блоки питания','MeanWell','MDR-20-24','Блок питания, 24VDC, 20 Вт','MDR','{"Мощность. Вт":20,"Напряжение":24}',1031270000,'RUB','Блоки питания.xlsx','MeanWell',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-241b9676ce7a789efd','Блоки питания','MeanWell','MDR-40-24','Блок питания, 24VDC, 40 Вт','MDR','{"Мощность. Вт":40,"Напряжение":24}',1335890000,'RUB','Блоки питания.xlsx','MeanWell',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e46f07f4f036a31423','Блоки питания','MeanWell','MDR-60-24','Блок питания, 24VDC, 60 Вт','MDR','{"Мощность. Вт":60,"Напряжение":24}',1463170000,'RUB','Блоки питания.xlsx','MeanWell',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9d661ba511df716749','Блоки питания','MeanWell','MDR-100-24','Блок питания, 24VDC, 100 Вт','MDR','{"Мощность. Вт":100,"Напряжение":24}',2396420000,'RUB','Блоки питания.xlsx','MeanWell',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c8066ee4daa91e90b6','Блоки питания','MeanWell','EDR-150-24','Блок питания, 24VDC, 150 Вт','EDR','{"Мощность. Вт":150,"Напряжение":24}',1997100000,'RUB','Блоки питания.xlsx','MeanWell',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0df1daec27bb746772','Блоки питания','MeanWell','DRP-240-24','Блок питания, 24VDC, 240 Вт','DRP','{"Мощность. Вт":240,"Напряжение":24}',7128960000,'RUB','Блоки питания.xlsx','MeanWell',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8acc54e8f2452291be','Блоки питания','MeanWell','DRP-480-24','Блок питания, 24VDC, 480 Вт','DRP','{"Мощность. Вт":480,"Напряжение":24}',13542620000,'RUB','Блоки питания.xlsx','MeanWell',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-57e752a6ed2211d04a','Блоки питания','MeanWell','DRT-960-24','Блок питания, 24VDC, 960 Вт','DRT','{"Мощность. Вт":960,"Напряжение":24}',29579920000,'RUB','Блоки питания.xlsx','MeanWell',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ce58dbeab59ed1ad41','Блоки питания','MeanWell','HRPG-300-12','Блок питания, 12VDC, 300 Вт','HRPG','{"Мощность. Вт":300,"Напряжение":12}',6669470000,'RUB','Блоки питания.xlsx','MeanWell',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d80ccc87144761d126','Блоки питания','MeanWell','DRC-40B','Блок питания, 24VDC с функцией UPS, 40 Вт','DRC','{"Мощность. Вт":40,"Напряжение":24}',2047890000,'RUB','Блоки питания.xlsx','MeanWell',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-38f7232093f7764751','Блоки питания','MeanWell','DRC-60B','Блок питания, 24VDC с функцией UPS, 60 Вт','DRC','{"Мощность. Вт":60,"Напряжение":24}',2547520000,'RUB','Блоки питания.xlsx','MeanWell',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8183b04ecac609f54f','Блоки питания','MeanWell','DRC-180B','Блок питания, 24VDC с функцией UPS, 180 Вт','DRC','{"Мощность. Вт":180,"Напряжение":24}',5596810000,'RUB','Блоки питания.xlsx','MeanWell',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-73e110fd3b2f38d4c8','Блоки питания','MeanWell','DRS-240-24','Блок питания, 24VDC с функцией UPS, 240 Вт, с ModBus','DRS','{"Мощность. Вт":240,"Напряжение":24}',13202190000,'RUB','Блоки питания.xlsx','MeanWell',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5c174e2d520dde6b25','Блоки питания','Бастион','SKAT BC 24/9 DIN','Резервный батарейный блок 24В 9,0Ач, на DIN-рейку','','{"Мощность. Вт":"9,0Ач","Напряжение":24}',7620000000,'RUB','Блоки питания.xlsx','MeanWell',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-94001c80a29943199a','Блоки питания','EKF','dr-30w-24','Блок питания, 24VDC, 30 Вт','DR','{"Мощность. Вт":"30 Вт","Напряжение":"24VDC","IP":20}',1913000000,'RUB','Блоки питания.xlsx','EKF',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8e28bbdd577dbf7383','Блоки питания','EKF','dr-45w-24','Блок питания, 24VDC, 45 Вт','DR','{"Мощность. Вт":"45 Вт","Напряжение":"24VDC","IP":20}',2149930000,'RUB','Блоки питания.xlsx','EKF',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8f1f2a27b6a5bc723c','Блоки питания','EKF','dr-60w-24','Блок питания, 24VDC, 60 Вт','DR','{"Мощность. Вт":"60 Вт","Напряжение":"24VDC","IP":20}',1975010000,'RUB','Блоки питания.xlsx','EKF',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-dc56605075efca91b4','Блоки питания','EKF','dr-120w-24','Блок питания, 24VDC, 120 Вт','DR','{"Мощность. Вт":"120 Вт","Напряжение":"24VDC","IP":20}',3290000000,'RUB','Блоки питания.xlsx','EKF',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1ba2f25a4c484ed1b8','Блоки питания','EKF','dr-15w-12','Блок питания, 12VDC, 15 Вт','DR','{"Мощность. Вт":"15 Вт","Напряжение":"12VDC","IP":20}',1917000000,'RUB','Блоки питания.xlsx','EKF',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ee2f9d05584ab31f38','Блоки питания','EKF','dr-30w-12','Блок питания, 12VDC, 30 Вт','DR','{"Мощность. Вт":"30 Вт","Напряжение":"12VDC","IP":20}',2700170000,'RUB','Блоки питания.xlsx','EKF',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-632f78aa196e679a48','Блоки питания','EKF','dr-60w-12','Блок питания, 12VDC, 60 Вт','DR','{"Мощность. Вт":"60 Вт","Напряжение":"12VDC","IP":20}',2777000000,'RUB','Блоки питания.xlsx','EKF',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8db3cd5ac00689f051','Ввод_кабеля','IEK','YSA20-06-07-54-K41','Сальник PG 7 диаметр проводника 5-6мм','PG','{"диаметр 1":"5-6","IP":54}',13690000,'RUB','Ввод_кабеля.xlsm','IEK',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4a59576c1ff969634a','Ввод_кабеля','IEK','YSA20-08-09-54-K41','Сальник PG 9 диаметр проводника 6-7мм','PG','{"диаметр 1":"6-7","IP":54}',18190000,'RUB','Ввод_кабеля.xlsm','IEK',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-bf6b5c0eeeee5e3f51','Ввод_кабеля','IEK','YSA20-10-11-54-K41','Сальник PG 11 диаметр проводника 7-9мм','PG','{"диаметр 1":"7-9","IP":54}',19720000,'RUB','Ввод_кабеля.xlsm','IEK',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5263c896b5de01b190','Ввод_кабеля','IEK','YSA20-12-13-54-K41','Сальник PG 13,5 диаметр проводника 7-11мм','PG','{"диаметр 1":"7-11","IP":54}',25220000,'RUB','Ввод_кабеля.xlsm','IEK',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0852a31b18d4b0aa7a','Ввод_кабеля','IEK','YSA20-14-16-54-K41','Сальник PG 16 диаметр проводника 9-13мм','PG','{"диаметр 1":"9-13","IP":54}',34320000,'RUB','Ввод_кабеля.xlsm','IEK',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-112f2336e5f751f9e1','Ввод_кабеля','IEK','YSA20-18-21-54-K41','Сальник PG 21 диаметр проводника 15-18мм','PG','{"диаметр 1":"15-18","IP":54}',46820000,'RUB','Ввод_кабеля.xlsm','IEK',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a2c6e8b2b89425e304','Ввод_кабеля','IEK','YSA20-25-29-54-K41','Сальник PG 29 диаметр проводника 18-24мм','PG','{"диаметр 1":"18-24","IP":54}',83730000,'RUB','Ввод_кабеля.xlsm','IEK',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3ddce7efbb92cc5f66','Ввод_кабеля','IEK','YSA20-32-36-54-K41','Сальник PG 36 диаметр проводника 24-32мм','PG','{"диаметр 1":"24-32","IP":54}',172870000,'RUB','Ввод_кабеля.xlsm','IEK',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3a8c79251cde7eb016','Ввод_кабеля','IEK','YSA20-40-42-54-K41','Сальник PG 42 диаметр проводника 30-40мм','PG','{"диаметр 1":"30-40","IP":54}',186180000,'RUB','Ввод_кабеля.xlsm','IEK',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b4c88bd6a4f9ed419f','Ввод_кабеля','IEK','YSA20-44-48-54-K41','Сальник PG 48 диаметр проводника 36-44мм','PG','{"диаметр 1":"36-44","IP":54}',199600000,'RUB','Ввод_кабеля.xlsm','IEK',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7d6bc2e7a6149b8a0b','Ввод_кабеля','IEK','YSA20-06-12-68-K02','Сальник MG12 IP68 диаметр проводника 4-8 мм','MG','{"диаметр 1":"4-8","IP":68}',28520000,'RUB','Ввод_кабеля.xlsm','IEK',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-002eea57a744be9b52','Ввод_кабеля','IEK','YSA20-08-16-68-K02','Сальник MG16 IP68 диаметр проводника 6-10мм','MG','{"диаметр 1":"6-10","IP":68}',38100000,'RUB','Ввод_кабеля.xlsm','IEK',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-92141bf00171d47698','Ввод_кабеля','IEK','YSA20-10-20-68-K02','Сальник MG20 IP68 диаметр проводника 8,5-14мм','MG','{"диаметр 1":"8,5-14","IP":68}',56610000,'RUB','Ввод_кабеля.xlsm','IEK',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f6dda922f06bf1b4b5','Ввод_кабеля','IEK','YSA20-15-25-68-K02','Сальник MG25 IP68 диаметр проводника 13-18мм','MG','{"диаметр 1":"13-18","IP":68}',74020000,'RUB','Ввод_кабеля.xlsm','IEK',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d5bb2ac8f8cab4716c','Ввод_кабеля','IEK','YSA20-21-32-68-K02','Сальник MG32 IP68 диаметр проводника 18-25мм','MG','{"диаметр 1":"18-25","IP":68}',123880000,'RUB','Ввод_кабеля.xlsm','IEK',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-14ac1cc7d9e9dcbdb3','Ввод_кабеля','IEK','YSA20-28-40-68-K02','Сальник MG40 IP68 диаметр проводника 24-32мм','MG','{"диаметр 1":"24-32","IP":68}',186120000,'RUB','Ввод_кабеля.xlsm','IEK',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5aca0cd16f1232a6e0','Ввод_кабеля','IEK','YSA20-36-50-68-K02','Сальник MG50 IP68 диаметр проводника 31-41мм','MG','{"диаметр 1":"31-41","IP":68}',314700000,'RUB','Ввод_кабеля.xlsm','IEK',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e4097b4318e4192505','Ввод_кабеля','IEK','YSA20-40-63-68-K02','Сальник MG63 IP68 диаметр проводника 35-45мм','MG','{"диаметр 1":"35-45","IP":68}',261730000,'RUB','Ввод_кабеля.xlsm','IEK',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a351d2f1ec75332b5e','Ввод_кабеля','IEK','YSA50-06-12-68-K23','Сальник металлический PGM7 IP68 диаметр проводника 3-6 мм','PGM','{"диаметр 1":"3-6","IP":68}',171070000,'RUB','Ввод_кабеля.xlsm','IEK',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e370e404939d8bd066','Ввод_кабеля','IEK','YSA50-10-18-68-K23','Сальник металлический PGM9 IP68 диаметр проводника 5-10 мм','PGM','{"диаметр 1":"5-10","IP":68}',231510000,'RUB','Ввод_кабеля.xlsm','IEK',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e39d722163d4e8e0fe','Ввод_кабеля','IEK','YSA50-14-22-68-K23','Сальник металлический PGM16 IP68 диаметр проводника 10-14 мм','PGM','{"диаметр 1":"10-14","IP":68}',302940000,'RUB','Ввод_кабеля.xlsm','IEK',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-356e25cf809896f133','Ввод_кабеля','IEK','YSA50-18-28-68-K23','Сальник металлический PGM21 IP68 диаметр проводника 13-18 мм','PGM','{"диаметр 1":"13-18","IP":68}',461270000,'RUB','Ввод_кабеля.xlsm','IEK',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a2b184f0adcfcb495a','Ввод_кабеля','IEK','YSA50-25-37-68-K23','Сальник металлический PGM29 IP68 диаметр проводника 18-25 мм','PGM','{"диаметр 1":"18-25","IP":68}',704160000,'RUB','Ввод_кабеля.xlsm','IEK',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1ccb091a9a6b0b82f8','Ввод_кабеля','IEK','YSA50-33-47-68-K23','Сальник металлический PGM36 IP68 диаметр проводника 25-33 мм','PGM','{"диаметр 1":"25-33","IP":68}',1439140000,'RUB','Ввод_кабеля.xlsm','IEK',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5b98a638c40d771625','Ввод_кабеля','IEK','YSA50-38-54-68-K23','Сальник металлический PGM42 IP68 диаметр проводника 32-38 мм','PGM','{"диаметр 1":"32-38","IP":68}',2055860000,'RUB','Ввод_кабеля.xlsm','IEK',26);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-50fde33514bfeabb2b','Ввод_кабеля','IEK','YSA50-44-59-68-K23','Сальник металлический PGM48 IP68 диаметр проводника 37-42 мм','PGM','{"диаметр 1":"37-42","IP":68}',2613150000,'RUB','Ввод_кабеля.xlsm','IEK',27);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c3d6635cf6cef8a4dd','Ввод_кабеля','EKF','plc-pg-7','Сальник PG 7 IP54 диаметр проводника 3-6,5мм','PG','{"диаметр 1":"3-6,5","IP":54}',16590000,'RUB','Ввод_кабеля.xlsm','EKF',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6475ed5d563396e66b','Ввод_кабеля','EKF','plc-pg-13.5','Сальник PG 13,5 IP54 диаметр проводника 6-12мм','PG','{"диаметр 1":"6-12","IP":54}',23300000,'RUB','Ввод_кабеля.xlsm','EKF',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e005626f37951eaea4','Ввод_кабеля','EKF','plc-pg-16','Сальник PG 16 IP54 диаметр проводника 10-14мм','PG','{"диаметр 1":"10-14","IP":54}',NULL,'RUB','Ввод_кабеля.xlsm','EKF',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7f5f2306f8045448bf','Ввод_кабеля','EKF','plc-pg-21','Сальник PG 21 IP54 диаметр проводника 13-18мм','PG','{"диаметр 1":"13-18","IP":54}',40220000,'RUB','Ввод_кабеля.xlsm','EKF',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-82f107dcdda53100de','Ввод_кабеля','EKF','plc-pg-29','Сальник PG 29 IP54 диаметр проводника 18-25мм','PG','{"диаметр 1":"18-25","IP":54}',72130000,'RUB','Ввод_кабеля.xlsm','EKF',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ac62c2095305fd4f62','Ввод_кабеля','EKF','plc-pg-36','Сальник PG 36 IP54 диаметр проводника 22-32мм','PG','{"диаметр 1":"22-32","IP":54}',149110000,'RUB','Ввод_кабеля.xlsm','EKF',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ee1ea058d85c0b4765','Ввод_кабеля','EKF','plc-pg-42','Сальник PG 42 IP54 диаметр проводника 32-38мм','PG','{"диаметр 1":"32-38","IP":54}',160340000,'RUB','Ввод_кабеля.xlsm','EKF',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cb6bc28fa28e8d0312','Ввод_кабеля','EKF','plc-pg-48','Сальник PG 48 диаметр проводника 37-44мм','PG','{"диаметр 1":"37-44","IP":54}',171580000,'RUB','Ввод_кабеля.xlsm','EKF',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c92225371c264eb973','Ввод_кабеля','EKF','plc-mg-12','Сальник MG12 IP68 диаметр проводника 5-7 мм','MG','{"диаметр 1":"5-7","IP":68}',28880000,'RUB','Ввод_кабеля.xlsm','EKF',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3e5d161733cdfe4f29','Ввод_кабеля','EKF','plc-mg-16','Сальник MG16 IP68 диаметр проводника 7-10мм','MG','{"диаметр 1":"7-10","IP":68}',36780000,'RUB','Ввод_кабеля.xlsm','EKF',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e7f040692da0c5292d','Ввод_кабеля','EKF','plc-mg-20','Сальник MG20 IP68 диаметр проводника 10-13мм','MG','{"диаметр 1":"10-13","IP":68}',55470000,'RUB','Ввод_кабеля.xlsm','EKF',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-744bba63866d21941b','Ввод_кабеля','EKF','plc-mg-25','Сальник MG25 IP68 диаметр проводника 13-18мм','MG','{"диаметр 1":"13-18","IP":68}',72420000,'RUB','Ввод_кабеля.xlsm','EKF',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7d2c95fec4f4901eb9','Ввод_кабеля','EKF','plc-mg-32','Сальник MG32 IP68 диаметр проводника 18-24мм','MG','{"диаметр 1":"18-24","IP":68}',98270000,'RUB','Ввод_кабеля.xlsm','EKF',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-19133c084572e10307','Ввод_кабеля','EKF','plc-mg-40','Сальник MG40 IP68 диаметр проводника 24-30мм','MG','{"диаметр 1":"24-30","IP":68}',170430000,'RUB','Ввод_кабеля.xlsm','EKF',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-605174617d0a388143','Ввод_кабеля','EKF','plc-mg-50','Сальник MG50 IP68 диаметр проводника 30-40мм','MG','{"диаметр 1":"30-40","IP":68}',283130000,'RUB','Ввод_кабеля.xlsm','EKF',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cf56e61068fc83b980','Ввод_кабеля','EKF','plc-mg-63','Сальник MG63 IP68 диаметр проводника 40-50мм','MG','{"диаметр 1":"40-50","IP":68}',369270000,'RUB','Ввод_кабеля.xlsm','EKF',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-122099a7b364531461','Ввод_кабеля','EKF','plc-mgm-12','Сальник металлический MGM12 IP68 диаметр проводника 3-7 мм','MGM','{"диаметр 1":"3-7","IP":68}',159150000,'RUB','Ввод_кабеля.xlsm','EKF',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-780912bb84e82ea731','Ввод_кабеля','EKF','plc-mgm-20','Сальник металлический MGM20 IP68 диаметр проводника 8-12 мм','MGM','{"диаметр 1":"8-12","IP":68}',252300000,'RUB','Ввод_кабеля.xlsm','EKF',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4d92228ca69d80b174','Ввод_кабеля','EKF','plc-mgm-22','Сальник металлический MGM22 IP68 диаметр проводника 10-14 мм','MGM','{"диаметр 1":"10-14","IP":68}',283870000,'RUB','Ввод_кабеля.xlsm','EKF',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-72b518e6957a1d1d9d','Ввод_кабеля','EKF','plc-mgm-32','Сальник металлический MGM32 IP68 диаметр проводника 15-22 мм','MGM','{"диаметр 1":"15-22","IP":68}',666500000,'RUB','Ввод_кабеля.xlsm','EKF',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9fc50de8c90dfbf100','Ввод_кабеля','EKF','plc-mgm-40','Сальник металлический MGM40 IP68 диаметр проводника 22-28 мм','MGM','{"диаметр 1":"22-28","IP":68}',873340000,'RUB','Ввод_кабеля.xlsm','EKF',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-91810f03b0758a584e','Ввод_кабеля','EKF','plc-mgm-48','Сальник металлический MGM48 IP68 диаметр проводника 28-32 мм','MGM','{"диаметр 1":"28-32","IP":68}',1474980000,'RUB','Ввод_кабеля.xlsm','EKF',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e3b20dc555627f70f8','Ввод_кабеля','EKF','plc-mgm-54','Сальник металлический MGM54 IP68 диаметр проводника 32-38 мм','MGM','{"диаметр 1":"32-38","IP":68}',1867530000,'RUB','Ввод_кабеля.xlsm','EKF',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a25be28e621b0299c5','Ввод_кабеля','EKF','plc-mgm-63','Сальник металлический MGM63 IP68 диаметр проводника 38-44 мм','MGM','{"диаметр 1":"38-44","IP":68}',2673390000,'RUB','Ввод_кабеля.xlsm','EKF',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-770c58696de7793a6a','Ввод_кабеля','EKF','plc-mgm-75','Сальник металлический MGM75 IP68 диаметр проводника 46-54 мм','MGM','{"диаметр 1":"46-54","IP":68}',5822280000,'RUB','Ввод_кабеля.xlsm','EKF',26);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2bcf2f23d0cd778f7c','Ввод_кабеля','TDM','SQ0814-0008','Мембранный кабельный ввод на 35 отверстий','','{}',NULL,'RUB','Ввод_кабеля.xlsm','TDM',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9d7080591406bef7f6','Вентиляторы_фильтры','IEK','YVR10D-EF-065-55','Фильтр с решеткой для вентиляции IP55 148х148','55','{"объем":"105 м3/час","Тип":"ВФИ"}',1394370000,'RUB','Вентиляторы_фильтры.xlsm','IEK',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-32abd73c6749de3904','Вентиляторы_фильтры','IEK','YVR10D-EF-200-55','Фильтр с решеткой для вентиляции IP55 204х200','55','{"объем":"200 м3/час","Тип":"ВФИ"}',1854890000,'RUB','Вентиляторы_фильтры.xlsm','IEK',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a8f828d6edc9384748','Вентиляторы_фильтры','IEK','YVR10D-EF-380-55','Фильтр с решеткой для вентиляции IP55 254х254','55','{"объем":"380 м3/час","Тип":"ВФИ"}',2378610000,'RUB','Вентиляторы_фильтры.xlsm','IEK',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-690461194961d1d784','Вентиляторы_фильтры','IEK','YVR10D-EF-480-55','Фильтр с решеткой для вентиляции IP55 320х320','55','{"объем":"700 м3/час","Тип":"ВФИ"}',3112540000,'RUB','Вентиляторы_фильтры.xlsm','IEK',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2f82963563e9573fbf','Вентиляторы_фильтры','IEK','YVR10-065-55','Вентилятор с фильтром IP55 148х148 17Вт','55','{"объем":"65 м3/час","мощность, Вт":17}',4038330000,'RUB','Вентиляторы_фильтры.xlsm','IEK',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-04c6a9096152bb8528','Вентиляторы_фильтры','IEK','YVR10-200-55','Вентилятор с фильтром IP55 200х200 37Вт','55','{"объем":"200 м3/час","мощность, Вт":37}',6863840000,'RUB','Вентиляторы_фильтры.xlsm','IEK',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ee938d018c7e725f13','Вентиляторы_фильтры','IEK','YVR10-380-55','Вентилятор с фильтром IP55 254х254 51Вт','55','{"объем":"380 м3/час","мощность, Вт":51}',10203360000,'RUB','Вентиляторы_фильтры.xlsm','IEK',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5fa8d3fc9b4957702a','Вентиляторы_фильтры','IEK','YVR10-480-55','Вентилятор с фильтром IP55 320х320 54Вт','55','{"объем":"480 м3/час","мощность, Вт":54}',12300490000,'RUB','Вентиляторы_фильтры.xlsm','IEK',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-53f42dc8d7ef69ffb4','Вентиляторы_фильтры','IEK','YCE-EF-021-55','Фильтр с защитным кожухом для вентиляции IP55 97х97','55','{"объем":"21 м3/час"}',1427490000,'RUB','Вентиляторы_фильтры.xlsm','IEK',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-92885710c8c02b82bc','Вентиляторы_фильтры','IEK','YCE-EF-055-55','Фильтр с защитным кожухом для вентиляции IP55 125х125','55','{"объем":"55 м3/час"}',1741490000,'RUB','Вентиляторы_фильтры.xlsm','IEK',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f3edb93747068d1c40','Вентиляторы_фильтры','IEK','YCE-EF-102-55','Фильтр с защитным кожухом для вентиляции IP55 176х176','55','{"объем":"102 м3/час"}',3083760000,'RUB','Вентиляторы_фильтры.xlsm','IEK',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6907d013e0c765dbe4','Вентиляторы_фильтры','IEK','YCE-FF-021-55','Вентилятор с защитным кожухом IP55 65х97 15Вт','55','{"объем":"21 м3/час","мощность, Вт":15}',3630180000,'RUB','Вентиляторы_фильтры.xlsm','IEK',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-665f8013b8f341bf93','Вентиляторы_фильтры','IEK','YCE-FF-055-55','Вентилятор с защитным кожухом IP55 63х125 18Вт','55','{"объем":"55 м3/час","мощность, Вт":18}',5018910000,'RUB','Вентиляторы_фильтры.xlsm','IEK',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7798f098436fc4ba2d','Вентиляторы_фильтры','IEK','YCE-FF-102-55','Вентилятор с защитным кожухом IP55 86х176 18Вт','55','{"объем":"102 м3/час","мощность, Вт":18}',5514340000,'RUB','Вентиляторы_фильтры.xlsm','IEK',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8e7f79da8ba4d22359','Вентиляторы_фильтры','EKF','EXF19','Фильтр с решеткой для вентиляции IP54 92х92','54','{"объем":"19 м3/час","Тип":"PROxima"}',1440590000,'RUB','Вентиляторы_фильтры.xlsm','EKF',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-67a4d4d988ae13b36f','Вентиляторы_фильтры','EKF','EXF52','Фильтр с решеткой для вентиляции IP54 124х124','54','{"объем":"52 м3/час","Тип":"PROxima"}',1408720000,'RUB','Вентиляторы_фильтры.xlsm','EKF',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-75187059f8fb69f26f','Вентиляторы_фильтры','EKF','EXF170','Фильтр с решеткой для вентиляции IP55 176х176','54','{"объем":"102 м3/час","Тип":"PROxima"}',1818400000,'RUB','Вентиляторы_фильтры.xlsm','EKF',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8099f62792269be799','Вентиляторы_фильтры','EKF','EXF305','Фильтр с решеткой для вентиляции IP55 223х223','54','{"объем":"305 м3/час","Тип":"PROxima"}',2145480000,'RUB','Вентиляторы_фильтры.xlsm','EKF',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-93e7d3b6258b378a88','Вентиляторы_фильтры','EKF','EXF433','Фильтр с решеткой для вентиляции IP55 291х291','54','{"объем":"850 м3/час","Тип":"PROxima"}',3946140000,'RUB','Вентиляторы_фильтры.xlsm','EKF',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-baa961ca7e24c7c066','Вентиляторы_фильтры','EKF','FAN19F','Вентилятор с фильтром IP54 92х92 12Вт','54','{"объем":"19 м3/час","Тип":"PROxima","мощность, Вт":12}',3866170000,'RUB','Вентиляторы_фильтры.xlsm','EKF',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ff6ff3de516c678137','Вентиляторы_фильтры','EKF','FAN52F','Вентилятор с фильтром IP54 124х124 19Вт','54','{"объем":"52 м3/час","Тип":"PROxima","мощность, Вт":19}',3633980000,'RUB','Вентиляторы_фильтры.xlsm','EKF',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-be1703916a7d94aa21','Вентиляторы_фильтры','EKF','FAN102F','Вентилятор с фильтром IP54 176х176 26Вт','54','{"объем":"102 м3/час","Тип":"PROxima","мощность, Вт":25}',4042250000,'RUB','Вентиляторы_фильтры.xlsm','EKF',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b9546eed1d26a8c0bc','Вентиляторы_фильтры','EKF','FAN305F','Вентилятор с фильтром IP54 223х223 64Вт','54','{"объем":"305 м3/час","Тип":"PROxima","мощность, Вт":64}',6528830000,'RUB','Вентиляторы_фильтры.xlsm','EKF',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c7b8f56f550a78b759','Вентиляторы_фильтры','EKF','FAN433F','Вентилятор с фильтром IP54 291х291 95Вт','54','{"объем":"433 м3/час","Тип":"PROxima","мощность, Вт":95}',15594970000,'RUB','Вентиляторы_фильтры.xlsm','EKF',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-14e6b96cf9fd464885','Вентиляторы_фильтры','DA','DA92','Фильтр с решеткой для вентиляции IP54 92х92','54','{"объем":"39 м3/час"}',680000000,'RUB','Вентиляторы_фильтры.xlsm','DA',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-78b2fd326c2e9ff9ca','Вентиляторы_фильтры','DA','DA125','Фильтр с решеткой для вентиляции IP54 124х124','54','{"объем":"138 м3/час"}',750000000,'RUB','Вентиляторы_фильтры.xlsm','DA',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4ec0adbe912696d696','Вентиляторы_фильтры','DA','DA177','Фильтр с решеткой для вентиляции IP55 176х176','54','{"объем":"102 м3/час"}',780000000,'RUB','Вентиляторы_фильтры.xlsm','DA',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-04903f10f839cac16f','Вентиляторы_фильтры','DA','DA223','Фильтр с решеткой для вентиляции IP55 223х223','54','{"объем":"316 м3/час"}',1000000000,'RUB','Вентиляторы_фильтры.xlsm','DA',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-69f912d7f4345c9a8e','Вентиляторы_фильтры','DA','DA291','Фильтр с решеткой для вентиляции IP55 291х291','54','{"объем":"1000 м3/час"}',1440000000,'RUB','Вентиляторы_фильтры.xlsm','DA',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-192d044303b3b016da','Вентиляторы_фильтры','DA','DA92F','Вентилятор с фильтром IP54 92х92 12Вт','54','{"объем":"39 м3/час","мощность, Вт":13}',2360000000,'RUB','Вентиляторы_фильтры.xlsm','DA',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f54d3ba18663d873ae','Вентиляторы_фильтры','DA','DA125F','Вентилятор с фильтром IP54 125х125 19Вт','54','{"объем":"138 м3/час","мощность, Вт":21}',2490000000,'RUB','Вентиляторы_фильтры.xlsm','DA',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-94274963b16ff56cbd','Вентиляторы_фильтры','DA','DA177F','Вентилятор с фильтром IP54 177х177 26Вт','54','{"объем":"102 м3/час","мощность, Вт":26}',3470000000,'RUB','Вентиляторы_фильтры.xlsm','DA',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-96bebb3174bfcb7099','Вентиляторы_фильтры','DA','DA223F','Вентилятор с фильтром IP54 223х223 64Вт','54','{"объем":"316 м3/час","мощность, Вт":28}',3530000000,'RUB','Вентиляторы_фильтры.xlsm','DA',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e2b1385cda082eb4d6','Вентиляторы_фильтры','DA','DA291F','Вентилятор с фильтром IP54 291х291 95Вт','54','{"объем":"1000 м3/час","мощность, Вт":72}',8670000000,'RUB','Вентиляторы_фильтры.xlsm','DA',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fac6e117c639c519f2','ИБП','DKC','AS400SM','Адаптер AS400 («сухие контакты»)','2NO','{"TYPE":"AS400","ASSEMBLYLIST":"AS400"}',261000000,'RUB','ИБП.xlsx','PW',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-93d32b425fd4ee8b84','ИБП','DKC','SMALLT3A10S','ИБП ДКС серии Small Tower, 3000 ВА/2700 Вт','2700 Вт','{"TYPE":"3000 ВА"}',266000000,'RUB','ИБП.xlsx','PW',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-238d846d880cc5c44e','ИБП','DKC','DRYCONTM','Адаптер AS400 («сухие контакты»)','-','{"TYPE":"AS400"}',267000000,'RUB','ИБП.xlsx','PW',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c6b0648ac56169a313','ИБП','Delta','UPS202N2000B035','Источник бемперебойного питания, AMPLON серия N 2 кВА','1800 Вт','{"TYPE":"AMPLON"}',268000000,'RUB','ИБП.xlsx','PW',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b70b482ec106561f49','ИБП','Delta','3915100474-S','Мини-карта ввода/вывода «сухие контакты (Mini relay I/O card для ИБП серий N (1kVA), RT, EH, HPH)','-','{"TYPE":"Mini relay I/O card"}',269000000,'RUB','ИБП.xlsx','PW',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ed0a0cb35e26f4d886','ИБП','Delta','UPS302N2000B035','Источник бемперебойного питания, AMPLON серия N 3 кВА','2700 Вт','{"TYPE":"AMPLON"}',270000000,'RUB','ИБП.xlsx','PW',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8c42ec5052acb15d8c','ИБП','Штиль','SW500SL','Источник бесперебойного питания','220VAC/500ВА','{"TYPE":"on-line (двойного преобразования)"}',271000000,'RUB','ИБП.xlsx','PW',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6040d8fed148584795','ИБП','Штиль','SW1000SL','Источник бесперебойного питания','220VAC/1кВА','{"TYPE":"on-line (двойного преобразования)"}',170000000,'RUB','ИБП.xlsx','PW',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ec5a4ffaa09a58b8c3','ИБП','Delta','GES153EH320035','Источник бемперебойного питания, 380В/220В','15 КВА / 12 КВТ','{"TYPE":"Ultron EH-series","MISCELLANEOUS1":"EH-15K","MISCELLANEOUS2":"Iвх=25А"}',174000000,'RUB','ИБП.xlsx','PW',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-506d544fd746873558','ИБП','Delta','GES103EH320035','Источник бемперебойного питания, 380В','8 кВт','{"TYPE":"EH"}',181000000,'RUB','ИБП.xlsx','PW',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-02f583b2fbc5ac7921','ИБП','Delta','GES203EH320035','Источник бемперебойного питания, 380В','16 кВт','{"TYPE":"EH"}',182000000,'RUB','ИБП.xlsx','PW',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5fc7001c0b66b2032f','ИБП','Delta','UPS1','Карта релейных выходов','3NO','{"TYPE":"-"}',183000000,'RUB','ИБП.xlsx','PW',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0d486268b5988b8e61','ИБП','Delta','UPS2','Карта Modbus RTU','RS485','{"TYPE":"-"}',184000000,'RUB','ИБП.xlsx','PW',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9510beaecb28511f37','ИБП','Delta','3915101864-s','Плата релейный выходов','3_NO','{"TYPE":"-","ASSEMBLYLIST":"Реле_ИБП"}',259000000,'RUB','ИБП.xlsx','PW',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-504a2c2eb687ab1cad','ИБП','DKC','SMALLT2A10S','ИБП ДКС серии Small Tower, 2000 ВА/1800 Вт','1800 Вт','{"TYPE":"2000 ВА","ASSEMBLYCODE":"AS400"}',260000000,'RUB','ИБП.xlsx','PW',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c2f61b3d964128b7a6','Клеммы','Klemsan','304120RP','Клеммник на DIN-рейку 2,5 мм.кв. (серый)','AVK2,5','{"уровни":"1 ур.","ток, А":27}',NULL,'RUB','Клеммы.xlsm','Klemsan',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f43a8e583d1ade56df','Клеммы','Klemsan','304130RP','Клеммник на DIN-рейку 4 мм.кв. (серый)','AVK4','{"уровни":"1 ур.","ток, А":36}',NULL,'RUB','Клеммы.xlsm','Klemsan',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f55962c093404ed5a3','Клеммы','Klemsan','304140RP','Клеммник на DIN-рейку 6 мм.кв. (серый)','AVK6','{"уровни":"1 ур.","ток, А":46}',NULL,'RUB','Клеммы.xlsm','Klemsan',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b2f5771fd63753c540','Клеммы','Klemsan','304150RP','Клеммник на DIN-рейку 10 мм.кв. (серый)','AVK10','{"уровни":"1 ур.","ток, А":63}',NULL,'RUB','Клеммы.xlsm','Klemsan',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-11b5fbde4288f1fc6c','Клеммы','Klemsan','304240','Клеммник на DIN-рейку 16 мм.кв. (серый)','AVK16','{"уровни":"1 ур.","ток, А":84}',NULL,'RUB','Клеммы.xlsm','Klemsan',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b4e253b920dce09826','Клеммы','Klemsan','304290','Клеммник на DIN-рейку 25 мм.кв. (серый)','AVK25','{"уровни":"1 ур.","ток, А":112}',NULL,'RUB','Клеммы.xlsm','Klemsan',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2762317a833186fdb7','Клеммы','Klemsan','304250','Клеммник на DIN-рейку 35 мм.кв. (серый)','AVK35','{"уровни":"1 ур.","ток, А":137}',18290000,'RUB','Клеммы.xlsm','Klemsan',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a55987ddd5ee62b31f','Клеммы','Klemsan','304330','Клеммник на DIN-рейку 50 мм.кв. (серый)','AVK50','{"уровни":"1 ур.","ток, А":167}',NULL,'RUB','Клеммы.xlsm','Klemsan',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c745c34128b8184bd5','Клеммы','Klemsan','304490','Клеммник на DIN-рейку 70 мм.кв. (серый)','AVK70','{"уровни":"1 ур.","ток, А":211}',NULL,'RUB','Клеммы.xlsm','Klemsan',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7678fd508a3b1b1b56','Клеммы','Klemsan','304340','Клеммник на DIN-рейку 95 мм.кв. (серый)','AVK95','{"уровни":"1 ур.","ток, А":261}',NULL,'RUB','Клеммы.xlsm','Klemsan',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-bd71a765b2d0847e72','Клеммы','Klemsan','444120','Концевой сегмент на клеммники AVK(2,5-10)- AVK RD (2,5-4), (серый)','NPP 2,5-10','{"уровни":"1 ур."}',NULL,'RUB','Клеммы.xlsm','Klemsan',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5a2aed1081e02d1cfc','Клеммы','Klemsan','444170','Концевой сегмент на клеммники AVK 16RD, (серый)','NPP 16RD','{"уровни":"1 ур."}',NULL,'RUB','Клеммы.xlsm','Klemsan',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9a5ac90753b305c7aa','Клеммы','Klemsan','450250','Концевой сегмент на клеммники AVK 25RD, (серый)','NPP 25RD','{"уровни":"1 ур."}',NULL,'RUB','Клеммы.xlsm','Klemsan',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4016a50754400b3923','Клеммы','Klemsan','449019','Концевой сегмент на клеммники 2-х ярусные PIK(2,5-4)N, (серый)','NPP PIK 2,5-4N','{"уровни":"2 ур."}',NULL,'RUB','Клеммы.xlsm','Klemsan',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-75a059eb566cf6aff2','Клеммы','Klemsan','450059','Концевой сегмент на клеммники ASK 3*, (серый)','NPP ASK3','{"уровни":"1 ур."}',NULL,'RUB','Клеммы.xlsm','Klemsan',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c85cd910ca87f7a03c','Клеммы','Klemsan','304121RP','Клеммник на DIN-рейку 2,5мм.кв. (синий)','AVK2,5','{"уровни":"1 ур.","ток, А":27}',NULL,'RUB','Клеммы.xlsm','Klemsan',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-45fdf3ff1841e0b8d2','Клеммы','Klemsan','304131RP','Клеммник на DIN-рейку 4 мм.кв. (синий)','AVK4','{"уровни":"1 ур.","ток, А":36}',NULL,'RUB','Клеммы.xlsm','Klemsan',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5b5a9d5ae5a4fe9f30','Клеммы','Klemsan','304141RP','Клеммник на DIN-рейку 6 мм.кв. (синий)','AVK6','{"уровни":"1 ур.","ток, А":46}',NULL,'RUB','Клеммы.xlsm','Klemsan',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fda9aa68ef47747a15','Клеммы','Klemsan','304151RP','Клеммник на DIN-рейку 10 мм.кв. (синий)','AVK10','{"уровни":"1 ур.","ток, А":63}',NULL,'RUB','Клеммы.xlsm','Klemsan',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ffaf4184193890ae78','Клеммы','Klemsan','304161','Клеммник на DIN-рейку 16 мм.кв. (синий)','AVK16','{"уровни":"1 ур.","ток, А":84}',NULL,'RUB','Клеммы.xlsm','Klemsan',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f69ce90dfc3f6054d2','Клеммы','Klemsan','304291','Клеммник на DIN-рейку 25 мм.кв. (синий)','AVK25','{"уровни":"1 ур.","ток, А":112}',NULL,'RUB','Клеммы.xlsm','Klemsan',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-31cd8e1e3984b64784','Клеммы','Klemsan','304251','Клеммник на DIN-рейку 35 мм.кв. (синий)','AVK35','{"уровни":"1 ур.","ток, А":137}',NULL,'RUB','Клеммы.xlsm','Klemsan',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0251b7e728394dcd38','Клеммы','Klemsan','304331','Клеммник на DIN-рейку 50 мм.кв. (синий)','AVK50','{"уровни":"1 ур.","ток, А":167}',NULL,'RUB','Клеммы.xlsm','Klemsan',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1d5668ede4f697d851','Клеммы','Klemsan','304191','Клеммник на DIN-рейку 70 мм.кв. (синий)','AVK70','{"уровни":"1 ур.","ток, А":211}',NULL,'RUB','Клеммы.xlsm','Klemsan',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-50c8ecf1fdf0a2d425','Клеммы','Klemsan','304341','Клеммник на DIN-рейку 95 мм.кв. (синий)','AVK95','{"уровни":"1 ур.","ток, А":261}',NULL,'RUB','Клеммы.xlsm','Klemsan',26);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f5f49226ea7822c3f7','Клеммы','Klemsan','334170','Клеммник на DIN-рейку 2,5 мм.кв. (земля)','AVK2,5','{"уровни":"1 ур.","ток, А":27}',NULL,'RUB','Клеммы.xlsm','Klemsan',27);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-12ed6e20c8bf383f79','Клеммы','Klemsan','334180','Клеммник на DIN-рейку 4 мм.кв. (земля)','AVK4','{"уровни":"1 ур.","ток, А":36}',NULL,'RUB','Клеммы.xlsm','Klemsan',28);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e35f44d60216de7616','Клеммы','Klemsan','334460','Клеммник на DIN-рейку 6 мм.кв.  (земля)','AVK 6TK','{"уровни":"1 ур.","ток, А":46}',NULL,'RUB','Клеммы.xlsm','Klemsan',29);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d04dbda09873b5bc53','Клеммы','Klemsan','334140','Клеммник на DIN-рейку 10 мм.кв. (земля)','AVK10','{"уровни":"1 ур.","ток, А":63}',1230300000,'RUB','Клеммы.xlsm','Klemsan',30);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8981891d19b5edc203','Клеммы','Klemsan','334200','Клеммник на DIN-рейку 16 мм.кв. (земля)','AVK 16T RD','{"уровни":"1 ур.","ток, А":84}',2049110000,'RUB','Клеммы.xlsm','Klemsan',31);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9bc1bf56558de77368','Клеммы','Klemsan','304180','Клеммник на DIN-рейку 35 мм.кв. (земля)','AVK35','{"уровни":"1 ур.","ток, А":137}',5920000,'RUB','Клеммы.xlsm','Klemsan',32);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ac64bfb84d8530eed9','Клеммы','Klemsan','334190','Клеммник на DIN-рейку 50 мм.кв., (земля)','AVK50 T','{"уровни":"1 ур.","ток, А":167}',23388610000,'RUB','Клеммы.xlsm','Klemsan',33);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-45926edf637fd57b73','Клеммы','Klemsan','336660','Клеммник на DIN-рейку 70-95 мм.кв., (земля)','AVK 70-95T','{"уровни":"1 ур.","ток, А":261}',NULL,'RUB','Клеммы.xlsm','Klemsan',34);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c9adcba528f78a99fb','Клеммы','Klemsan','317109','Клеммник 2-х ярусный на DIN-рейку 2,5мм.кв. (серый)','PIK2,5N','{"уровни":"2 ур."}',30933330000,'RUB','Клеммы.xlsm','Klemsan',35);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7b8157b3328bf63d88','Клеммы','Klemsan','355109','Клеммник с держ. предохр. (5х20, 5х25), откид.картридж, на DIN-рейку, 4 мм.кв., (серый)','ASK 3M','{"уровни":"1 ур."}',NULL,'RUB','Клеммы.xlsm','Klemsan',36);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f884a1ed36fd5ad903','Клеммы','DKC','TUR-2.5R','Клемма TUR-2.5R мм.кв. серый','TUR','{"Цвет":"серый","ток, А":27,"сечение":2.5}',56750000,'RUB','Клеммы.xlsm','DKC',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cdf669c69652197845','Клеммы','DKC','TUR-4R','Клемма TUR-4R мм.кв. серый','TUR','{"Цвет":"серый","ток, А":36,"сечение":4}',61570000,'RUB','Клеммы.xlsm','DKC',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-da95876f4746f3c95d','Клеммы','DKC','TUR-6','Клемма TUR-6R мм.кв. серый','TUR','{"Цвет":"серый","ток, А":46,"сечение":6}',86330000,'RUB','Клеммы.xlsm','DKC',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c2a1a3f5330a9aa586','Клеммы','DKC','TUR-10','Клемма TUR-10R мм.кв. серый','TUR','{"Цвет":"серый","ток, А":63,"сечение":10}',119470000,'RUB','Клеммы.xlsm','DKC',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-50b6fa5adbeeeff005','Клеммы','DKC','TUR-16','Клемма TUR-16R мм.кв. серый','TUR','{"Цвет":"серый","ток, А":84,"сечение":16}',201630000,'RUB','Клеммы.xlsm','DKC',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-77103ef7466e982a68','Клеммы','DKC','TUR-35R','Клемма TUR-35R мм.кв. серый','TUR','{"Цвет":"серый","ток, А":137,"сечение":35}',427180000,'RUB','Клеммы.xlsm','DKC',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-34576f06aefc0298ae','Клеммы','DKC','KRUH-50','Клемма KRUH-50 мм.кв. серый','KRUH','{"Цвет":"серый","ток, А":167,"сечение":50}',941570000,'RUB','Клеммы.xlsm','DKC',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6be572b4afdb48fd9e','Клеммы','DKC','KRUH-95','Клемма KRUH-95 мм.кв. серый','KRUH','{"Цвет":"серый","ток, А":261,"сечение":95}',1401010000,'RUB','Клеммы.xlsm','DKC',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c09a8280b8bfca529e','Клеммы','DKC','KRUH-150','Клемма KRUH-150 мм.кв. серый','KRUH','{"Цвет":"серый","ток, А":309,"сечение":150}',3051030000,'RUB','Клеммы.xlsm','DKC',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f58ee5e9cdff7c84c7','Клеммы','DKC','TUR-2.5-BU','Клемма TUR-2.5 мм.кв. синяя','TUR','{"Цвет":"синяя","ток, А":27,"сечение":2.5}',60930000,'RUB','Клеммы.xlsm','DKC',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0684167f84a297b0d8','Клеммы','DKC','TUR-4-BU','Клемма TUR-4 мм.кв. синяя','TUR','{"Цвет":"синяя","ток, А":36,"сечение":4}',72340000,'RUB','Клеммы.xlsm','DKC',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-decd05d08996e84bfd','Клеммы','DKC','TUR-6-BU','Клемма TUR-6 мм.кв. синяя','TUR','{"Цвет":"синяя","ток, А":46,"сечение":6}',97900000,'RUB','Клеммы.xlsm','DKC',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-25150e1ec98b32c3a5','Клеммы','DKC','TUR-10-BU','Клемма TUR-10 мм.кв. синяя','TUR','{"Цвет":"синяя","ток, А":63,"сечение":10}',135120000,'RUB','Клеммы.xlsm','DKC',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-37e0026f4fe41bff3a','Клеммы','DKC','TUR-16-BU','Клемма TUR-16 мм.кв. синяя','TUR','{"Цвет":"синяя","ток, А":84,"сечение":16}',201630000,'RUB','Клеммы.xlsm','DKC',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-73f3065496c38f68c4','Клеммы','DKC','KRU-35N-BU','Клемма KRUH-35 мм.кв. синяя','KRUH','{"Цвет":"синяя","ток, А":137,"сечение":35}',427180000,'RUB','Клеммы.xlsm','DKC',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d249d124c9cd3600e5','Клеммы','DKC','KRUH-50-BU','Клемма KRUH-50 мм.кв. синяя','KRUH','{"Цвет":"синяя","ток, А":167,"сечение":50}',923120000,'RUB','Клеммы.xlsm','DKC',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-00d0d477d05c0c6ab2','Клеммы','DKC','KRUH-95-BU','Клемма KRUH-95 мм.кв. синяя','KRUH','{"Цвет":"синяя","ток, А":211,"сечение":95}',1401010000,'RUB','Клеммы.xlsm','DKC',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a4ce2b4a726d724f5a','Клеммы','DKC','KRUH-150-BU','Клемма KRUH-150 мм.кв. синяя','KRUH','{"Цвет":"синяя","ток, А":309,"сечение":150}',3051030000,'RUB','Клеммы.xlsm','DKC',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9b699f471bee88f440','Клеммы','DKC','KRUH-240-BU','Клемма KRUH-240 мм.кв. синяя','KRUH','{"Цвет":"Земля","ток, А":27,"сечение":2.5}',4000720000,'RUB','Клеммы.xlsm','DKC',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e9de5b4e8d039418d2','Клеммы','DKC','ZTO120','Клемма TEO.6/C мм.кв. земля','TEO','{"Цвет":"Земля","ток, А":46,"сечение":6}',291670000,'RUB','Клеммы.xlsm','DKC',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1e1e9ea924986b510f','Клеммы','DKC','ZTO510','Клемма TEO.10/C мм.кв. земля','TEO','{"Цвет":"Земля","ток, А":63,"сечение":10}',373000000,'RUB','Клеммы.xlsm','DKC',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fe781c8e184c084dbe','Клеммы','DKC','ZTO220','Клемма TEO.16/C мм.кв. земля','TEO','{"Цвет":"Земля","ток, А":84,"сечение":16}',519000000,'RUB','Клеммы.xlsm','DKC',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-67da4bec9b77fb1c12','Клеммы','DKC','ZTO320','Клемма TEC.35/O мм.кв. земля','TEO','{"Цвет":"Земля","ток, А":137,"сечение":35}',1218790000,'RUB','Клеммы.xlsm','DKC',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8e4bb40d38168d9990','Клеммы','DKC','ZTO810','Клемма TEO.70/C мм.кв. земля','TEO','{"Цвет":"Земля","ток, А":211,"сечение":95}',2966000000,'RUB','Клеммы.xlsm','DKC',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5d51b06caac5709632','Клеммы','EKF','SM-3x30','Шина медная М1T 3х30х4000','М1T','{"Цвет":"Ш","ток, А":380,"сечение":"3х30"}',12320580000,'RUB','Клеммы.xlsm','EKF',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-84c081306b7a0bdd51','Клеммы','EKF','SM-4x30','Шина медная М1T 4х30х4000','М1T','{"Цвет":"Ш","ток, А":475,"сечение":"4х30"}',15224810000,'RUB','Клеммы.xlsm','EKF',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-874ea7334efaafa432','Клеммы','EKF','SM-5x30','Шина медная М1T 5х30х4000','М1T','{"Цвет":"Ш","ток, А":529,"сечение":"5х30"}',19157220000,'RUB','Клеммы.xlsm','EKF',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-52901b77f1366ec3d2','Клеммы','EKF','SM-5x40','Шина медная М1T 5х40х4000','М1T','{"Цвет":"Ш","ток, А":700,"сечение":"5х40"}',27254600000,'RUB','Клеммы.xlsm','EKF',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5e036c0417e56dc92d','Клеммы','EKF','SM-5x50','Шина медная М1T 5х50х4000','М1T','{"Цвет":"Ш","ток, А":860,"сечение":"5х50"}',34068230000,'RUB','Клеммы.xlsm','EKF',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cc8ef7a7ac4c9d11b5','Клеммы','EKF','SM-6x60','Шина медная М1T 6х60х4000','М1T','{"Цвет":"Ш","ток, А":1125,"сечение":"6х60"}',53714290000,'RUB','Клеммы.xlsm','EKF',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6ded87a212f971d6e8','Клеммы','EKF','SM-8x80','Шина медная М1T 8х80х4000','М1T','{"Цвет":"Ш","ток, А":1690,"сечение":"8х80"}',95439180000,'RUB','Клеммы.xlsm','EKF',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9b0b8b6aa245add0ab','Клеммы','EKF','SM-10x100','Шина медная М1T 10х100х4000','М1T','{"Цвет":"Ш","ток, А":2310,"сечение":"10х100"}',135515950000,'RUB','Клеммы.xlsm','EKF',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-71d71fadfd3f42f001','Клеммы','EKF','scr-ut-2,5-g','Клемма UT-2.5 мм.кв. серый','UT','{"Цвет":"Серый","ток, А":27,"сечение":"2.5"}',34530000,'RUB','Клеммы.xlsm','EKF',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c074317c5ffec91dff','Клеммы','EKF','scr-ut-4-g','Клемма UT-4 мм.кв. серый','UT','{"Цвет":"Серый","ток, А":36,"сечение":4}',43010000,'RUB','Клеммы.xlsm','EKF',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-17f1035dcbfb67470b','Клеммы','EKF','scr-ut-6-g','Клемма UT-6 мм.кв. серый','UT','{"Цвет":"Серый","ток, А":46,"сечение":"6"}',68420000,'RUB','Клеммы.xlsm','EKF',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-13c51952f68822f212','Клеммы','EKF','scr-ut-10-g','Клемма UT-10 мм.кв. серый','UT','{"Цвет":"Серый","ток, А":63,"сечение":"10"}',67980000,'RUB','Клеммы.xlsm','EKF',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8623b9ebdc652d124b','Клеммы','EKF','scr-ut-16-g','Клемма UT-16 мм.кв. серый','UT','{"Цвет":"Серый","ток, А":84,"сечение":"16"}',127100000,'RUB','Клеммы.xlsm','EKF',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8ac90417a186b29c49','Клеммы','EKF','scr-ut-35-g','Клемма UT-35 мм.кв. серый','UT','{"Цвет":"Серый","ток, А":137,"сечение":"35"}',236200000,'RUB','Клеммы.xlsm','EKF',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-bed4ad9bccda21f318','Клеммы','EKF','scr-ut-70-g','Клемма UT-70 мм.кв. серый','UT','{"Цвет":"Серый","ток, А":211,"сечение":"70"}',899200000,'RUB','Клеммы.xlsm','EKF',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-64b540cb63c917372b','Клеммы','EKF','scr-ut-95-g','Клемма UT-95 мм.кв. серый','UT','{"Цвет":"Серый","ток, А":261,"сечение":"95"}',1377290000,'RUB','Клеммы.xlsm','EKF',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-acd76973e355c7c154','Клеммы','EKF','scr-ut-2,5-b','Клемма UT-2.5 мм.кв. синяя','UT','{"Цвет":"Синий","ток, А":36,"сечение":"2.5"}',34480000,'RUB','Клеммы.xlsm','EKF',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5675d23c9701f4e624','Клеммы','EKF','scr-ut-4-b','Клемма UT-4 мм.кв. синяя','UT','{"Цвет":"Синий","ток, А":36,"сечение":4}',46700000,'RUB','Клеммы.xlsm','EKF',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4873f95dcd41b21945','Клеммы','EKF','scr-ut-6-b','Клемма UT-6 мм.кв. синяя','UT','{"Цвет":"Синий","ток, А":46,"сечение":"6"}',70080000,'RUB','Клеммы.xlsm','EKF',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0249e0c3080272488f','Клеммы','EKF','scr-ut-10-b','Клемма UT-10 мм.кв. синяя','UT','{"Цвет":"Синий","ток, А":63,"сечение":"10"}',69760000,'RUB','Клеммы.xlsm','EKF',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-93d7b2bd71e777fda5','Клеммы','EKF','scr-ut-16-b','Клемма UT-16 мм.кв. синяя','UT','{"Цвет":"Синий","ток, А":84,"сечение":"16"}',159600000,'RUB','Клеммы.xlsm','EKF',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4fa7d8a99c6d2149e5','Клеммы','EKF','scr-ut-35-b','Клемма UT-35 мм.кв. синяя','UT','{"Цвет":"Синий","ток, А":137,"сечение":"35"}',245560000,'RUB','Клеммы.xlsm','EKF',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3762695d684e2af715','Клеммы','EKF','scr-ut-70-b','Клемма UT-70 мм.кв. синяя','UT','{"Цвет":"Синий","ток, А":211,"сечение":"70"}',890770000,'RUB','Клеммы.xlsm','EKF',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9c142c18a77604bbba','Клеммы','EKF','scr-ut-95-b','Клемма UT-95 мм.кв. синяя','UT','{"Цвет":"Синий","ток, А":261,"сечение":"95"}',1272350000,'RUB','Клеммы.xlsm','EKF',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fa6c5b6820f054c227','Клеммы','EKF','scr-ut-2,5-pe','Клемма UT-2.5 мм.кв. земля','UT','{"Цвет":"Земля","ток, А":36,"сечение":"2.5"}',180330000,'RUB','Клеммы.xlsm','EKF',26);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4f74c1d7104579fc01','Клеммы','EKF','scr-ut-4-pe','Клемма UT-4 мм.кв. земля','UT','{"Цвет":"Земля","ток, А":36,"сечение":4}',116630000,'RUB','Клеммы.xlsm','EKF',27);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-554543457d3a0f9bb8','Клеммы','EKF','scr-ut-6-pe','Клемма UT-6 мм.кв. земля','UT','{"Цвет":"Земля","ток, А":46,"сечение":"6"}',194720000,'RUB','Клеммы.xlsm','EKF',28);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8ad48b99fdd11d9eda','Клеммы','EKF','scr-ut-10-pe','Клемма UT-10 мм.кв. земля','UT','{"Цвет":"Земля","ток, А":63,"сечение":"10"}',212770000,'RUB','Клеммы.xlsm','EKF',29);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ca4c5089fb618e92bf','Клеммы','EKF','scr-ut-16-pe','Клемма UT-16 мм.кв. земля','UT','{"Цвет":"Земля","ток, А":84,"сечение":"16"}',445970000,'RUB','Клеммы.xlsm','EKF',30);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-07cb9cd16ae1c134be','Клеммы','EKF','scr-ut-35-pe','Клемма UT-35 мм.кв. земля','UT','{"Цвет":"Земля","ток, А":137,"сечение":"35"}',612240000,'RUB','Клеммы.xlsm','EKF',31);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2186e678ec2030164f','Клеммы','EKF','scr-ut-70-pe','Клемма UT-70 мм.кв. земля','UT','{"Цвет":"Земля","ток, А":211,"сечение":"70"}',2650520000,'RUB','Клеммы.xlsm','EKF',32);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c1983736c210093744','Клеммы','IEK','YZN10-002-K03','Клемма ЗНИ-2.5 мм.кв. серый','ЗНИ','{"Цвет":"Серый","ток, А":27,"сечение":"2.5"}',46310000,'RUB','Клеммы.xlsm','IEK',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-83bfa16b525ef815b8','Клеммы','IEK','YZN10-004-K03','Клемма ЗНИ-4 мм.кв. серый','ЗНИ','{"Цвет":"Серый","ток, А":36,"сечение":4}',46510000,'RUB','Клеммы.xlsm','IEK',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-297ea135218e901800','Клеммы','IEK','YZN10-006-K03','Клемма ЗНИ-6 мм.кв. серый','ЗНИ','{"Цвет":"Серый","ток, А":46,"сечение":"6"}',55230000,'RUB','Клеммы.xlsm','IEK',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8f0909d059da97df5e','Клеммы','IEK','YZN10-010-K03','Клемма ЗНИ-10 мм.кв. серый','ЗНИ','{"Цвет":"Серый","ток, А":63,"сечение":"10"}',77370000,'RUB','Клеммы.xlsm','IEK',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9de901993d0c616129','Клеммы','IEK','YZN10-016-K03','Клемма ЗНИ-16 мм.кв. серый','ЗНИ','{"Цвет":"Серый","ток, А":84,"сечение":"16"}',168490000,'RUB','Клеммы.xlsm','IEK',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b7b1221f52ecf797fe','Клеммы','IEK','YZN10-035-K03','Клемма ЗНИ-35 мм.кв. серый','ЗНИ','{"Цвет":"Серый","ток, А":137,"сечение":"35"}',198520000,'RUB','Клеммы.xlsm','IEK',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4a2ca03fd42205e453','Клеммы','IEK','YZN10-070-K03','Клемма ЗНИ-70 мм.кв. серый','ЗНИ','{"Цвет":"Серый","ток, А":211,"сечение":"70"}',648600000,'RUB','Клеммы.xlsm','IEK',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f2c17fa0e6856287be','Клеммы','IEK','YZN10-095-K03','Клемма ЗНИ-95 мм.кв. серый','ЗНИ','{"Цвет":"Серый","ток, А":261,"сечение":"95"}',1517480000,'RUB','Клеммы.xlsm','IEK',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-44b95a9eb428906c63','Клеммы','IEK','YZN10-002-K07','Клемма ЗНИ-2,5 мм.кв. синий','ЗНИ','{"Цвет":"Синий","ток, А":36,"сечение":"2,5"}',46140000,'RUB','Клеммы.xlsm','IEK',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fc36833773a28c97fe','Клеммы','IEK','YZN10-004-K07','Клемма ЗНИ-4 мм.кв. синий','ЗНИ','{"Цвет":"Синий","ток, А":36,"сечение":"4"}',46620000,'RUB','Клеммы.xlsm','IEK',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e926748fc3e738a1ae','Клеммы','IEK','YZN10-006-K07','Клемма ЗНИ-6 мм.кв. синий','ЗНИ','{"Цвет":"Синий","ток, А":46,"сечение":"6"}',58070000,'RUB','Клеммы.xlsm','IEK',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f4bf0ea9e1f3cbba33','Клеммы','IEK','YZN10-010-K07','Клемма ЗНИ-10 мм.кв. синий','ЗНИ','{"Цвет":"Синий","ток, А":63,"сечение":"10"}',76860000,'RUB','Клеммы.xlsm','IEK',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-68b3977146201e4425','Клеммы','IEK','YZN10-016-K07','Клемма ЗНИ-16 мм.кв. синий','ЗНИ','{"Цвет":"Синий","ток, А":84,"сечение":"16"}',168930000,'RUB','Клеммы.xlsm','IEK',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7ae4b697376a2430c8','Клеммы','IEK','YZN10-035-K07','Клемма ЗНИ-35 мм.кв. синий','ЗНИ','{"Цвет":"Синий","ток, А":137,"сечение":"35"}',189700000,'RUB','Клеммы.xlsm','IEK',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-58d42fabcaf423a5e4','Клеммы','IEK','YZN10-070-K07','Клемма ЗНИ-70 мм.кв. синий','ЗНИ','{"Цвет":"Синий","ток, А":211,"сечение":"70"}',631300000,'RUB','Клеммы.xlsm','IEK',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f21486db6ac0ab9c36','Клеммы','IEK','YZN10-095-K07','Клемма ЗНИ-95 мм.кв. синий','ЗНИ','{"Цвет":"Синий","ток, А":261,"сечение":"95"}',1512970000,'RUB','Клеммы.xlsm','IEK',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5c8534962827b97ac7','Клеммы','IEK','YZN20-004-K52','Клемма ЗНИ-4 мм.кв. земля','ЗНИ','{"Цвет":"Земля","ток, А":36,"сечение":"4"}',122340000,'RUB','Клеммы.xlsm','IEK',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2592c15bbc7cfa139a','Клеммы','IEK','YZN20-006-K52','Клемма ЗНИ-6 мм.кв. земля','ЗНИ','{"Цвет":"Земля","ток, А":46,"сечение":"6"}',138380000,'RUB','Клеммы.xlsm','IEK',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-eefde4e29716bc714c','Клеммы','IEK','YZN20-010-K52','Клемма ЗНИ-10 мм.кв. земля','ЗНИ','{"Цвет":"Земля","ток, А":63,"сечение":"10"}',173650000,'RUB','Клеммы.xlsm','IEK',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-97dcaa19802beba1b6','Клеммы','IEK','YZN20-016-K52','Клемма ЗНИ-16 мм.кв. земля','ЗНИ','{"Цвет":"Земля","ток, А":84,"сечение":"16"}',221710000,'RUB','Клеммы.xlsm','IEK',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4eafbef828b44024a0','Клеммы','IEK','YZN20-035-K52','Клемма ЗНИ-35 мм.кв. земля','ЗНИ','{"Цвет":"Земля","ток, А":137,"сечение":"35"}',433560000,'RUB','Клеммы.xlsm','IEK',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0700745ecfc96ea515','Клеммы','IEK','YZN20-070-K52','Клемма ЗНИ-70 мм.кв. земля','ЗНИ','{"Цвет":"Земля","ток, А":211,"сечение":"70"}',1319530000,'RUB','Клеммы.xlsm','IEK',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c9c9f06f26fafeab12','Клеммы','Onka','1010012','Клемма MRK-2.5 мм.кв. серый','MRK','{"Цвет":"Серый","ток, А":27,"сечение":"2.5"}',NULL,'RUB','Клеммы.xlsm','Onka',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c388ea6e40526910d5','Клеммы','Onka','1010022','Клемма MRK-4 мм.кв. серый','MRK','{"Цвет":"Серый","ток, А":36,"сечение":4}',NULL,'RUB','Клеммы.xlsm','Onka',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c6f0daa8ff7a6c41b4','Клеммы','Onka','1010032','Клемма MRK-6 мм.кв. серый','MRK','{"Цвет":"Серый","ток, А":46,"сечение":"6"}',NULL,'RUB','Клеммы.xlsm','Onka',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-61f60203d8075fb771','Клеммы','Onka','1010042','Клемма MRK-10 мм.кв. серый','MRK','{"Цвет":"Серый","ток, А":63,"сечение":"10"}',NULL,'RUB','Клеммы.xlsm','Onka',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-347d255a0c9465d554','Клеммы','Onka','1010052','Клемма MRK-16 мм.кв. серый','MRK','{"Цвет":"Серый","ток, А":84,"сечение":"16"}',NULL,'RUB','Клеммы.xlsm','Onka',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7a47e23f2a69c7a0af','Клеммы','Onka','1010072','Клемма MRK-35 мм.кв. серый','MRK','{"Цвет":"Серый","ток, А":137,"сечение":"35"}',NULL,'RUB','Клеммы.xlsm','Onka',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-284c01861e678ad24a','Клеммы','Onka','1010102','Клемма MRK-70 мм.кв. серый','MRK','{"Цвет":"Серый","ток, А":211,"сечение":"70"}',NULL,'RUB','Клеммы.xlsm','Onka',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c3e5dd265918a6c8c1','Клеммы','Onka','1010112','Клемма MRK-95 мм.кв. серый','MRK','{"Цвет":"Серый","ток, А":261,"сечение":"95"}',NULL,'RUB','Клеммы.xlsm','Onka',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-abaf734a520a9c0928','Клеммы','Onka','1010015','Клемма MRK-2,5 мм.кв. синий','MRK','{"Цвет":"Синий","ток, А":36,"сечение":"2,5"}',NULL,'RUB','Клеммы.xlsm','Onka',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b4b954a9d0d4921507','Клеммы','Onka','1010125','Клемма MRK-4 мм.кв. синий','MRK','{"Цвет":"Синий","ток, А":36,"сечение":"4"}',NULL,'RUB','Клеммы.xlsm','Onka',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-21501cf1b6c5fa79a4','Клеммы','Onka','1010035','Клемма MRK-6 мм.кв. синий','MRK','{"Цвет":"Синий","ток, А":46,"сечение":"6"}',NULL,'RUB','Клеммы.xlsm','Onka',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-25f6ba08310d62fb8a','Клеммы','Onka','1010045','Клемма MRK-10 мм.кв. синий','MRK','{"Цвет":"Синий","ток, А":63,"сечение":"10"}',NULL,'RUB','Клеммы.xlsm','Onka',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8dc9b267a8292424a7','Клеммы','Onka','1010055','Клемма MRK-16 мм.кв. синий','MRK','{"Цвет":"Синий","ток, А":84,"сечение":"16"}',NULL,'RUB','Клеммы.xlsm','Onka',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b1229ed6c305a0ee76','Клеммы','Onka','1010075','Клемма MRK-35 мм.кв. синий','MRK','{"Цвет":"Синий","ток, А":137,"сечение":"35"}',NULL,'RUB','Клеммы.xlsm','Onka',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fcfcd026c22921fdb3','Клеммы','Onka','1010095','Клемма MRK-50 мм.кв. синий','MRK','{"Цвет":"Синий","ток, А":167,"сечение":50}',NULL,'RUB','Клеммы.xlsm','Onka',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c092ba1012277a90fb','Клеммы','Onka','1010105','Клемма MRK-70 мм.кв. синий','MRK','{"Цвет":"Синий","ток, А":211,"сечение":"70"}',NULL,'RUB','Клеммы.xlsm','Onka',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-160718601b54a9c5e2','Клеммы','Onka','1010115','Клемма MRK-95 мм.кв. синий','MRK','{"Цвет":"Синий","ток, А":261,"сечение":"95"}',NULL,'RUB','Клеммы.xlsm','Onka',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e4c2c66d2fec3a584a','Клеммы','Onka','1010018','Клемма MRK-2,5 мм.кв. земля','MRK','{"Цвет":"Земля","ток, А":36,"сечение":"2,5"}',NULL,'RUB','Клеммы.xlsm','Onka',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-34dd0772979a2a1021','Клеммы','Onka','1010220','Клемма MRK-4 мм.кв. земля','MRK','{"Цвет":"Земля","ток, А":36,"сечение":"4"}',NULL,'RUB','Клеммы.xlsm','Onka',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d3a4470e1e78ec49a6','Клеммы','Onka','1010221','Клемма MRK-6/10 мм.кв. земля','MRK','{"Цвет":"Земля","ток, А":63,"сечение":"10"}',NULL,'RUB','Клеммы.xlsm','Onka',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e5da5615f2f6a2b10e','Клеммы','Onka','1010532','Клемма MRK-16 мм.кв. земля','MRK','{"Цвет":"Земля","ток, А":84,"сечение":"16"}',NULL,'RUB','Клеммы.xlsm','Onka',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f53b0732e48d6eba1f','Клеммы','Onka','1010225','Клемма MRK-35 мм.кв. земля','MRK','{"Цвет":"Земля","ток, А":137,"сечение":"35"}',NULL,'RUB','Клеммы.xlsm','Onka',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b513b8a09386333107','Клеммы','Onka','1010110','Клемма MRK-70 мм.кв. земля','MRK','{"Цвет":"Земля","ток, А":211,"сечение":"70"}',NULL,'RUB','Клеммы.xlsm','Onka',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-bc1a46f585c42e2c8c','Клеммы','Onka','1010120','Клемма MRK-95 мм.кв. земля','MRK','{"Цвет":"Земля","ток, А":261,"сечение":95}',NULL,'RUB','Клеммы.xlsm','Onka',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d840fc82e60c70ccd3','Контактор','Dekraft','21904DEK','Контактор, КМ102-009A-220B-11','КМ-102','{"Мощность. кВт":4,"Ток, А":9,"катушка":230}',1430000000,'RUB','Контактор.xlsm','dekraft',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f1cb6657143c199f6c','Контактор','Dekraft','21910DEK','Контактор, КМ102-012A-220B-11','КМ-102','{"Мощность. кВт":5.5,"Ток, А":12,"катушка":230}',1560000000,'RUB','Контактор.xlsm','dekraft',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ae5dadc57f50d7e381','Контактор','Dekraft','21916DEK','Контактор, КМ102-018A-220B-11','КМ-102','{"Мощность. кВт":7.5,"Ток, А":18,"катушка":230}',1750000000,'RUB','Контактор.xlsm','dekraft',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a16a1b02ae46e61f4c','Контактор','Dekraft','21922DEK','Контактор, КМ102-025A-220B-11','КМ-102','{"Мощность. кВт":11,"Ток, А":25,"катушка":230}',2210000000,'RUB','Контактор.xlsm','dekraft',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-79b63faaf0c334fa00','Контактор','Dekraft','21928DEK','Контактор, КМ102-032A-220B-11','КМ-102','{"Мощность. кВт":15,"Ток, А":32,"катушка":230}',2910000000,'RUB','Контактор.xlsm','dekraft',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-07c92365415cb40d99','Контактор','Dekraft','22006DEK','Контактор, КМ102-040A-220B-11','КМ-102','{"Мощность. кВт":18.5,"Ток, А":40,"катушка":230}',4610000000,'RUB','Контактор.xlsm','dekraft',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c84f7066123fd948d2','Контактор','Dekraft','22007DEK','Контактор, КМ102-050A-220B-11','КМ-102','{"Мощность. кВт":22,"Ток, А":50,"катушка":230}',5610000000,'RUB','Контактор.xlsm','dekraft',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d7a7dbda4fd5d110d6','Контактор','Dekraft','22008DEK','Контактор, КМ102-065A-220B-11','КМ-102','{"Мощность. кВт":30,"Ток, А":65,"катушка":230}',5600000000,'RUB','Контактор.xlsm','dekraft',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e83dd198c846355944','Контактор','Dekraft','22010DEK','Контактор, КМ102-095A-220B-11','КМ-102','{"Мощность. кВт":45,"Ток, А":95,"катушка":230}',8840000000,'RUB','Контактор.xlsm','dekraft',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-aa26d50d6e71a07ecb','Контактор','Dekraft','21937DEK','Контактор, КМ102-115A-220B-11','КМ-102','{"Мощность. кВт":55,"Ток, А":115,"катушка":230}',18680000000,'RUB','Контактор.xlsm','dekraft',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3a8e0d19ab43744e6b','Контактор','Dekraft','21943DEK','Контактор, КМ102-150A-220B-11','КМ-102','{"Мощность. кВт":75,"Ток, А":150,"катушка":230}',20040000000,'RUB','Контактор.xlsm','dekraft',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b668d2aa6ffe75f2c2','Контактор','Dekraft','21949DEK','Контактор, КМ102-185A-220B-11','КМ-102','{"Мощность. кВт":90,"Ток, А":185,"катушка":230}',28550000000,'RUB','Контактор.xlsm','dekraft',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5cfcdb21575b3e1f9c','Контактор','Dekraft','21955DEK','Контактор, КМ102-225A-220B-11','КМ-102','{"Мощность. кВт":110,"Ток, А":225,"катушка":230}',31710000000,'RUB','Контактор.xlsm','dekraft',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d4129860842209b994','Контактор','Dekraft','21964DEK','Контактор, КМ102-330A-220B-11','КМ-102','{"Мощность. кВт":160,"Ток, А":330,"катушка":230}',56150000000,'RUB','Контактор.xlsm','dekraft',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a338febadbd28cd9a5','Контактор','Dekraft','21970DEK','Контактор, КМ102-500A-220B-11','КМ-102','{"Мощность. кВт":250,"Ток, А":500,"катушка":230}',72750000000,'RUB','Контактор.xlsm','dekraft',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-245da267c81917cdb5','Контактор','Dekraft','22188DEK','Мех блокировка, КМ-102, 9-38А','-','{"Мощность. кВт":"-","Ток, А":"-","катушка":"-"}',1280000000,'RUB','Контактор.xlsm','dekraft',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c9f16f1857865a4349','Контактор','Dekraft','22189DEK','Мех блокировка, КМ-102, 40-95А','-','{"Мощность. кВт":"-","Ток, А":"-","катушка":"-"}',1750000000,'RUB','Контактор.xlsm','dekraft',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-58113d0a07561f964f','Контактор','Dekraft','22190DEK','Мех блокировка, КМ-102, 115-150А','-','{"Мощность. кВт":"-","Ток, А":"-","катушка":"-"}',5540000000,'RUB','Контактор.xlsm','dekraft',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c99048e39425c13f18','Контактор','Dekraft','22191DEK','Мех блокировка, КМ-102, 185-225А','-','{"Мощность. кВт":"-","Ток, А":"-","катушка":"-"}',6370000000,'RUB','Контактор.xlsm','dekraft',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-16fadef8679ead1f12','Контактор','Dekraft','22192DEK','Мех блокировка, КМ-102, 265-330А','-','{"Мощность. кВт":"-","Ток, А":"-","катушка":"-"}',8570000000,'RUB','Контактор.xlsm','dekraft',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fc42fecbd9e548872f','Контактор','Dekraft','22171DEK','Доп. Блок контактов 2 НО, КМ-102, 6-95А','-','{"Мощность. кВт":"-","Ток, А":"-","катушка":"2NO"}',520000000,'RUB','Контактор.xlsm','dekraft',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ba1e7745ac31b19a33','Контактор','Dekraft','22175DEK','Доп. Блок контактов 2 НО+2 НЗ, КМ-102, 6-95А','-','{"Мощность. кВт":"-","Ток, А":"-","катушка":"2NO,2NC"}',670000000,'RUB','Контактор.xlsm','dekraft',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-18eb058ca4cc0105dc','Контактор','CHINT','572269','Контактор, NC8-09/W 3P 9А, 250В, 1НО+1НЗ','NC8','{"Мощность. кВт":4,"Ток, А":9,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b842fcd4125d3195cd','Контактор','CHINT','221033','Контактор, NC1 3p 9А, 250В, 1НО','NC1','{"Мощность. кВт":4,"Ток, А":9,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-67564dc7a6f2568e43','Контактор','CHINT','221358','Контактор, NC1 3p 12А, 250В, 1НО','NC1','{"Мощность. кВт":5.5,"Ток, А":12,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-df6bca5a45d9959f15','Контактор','CHINT','221533','Контактор, NC1 3p 18А, 250В, 1НО','NC1','{"Мощность. кВт":7.5,"Ток, А":18,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ce48ea132f8f94bf0f','Контактор','CHINT','221865','Контактор, NC1 3p 25А, 250В, 1НО','NC1','{"Мощность. кВт":11,"Ток, А":25,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1e33d4771de42cb19c','Контактор','CHINT','222066','Контактор, NC1 3p 32А, 250В, 1НО','NC1','{"Мощность. кВт":15,"Ток, А":32,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4819acda2b71a6bd27','Контактор','CHINT','222272','Контактор, NC1 3p 40А, 250В, 1НО+1НС','NC1','{"Мощность. кВт":18.5,"Ток, А":40,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b67a747620ccf60e99','Контактор','CHINT','222493','Контактор, NC1 3p 50А, 250В, 1НО+1НС','NC1','{"Мощность. кВт":22,"Ток, А":50,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b39b011e8ed04d635d','Контактор','CHINT','222714','Контактор, NC1 3p 65А, 250В, 1НО+1НС','NC1','{"Мощность. кВт":30,"Ток, А":65,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c90a8bbb18801fd03b','Контактор','CHINT','223156','Контактор, NC1 3p 95А, 250В, 1НО+1НС','NC1','{"Мощность. кВт":45,"Ток, А":95,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2b9f5bf035cfd5c945','Контактор','CHINT','237030','Контактор, NC2 3p 115А, 220В','NC2','{"Мощность. кВт":55,"Ток, А":115,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-31b9c053a8b7c65d51','Контактор','CHINT','237034','Контактор, NC2 3p 150А, 220В','NC2','{"Мощность. кВт":75,"Ток, А":150,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4c98c823c9ecdaf7af','Контактор','CHINT','237036','Контактор, NC2 3p 185А, 220В','NC2','{"Мощность. кВт":90,"Ток, А":185,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a3c15b9dc2d708878d','Контактор','CHINT','237039','Контактор, NC2 3p 225А, 220В','NC2','{"Мощность. кВт":110,"Ток, А":225,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-19be8a17295fc2d973','Контактор','CHINT','236046','Контактор, NC2 3p 330А, 220В','NC2','{"Мощность. кВт":160,"Ток, А":330,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-77b7b42f5d56e3f13a','Контактор','CHINT','236245','Контактор, NC2 3p 500А, 220В','NC2','{"Мощность. кВт":250,"Ток, А":500,"катушка":230}',NULL,'RUB','Контактор.xlsm','CHINT',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-71f0768c9401e05f34','Контактор','CHINT','439522','Доп. Блок контактов 2 НО+2 НЗ, F4-40, для NC1, NC2, NC8','F4-40','{"Мощность. кВт":"-","Ток, А":"-","катушка":"2NO,2NC"}',NULL,'RUB','Контактор.xlsm','CHINT',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b9ec6e004d907a3eb8','Контактор','CHINT','781936','Мех блокировка, NCL8-C для контакторов NXC-265-630 ®','NCL8-C','{"Мощность. кВт":"-","Ток, А":"-","катушка":"-"}',NULL,'RUB','Контактор.xlsm','CHINT',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ad18b27dac915cf3c3','Контактор','IEK','KKM11-009-024-10','Контактор, КМИ-10910 9А 24В/АС3 1NO','КМИ','{"Мощность. кВт":4,"Ток, А":9,"катушка":24}',NULL,'RUB','Контактор.xlsm','iek',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cdfee6ebe85d3cbdba','Контактор','IEK','KKM11-012-024-10','Контактор, КМИ-11210 12А 24В/АС3 1NO','КМИ','{"Мощность. кВт":5.5,"Ток, А":12,"катушка":24}',NULL,'RUB','Контактор.xlsm','iek',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d6c635cf029b0a64bb','Контактор','IEK','KKM11-018-024-10','Контактор, КМИ-11810 18А 24В/АС3 1NO','КМИ','{"Мощность. кВт":7.5,"Ток, А":18,"катушка":24}',NULL,'RUB','Контактор.xlsm','iek',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2d6eb60aeb3c7557bb','Контактор','IEK','KKM21-025-024-10','Контактор, КМИ-22510 25А 24В/АС3 1NO','КМИ','{"Мощность. кВт":11,"Ток, А":25,"катушка":24}',NULL,'RUB','Контактор.xlsm','iek',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c628590a02bfafb976','Контактор','IEK','KKM21-032-024-01','Контактор, КМИ-23211 32А 24В/АС3 1NC','КМИ','{"Мощность. кВт":15,"Ток, А":32,"катушка":24}',NULL,'RUB','Контактор.xlsm','iek',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0d410269c90a09f1c1','Контактор','IEK','KKM31-040-230-11','Контактор, КМИ-34012 40А 230В/АС3 1NO;1NC','КМИ','{"Мощность. кВт":18.5,"Ток, А":40,"катушка":230}',NULL,'RUB','Контактор.xlsm','iek',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5fe7dec03108d02cd8','Контактор','IEK','KKM31-050-230-11','Контактор, КМИ-35012 50А 230В/АС3 1NO;1NC','КМИ','{"Мощность. кВт":22,"Ток, А":50,"катушка":230}',NULL,'RUB','Контактор.xlsm','iek',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-444df78441aa9e9c79','Контактор','IEK','KKM41-065-230-11','Контактор, КМИ-46512 65А 230В/АС3 1NO;1NC','КМИ','{"Мощность. кВт":30,"Ток, А":65,"катушка":230}',NULL,'RUB','Контактор.xlsm','iek',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-76383935506179f121','Контактор','IEK','KKM41-095-230-11','Контактор, КМИ-49512 95А 230В/АС3 1NO;1NC','КМИ','{"Мощность. кВт":45,"Ток, А":95,"катушка":230}',NULL,'RUB','Контактор.xlsm','iek',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-495e7fe81c96ffd4e3','Контактор','IEK','KKT50-115-230-10','Контактор, КТИ-5115 115А 230В/АС3','КТИ','{"Мощность. кВт":55,"Ток, А":115,"катушка":230}',NULL,'RUB','Контактор.xlsm','iek',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3edf1fca186c8ca594','Контактор','IEK','KKT50-150-230-10','Контактор, КТИ-5150 150А 230В/АС3','КТИ','{"Мощность. кВт":75,"Ток, А":150,"катушка":230}',NULL,'RUB','Контактор.xlsm','iek',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6d52df9fdf277d9c31','Контактор','IEK','KKT50-185-230-10','Контактор, КТИ-5185 185А 230В/АС3','КТИ','{"Мощность. кВт":90,"Ток, А":185,"катушка":230}',NULL,'RUB','Контактор.xlsm','iek',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-82e9a313bfcb2f3239','Контактор','IEK','22154DEK','Контактор, КМ103-185A-220B-00','КМИ','{"Мощность. кВт":90,"Ток, А":185,"катушка":230}',NULL,'RUB','Контактор.xlsm','iek',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ab3d32999257288f67','Контактор','IEK','KPK10-22','Приставка ПКИ-22 дополнительные контакты 2NO+2NC','ПКИ-22','{"Мощность. кВт":"-","катушка":"2NO+2NC"}',NULL,'RUB','Контактор.xlsm','iek',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-73e7f2b42b67612725','Контактор','IEK','KKM11-009-230-10','Контактор, КМИ-10910 9А 230В/АС3 1NO','КМИ','{"Мощность. кВт":4,"Ток, А":9,"катушка":230}',NULL,'RUB','Контактор.xlsm','iek',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e9da9c44285629262b','Контактор','IEK','KKM11-012-230-10','Контактор, КМИ-11210 12А 230В/АС3 1NO','КМИ','{"Мощность. кВт":4,"Ток, А":12,"катушка":230}',NULL,'RUB','Контактор.xlsm','iek',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f021392b21d57f3082','Контактор','IEK','KKM11-018-230-10','Контактор, КМИ-11810 18А 230В/АС3 1NO','КМИ','{"Мощность. кВт":4,"Ток, А":18,"катушка":230}',NULL,'RUB','Контактор.xlsm','iek',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-58819eccc519b9befc','Контактор','IEK','KKM21-025-230-10','Контактор, КМИ-22510 25А 230В/АС3 1NO','КМИ','{"Мощность. кВт":4,"Ток, А":25,"катушка":230}',NULL,'RUB','Контактор.xlsm','iek',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0338b7325cd3907bdb','Контактор','IEK','KKM21-032-230-10','Контактор, КМИ-23210 32А 230В/АС3 1NO','КМИ','{"Мощность. кВт":4,"Ток, А":32,"катушка":230}',NULL,'RUB','Контактор.xlsm','iek',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c8557b7ec033d7e6b1','Корпуса_шкафов','DKC','R5ST0331','Корпус сборный сварной габариты ШхВхГ 300х300х150','ЩМП','{"Габарит":"300х300х150","IP":55,"климат":"УХЛ1"}',7098920000,'RUB','Корпуса_шкафов.xlsm','DKC',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-40b4d6ffd8b8ed037e','Корпуса_шкафов','DKC','R5ST0442','Корпус сборный сварной габариты ШхВхГ 400х400х200','ЩМП','{"Габарит":"400х400х200","IP":55,"климат":"УХЛ1"}',8351180000,'RUB','Корпуса_шкафов.xlsm','DKC',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fc3320737071431a0c','Корпуса_шкафов','DKC','R5ST0552','Корпус сборный сварной габариты ШхВхГ 500х500х200','ЩМП','{"Габарит":"500х500х200","IP":55,"климат":"УХЛ1"}',11816040000,'RUB','Корпуса_шкафов.xlsm','DKC',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4b9753a2f6de19bf7a','Корпуса_шкафов','DKC','R5ST0863','Корпус сборный сварной габариты ШхВхГ 800х600х300','ЩМП','{"Габарит":"800х600х300","IP":55,"климат":"УХЛ1"}',18261500000,'RUB','Корпуса_шкафов.xlsm','DKC',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6b3a1d070c44a337bd','Корпуса_шкафов','DKC','R5ST0883','Корпус сборный сварной габариты ШхВхГ 800х800х300','ЩМП','{"Габарит":"800х800х300","IP":55,"климат":"УХЛ1"}',24822520000,'RUB','Корпуса_шкафов.xlsm','DKC',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-836e0a353adbb9250b','Корпуса_шкафов','DKC','R5ST1083','Корпус сборный сварной габариты ШхВхГ 1000х800х300','ЩМП','{"Габарит":"1000х800х300","IP":55,"климат":"УХЛ1"}',28040880000,'RUB','Корпуса_шкафов.xlsm','DKC',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b1167b4f6a56d06942','Корпуса_шкафов','DKC','R5ST1013','Корпус сборный сварной габариты ШхВхГ 1000х1000х300','ЩМП','{"Габарит":"1000х1000х300","IP":55,"климат":"УХЛ1"}',55368640000,'RUB','Корпуса_шкафов.xlsm','DKC',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b069ca8c70e0d6acd1','Корпуса_шкафов','DKC','R5ST1283','Корпус сборный сварной габариты ШхВхГ 1200х800х300','ЩМП','{"Габарит":"1200х800х300","IP":55,"климат":"УХЛ1"}',35290670000,'RUB','Корпуса_шкафов.xlsm','DKC',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-897e350e8a0242ba85','Корпуса_шкафов','DKC','R5ST1213','Корпус сборный сварной габариты ШхВхГ 1200х1000х300','ЩМП','{"Габарит":"1200х1000х300","IP":55,"климат":"УХЛ1"}',64575770000,'RUB','Корпуса_шкафов.xlsm','DKC',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9dba0d984104070d0e','Корпуса_шкафов','DKC','R5ST1483','Корпус сборный сварной габариты ШхВхГ 1400х800х300','ЩМП','{"Габарит":"1400х800х300","IP":55,"климат":"УХЛ1"}',47971810000,'RUB','Корпуса_шкафов.xlsm','DKC',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-18f5b39ea7e6a87115','Корпуса_шкафов','DKC','R5ST1413','Корпус сборный сварной габариты ШхВхГ 1400х1000х300','ЩМП','{"Габарит":"1400х1000х300","IP":55,"климат":"УХЛ1"}',81118190000,'RUB','Корпуса_шкафов.xlsm','DKC',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fcf7fa3ffc37eaa9b3','Корпуса_шкафов','IEK','TI5-10-N-030-030-015-66','Корпус сборный сварной габариты ШхВхГ 300х300х150','ЩМП','{"Габарит":"300х300х150","IP":66,"климат":"УХЛ1"}',7197160000,'RUB','Корпуса_шкафов.xlsm','IEK',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c98572bfb013eda17e','Корпуса_шкафов','IEK','TI5-10-N-040-040-020-66','Корпус сборный сварной габариты ШхВхГ 400х400х200','ЩМП','{"Габарит":"400х400х200","IP":66,"климат":"УХЛ1"}',6904970000,'RUB','Корпуса_шкафов.xlsm','IEK',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a3d8a0fb2558118c34','Корпуса_шкафов','IEK','TI5-10-N-050-050-020-66','Корпус сборный сварной габариты ШхВхГ 500х500х200','ЩМП','{"Габарит":"500х500х200","IP":66,"климат":"УХЛ1"}',12491020000,'RUB','Корпуса_шкафов.xlsm','IEK',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b909365bddf7b700df','Корпуса_шкафов','IEK','TI5-10-N-060-060-025-66','Корпус сборный сварной габариты ШхВхГ 600х600х250','ЩМП','{"Габарит":"600х600х250","IP":66,"климат":"УХЛ1"}',16701460000,'RUB','Корпуса_шкафов.xlsm','IEK',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-423036e6cc0a99de34','Корпуса_шкафов','IEK','TI5-10-N-080-060-020-66','Корпус сборный сварной габариты ШхВхГ 800х600х200','ЩМП','{"Габарит":"800х600х200","IP":66,"климат":"УХЛ1"}',17281790000,'RUB','Корпуса_шкафов.xlsm','IEK',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8316d93e55ff7950f5','Корпуса_шкафов','IEK','TI5-10-N-080-080-020-66','Корпус сборный сварной габариты ШхВхГ 800х800х200','ЩМП','{"Габарит":"800х800х200","IP":66,"климат":"УХЛ1"}',22879540000,'RUB','Корпуса_шкафов.xlsm','IEK',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3c97722cb36ca1fbc9','Корпуса_шкафов','IEK','TI5-10-N-100-080-030-66','Корпус сборный сварной габариты ШхВхГ 1000х800х300','ЩМП','{"Габарит":"1000х800х300","IP":66,"климат":"УХЛ1"}',22707980000,'RUB','Корпуса_шкафов.xlsm','IEK',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f772e36b9734f39bbc','Корпуса_шкафов','IEK','TI5-10-N-120-080-030-66','Корпус сборный сварной габариты ШхВхГ 1200х800х300','ЩМП','{"Габарит":"1200х800х300","IP":66,"климат":"УХЛ1"}',28710970000,'RUB','Корпуса_шкафов.xlsm','IEK',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f69e1ad0e55edb3027','Корпуса_шкафов','IEK','TI5-10-N-140-080-030-66','Корпус сборный сварной габариты ШхВхГ 1400х800х300','ЩМП','{"Габарит":"1400х800х300","IP":66,"климат":"УХЛ1"}',48546110000,'RUB','Корпуса_шкафов.xlsm','IEK',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-dd709488229fdb7bc5','Лампы_HL','EKF','ed16-22bms','Извещатель светозвуковой, ED16-22BMS','ed16','{"ip":54,"катушка":"230VAC"}',464800000,'RUB','Лампы_HL.xlsm','EKF',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4da748327450d77ad6','Лампы_HL','EKF','ed16-22bms-24','Извещатель светозвуковой, ED16-22BMS','ed16','{"ip":54,"катушка":"24VDC"}',464800000,'RUB','Лампы_HL.xlsm','EKF',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d92da6d399b8bd2539','Лампы_HL','EKF','ed16-22bm-24','Извещатель звуковой ED16-22BM','ed16','{"ip":54,"катушка":"24VDC"}',464800000,'RUB','Лампы_HL.xlsm','EKF',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fbaf054d442bf38029','Лампы_HL','EKF','ledm-ad16-w-24','Лампа сигнальная белая 24B','AD16','{"ip":54,"катушка":"24VDC"}',170300000,'RUB','Лампы_HL.xlsm','EKF',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-edebdfbc97ada3e80b','Лампы_HL','EKF','ledm-ad16-r-24','Лампа сигнальная красная 24B','AD16','{"ip":54,"катушка":"24VDC"}',158930000,'RUB','Лампы_HL.xlsm','EKF',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4fe233a243e8b01121','Лампы_HL','EKF','ledm-ad16-o-24','Лампа сигнальная желтая 24B','AD16','{"ip":54,"катушка":"24VDC"}',158930000,'RUB','Лампы_HL.xlsm','EKF',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ccdc44bb7676fa300b','Лампы_HL','EKF','ledm-ad16-g-24','Лампа сигнальная зеленая 24B','AD16','{"ip":54,"катушка":"24VDC"}',193000000,'RUB','Лампы_HL.xlsm','EKF',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3f7b138d7ceec72d83','Лампы_HL','EKF','ledm-ad16-b-24','Лампа сигнальная синий 24B','AD16','{"ip":54,"катушка":"24VDC"}',306980000,'RUB','Лампы_HL.xlsm','EKF',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ab45d6a8d83aefdedf','Лампы_HL','EKF','ledm-ad16-w','Лампа сигнальная белая 230B','AD16','{"ip":54,"катушка":"230VAC"}',162350000,'RUB','Лампы_HL.xlsm','EKF',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-397d8fe97e2e80c390','Лампы_HL','EKF','ledm-ad16-r','Лампа сигнальная красная 230B','AD16','{"ip":54,"катушка":"230VAC"}',156930000,'RUB','Лампы_HL.xlsm','EKF',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-305abc9454078e1f24','Лампы_HL','EKF','ledm-ad16-o','Лампа сигнальная желтая 230B','AD16','{"ip":54,"катушка":"230VAC"}',158930000,'RUB','Лампы_HL.xlsm','EKF',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-33b363453a7a3acfc1','Лампы_HL','EKF','ledm-ad16-g','Лампа сигнальная зеленая 230B','AD16','{"ip":54,"катушка":"230VAC"}',134000000,'RUB','Лампы_HL.xlsm','EKF',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fe159e80434b223e86','Лампы_HL','EKF','ledm-ad16-b','Лампа сигнальная синий 230B','AD16','{"ip":54,"катушка":"230VAC"}',156160000,'RUB','Лампы_HL.xlsm','EKF',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e4e77285f78667f110','Лампы_HL','IEK','MLS20-230-K04','Лампа сигнальная модульная на DIN 230В красная','ЛС-47М','{"ip":20,"катушка":"230V AC"}',216540000,'RUB','Лампы_HL.xlsm','IEK',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6223462728309bcc2e','Лампы_HL','IEK','MLS20-230-K06','Лампа сигнальная модульная на DIN 230В зеленая','ЛС-47М','{"ip":20,"катушка":"230V AC"}',202370000,'RUB','Лампы_HL.xlsm','IEK',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b2be7ab65b92481347','Лампы_HL','IEK','BLS10-ADDS-024-K01','Лампа сигнальная белая 24B','AD22DS','{"ip":54,"катушка":"24VDC"}',184210000,'RUB','Лампы_HL.xlsm','IEK',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2ab801d2793bdeed24','Лампы_HL','IEK','BLS10-ADDS-024-K04','Лампа сигнальная красная 24B','AD22DS','{"ip":54,"катушка":"24VDC"}',118790000,'RUB','Лампы_HL.xlsm','IEK',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-889581a5e3e572fbc0','Лампы_HL','IEK','BLS10-ADDS-024-K05','Лампа сигнальная желтая 24B','AD22DS','{"ip":54,"катушка":"24VDC"}',148120000,'RUB','Лампы_HL.xlsm','IEK',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3f38bfd41251e61fb4','Лампы_HL','IEK','BLS10-ADDS-024-K06','Лампа сигнальная зеленая 24B','AD22DS','{"ip":54,"катушка":"24VDC"}',136990000,'RUB','Лампы_HL.xlsm','IEK',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8e3f7d4ce3104412a7','Лампы_HL','IEK','BLS10-ADDS-024-K07','Лампа сигнальная синий 24B','AD22DS','{"ip":54,"катушка":"24VDC"}',155740000,'RUB','Лампы_HL.xlsm','IEK',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4b9191d8e74705e340','Лампы_HL','IEK','BLS10-ADDS-230-K01','Лампа сигнальная белая 230B','AD22DS','{"ip":54,"катушка":"230VAC"}',184230000,'RUB','Лампы_HL.xlsm','IEK',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7f72a6f30810186a99','Лампы_HL','IEK','BLS10-ADDS-230-K04','Лампа сигнальная красная 230B','AD22DS','{"ip":54,"катушка":"230VAC"}',129210000,'RUB','Лампы_HL.xlsm','IEK',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b5acaa3c367f434411','Лампы_HL','IEK','BLS10-ADDS-230-K05','Лампа сигнальная желтая 230B','AD22DS','{"ip":54,"катушка":"230VAC"}',129170000,'RUB','Лампы_HL.xlsm','IEK',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5dd21bdc962eafa0dc','Лампы_HL','IEK','BLS10-ADDS-230-K06','Лампа сигнальная зеленая 230B','AD22DS','{"ip":54,"катушка":"230VAC"}',115760000,'RUB','Лампы_HL.xlsm','IEK',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d12fd95890a79d54c3','Лампы_HL','IEK','BLS10-ADDS-230-K07','Лампа сигнальная синий 230B','AD22DS','{"ip":54,"катушка":"230VAC"}',187600000,'RUB','Лампы_HL.xlsm','IEK',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0c0b9b6db25cd84d44','Лампы_HL','Dekraft','25121DEK','Лампа сигнальная белая 230B','ЛК-22','{"ip":54,"катушка":"230VAC"}',263520000,'RUB','Лампы_HL.xlsm','Dekraft',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ef4cfcaf3cd6bea707','Лампы_HL','Dekraft','25002DEK','Лампа сигнальная зеленая 230B','ЛК-22','{"ip":54,"катушка":"230VAC"}',195820000,'RUB','Лампы_HL.xlsm','Dekraft',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1b0881023f8c05533d','Лампы_HL','Dekraft','25003DEK','Лампа сигнальная красная 230B','ЛК-22','{"ip":54,"катушка":"230VAC"}',195820000,'RUB','Лампы_HL.xlsm','Dekraft',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-38562570872bda0831','Лампы_HL','Dekraft','25004DEK','Лампа сигнальная желтая 230B','ЛК-22','{"ip":54,"катушка":"230VAC"}',190320000,'RUB','Лампы_HL.xlsm','Dekraft',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d527ae8c5cc926809b','Лампы_HL','Dekraft','25065DEK','Лампа сигнальная зеленая 24B','ЛК-22','{"ip":54,"катушка":"24VDC"}',201920000,'RUB','Лампы_HL.xlsm','Dekraft',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-66144f1df9b8300964','Лампы_HL','Dekraft','25066DEK','Лампа сигнальная красная 24B','ЛК-22','{"ip":54,"катушка":"24VDC"}',201920000,'RUB','Лампы_HL.xlsm','Dekraft',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3fc9cdb93d52d50dd3','Лампы_HL','Dekraft','25067DEK','Лампа сигнальная желтая 24B','ЛК-22','{"ip":54,"катушка":"24VDC"}',201920000,'RUB','Лампы_HL.xlsm','Dekraft',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-de9da0816519e8efc6','Лампы_HL','Dekraft','25106DEK','Держетель маркеровки, ДМ22-1','ДМ22','{}',26780000,'RUB','Лампы_HL.xlsm','Dekraft',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-93dee9710e51b6fa73','Лампы_HL','Chint','593073','Лампа сигнальная белая 230B','ND16','{"ip":54,"катушка":"230VAC"}',NULL,'RUB','Лампы_HL.xlsm','Chint',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1e20790d67723f5d62','Лампы_HL','Chint','593071','Лампа сигнальная зеленая 230B','ND16','{"ip":54,"катушка":"230VAC"}',NULL,'RUB','Лампы_HL.xlsm','Chint',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-aae5817caa1d2877dd','Лампы_HL','Chint','593150','Лампа сигнальная красная 230B','ND16','{"ip":54,"катушка":"230VAC"}',NULL,'RUB','Лампы_HL.xlsm','Chint',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-074ea6fa24e24b269f','Лампы_HL','Chint','593012','Лампа сигнальная желтая 230B','ND16','{"ip":54,"катушка":"230VAC"}',NULL,'RUB','Лампы_HL.xlsm','Chint',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b14500428c8fde55b7','Лампы_HL','Chint','592940','Лампа сигнальная зеленая 24B','ND16','{"ip":54,"катушка":"24VDC"}',NULL,'RUB','Лампы_HL.xlsm','Chint',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d3f959e1d775576f53','Лампы_HL','Chint','592938','Лампа сигнальная красная 24B','ND16','{"ip":54,"катушка":"24VDC"}',NULL,'RUB','Лампы_HL.xlsm','Chint',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c9e4e5521593bb43c6','Лампы_HL','Chint','592939','Лампа сигнальная желтая 24B','ND16','{"ip":54,"катушка":"24VDC"}',NULL,'RUB','Лампы_HL.xlsm','Chint',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-467abd22346c8cb02a','Лампы_HL','Chint','592936','Лампа сигнальная белая 24B','ND16','{"ip":54,"катушка":"24VDC"}',NULL,'RUB','Лампы_HL.xlsm','Chint',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0b7258de67642da3f8','Нагреватели_термостаты','IEK','YCE-CS-050-20','Обогреватель конвекцционный в корпусе на DIN-рейку 50Вт IP20','YCE','{"IP":20,"Габариты ВхШхГ, мм":"110х60х90","мощность, Вт,":50}',3138180000,'RUB','Нагреватели_термостаты.xlsm','IEK',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f0369d1d1155aabc1c','Нагреватели_термостаты','IEK','YCE-CS-100-20','Обогреватель конвекцционный в корпусе на DIN-рейку 100Вт IP20','YCE','{"IP":20,"Габариты ВхШхГ, мм":"150х60х90","мощность, Вт,":100}',4751110000,'RUB','Нагреватели_термостаты.xlsm','IEK',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0b4b31152d4fbee612','Нагреватели_термостаты','IEK','YCE-CS-150-20','Обогреватель конвекцционный в корпусе на DIN-рейку 150Вт IP20','YCE','{"IP":20,"Габариты ВхШхГ, мм":"150х60х90","мощность, Вт,":150}',5361780000,'RUB','Нагреватели_термостаты.xlsm','IEK',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f5825af51439a67797','Нагреватели_термостаты','IEK','YCE-HG-030-20','Обогреватель конвекцционный на DIN-рейку 30Вт IP20','YCE','{"IP":20,"Габариты ВхШхГ, мм":"65х70х56,5","мощность, Вт,":30}',2291990000,'RUB','Нагреватели_термостаты.xlsm','IEK',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9fc33fd0c4afe22054','Нагреватели_термостаты','IEK','YCE-HG-060-20','Обогреватель конвекцционный на DIN-рейку 60Вт IP20','YCE','{"IP":20,"Габариты ВхШхГ, мм":"140х70х56,5","мощность, Вт,":60}',3002810000,'RUB','Нагреватели_термостаты.xlsm','IEK',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-89a5a85400ce637e1a','Нагреватели_термостаты','IEK','YCE-HG-100-20','Обогреватель конвекцционный на DIN-рейку 100Вт IP20','YCE','{"IP":20,"Габариты ВхШхГ, мм":"140х70х56,5","мощность, Вт,":100}',3275760000,'RUB','Нагреватели_термостаты.xlsm','IEK',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3007caaf97621ceb3b','Нагреватели_термостаты','IEK','YCE-HG-150-20','Обогреватель конвекцционный на DIN-рейку 150Вт IP20','YCE','{"IP":20,"Габариты ВхШхГ, мм":"220х70х56,5","мощность, Вт,":100}',4310220000,'RUB','Нагреватели_термостаты.xlsm','IEK',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-128b4b11ca184823af','Нагреватели_термостаты','IEK','YCE-HVL-100-20','Обогреватель на DIN-рейку (встроенный вентилятор) 100Вт IP20','YCE','{"IP":20,"Габариты ВхШхГ, мм":"80х68х22","мощность, Вт,":100}',8657880000,'RUB','Нагреватели_термостаты.xlsm','IEK',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6bf926551bdbb5f252','Нагреватели_термостаты','IEK','YCE-HVL-200-20','Обогреватель на DIN-рейку (встроенный вентилятор) 200Вт IP20','YCE','{"IP":20,"Габариты ВхШхГ, мм":"119х68х151","мощность, Вт,":200}',11556330000,'RUB','Нагреватели_термостаты.xlsm','IEK',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5664a49425a6540f05','Нагреватели_термостаты','IEK','YCE-HVL-300-20','Обогреватель на DIN-рейку (встроенный вентилятор) 300Вт IP20','YCE','{"IP":20,"Габариты ВхШхГ, мм":"47х119х151","мощность, Вт,":300}',10994120000,'RUB','Нагреватели_термостаты.xlsm','IEK',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-832795360fbf0490bb','Нагреватели_термостаты','IEK','YCE-HVL-400-20','Обогреватель на DIN-рейку (встроенный вентилятор) 400Вт IP20','YCE','{"IP":20,"Габариты ВхШхГ, мм":"47х119х151","мощность, Вт,":400}',13742580000,'RUB','Нагреватели_термостаты.xlsm','IEK',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b48213b325da420abe','Нагреватели_термостаты','IEK','YOB30-0800-20','Обогреватель на DIN-рейку (встроенный вентилятор и термостат) 800Вт IP20','YOB','{"IP":20,"Габариты ВхШхГ, мм":"67х142х182","мощность, Вт,":800}',18657690000,'RUB','Нагреватели_термостаты.xlsm','IEK',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b8431fbbd76986717d','Нагреватели_термостаты','IEK','YOB30-0900-20','Обогреватель на DIN-рейку (встроенный вентилятор и термостат) 900Вт IP20','YOB','{"IP":20,"Габариты ВхШхГ, мм":"67х142х182","мощность, Вт,":900}',17431260000,'RUB','Нагреватели_термостаты.xlsm','IEK',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-931df86420d3720459','Нагреватели_термостаты','IEK','YOB30-1000-20','Обогреватель на DIN-рейку (встроенный вентилятор и термостат) 1000Вт IP20','YOB','{"IP":20,"Габариты ВхШхГ, мм":"67х142х182","мощность, Вт,":1000}',19254150000,'RUB','Нагреватели_термостаты.xlsm','IEK',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1b5d35b4370341a436','Нагреватели_термостаты','IEK','YOB30-1200-20','Обогреватель на DIN-рейку (встроенный вентилятор и термостат) 1200Вт IP20','YOB','{"IP":20,"Габариты ВхШхГ, мм":"67х142х182","мощность, Вт,":1200}',19552380000,'RUB','Нагреватели_термостаты.xlsm','IEK',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-97838cded7c328a4c2','Нагреватели_термостаты','IEK','YCE-MH-35-95','Гигростат механический УККг от 35 до 95% RH','УККг','{"IP":20}',4003820000,'RUB','Нагреватели_термостаты.xlsm','IEK',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-35ac85c36f2a835df2','Нагреватели_термостаты','IEK','YCE-HT-00-60-50-90','Гигротерм УККгт от 0 до +60°C от 50 до 90% RH','УККг','{"IP":20}',10510230000,'RUB','Нагреватели_термостаты.xlsm','IEK',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-21d8e83bda85cc1763','Нагреватели_термостаты','IEK','YCE-TNO-00-60','Термостат УККт от 0 до +60 °C NO (Охлаждение)','УККг','{"IP":20}',691760000,'RUB','Нагреватели_термостаты.xlsm','IEK',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-609a45299cb47e483f','Нагреватели_термостаты','IEK','YCE-TNC-00-60','Термостат УККт от 0 до +60 °C NC (обогрев)','УККг','{"IP":20}',691760000,'RUB','Нагреватели_термостаты.xlsm','IEK',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-67479c4cdcad718116','Нагреватели_термостаты','EKF','heater-click-30-20','Обогреватель конвекцционный на DIN-рейку 30Вт IP20','PROxima','{"IP":20,"Габариты ВхШхГ, мм":"109х70х60","мощность, Вт,":30}',2473490000,'RUB','Нагреватели_термостаты.xlsm','EKF',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-aae9292ce4823aa1b0','Нагреватели_термостаты','EKF','heater-click-45-20','Обогреватель конвекцционный на DIN-рейку 45Вт IP20','PROxima','{"IP":20,"Габариты ВхШхГ, мм":"109х70х60","мощность, Вт,":45}',2005360000,'RUB','Нагреватели_термостаты.xlsm','EKF',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ea797647e86aa00311','Нагреватели_термостаты','EKF','heater-click-60-20','Обогреватель конвекцционный на DIN-рейку 60Вт IP20','PROxima','{"IP":20,"Габариты ВхШхГ, мм":"184х70х60","мощность, Вт,":60}',3143220000,'RUB','Нагреватели_термостаты.xlsm','EKF',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c484997124964c34dc','Нагреватели_термостаты','EKF','heater-click-100-20','Обогреватель конвекцционный на DIN-рейку 100Вт IP20','PROxima','{"IP":20,"Габариты ВхШхГ, мм":"184х70х60","мощность, Вт,":100}',3706670000,'RUB','Нагреватели_термостаты.xlsm','EKF',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-539940b56d86916d06','Нагреватели_термостаты','EKF','heater-click-150-20','Обогреватель конвекцционный на DIN-рейку 150Вт IP20','PROxima','{"IP":20,"Габариты ВхШхГ, мм":"264х70х60","мощность, Вт,":150}',4427010000,'RUB','Нагреватели_термостаты.xlsm','EKF',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4aba2a829ac368ec65','Нагреватели_термостаты','EKF','heater-vent-q-100-20','Обогреватель на DIN-рейку (встроенный вентилятор) 100Вт IP20','PROxima','{"IP":20,"Габариты ВхШхГ, мм":"112х80х47","мощность, Вт,":100}',9698480000,'RUB','Нагреватели_термостаты.xlsm','EKF',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-17257b672d4174ff52','Нагреватели_термостаты','EKF','heater-vent-q-200-20','Обогреватель на DIN-рейку (встроенный вентилятор) 200Вт IP20','PROxima','{"IP":20,"Габариты ВхШхГ, мм":"151х119х47","мощность, Вт,":200}',6750990000,'RUB','Нагреватели_термостаты.xlsm','EKF',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5b8079206ff6324f98','Нагреватели_термостаты','EKF','heater-vent-q-300-20','Обогреватель на DIN-рейку (встроенный вентилятор) 300Вт IP20','PROxima','{"IP":20,"Габариты ВхШхГ, мм":"151х119х47","мощность, Вт,":300}',10467610000,'RUB','Нагреватели_термостаты.xlsm','EKF',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9e3181f10b3bd632fd','Нагреватели_термостаты','EKF','heater-vent-q-400-20','Обогреватель на DIN-рейку (встроенный вентилятор) 400Вт IP20','PROxima','{"IP":20,"Габариты ВхШхГ, мм":"151х119х47","мощность, Вт,":400}',14461450000,'RUB','Нагреватели_термостаты.xlsm','EKF',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6269bc021eb9252cb1','Нагреватели_термостаты','EKF','HFT800C','Обогреватель на DIN-рейку (встроенный вентилятор и термостат) 800Вт IP20','PROxima','{"IP":20,"Габариты ВхШхГ, мм":"120х160х182","мощность, Вт,":800}',21795310000,'RUB','Нагреватели_термостаты.xlsm','EKF',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-068dfe590821c7b790','Нагреватели_термостаты','EKF','HFT900C','Обогреватель на DIN-рейку (встроенный вентилятор и термостат) 900Вт IP20','PROxima','{"IP":20,"Габариты ВхШхГ, мм":"120х160х182","мощность, Вт,":900}',21795530000,'RUB','Нагреватели_термостаты.xlsm','EKF',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-57d13d925df2c4859f','Нагреватели_термостаты','EKF','HFT1000C','Обогреватель на DIN-рейку (встроенный вентилятор и термостат) 1000Вт IP20','PROxima','{"IP":20,"Габариты ВхШхГ, мм":"120х160х182","мощность, Вт,":1000}',22548410000,'RUB','Нагреватели_термостаты.xlsm','EKF',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0e0d7452080236d711','Нагреватели_термостаты','EKF','HFT1200C','Обогреватель на DIN-рейку (встроенный вентилятор и термостат) 1200Вт IP20','PROxima','{"IP":20,"Габариты ВхШхГ, мм":"120х160х182","мощность, Вт,":1200}',22840430000,'RUB','Нагреватели_термостаты.xlsm','EKF',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a117b0ce50634c1bed','Нагреватели_термостаты','EKF','HCO5EM','Гигростат на DIN-рейку 5А 230В IP20 от 35 до 95% RH','PROxima','{"IP":20}',4326530000,'RUB','Нагреватели_термостаты.xlsm','EKF',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-bf5ae5b5b0dca7465e','Нагреватели_термостаты','EKF','TNC10M','Термостат NC (обогрев) на DIN-рейку 10А 230В IP20','PROxima','{"IP":20}',647990000,'RUB','Нагреватели_термостаты.xlsm','EKF',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0b118eb0a836775f63','Нагреватели_термостаты','EKF','TNO10M','Термостат NO (Охлаждение) на DIN-рейку 10А 230В IP20','PROxima','{"IP":20}',634000000,'RUB','Нагреватели_термостаты.xlsm','EKF',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f5bda91966e2591df6','Общее_DV','IRZ-Электроника','ATM21.B','GSM модем ATM21.B','GSM модем ATM21.B','{"ток контактов":"230 В","катушка":"RS485/232"}',NULL,'RUB','Общее_DV.xlsm','DV',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a36331b726486f1282','Общее_DV','ОВЕН','КСН210','КСН210 коммутатор сетевой неуправляемый, Fast Ethernet (100 Мбит/с)','КСН210 коммутатор сетевой неуправляемый, Fast Ethernet (100 Мбит/с)','{"ток контактов":"-","катушка":"-"}',7320510000,'RUB','Общее_DV.xlsm','DV',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6dbc0c0c4bd899341a','Общее_DV','Термотроник','TB7-01-M-БП-AA','Тепловычеслитель','Тепловычеслитель','{"ток контактов":"24В","катушка":"RS-232"}',NULL,'RUB','Общее_DV.xlsm','DV',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1580c318cef0f18575','Общее_DV','IRZ-Электроника','RL21w','GSM модем RL21w','GSM модем RL21w','{"ток контактов":"БП 12В","катушка":"RS485/232/Ethernet"}',NULL,'RUB','Общее_DV.xlsm','DV',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ad916c90690ee61f00','Общее_DV','ОВЕН','МКОН 24','Преобразователь интерфейсов, 24DC','Преобразователь интерфейсов, 24DC','{"ток контактов":"RS-485","катушка":"Ethernet"}',14152990000,'RUB','Общее_DV.xlsm','DV',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5a2fca33540086c622','Общее_DV','Термотроник','АДИ-1-1 Ethernet','Регистратор электронный','Регистратор электронный','{"ток контактов":"12В","катушка":"Ethernet"}',NULL,'RUB','Общее_DV.xlsm','DV',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f376e8c514130dadd5','Общее_DV','MOXA','EDS-2016','Неуправляемый коммутатор','Неуправляемый коммутатор','{"ток контактов":"10/100 BaseT(X) Ethernet","катушка":"16 портов"}',NULL,'RUB','Общее_DV.xlsm','DV',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9ca2de24f3b0191b77','Общее_DV','Термотроник','АДИ-0-1 RS-485','Регистратор электронный','Регистратор электронный','{"ток контактов":"24В","катушка":"RS-485"}',NULL,'RUB','Общее_DV.xlsm','DV',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-30196b94cb8da5332a','Общее_DV','IEK','MRD10-16','Розетка электропитания','Розетка электропитания','{"ток контактов":"220VAC","катушка":"16A"}',319050000,'RUB','Общее_DV.xlsm','DV',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c79c70dbe3db77bde3','Общее_DV','MOXA','EDS-205','Неуправляемый коммутатор','Неуправляемый коммутатор','{"ток контактов":"10/100 BaseT(X) Ethernet","катушка":"5 портов"}',NULL,'RUB','Общее_DV.xlsm','DV',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3051db7e7d1fb06b57','Общее_DV','MOXA','EDS-208','Неуправляемый коммутатор','Неуправляемый коммутатор','{"ток контактов":"10/100 BaseT(X) Ethernet","катушка":"8 портов"}',16418380000,'RUB','Общее_DV.xlsm','DV',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-060dfcc9344c12feb1','Общее_DV','Солис','РИС-1х6(3/3)','Разветвитель импульсного сигнала','РИС','{"катушка":"220VAC"}',NULL,'RUB','Общее_DV.xlsm','DV',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-83a4777878ca77cc18','Общее_DV','Dekraft','23300DEK','Реле контроля напряжения','РК 101-01','{"ток контактов":"-","катушка":"-"}',4380500000,'RUB','Общее_DV.xlsm','DV',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a82f12597e61d49731','Общее_DV','Dekraft','23301DEK','Реле контроля напряжения','РК 101-02','{"ток контактов":"-","катушка":"-"}',4008350000,'RUB','Общее_DV.xlsm','DV',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-af1a6705bc74ddf82f','Общее_DV','IEK','MRD10-16','Розетка на DIN-рейку с заземлением','Рар','{"ток контактов":"16А"}',319050000,'RUB','Общее_DV.xlsm','DV',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f90f1b7f409a3915bd','Общее_DV','Dekraft','18012DEK','Розетка на DIN-рейку с заземлением','РМ-102','{"ток контактов":"16А"}',375170000,'RUB','Общее_DV.xlsm','DV',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-967afc3f6de14b66f9','Общее_DV','ЭРА','Б0057482','Розетка на DIN-рейку с заземлением','MRD10','{"ток контактов":"16А"}',268110000,'RUB','Общее_DV.xlsm','DV',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9fcf0e69bee26e92b3','Общее_DV','CHINT','775001','Розетка на DIN-рейку с заземлением','AC30','{"ток контактов":"16А"}',436050000,'RUB','Общее_DV.xlsm','DV',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7e79ddaca56eebb103','Общее_DV','EKF','RDE4716','Розетка на DIN-рейку с заземлением','РДЕ-47','{"ток контактов":"16А"}',344410000,'RUB','Общее_DV.xlsm','DV',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-11849d1ad1f309a10e','Общее_DV','АКЭЛ','300207','Розетка на DIN-рейку с заземлением','ВА47','{"ток контактов":"16А"}',391730000,'RUB','Общее_DV.xlsm','DV',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6b365593766b77bf39','Общее_DV','ОВЕН','ПР103-230.1610.01.1.0','Реле программируемое ПР103-230.1610.01.1.0','ПР103','{"ток контактов":"-","катушка":"220 VAC","кол-во контактов":"16DI, 10DO"}',16330000000,'RUB','Общее_DV.xlsm','Овен',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c9c1f6ca5617cd2428','Общее_DV','ОВЕН','САУ М6','Сигнализатор уровня САУ М6','САУ М6','{"ток контактов":"5 А","катушка":"220 VAC","кол-во контактов":"3NO, 3NC"}',8564000000,'RUB','Общее_DV.xlsm','Овен',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d0896cd2116e7a1faa','Общее_DV','ОВЕН','БКК1-220','Блок согласования БКК1-220','БКК1-220','{"ток контактов":"2 А","катушка":"220 VAC","кол-во контактов":"4NO"}',7015000000,'RUB','Общее_DV.xlsm','Овен',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-552048d0857b4684af','Переключатель','Dekraft','25062DEK','Выключатель кнопочный двойной,  с подстветкой','ПЕ-22-PPBB','{"ном. Ток":"10 А","доп контакты":"1NO+1NC"}',842420000,'RUB','Переключатель.xlsm','SA',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d7c3288bc62bde2728','Переключатель','Dekraft','25063DEK','Выключатель кнопочный двойной,  с подстветкой','ПЕ22-BL','{"ном. Ток":"10 А","доп контакты":"1NO+1NC"}',521560000,'RUB','Переключатель.xlsm','SA',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-442172f68bd521966b','Переключатель','Chint','667178','Выключатель кнопочный двойной,  без подстветки','NP8-11S','{"ном. Ток":"10 А","доп контакты":"1NO+1NC"}',NULL,'RUB','Переключатель.xlsm','SA',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-19e8c1ee3916c45438','Переключатель','Dekraft','25051DEK','Переключатель, 0-1, фикс., ПЕ-22','ПЕ-22','{"ном. Ток":"10 А","катушка":"2 пол.","доп контакты":"1NO+1NC"}',483120000,'RUB','Переключатель.xlsm','SA',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-580b48e8faa9dbb56a','Переключатель','Dekraft','25139DEK','Переключатель, 0-1, без фикс., ПЕ-22','ПЕ-22','{"ном. Ток":"10 А","катушка":"2 пол.","доп контакты":"1NO+1NC"}',527660000,'RUB','Переключатель.xlsm','SA',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3d64cddfe48608702e','Переключатель','Dekraft','25052DEK','Переключатель, 2-0-1, фикс., ПЕ-22','ПЕ-22','{"ном. Ток":"10 А","катушка":"3 пол.","доп контакты":"2NO"}',533760000,'RUB','Переключатель.xlsm','SA',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ef999ddc3376460f1a','Переключатель','Dekraft','25141DEK','Переключатель, 2-0-1, без фикс., ПЕ-22','ПЕ-22','{"ном. Ток":"10 А","катушка":"3 пол.","доп контакты":"2NO"}',527660000,'RUB','Переключатель.xlsm','SA',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-eea46ac79764be1bfb','Переключатель','Dekraft','25053DEK','Переключатель, ключ, 0-1, фикс., ПЕ-22','ПЕ-22','{"ном. Ток":"10 А","катушка":"2 пол.","доп контакты":"1NO+1NC"}',675280000,'RUB','Переключатель.xlsm','SA',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d07d01e3d107ea1d46','Переключатель','Dekraft','25142DEK','Переключатель, ключ, 0-1, без фикс., ПЕ-22','ПЕ-22','{"ном. Ток":"10 А","катушка":"2 пол.","доп контакты":"1NO+1NC"}',711260000,'RUB','Переключатель.xlsm','SA',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d8470b964c89234878','Переключатель','Dekraft','25054DEK','Переключатель, ключ, 2-0-1, фикс., ПЕ-22','ПЕ-22','{"ном. Ток":"10 А","катушка":"3 пол.","доп контакты":"2NO"}',699060000,'RUB','Переключатель.xlsm','SA',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-79f605d9eaffa0a28f','Переключатель','Dekraft','25144DEK','Переключатель, ключ, 2-0-1, без фикс., ПЕ-22','ПЕ-22','{"ном. Ток":"10 А","катушка":"3 пол.","доп контакты":"2NO"}',711260000,'RUB','Переключатель.xlsm','SA',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4dfa22e2a9c211477f','Переключатель','Dekraft','25100DEK','Доп.контакт, ПЕ-22, 2м., ДК22','ДК22','{"ном. Ток":"10 А","доп контакты":"1NO"}',102900000,'RUB','Переключатель.xlsm','SA',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-dc216e649c6cf48c52','Переключатель','Dekraft','25101DEK','Доп.контакт, ПЕ-22, 2м., ДК22','ДК22','{"ном. Ток":"10 А","доп контакты":"1NC"}',102900000,'RUB','Переключатель.xlsm','SA',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cd9252c60c4700377f','Переключатель','Dekraft','25104DEK','Доп.контакт, ПЕ-22, 1м., ДК22','ДК22','{"ном. Ток":"10 А","доп контакты":"1NO"}',101810000,'RUB','Переключатель.xlsm','SA',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d6beb7368e4e2bc612','Переключатель','Dekraft','25105DEK','Доп.контакт, ПЕ-22, 1м., ДК22','ДК22','{"ном. Ток":"10 А","доп контакты":"1NC"}',101810000,'RUB','Переключатель.xlsm','SA',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e57475b93648eb4908','Переключатель','Dekraft','25103DEK','Адаптер,АД22','АД22','{"ном. Ток":"-"}',31410000,'RUB','Переключатель.xlsm','SA',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f091fd10b80724b9ef','Переключатель','Dekraft','25106DEK','Держетель маркеровки, ДМ22','ДМ22','{"ном. Ток":"10х25мм"}',26780000,'RUB','Переключатель.xlsm','SA',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e3b27a8b9298a03006','Переключатель','Dekraft','25107DEK','Держетель маркеровки, ДМ22','ДМ22','{"ном. Ток":"20х25мм"}',35870000,'RUB','Переключатель.xlsm','SA',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f08a94738748ab0f5b','Переключатель','Chint','576841','Блок контакт NP2-BE101 1НО;','NP2-BE101','{"ном. Ток":"NO"}',116310000,'RUB','Переключатель.xlsm','SA',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0d0d4a0bfe5f21643d','Переключатель','Chint','576842','Блок контакт NP2-BE102 1НЗ Chint;','NP2-BE102','{"ном. Ток":"NC"}',116310000,'RUB','Переключатель.xlsm','SA',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5f0cde981399626884','Переключатель','Chint','574095','Переключатель NP2-ED21 2 положения с фикс. НО;','NP2-ED21','{"ном. Ток":"NO"}',311990000,'RUB','Переключатель.xlsm','SA',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d53c2a1c79c9794d96','Переключатель','Chint','574098','Переключатель NP2-ED33 3 положения 2НО;','NP2-ED33','{"ном. Ток":"2NO"}',455170000,'RUB','Переключатель.xlsm','SA',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-bd5d39eca1ab213a09','Переключатель','EKF','pk-1-64-10','Переключатель кулачковый ПК-1-64 10А для вольтметра','ПК-1-64','{"ном. Ток":"6 пол.","катушка":10}',1782790000,'RUB','Переключатель.xlsm','SA',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7faa5f4a41cb600f58','Переключатель','IEK','BCS11-010-1','Переключатель кулачковый ПКП10-11 /0 10А "0-1" 1Р/400В','ПКП10-11 /0','{"ном. Ток":"6 пол.","катушка":10}',847980000,'RUB','Переключатель.xlsm','SA',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d70e40697aad3f3c3e','ПЧ','ESQ','08.04.000642','Частотный преобразователь ESQ-760-4T0007G/0015P','ESQ-760','{"Мощность. кВт":0.7}',16323830000,'RUB','ПЧ.xlsm','ESQ',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b6b93fbc96e44bf842','ПЧ','ESQ','08.04.000643','Частотный преобразователь ESQ-760-4T0015G/0022P','ESQ-760','{"Мощность. кВт":1.5}',16680820000,'RUB','ПЧ.xlsm','ESQ',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-91230daeba73a87602','ПЧ','ESQ','08.04.000644','Частотный преобразователь ESQ-760-4T0022G/0040P','ESQ-760','{"Мощность. кВт":2.2}',17319450000,'RUB','ПЧ.xlsm','ESQ',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-12cb2d8ea47395137d','ПЧ','ESQ','08.04.000645','Частотный преобразователь ESQ-760-4T0040G/0055P','ESQ-760','{"Мощность. кВт":4}',20448830000,'RUB','ПЧ.xlsm','ESQ',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8efefc19707f5b629f','ПЧ','ESQ','08.04.000477','Частотный преобразователь ESQ-760-4T0055G/0075P','ESQ-760','{"Мощность. кВт":5.5}',25856900000,'RUB','ПЧ.xlsm','ESQ',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-71c0c518dcf125e438','ПЧ','ESQ','08.04.000478','Частотный преобразователь ESQ-760-4T0075G/0110P','ESQ-760','{"Мощность. кВт":7.5}',30548670000,'RUB','ПЧ.xlsm','ESQ',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6855471a84faf8a815','ПЧ','ESQ','08.04.000479','Частотный преобразователь ESQ-760-4T0110G/0150P','ESQ-760','{"Мощность. кВт":11}',39000340000,'RUB','ПЧ.xlsm','ESQ',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d86459d26c59cf4881','ПЧ','ESQ','08.04.000480','Частотный преобразователь ESQ-760-4T0150G/0185P','ESQ-760','{"Мощность. кВт":15}',46224590000,'RUB','ПЧ.xlsm','ESQ',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-62ef61fcb167434a7a','ПЧ','ESQ','08.04.000482','Частотный преобразователь ESQ-760-4T0220G/0300P','ESQ-760','{"Мощность. кВт":22}',75006890000,'RUB','ПЧ.xlsm','ESQ',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4843a76d829103bc0b','ПЧ','ESQ','08.04.000729','Частотный преобразователь ESQ-760-4T0370G/0450P','ESQ-760','{"Мощность. кВт":37}',102567550000,'RUB','ПЧ.xlsm','ESQ',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a25679b571b6163b0b','ПЧ','ESQ','08.04.000481','Частотный преобразователь ESQ-760-4T0185G/0220P','ESQ-760','{"Мощность. кВт":45}',67721190000,'RUB','ПЧ.xlsm','ESQ',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-257504fb82f66db89d','ПЧ','ESQ','08.04.000728','Частотный преобразователь ESQ-760-4T0300G/0370P','ESQ-760','{"Мощность. кВт":55}',95611030000,'RUB','ПЧ.xlsm','ESQ',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1f4805e1cd1807f0e9','ПЧ','ESQ','08.04.000706','Частотный преобразователь ESQ-760-4T0450G/0550P','ESQ-760','{"Мощность. кВт":75}',132301410000,'RUB','ПЧ.xlsm','ESQ',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7c66fc63fd724495a8','ПЧ','ESQ','08.04.000707','Частотный преобразователь ESQ-760-4T0550G/0750P','ESQ-760','{"Мощность. кВт":90}',164843590000,'RUB','ПЧ.xlsm','ESQ',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-33f1fc568f8ca97900','ПЧ','ОВЕН','156617','Частотный преобразователь ПЧВ3-37К-В [М01]','ПЧВ3','{"Мощность. кВт":"37 кВт"}',236431810000,'RUB','ПЧ.xlsm','ОВЕН',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-068f4d29622ac21c1a','ПЧ','ОВЕН','129884','Частотный преобразователь ПЧВ1-К75-В [М01]','ПЧВ1','{"Мощность. кВт":"0,75 кВт"}',19537230000,'RUB','ПЧ.xlsm','ОВЕН',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c4756c358b4a46d1b2','ПЧ','ОВЕН','129885','Частотный преобразователь ПЧВ1-1К5-В [М01]','ПЧВ1','{"Мощность. кВт":"1,5 кВт"}',24127190000,'RUB','ПЧ.xlsm','ОВЕН',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3833c3f291088305a9','ПЧ','ОВЕН','129886','Частотный преобразователь ПЧВ1-2К2-В [М01]','ПЧВ1','{"Мощность. кВт":"2,2 кВт"}',29461400000,'RUB','ПЧ.xlsm','ОВЕН',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-df664477bc7872a330','ПЧ','ОВЕН','129887','Частотный преобразователь ПЧВ1-4К0-В [М01]','ПЧВ1','{"Мощность. кВт":"4 кВт"}',33617010000,'RUB','ПЧ.xlsm','ОВЕН',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fce2114c0e22e5a7f0','ПЧ','ОВЕН','129888','Частотный преобразователь ПЧВ1-5К5-В [М01]','ПЧВ1','{"Мощность. кВт":"5,5 кВт"}',42238140000,'RUB','ПЧ.xlsm','ОВЕН',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-975d533eeec4ad1c0b','ПЧ','ОВЕН','129889','Частотный преобразователь ПЧВ1-7К5-В [М01]','ПЧВ1','{"Мощность. кВт":"7,5 кВт"}',47943260000,'RUB','ПЧ.xlsm','ОВЕН',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-009c664aaa3d12d60e','ПЧ','ОВЕН','129890','Частотный преобразователь ПЧВ1-11К-В [М01]','ПЧВ1','{"Мощность. кВт":"11 кВт"}',59303180000,'RUB','ПЧ.xlsm','ОВЕН',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fd779061e7bb23c384','ПЧ','ОВЕН','129891','Частотный преобразователь ПЧВ1-15К-В [М01]','ПЧВ1','{"Мощность. кВт":"15 кВт"}',79699640000,'RUB','ПЧ.xlsm','ОВЕН',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a641e217ca8844aefd','ПЧ','ОВЕН','129892','Частотный преобразователь ПЧВ1-18К-В [М01]','ПЧВ1','{"Мощность. кВт":"18 кВт"}',98678070000,'RUB','ПЧ.xlsm','ОВЕН',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1aa73cf7657fe04a7c','ПЧ','ОВЕН','129893','Частотный преобразователь ПЧВ1-22К-В [М01]','ПЧВ1','{"Мощность. кВт":"22 кВт"}',115797090000,'RUB','ПЧ.xlsm','ОВЕН',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4e630531052184cfb2','ПЧ','DA','DA0007G3','Частотный преобразователь DA-G3-0,75','DA G3','{"Мощность. кВт":0.75}',9091170000,'RUB','ПЧ.xlsm','DA',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fa98a402c349b5774e','ПЧ','DA','DA0015G3','Частотный преобразователь DA-G3-1,5','DA G3','{"Мощность. кВт":1.5}',9375790000,'RUB','ПЧ.xlsm','DA',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-727e873771e3d523bd','ПЧ','DA','DA0022G3','Частотный преобразователь DA-G3-2,2','DA G3','{"Мощность. кВт":2.2}',9659480000,'RUB','ПЧ.xlsm','DA',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ced68215eb3af52ace','ПЧ','DA','DA0040G3','Частотный преобразователь DA-G3-4,0','DA G3','{"Мощность. кВт":4}',12711360000,'RUB','ПЧ.xlsm','DA',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-bb77d5867b70ab433c','ПЧ','DA','DA0055G3','Частотный преобразователь DA-G3-5,5','DA G3','{"Мощность. кВт":5.5}',13928520000,'RUB','ПЧ.xlsm','DA',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4063449302b11a448e','ПЧ','DA','DA0075G3','Частотный преобразователь DA-G3-7,5','DA G3','{"Мощность. кВт":7.5}',17565710000,'RUB','ПЧ.xlsm','DA',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e8527b5d932b21165b','ПЧ','DA','DA0110G3','Частотный преобразователь DA-G3-11,0','DA G3','{"Мощность. кВт":11}',21893820000,'RUB','ПЧ.xlsm','DA',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-60bd7eda9906fe79b2','ПЧ','DA','DA0150G3','Частотный преобразователь DA-G3-15,0','DA G3','{"Мощность. кВт":15}',25994590000,'RUB','ПЧ.xlsm','DA',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-04a6679c1d7b0ac4b6','ПЧ','DA','DA0185G3','Частотный преобразователь DA-G3-18,5','DA G3','{"Мощность. кВт":18.5}',28929210000,'RUB','ПЧ.xlsm','DA',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3a6e985380e77e8502','ПЧ','DA','DA0220G3','Частотный преобразователь DA-G3-22,0','DA G3','{"Мощность. кВт":22}',35357830000,'RUB','ПЧ.xlsm','DA',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f7993ee52a63404fd8','ПЧ','DA','DA0300G3','Частотный преобразователь DA-G3-30,0','DA G3','{"Мощность. кВт":30}',46687330000,'RUB','ПЧ.xlsm','DA',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-13a7239fa322ee07a2','ПЧ','DA','DA0370G3','Частотный преобразователь DA-G3-37,0','DA G3','{"Мощность. кВт":37}',53417550000,'RUB','ПЧ.xlsm','DA',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-64edebaccbd018c1f8','ПЧ','DA','DA0450G3','Частотный преобразователь DA-G3-45,0','DA G3','{"Мощность. кВт":45}',78462570000,'RUB','ПЧ.xlsm','DA',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9fd02a2535fcb2afd0','ПЧ','DA','DA0550G3','Частотный преобразователь DA-G3-55,0','DA G3','{"Мощность. кВт":55}',88598170000,'RUB','ПЧ.xlsm','DA',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2cca5bf4b3fb106edb','ПЧ','DA','DA0750G3','Частотный преобразователь DA-G3-75,0','DA G3','{"Мощность. кВт":75}',NULL,'RUB','ПЧ.xlsm','DA',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6c4e4b2f61ebef469b','ПЧ','DA','DA0930G3','Частотный преобразователь DA-G3-93,0','DA G3','{"Мощность. кВт":93}',NULL,'RUB','ПЧ.xlsm','DA',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9431515e0aa1ade098','ПЧ','DA','DA1100G3','Частотный преобразователь DA-G3-110,0','DA G3','{"Мощность. кВт":110}',NULL,'RUB','ПЧ.xlsm','DA',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1e308cad2c9222bd3c','Реле_коммутационные','Dekraft','23865DEK','Реле управления, 2 к-та, ПР-102-2-5A-230В-AC-T','ПР-102','{"ток контактов":"5 А","катушка":"220VAC","кол-во контактов":"2NO,2NC","куда прикрепляется":"Колодка_РР-102-2-3-5А"}',511800000,'RUB','Реле_коммутационные.xlsm','Dekraft',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8db522e82efd12d92f','Реле_коммутационные','Dekraft','23953DEK','Розетка для реле 4 к-та РР-102-4-(3-5)А','ПР-102','{"ток контактов":"5 А","катушка":"IP00","что прикрепляется":"Колодка_РР-102-4-3-5А"}',256820000,'RUB','Реле_коммутационные.xlsm','Dekraft',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-217e21d8fb0522bfe0','Реле_коммутационные','Dekraft','23855DEK','Реле управления, 2 к-та, ПР-102-2-5A-24В-AC-T','ПР-102','{"ток контактов":"5 А","катушка":"24VAC","кол-во контактов":"2NO,2NC","куда прикрепляется":"Колодка_РР-102-2-3-5А"}',511800000,'RUB','Реле_коммутационные.xlsm','Dekraft',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-28e018ce4b5bcfeec8','Реле_коммутационные','Dekraft','23839DEK','Реле управления, 2 к-та, ПР-102-2-5A-24В-DC-T','ПР-102','{"ток контактов":"5 А","катушка":"24VDC","кол-во контактов":"2NO,2NC","куда прикрепляется":"Колодка_РР-102-2-3-5А"}',511800000,'RUB','Реле_коммутационные.xlsm','Dekraft',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cc01ffea33cc7fa7bf','Реле_коммутационные','Dekraft','23937DEK','Реле управления, 4 к-та, ПР-102-4-10A-24В-DC','ПР-102','{"ток контактов":"10 А","катушка":"24VDC","кол-во контактов":"4NO,4NC","куда прикрепляется":"Колодка_РР-102-4-10А"}',800320000,'RUB','Реле_коммутационные.xlsm','Dekraft',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0a919f57a622521d2c','Реле_коммутационные','Dekraft','23945DEK','Реле управления, 4 к-та, ПР-102-4-10A-24В-AC','ПР-102','{"ток контактов":"10 А","катушка":"24VAC","кол-во контактов":"4NO,4NC","куда прикрепляется":"Колодка_РР-102-4-10А"}',520210000,'RUB','Реле_коммутационные.xlsm','Dekraft',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-344f647eefbafc4930','Реле_коммутационные','Dekraft','23949DEK','Реле управления, 4 к-та, ПР-102-4-10A-230В-AC','ПР-102','{"ток контактов":"10 А","катушка":"220VAC","кол-во контактов":"4NO,4NC","куда прикрепляется":"Колодка_РР-102-4-10А"}',520210000,'RUB','Реле_коммутационные.xlsm','Dekraft',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8c79444db5a4a26a12','Реле_коммутационные','Dekraft','23900DEK','Реле управления, 4 к-та, ПР-102-4-5A-230В-AC','ПР-102','{"ток контактов":"5 А","катушка":"220VAC","кол-во контактов":"4NO,4NC","куда прикрепляется":"Колодка_РР-102-4-3-5А"}',505700000,'RUB','Реле_коммутационные.xlsm','Dekraft',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c3b3e5250bef8c39e0','Реле_коммутационные','Dekraft','23887DEK','Реле управления, 4 к-та, ПР-102-4-5A-24В-DC','ПР-102','{"ток контактов":"5 А","катушка":"24VDC","кол-во контактов":"4NO,4NC","куда прикрепляется":"Колодка_РР-102-4-3-5А"}',505700000,'RUB','Реле_коммутационные.xlsm','Dekraft',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8cb57d292af30b1aec','Реле_коммутационные','Dekraft','23895DEK','Реле управления, 4 к-та, ПР-102-4-5A-24В-AC','ПР-102','{"ток контактов":"5 А","катушка":"24VAC","кол-во контактов":"4NO,4NC","куда прикрепляется":"Колодка_РР-102-4-3-5А"}',328700000,'RUB','Реле_коммутационные.xlsm','Dekraft',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-15d0c4f108745a881b','Реле_коммутационные','Dekraft','23958DEK','Розетка для реле 4 к-та РР-102-4-10А','РР-102','{"ток контактов":"10 А","что прикрепляется":"Колодка_РР-102-4-10А"}',425780000,'RUB','Реле_коммутационные.xlsm','Dekraft',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6392daf2410431ade9','Реле_коммутационные','Dekraft','23951DEK','Розетка для реле 2 к-та РР-102-2-(3-5)А','ПР-102','{"ток контактов":"5 А","что прикрепляется":"Колодка_РР-102-2-3-5А"}',256820000,'RUB','Реле_коммутационные.xlsm','Dekraft',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-71d4821c469b6537ea','Реле_коммутационные','IEK','RRP20-3-05-220A','Реле управления, 3 к-та, без розетки','РЭК78/3','{"ток контактов":"5A","катушка":"230VAC","кол-во контактов":"3NO,3NC","куда прикрепляется":"РЭК78/3"}',230370000,'RUB','Реле_коммутационные.xlsm','IEK',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3b24c4dca0364ad018','Реле_коммутационные','IEK','RRP20D-RRM-3','Разъем модульный РРМ78/3(PYF11 A) для РЭК78/3','РЭК78/3','{"ток контактов":"-","что прикрепляется":"РЭК78/3"}',103250000,'RUB','Реле_коммутационные.xlsm','IEK',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1bfa01258b42e53b18','Реле_коммутационные','IEK','RRP20-3-05-024A','Реле управления, 3 к-та, без розетки','РЭК78/3','{"ток контактов":"5A","катушка":"24VDC","кол-во контактов":"3NO,3NC"}',NULL,'RUB','Реле_коммутационные.xlsm','IEK',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ec63da64eb1a228fa9','Реле_коммутационные','Shenler','RFT2CO730LT','Реле управления, 2 к-та, мех. индикация, тест-кнопка с блокировкой, LED','RFT','{"ток контактов":"8A","катушка":"230VAC","кол-во контактов":"2NO,2NC"}',467490000,'RUB','Реле_коммутационные.xlsm','Shenler',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d2e37ad5d28b71e876','Реле_коммутационные','Shenler','SR20T','Фиксатор для SRU, SRC*-ST','-','{"ток контактов":"-","катушка":"-"}',32680000,'RUB','Реле_коммутационные.xlsm','Shenler',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-bd048125916ae8f263','Реле_коммутационные','Shenler','SRU08-E','Цоколь для RFT2CO','-','{"ток контактов":"-","катушка":"-"}',223090000,'RUB','Реле_коммутационные.xlsm','Shenler',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5576a8f1adfeaa5871','Реле_коммутационные','Shenler','SR2P','Шильдик маркировочный для SRU, SRB, SRC*-E, SRC*-ST','-','{"ток контактов":"-","катушка":"-"}',7520000,'RUB','Реле_коммутационные.xlsm','Shenler',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f0e1180782ad25868b','Реле_коммутационные','Shenler','RKE4CO730LT','Реле управления, 4 к-та, мех. индикация, тест-кнопка с блокировкой, LED','RKE','{"ток контактов":"5A","катушка":"230VAC","кол-во контактов":"4NO,4NC"}',451860000,'RUB','Реле_коммутационные.xlsm','Shenler',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-496a134824a2c966b5','Реле_коммутационные','Shenler','SKC14-E','Цоколь для RKE, RKF, R4N, MY4, 55','-','{"ток контактов":"-","катушка":"-"}',325400000,'RUB','Реле_коммутационные.xlsm','Shenler',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c148d9068107e56a5f','Реле_коммутационные','Shenler','SK4P','Шильдик маркировочный для SKC*, SKB*','-','{"ток контактов":"-","катушка":"-"}',8530000,'RUB','Реле_коммутационные.xlsm','Shenler',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9e58b6d4e873fc8479','Реле_коммутационные','Shenler','SK36M','Фиксатор для SKF*, SKB*, SKC*, SY*, STB08*','-','{"ток контактов":"-","катушка":"-"}',17050000,'RUB','Реле_коммутационные.xlsm','Shenler',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-982278439594008b46','Реле_коммутационные','Shenler','RFT2CO024LT','Реле управления, 2 к-та, мех. индикация, тест-кнопка с блокировкой, LED','RFT','{"ток контактов":"8A","катушка":"24VDC","кол-во контактов":"2NO,2NC"}',406390000,'RUB','Реле_коммутационные.xlsm','Shenler',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-15d723213ada302805','Реле_коммутационные','Shenler','RKE4CO024LT','Реле управления, 4 к-та, мех. индикация, тест-кнопка с блокировкой, LED','RKE','{"ток контактов":"5A","катушка":"24VAC","кол-во контактов":"4NO,4NC"}',426280000,'RUB','Реле_коммутационные.xlsm','Shenler',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c75dbc60b0d592d0ee','Реле_коммутационные','Hongfa','HF115-230AC-2','Реле управления, 2 к-та, 230В, 8А,  Реле, розетка, крепеж, маркировка','HF115','{"ток контактов":"8 А","катушка":"220VAC","кол-во контактов":"2NO,2NC"}',NULL,'RUB','Реле_коммутационные.xlsm','Hongfa',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-35b9a2d1967702d113','Реле_коммутационные','Hongfa','HF115-012DC-2','Реле управления, 2 к-та, 12В, 8А,  Реле, розетка, крепеж, маркировка','HF115','{"ток контактов":"8 А","катушка":"12VDC","кол-во контактов":"2NO,2NC"}',NULL,'RUB','Реле_коммутационные.xlsm','Hongfa',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-221399b527e0221d1c','Реле_коммутационные','Hongfa','HF115-024DC-2','Реле управления, 2 к-та, 24В, 8А,  Реле, розетка, крепеж, маркировка','HF115','{"ток контактов":"8 А","катушка":"24VDC","кол-во контактов":"2NO,2NC"}',NULL,'RUB','Реле_коммутационные.xlsm','Hongfa',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-895968b440da1de6ea','Реле_коммутационные','Hongfa','HF115-230AC-2-LED','Реле управления, 2 к-та, 230В, 8А, Реле, розетка, крепеж, маркировка,светодиод','HF115','{"ток контактов":"8 А","катушка":"220VAC","кол-во контактов":"2NO,2NC"}',NULL,'RUB','Реле_коммутационные.xlsm','Hongfa',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f685d37d32e2c5e502','Реле_коммутационные','Hongfa','HF115-024DC-2-LED','Реле управления, 2 к-та, 24В, 8А, , Реле, розетка, крепеж, маркировка,светодиод','HF115','{"ток контактов":"8 А","катушка":"24VDC","кол-во контактов":"2NO,2NC"}',NULL,'RUB','Реле_коммутационные.xlsm','Hongfa',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-34c64ec9798a06fbb7','Реле_коммутационные','Hongfa','HF115-012DC-2-LED','Реле управления, 2 к-та, 12В, 8А, Реле, розетка, крепеж, маркировка,светодиод','HF115','{"ток контактов":"8 А","катушка":"12VDC","кол-во контактов":"2NO,2NC"}',NULL,'RUB','Реле_коммутационные.xlsm','Hongfa',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fe6ee33422107e0081','Реле_коммутационные','Hongfa','HF18-024AC-4','Реле управления, 4 к-та, 24В, 6А,  Реле, розетка, крепеж, маркировка','HF18','{"ток контактов":"6 А","катушка":"24VDC","кол-во контактов":"4NO,4NC"}',NULL,'RUB','Реле_коммутационные.xlsm','Hongfa',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d34e52ab626016e62e','Реле_коммутационные','Hongfa','HF18-012DC-4','6Реле управления, 4 к-та, 12В, 6А,  Реле, розетка, крепеж, маркировка','HF18','{"ток контактов":"6 А","катушка":"24VDC","кол-во контактов":"4NO,4NC"}',NULL,'RUB','Реле_коммутационные.xlsm','Hongfa',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c5208c648d38a002a2','Реле_коммутационные','Hongfa','HF18-230AC-4','6Реле управления, 4 к-та, 230В, 6А,  Реле, розетка, крепеж, маркировка','HF18','{"ток контактов":"6 А","катушка":"220VAC","кол-во контактов":"4NO,4NC"}',NULL,'RUB','Реле_коммутационные.xlsm','Hongfa',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e86f8a6f83b60f59dd','Реле_коммутационные','Hongfa','HF41-12-DA','Реле управления, 1 к-та, 12В, 6А, Реле, розетка, крепеж, маркировка','HF41','{"ток контактов":"6 А","катушка":"12VDC","кол-во контактов":"1NO,1NC"}',NULL,'RUB','Реле_коммутационные.xlsm','Hongfa',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-97b712a21ab5820277','Реле_коммутационные','Hongfa','HF41-24','Реле управления, 1 к-та, 24В, 6А, Реле, розетка, крепеж, маркировка','HF41','{"ток контактов":"6 А","катушка":"24VDC","кол-во контактов":"1NO,1NC"}',NULL,'RUB','Реле_коммутационные.xlsm','Hongfa',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-38d5f9823abb272abf','Реле_коммутационные','Hongfa','HF41-220','Реле управления, 1 к-та, 230В, 6А, Реле, розетка, крепеж, маркировка','HF41','{"ток контактов":"6 А","катушка":"220VAC","кол-во контактов":"1NO,1NC"}',NULL,'RUB','Реле_коммутационные.xlsm','Hongfa',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b62b2b827712b260ea','Реле_коммутационные','Меандр','2000016930061','Реле контроля постоянного тока РКТ-3','РКТ-3','{"ток контактов":"5 А","катушка":"220 VDC","кол-во контактов":"1NO","куда прикрепляется":"УХЛ4"}',2705520000,'RUB','Реле_коммутационные.xlsm','Меандр',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-092de9eb7aae6dce24','Реле_коммутационные','Меандр','2000016930078','Реле контроля постоянного тока РКТ-3','РКТ-3','{"ток контактов":"16 А","катушка":"220 VDC","кол-во контактов":"1NO","куда прикрепляется":"УХЛ4"}',2705520000,'RUB','Реле_коммутационные.xlsm','Меандр',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d2037938922d2a9dbf','Реле_коммутационные','Меандр','2000016930115','Реле контроля постоянного тока РКТ-3','РКТ-3','{"ток контактов":"16 А","катушка":"220 VDC","кол-во контактов":"1NO","куда прикрепляется":"УХЛ2"}',3801590000,'RUB','Реле_коммутационные.xlsm','Меандр',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-df2eeed3f70a77ec5c','Реле_коммутационные','Меандр','4640016936908','Реле времени циклическое РВЦ-1М ACDC24В/АС230В УХЛ4','РВЦ-1М','{"катушка":"230AC","кол-во контактов":"1 NOC"}',2328920000,'RUB','Реле_коммутационные.xlsm','Меандр',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c670b5f9c075af6bd0','Реле_коммутационные','Меандр','4640016938193','Реле защиты двигателя','РЗН-1М','{"ток контактов":"5 А","катушка":"220 VAC","кол-во контактов":"1NO"}',3424990000,'RUB','Реле_коммутационные.xlsm','Меандр',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9d4b3f699dbe8d422d','Реле_коммутационные','Меандр','4640016933945','Реле контроля напряжения','РКН-3-15-15 УХЛ4','{"ток контактов":"8А","катушка":"220/400В","кол-во контактов":"2NO,2NC"}',2717070000,'RUB','Реле_коммутационные.xlsm','Меандр',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1fd967a4c772af5d54','Реле_коммутационные','Меандр','4640016933952','Реле контроля напряжения','РКН-3-15-15 УХЛ2','{"ток контактов":"8А","катушка":"220/400В","кол-во контактов":"2NO,2NC"}',3861310000,'RUB','Реле_коммутационные.xlsm','Меандр',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-24e46cd5c221e737d0','Реле_коммутационные','Меандр','4640016935871','Фотореле','ФР-М02 АС230В','{"ток контактов":"--","катушка":"220 VAC/5A","кол-во контактов":"1NO,1NC"}',1353250000,'RUB','Реле_коммутационные.xlsm','Меандр',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-582d4eede7af079769','Реле_коммутационные','Меандр','4640016936441','Фотодатчик','ФД-3-1','{"ток контактов":"--","катушка":"--","кол-во контактов":"IP67"}',416090000,'RUB','Реле_коммутационные.xlsm','Меандр',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8d8fe9aaa4bce9409e','Реле_коммутационные','Меандр','4640016939183','Термистоное реле','РТ-М01-1-15 АС230В','{"ток контактов":"5 А","катушка":"220 VAC","кол-во контактов":"1NO"}',2459910000,'RUB','Реле_коммутационные.xlsm','Меандр',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e3fa31ee438f3a43d9','Реле_коммутационные','Меандр','4640016936984','Термистоное реле','РТЗ-1М AC230В','{"ток контактов":"5 А","катушка":"220 VAC","кол-во контактов":"1NO"}',1941730000,'RUB','Реле_коммутационные.xlsm','Меандр',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6ecfb6be4699b8549c','Реле_коммутационные','Меандр','7860310','Реле РКН-3-15-15','РКН-3-15-15','{"катушка":"AC230В/AC400B"}',2717070000,'RUB','Реле_коммутационные.xlsm','Меандр',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cacf884e7f3d0eac06','Реле_коммутационные','МЕАНДР','4640016932887','Реле времени на замыкание РВО-15 АСDC24В/АС230В УХЛ4','РВО-15','{"катушка":"230AC","кол-во контактов":"2NOС"}',2003370000,'RUB','Реле_коммутационные.xlsm','Меандр',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-574d580cb6bb4facfc','Реле_коммутационные','EKF','rel-avr-2','Контроллер АВР на 2 ввода AVR-2','AVR-2','{}',7013010000,'RUB','Реле_коммутационные.xlsm','АВР',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b6ebf003b8af52c5c2','Реле_коммутационные','Полигон','ПЛГН.991002.044','Контроллер АВР-3/3-22, 2 ввода  с секционированием','АВР-3/3-22','{"ток контактов":"блок АВР"}',NULL,'RUB','Реле_коммутационные.xlsm','АВР',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-915163f29222f4e144','релейные блоки управления','Солис','РИС-1х6(3/3)','Разветвитель импульсного сигнала','РИС','{"ток контактов":"220VAC","column_19":20184}',NULL,'RUB','релейные блоки управления.xlsm','реле',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-488c1b92b44de74b58','релейные блоки управления','ОВЕН','САУ М6','Сигнализатор уровня','САУ М6','{"ток контактов":"5 А","катушка":"220 VAC","кол-во контактов":"3NO, 3NC","column_19":20100}',NULL,'RUB','релейные блоки управления.xlsm','реле',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-20bd382246e3a05d80','релейные блоки управления','ОВЕН','БКК1-220','Блок согласования','БКК1-220','{"ток контактов":"2 А","катушка":"220 VAC","кол-во контактов":"4NO","column_19":20112}',NULL,'RUB','релейные блоки управления.xlsm','реле',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3aa097f087256d9927','релейные блоки управления','ОВЕН','ПР103-230.1610.01.1.0','Реле программируемое','ПР103','{"ток контактов":"-","катушка":"220 VAC","кол-во контактов":"16DI, 10DO","column_19":20172}',NULL,'RUB','релейные блоки управления.xlsm','реле',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4f8903a7506704c2f8','Рубильники','DEKraft','17001DEK','Выключатель нагрузки, ВН102-1Р-020А','ВН-102','{"кол-во полюсов":1,"номинал, А":20}',301950000,'RUB','Рубильники.xlsm','dekraft',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e65d5ef9527cc8f350','Рубильники','DEKraft','17002DEK','Выключатель нагрузки, ВН102-1Р-032А','ВН-102','{"кол-во полюсов":1,"номинал, А":32}',299510000,'RUB','Рубильники.xlsm','dekraft',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fdf1ab96c6c4166d0c','Рубильники','DEKraft','17003DEK','Выключатель нагрузки, ВН102-1Р-063А','ВН-102','{"кол-во полюсов":1,"номинал, А":63}',374540000,'RUB','Рубильники.xlsm','dekraft',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a9dd99d72656cbe01e','Рубильники','DEKraft','17004DEK','Выключатель нагрузки, ВН102-1Р-100А','ВН-102','{"кол-во полюсов":1,"номинал, А":100}',374540000,'RUB','Рубильники.xlsm','dekraft',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-33231f421acf18e206','Рубильники','DEKraft','17017DEK','Выключатель нагрузки, ВН102-1Р-125А','ВН-102','{"кол-во полюсов":1,"номинал, А":125}',374540000,'RUB','Рубильники.xlsm','dekraft',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a37a20bc7ffa595f11','Рубильники','DEKraft','17021DEK','Выключатель нагрузки, ВН102-1Р-025А','ВН-102','{"кол-во полюсов":1,"номинал, А":25}',300730000,'RUB','Рубильники.xlsm','dekraft',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1c45055ff63727b1fa','Рубильники','DEKraft','17022DEK','Выключатель нагрузки, ВН102-1Р-040А','ВН-102','{"кол-во полюсов":1,"номинал, А":40}',300730000,'RUB','Рубильники.xlsm','dekraft',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a74f4d23a7a804ccae','Рубильники','DEKraft','17007DEK','Выключатель нагрузки, ВН102-2Р-063А','ВН-102','{"кол-во полюсов":2,"номинал, А":63}',738710000,'RUB','Рубильники.xlsm','dekraft',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5870b5e3c30ad916bb','Рубильники','DEKraft','17005DEK','Выключатель нагрузки, ВН102-2Р-020А','ВН-102','{"кол-во полюсов":2,"номинал, А":20}',587430000,'RUB','Рубильники.xlsm','dekraft',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d734102bbe766bc775','Рубильники','DEKraft','17006DEK','Выключатель нагрузки, ВН102-2Р-032А','ВН-102','{"кол-во полюсов":2,"номинал, А":32}',587430000,'RUB','Рубильники.xlsm','dekraft',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-63dd0cfc5f22effc32','Рубильники','DEKraft','17008DEK','Выключатель нагрузки, ВН102-2Р-100А','ВН-102','{"кол-во полюсов":2,"номинал, А":100}',738710000,'RUB','Рубильники.xlsm','dekraft',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a8d1414bb7124fdb46','Рубильники','DEKraft','17018DEK','Выключатель нагрузки, ВН102-2Р-125А','ВН-102','{"кол-во полюсов":2,"номинал, А":125}',744200000,'RUB','Рубильники.xlsm','dekraft',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-504110a2ef1362184c','Рубильники','DEKraft','17023DEK','Выключатель нагрузки, ВН102-2Р-025А','ВН-102','{"кол-во полюсов":2,"номинал, А":25}',593530000,'RUB','Рубильники.xlsm','dekraft',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7a4a9cb2fd1e6992f4','Рубильники','DEKraft','17024DEK','Выключатель нагрузки, ВН102-2Р-040А','ВН-102','{"кол-во полюсов":2,"номинал, А":40}',593530000,'RUB','Рубильники.xlsm','dekraft',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b68aa1478fea400c44','Рубильники','DEKraft','17009DEK','Выключатель нагрузки, ВН102-3Р-020А','ВН-102','{"кол-во полюсов":3,"номинал, А":20}',879010000,'RUB','Рубильники.xlsm','dekraft',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-90c3dca48af6f38bc0','Рубильники','DEKraft','17010DEK','Выключатель нагрузки, ВН102-3Р-032А','ВН-102','{"кол-во полюсов":3,"номинал, А":32}',879010000,'RUB','Рубильники.xlsm','dekraft',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ddadaa864800a3cbf1','Рубильники','DEKraft','17011DEK','Выключатель нагрузки, ВН102-3Р-063А','ВН-102','{"кол-во полюсов":3,"номинал, А":63}',1098610000,'RUB','Рубильники.xlsm','dekraft',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-98421591109507ac62','Рубильники','DEKraft','17012DEK','Выключатель нагрузки, ВН102-3Р-100А','ВН-102','{"кол-во полюсов":3,"номинал, А":100}',1107760000,'RUB','Рубильники.xlsm','dekraft',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6db84fcf59b438f34d','Рубильники','DEKraft','17019DEK','Выключатель нагрузки, ВН102-3Р-125А','ВН-102','{"кол-во полюсов":3,"номинал, А":125}',1209020000,'RUB','Рубильники.xlsm','dekraft',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-93fa42fdad0b87f77d','Рубильники','DEKraft','17025DEK','Выключатель нагрузки, ВН102-3Р-025А','ВН-102','{"кол-во полюсов":3,"номинал, А":25}',887550000,'RUB','Рубильники.xlsm','dekraft',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-21c16b54d5d4664fe6','Рубильники','DEKraft','17026DEK','Выключатель нагрузки, ВН102-3Р-040А','ВН-102','{"кол-во полюсов":3,"номинал, А":40}',887550000,'RUB','Рубильники.xlsm','dekraft',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-666434172bd7155426','Рубильники','Dekraft','40001DEK','Выключатель нагрузки, ВР-101-63-3Р-63А','ВР-101','{"кол-во полюсов":3,"номинал, А":63}',5172800000,'RUB','Рубильники.xlsm','dekraft',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8e3816cbfc6f664f7d','Рубильники','Dekraft','40002DEK','Выключатель нагрузки, ВР-101-100-3Р-80А','ВР-101','{"кол-во полюсов":3,"номинал, А":80}',5563200000,'RUB','Рубильники.xlsm','dekraft',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7380520fafcfcab895','Рубильники','Dekraft','40003DEK','Выключатель нагрузки, ВР-101-100-3Р-100А','ВР-101','{"кол-во полюсов":3,"номинал, А":100}',5422900000,'RUB','Рубильники.xlsm','dekraft',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e58740f5d0c33634b4','Рубильники','Dekraft','40005DEK','Выключатель нагрузки, ВР-101-160-3Р-125А','ВР-101','{"кол-во полюсов":3,"номинал, А":125}',11224000000,'RUB','Рубильники.xlsm','dekraft',26);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-434e3cbe793e4c6019','Рубильники','Dekraft','40006DEK','Выключатель нагрузки, ВР-101-160-3Р-160А','ВР-101','{"кол-во полюсов":3,"номинал, А":160}',12444000000,'RUB','Рубильники.xlsm','dekraft',27);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f7b75b09c5ad50212e','Рубильники','Dekraft','40007DEK','Выключатель нагрузки, ВР-101-250-3Р-200А','ВР-101','{"кол-во полюсов":3,"номинал, А":200}',17080000000,'RUB','Рубильники.xlsm','dekraft',28);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-81911d923e8ce8f057','Рубильники','Dekraft','40008DEK','Выключатель нагрузки, ВР-101-250-3Р-250А','ВР-101','{"кол-во полюсов":3,"номинал, А":250}',17080000000,'RUB','Рубильники.xlsm','dekraft',29);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-be7f79cb297e6ff747','Рубильники','Dekraft','40009DEK','Выключатель нагрузки, ВР-101-630-3Р-315А','ВР-101','{"кол-во полюсов":3,"номинал, А":315}',27511000000,'RUB','Рубильники.xlsm','dekraft',30);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5ae4021127c56c0d5b','Рубильники','Dekraft','40010DEK','Выключатель нагрузки, ВР-101-630-3Р-400А','ВР-101','{"кол-во полюсов":3,"номинал, А":400}',28304000000,'RUB','Рубильники.xlsm','dekraft',31);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9ce7c4a7e8ca6f08ba','Рубильники','Dekraft','40011DEK','Выключатель нагрузки, ВР-101-630-3Р-500А','ВР-101','{"кол-во полюсов":3,"номинал, А":500}',39833000000,'RUB','Рубильники.xlsm','dekraft',32);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-664468bc45cf6da6c7','Рубильники','Dekraft','40012DEK','Выключатель нагрузки, ВР-101-630-3Р-630А','ВР-101','{"кол-во полюсов":3,"номинал, А":630}',39101000000,'RUB','Рубильники.xlsm','dekraft',33);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6643d73e3c5b87e5b0','Рубильники','Dekraft','40013DEK','Выключатель нагрузки, ВР-101-1600-3Р-800А','ВР-101','{"кол-во полюсов":3,"номинал, А":800}',67832000000,'RUB','Рубильники.xlsm','dekraft',34);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-489d0e5335a37e3709','Рубильники','Dekraft','40014DEK','Выключатель нагрузки, ВР-101-1600-3Р-1000А','ВР-101','{"кол-во полюсов":3,"номинал, А":1000}',72224000000,'RUB','Рубильники.xlsm','dekraft',35);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b7589e4a24b88f83a2','Рубильники','Dekraft','40015DEK','Выключатель нагрузки, ВР-101-1600-3Р-1250А','ВР-101','{"кол-во полюсов":3,"номинал, А":1250}',80154000000,'RUB','Рубильники.xlsm','dekraft',36);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4c538e1b88c02e2876','Рубильники','Dekraft','40016DEK','Выключатель нагрузки, ВР-101-1600-3Р-1600А','ВР-101','{"кол-во полюсов":3,"номинал, А":1600}',91622000000,'RUB','Рубильники.xlsm','dekraft',37);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1fa7ea1df43aaca818','Рубильники','Dekraft','40100DEK','Рубильник реверсивный, ВР-101-100-3Р-80А-T','ВР-101','{"кол-во полюсов":3,"номинал, А":80}',15006000000,'RUB','Рубильники.xlsm','dekraft',38);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e4a47a3ad787d339c8','Рубильники','Dekraft','40101DEK','Рубильник реверсивный, ВР-101-100-3Р-100А-T','ВР-101','{"кол-во полюсов":3,"номинал, А":100}',15189000000,'RUB','Рубильники.xlsm','dekraft',39);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6783e65650333159f5','Рубильники','Dekraft','40102DEK','Рубильник реверсивный, ВР-101-160-3Р-125А-T','ВР-101','{"кол-во полюсов":3,"номинал, А":125}',28121000000,'RUB','Рубильники.xlsm','dekraft',40);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-16d2ea5d343a5a362d','Рубильники','Dekraft','40103DEK','Рубильник реверсивный, ВР-101-160-3Р-160А-T','ВР-101','{"кол-во полюсов":3,"номинал, А":160}',28426000000,'RUB','Рубильники.xlsm','dekraft',41);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a2ff612727e78e84ec','Рубильники','Dekraft','40104DEK','Рубильник реверсивный, ВР-101-250-3Р-200А-T','ВР-101','{"кол-во полюсов":3,"номинал, А":200}',32879000000,'RUB','Рубильники.xlsm','dekraft',42);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d3c131d40088ee9b9f','Рубильники','Dekraft','40105DEK','Рубильник реверсивный, ВР-101-250-3Р-250А-T','ВР-101','{"кол-во полюсов":3,"номинал, А":250}',33245000000,'RUB','Рубильники.xlsm','dekraft',43);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0e84df1450fb0ad943','Рубильники','Dekraft','40106DEK','Рубильник реверсивный, ВР-101-630-3Р-315А-T','ВР-101','{"кол-во полюсов":3,"номинал, А":315}',64721000000,'RUB','Рубильники.xlsm','dekraft',44);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-53520c6b7095c212a6','Рубильники','Dekraft','40107DEK','Рубильник реверсивный, ВР-101-630-3Р-400А-T','ВР-101','{"кол-во полюсов":3,"номинал, А":400}',65819000000,'RUB','Рубильники.xlsm','dekraft',45);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4af584e6db1906aab0','Рубильники','Dekraft','40108DEK','Рубильник реверсивный, ВР-101-630-3Р-500А-T','ВР-101','{"кол-во полюсов":3,"номинал, А":500}',77470000000,'RUB','Рубильники.xlsm','dekraft',46);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-de0586e289680d7c78','Рубильники','Dekraft','40109DEK','Рубильник реверсивный, ВР-101-630-3Р-630А-T','ВР-101','{"кол-во полюсов":3,"номинал, А":630}',79605000000,'RUB','Рубильники.xlsm','dekraft',47);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c09bc7eb7959e1888c','Рубильники','Dekraft','40110DEK','Рубильник реверсивный, ВР-101-1600-3Р-800А-T','ВР-101','{"кол-во полюсов":3,"номинал, А":800}',195200000000,'RUB','Рубильники.xlsm','dekraft',48);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-dc215e0ba13f8c2ee5','Рубильники','Dekraft','40111DEK','Рубильник реверсивный, ВР-101-1600-3Р-1000А-T','ВР-101','{"кол-во полюсов":3,"номинал, А":1000}',174460000000,'RUB','Рубильники.xlsm','dekraft',49);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-22f77f9e494685cd66','Рубильники','Dekraft','40112DEK','Рубильник реверсивный, ВР-101-1600-3Р-1250А-T','ВР-101','{"кол-во полюсов":3,"номинал, А":1250}',183610000000,'RUB','Рубильники.xlsm','dekraft',50);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a869beda6730815be2','Рубильники','Dekraft','40113DEK','Рубильник реверсивный, ВР-101-1600-3Р-1600А-T','ВР-101','{"кол-во полюсов":3,"номинал, А":1600}',218380000000,'RUB','Рубильники.xlsm','dekraft',51);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6d894f9d6cd72fa143','Рубильники','EKF','tb-40-3p-f','Выключатель нагрузки, 40A-3p c рукояткой управления для прямой','TwinBlock','{"кол-во полюсов":3,"номинал, А":40}',3519060000,'RUB','Рубильники.xlsm','EKF',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-df6d6bcb7ec9e7d51c','Рубильники','EKF','tb-63-3p-f','Выключатель нагрузки, 63A-3p c рукояткой управления для прямой','TwinBlock','{"кол-во полюсов":3,"номинал, А":63}',5105690000,'RUB','Рубильники.xlsm','EKF',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2af5641e5182a3abdd','Рубильники','EKF','tb-80-3p-f','Выключатель нагрузки, 80A-3p c рукояткой управления для прямой','TwinBlock','{"кол-во полюсов":3,"номинал, А":80}',4791490000,'RUB','Рубильники.xlsm','EKF',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7943c92411e8528ffd','Рубильники','EKF','tb-100-3p-f','Выключатель нагрузки, 100A-3p c рукояткой управления для прямой','TwinBlock','{"кол-во полюсов":3,"номинал, А":100}',6236050000,'RUB','Рубильники.xlsm','EKF',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-7093d7b6313699096d','Рубильники','EKF','tb-125-3p-f','Выключатель нагрузки, 125A-3p c рукояткой управления для прямой','TwinBlock','{"кол-во полюсов":3,"номинал, А":125}',9084000000,'RUB','Рубильники.xlsm','EKF',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-53e5d656ac9c91f79c','Рубильники','EKF','tb-s-160-3p','Рубильник 160A-3p без рукоятки управления','TwinBlock','{"кол-во полюсов":3,"номинал, А":160}',9046940000,'RUB','Рубильники.xlsm','EKF',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5a770356309a685046','Рубильники','EKF','tb-s-200-3p','Рубильник 200A-3p без рукоятки управления','TwinBlock','{"кол-во полюсов":3,"номинал, А":200}',9227200000,'RUB','Рубильники.xlsm','EKF',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-93bbbeeec64784ef7d','Рубильники','EKF','tb-s-250-3p','Рубильник 250A-3p без рукоятки управления','TwinBlock','{"кол-во полюсов":3,"номинал, А":250}',8622330000,'RUB','Рубильники.xlsm','EKF',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a86278e6dd98305c76','Рубильники','EKF','tb-s-315-3p','Рубильник 315A-3p без рукоятки управления','TwinBlock','{"кол-во полюсов":3,"номинал, А":315}',18308380000,'RUB','Рубильники.xlsm','EKF',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b24a95e4b95c14664e','Рубильники','EKF','tb-s-400-3p','Рубильник 400A-3p без рукоятки управления','TwinBlock','{"кол-во полюсов":3,"номинал, А":400}',21211260000,'RUB','Рубильники.xlsm','EKF',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9e00340b0d282e5526','Рубильники','EKF','tb-s-630-3p','Рубильник 630A-3p без рукоятки управления','TwinBlock','{"кол-во полюсов":3,"номинал, А":630}',45220370000,'RUB','Рубильники.xlsm','EKF',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-df6a66d4705304f8e6','Рубильники','EKF','tb-s-800-3p','Рубильник 800A-3p без рукоятки управления','TwinBlock','{"кол-во полюсов":3,"номинал, А":800}',46634560000,'RUB','Рубильники.xlsm','EKF',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c171944309341eb6ff','Рубильники','EKF','tb-s-1000-3p','Рубильник 1000A-3p без рукоятки управления','TwinBlock','{"кол-во полюсов":3,"номинал, А":1000}',97899050000,'RUB','Рубильники.xlsm','EKF',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-eaf750d433aa381749','Рубильники','EKF','tb-s-1250-3p','Рубильник 1250A-3p без рукоятки управления','TwinBlock','{"кол-во полюсов":3,"номинал, А":1250}',106735040000,'RUB','Рубильники.xlsm','EKF',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2f46dca5bf6c3b467a','Рубильники','EKF','tb-s-1600-3p','Рубильник 1600A-3p без рукоятки управления','TwinBlock','{"кол-во полюсов":3,"номинал, А":1600}',114582940000,'RUB','Рубильники.xlsm','EKF',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e916a9f5d2d6800bd9','Рубильники','EKF','tb-s-40-3p-rev','Рубильник 40A-3p реверсивный c рукояткой для прямой','TwinBlock','{"кол-во полюсов":3,"номинал, А":40}',10213810000,'RUB','Рубильники.xlsm','EKF',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a431ce890fd84bffec','Рубильники','EKF','tb-s-63-3p-rev','Рубильник 63A-3p реверсивный c рукояткой для прямой','TwinBlock','{"кол-во полюсов":3,"номинал, А":630}',6688670000,'RUB','Рубильники.xlsm','EKF',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0d5571a4ce23d4e8e8','Рубильники','EKF','tb-s-80-3p-rev','Рубильник 80A-3p реверсивный c рукояткой для прямой','TwinBlock','{"кол-во полюсов":3,"номинал, А":80}',7552260000,'RUB','Рубильники.xlsm','EKF',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6bbec38685e4976962','Рубильники','EKF','tb-s-100-3p-rev','Рубильник 100A-3p реверсивный c рукояткой для прямой','TwinBlock','{"кол-во полюсов":3,"номинал, А":100}',7918430000,'RUB','Рубильники.xlsm','EKF',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0a0ab8c568aca1ea0a','Рубильники','EKF','tb-s-160-3p-rev','Рубильник 160A-3p реверсивный без рукоятки','TwinBlock','{"кол-во полюсов":3,"номинал, А":160}',25945830000,'RUB','Рубильники.xlsm','EKF',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c68a1be71436109e15','Рубильники','EKF','tb-s-200-3p-rev','Рубильник 200A-3p реверсивный без рукоятки','TwinBlock','{"кол-во полюсов":3,"номинал, А":200}',25689020000,'RUB','Рубильники.xlsm','EKF',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2d7666c1c06ea41844','Рубильники','EKF','tb-s-250-3p-rev','Рубильник 250A-3p реверсивный без рукоятки','TwinBlock','{"кол-во полюсов":3,"номинал, А":250}',25436480000,'RUB','Рубильники.xlsm','EKF',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b92e1eb351d8df0738','Рубильники','EKF','tb-s-315-3p-rev','Рубильник 315A-3p реверсивный без рукоятки','TwinBlock','{"кол-во полюсов":3,"номинал, А":315}',46109830000,'RUB','Рубильники.xlsm','EKF',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-10d8da9c11fff52c10','Рубильники','EKF','tb-1000-1250-dh','Рукоятка управления 100-1600А','TwinBlock','{}',NULL,'RUB','Рубильники.xlsm','EKF',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-238c48dff9705c7ad6','Рубильники','EKF','tb-160-250-dh','Рукоятка управления 160-250А','TwinBlock','{}',NULL,'RUB','Рубильники.xlsm','EKF',26);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-109074699508ac1be3','Рубильники','EKF','tb-315-400-dh','Рукоятка управления 315-400А','TwinBlock','{}',NULL,'RUB','Рубильники.xlsm','EKF',27);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1510db7e48e852dae2','Рубильники','EKF','tb-630-800-dh','Рукоятка управления 630-800А','TwinBlock','{}',NULL,'RUB','Рубильники.xlsm','EKF',28);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f9f6d6f8f1ee86785b','Рубильники','EKF','tb-80-100-dh','Рукоятка управления 80-100А','TwinBlock','{}',NULL,'RUB','Рубильники.xlsm','EKF',29);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0d60b18d1f2c010d75','Рубильники','EKF','tb-315-400-dh-rev','Рукоятка управления реверсивная 315-400А','TwinBlock','{}',NULL,'RUB','Рубильники.xlsm','EKF',30);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2231ab816e6222321e','Рубильники','EKF','tb-630-800-dh-rev','Рукоятка управления реверсивная 630-800А','TwinBlock','{}',NULL,'RUB','Рубильники.xlsm','EKF',31);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6dced9692b1e8ffe9e','Рубильники','EKF','tb-160-250-dh-rev','Рукоятка управления реверсивная 80-250А','TwinBlock','{}',NULL,'RUB','Рубильники.xlsm','EKF',32);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c1b1f98cf75aeabd6d','AM_Ампермерты','IEK','IPA10-6-0010-E','Амперметр Э47,10 А, 72х72','Э47','{"размер":"72х72мм","номинал, А":"10 А","подвключение":"неоср."}',2094920000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d647a66e7e41bdbed3','AM_Ампермерты','IEK','IPA10-6-0050-E','Амперметр Э47,50 А, 72х72','400В','{"размер":"72х72мм","номинал, А":"50 A","подвключение":"неоср."}',2079960000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ed20f7000c69c24bfc','AM_Ампермерты','IEK','IPA10-6-0100-E','Амперметр Э47,100 А, 72х72','400В','{"размер":"72х72мм","номинал, А":"100 A","подвключение":"ч. тр-р"}',2081070000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4a0b1e94e6c04459a4','AM_Ампермерты','IEK','IPA10-6-0150-E','Амперметр Э47,150 А, 72х72','400В','{"размер":"72х72мм","номинал, А":"150 A","подвключение":"ч. тр-р"}',2081070000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fdd35019402eb76c7e','AM_Ампермерты','IEK','IPA10-6-0200-E','Амперметр Э47,200 А, 72х72','400В','{"размер":"72х72мм","номинал, А":"200 A","подвключение":"ч. тр-р"}',2081070000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ab8a0b67ee9fb9b510','AM_Ампермерты','IEK','IPA10-6-0300-E','Амперметр Э47,300 А, 72х72','400В','{"размер":"72х72мм","номинал, А":"300 A","подвключение":"ч. тр-р"}',2081070000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-34dc30cbc6db53bc95','AM_Ампермерты','IEK','IPA10-6-0400-E','Амперметр Э47,400 А, 72х72','400В','{"размер":"72х72мм","номинал, А":"400 A","подвключение":"ч. тр-р"}',2081070000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3aa4221931c57131c1','AM_Ампермерты','IEK','IPA10-6-0600-E','Амперметр Э47,600 А, 72х72','400В','{"размер":"72х72мм","номинал, А":"600 A","подвключение":"ч. тр-р"}',2081070000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-75bcf7c084d628fd26','AM_Ампермерты','IEK','IPA10-6-1000-E','Амперметр Э47,1000 А, 72х72','400В','{"размер":"72х72мм","номинал, А":"1000 A","подвключение":"ч. тр-р"}',2100350000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-588920be9b307c6a68','AM_Ампермерты','IEK','IPA10-6-1500-E','Амперметр Э47,1500 А, 72х72','400В','{"размер":"72х72мм","номинал, А":"1500 A","подвключение":"ч. тр-р"}',2115630000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e82cdf408b88df2edd','AM_Ампермерты','IEK','IPA10-6-2000-E','Амперметр Э47,2000 А, 72х72','400В','{"размер":"72х72мм","номинал, А":"2000 A","подвключение":"ч. тр-р"}',2115630000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-465bb3f2dbb4b98151','AM_Ампермерты','IEK','IPA10-6-3000-E','Амперметр Э47,3000 А, 72х72','400В','{"размер":"72х72мм","номинал, А":"3000 A","подвключение":"ч. тр-р"}',2210740000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-72971907f60f66c340','AM_Ампермерты','IEK','IPA20-6-0010-E','Амперметр Э47,10 А, 96х96','400В','{"размер":"96х96мм","номинал, А":"10 А","подвключение":"неоср."}',2103040000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e405054c70169bb0ac','AM_Ампермерты','IEK','IPA20-6-0050-E','Амперметр Э47,50 А, 96х96','400В','{"размер":"96х96мм","номинал, А":"50 A","подвключение":"неоср."}',2142880000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-929b913e1c2347463d','AM_Ампермерты','IEK','IPA20-6-0100-E','Амперметр Э47,100 А, 96х96','400В','{"размер":"96х96мм","номинал, А":"100 A","подвключение":"ч. тр-р"}',2135570000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-368e0dc8235585a913','AM_Ампермерты','IEK','IPA20-6-0150-E','Амперметр Э47,150 А, 96х96','400В','{"размер":"96х96мм","номинал, А":"150 A","подвключение":"ч. тр-р"}',2115230000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cabab8e71864a06bbc','AM_Ампермерты','IEK','IPA20-6-0200-E','Амперметр Э47,200 А, 96х96','400В','{"размер":"96х96мм","номинал, А":"200 A","подвключение":"ч. тр-р"}',2115230000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2b6156ea0e69f8c65b','AM_Ампермерты','IEK','IPA20-6-0300-E','Амперметр Э47,300 А, 96х96','400В','{"размер":"96х96мм","номинал, А":"300 A","подвключение":"ч. тр-р"}',2135570000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-218eb8f6c1d804bb63','AM_Ампермерты','IEK','IPA20-6-0400-E','Амперметр Э47,400 А, 96х96','400В','{"размер":"96х96мм","номинал, А":"400 A","подвключение":"ч. тр-р"}',2135570000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-01fb4dd02af0fdc13d','AM_Ампермерты','IEK','IPA20-6-0600-E','Амперметр Э47,600 А, 96х96','400В','{"размер":"96х96мм","номинал, А":"600 A","подвключение":"ч. тр-р"}',2094920000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-139dc5553b46bd20f1','AM_Ампермерты','IEK','IPA20-6-1000-E','Амперметр Э47,1000 А, 96х96','400В','{"размер":"96х96мм","номинал, А":"1000 A","подвключение":"ч. тр-р"}',2135590000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3ab17cf90f22835ea9','AM_Ампермерты','IEK','IPA20-6-1500-E','Амперметр Э47,1500 А, 96х96','400В','{"размер":"96х96мм","номинал, А":"1500 A","подвключение":"ч. тр-р"}',2135590000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-315e14871aac2dc2d8','AM_Ампермерты','IEK','IPA20-6-2000-E','Амперметр Э47,2000 А, 96х96','400В','{"размер":"96х96мм","номинал, А":"2000 A","подвключение":"ч. тр-р"}',2135590000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cc2cec9c312a1be001','AM_Ампермерты','IEK','IPA20-6-3000-E','Амперметр Э47,3000 А, 96х96','400В','{"размер":"96х96мм","номинал, А":"3000 A","подвключение":"ч. тр-р"}',2168220000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','IEK',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8680a6a4659d6d516e','AM_Ампермерты','EKF','AM-721','Амперметр аналоговый, 10-4000 А, 72х72','AM','{"размер":"72х72мм","номинал, А":"10-4000 А","подвключение":"неоср."}',1714230000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a6bd566007f42d2494','AM_Ампермерты','EKF','AM-961','Амперметр аналоговый, 10-4000 А, 96х96','AM','{"размер":"96х96мм","номинал, А":"10-4000 А","подвключение":"неоср."}',1900160000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-194e3074628fb98066','AM_Ампермерты','EKF','s-a721-100','Сменная шкала на 100 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5d20dbec7a5a14852c','AM_Ампермерты','EKF','s-a721-1000','Сменная шкала на 1000 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5fd1b921640bf304b1','AM_Ампермерты','EKF','s-a721-1200','Сменная шкала на 1200 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-33fec0164d79364fd2','AM_Ампермерты','EKF','s-a721-125','Сменная шкала на 125 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-06a997351769e09515','AM_Ампермерты','EKF','s-a721-150','Сменная шкала на 150 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8d36bc9e0842ed1e7c','AM_Ампермерты','EKF','s-a721-1500','Сменная шкала на 1500 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2e2980d4b915700f98','AM_Ампермерты','EKF','s-a721-1600','Сменная шкала на 1600 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8ee3dab8f0c07fea2d','AM_Ампермерты','EKF','s-a721-200','Сменная шкала на 200 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c142fe240fe9d58403','AM_Ампермерты','EKF','s-a721-25','Сменная шкала на 25 А','AM','{"размер":"72х72мм","номинал, А":"-"}',110570000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-35fcb2a4fb155ece87','AM_Ампермерты','EKF','s-a721-250','Сменная шкала на 250 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fe908df61584e51a6e','AM_Ампермерты','EKF','s-a721-30','Сменная шкала на 30 А','AM','{"размер":"72х72мм","номинал, А":"-"}',110570000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-2c54e9f885cf35b098','AM_Ампермерты','EKF','s-a721-300','Сменная шкала на 300 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0b90c8daf386fec1e4','AM_Ампермерты','EKF','s-a721-40','Сменная шкала на 40 А','AM','{"размер":"72х72мм","номинал, А":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b70ea72014531b38da','AM_Ампермерты','EKF','s-a721-400','Сменная шкала на 400 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-261cf6fad4fb8f1241','AM_Ампермерты','EKF','s-a721-50','Сменная шкала на 50 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110110000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',18);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5bb73455c62965b837','AM_Ампермерты','EKF','s-a721-500','Сменная шкала на 500 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',19);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-98a3913b8faec071fe','AM_Ампермерты','EKF','s-a721-60','Сменная шкала на 60 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110110000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',20);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6395ffd88b3fd0fbb1','AM_Ампермерты','EKF','s-a721-600','Сменная шкала на 600 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',21);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ac54a7f2aba6eb3470','AM_Ампермерты','EKF','s-a721-75','Сменная шкала на 75 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',22);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-1100a6989678bfe442','AM_Ампермерты','EKF','s-a721-750','Сменная шкала на 750 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',23);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4945d4dc14a1a13440','AM_Ампермерты','EKF','s-a721-80','Сменная шкала на 80 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',24);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3047ad65b1de7d528b','AM_Ампермерты','EKF','s-a721-800','Сменная шкала на 800 А','AM','{"размер":"72х72мм","номинал, А":"-","подвключение":"-"}',110210000,'RUB','синхронизированно с каталогом/AM_Ампермерты.xlsm','EKF',25);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c9b4975a3a5438ff91','VM_Вольтметры','IEK','IPV10-6-0100-E','Вольтметр Э47','Э47','{"размер":"72х72мм","номинал, напряжения":"100В","подвключение":"неоср."}',NULL,'RUB','синхронизированно с каталогом/VM_Вольтметры.xlsm','IEK',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0dc1ad6c97f8915e5b','VM_Вольтметры','IEK','IPV10-6-0300-E','Вольтметр Э47','Э47','{"размер":"72х72мм","номинал, напряжения":"300В","подвключение":"неоср."}',NULL,'RUB','синхронизированно с каталогом/VM_Вольтметры.xlsm','IEK',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ec075f307c93bca676','VM_Вольтметры','IEK','IPV10-6-0500-E','Вольтметр Э47','Э47','{"размер":"72х72мм","номинал, напряжения":"500В","подвключение":"неоср."}',NULL,'RUB','синхронизированно с каталогом/VM_Вольтметры.xlsm','IEK',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-bc3c3264dd5844ce2c','VM_Вольтметры','IEK','IPV10-6-0600-E','Вольтметр Э47','Э47','{"размер":"72х72мм","номинал, напряжения":"600В","подвключение":"неоср."}',NULL,'RUB','синхронизированно с каталогом/VM_Вольтметры.xlsm','IEK',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f9753e42c40fbe882a','VM_Вольтметры','IEK','IPV20-6-0100-E','Вольтметр Э47','Э47','{"размер":"96х96мм","номинал, напряжения":"100В","подвключение":"неоср."}',NULL,'RUB','синхронизированно с каталогом/VM_Вольтметры.xlsm','IEK',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c99c816a13880c4747','VM_Вольтметры','IEK','IPV20-6-0300-E','Вольтметр Э47','Э47','{"размер":"96х96мм","номинал, напряжения":"300В","подвключение":"неоср."}',NULL,'RUB','синхронизированно с каталогом/VM_Вольтметры.xlsm','IEK',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ee03bdae20d39080be','VM_Вольтметры','IEK','IPV20-6-0500-E','Вольтметр Э47','Э47','{"размер":"96х96мм","номинал, напряжения":"500В","подвключение":"неоср."}',NULL,'RUB','синхронизированно с каталогом/VM_Вольтметры.xlsm','IEK',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-6849d3130169acc75a','VM_Вольтметры','IEK','IPV20-6-0600-E','Вольтметр Э47','Э47','{"размер":"96х96мм","номинал, напряжения":"600В","подвключение":"неоср."}',NULL,'RUB','синхронизированно с каталогом/VM_Вольтметры.xlsm','IEK',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3da0851705788c4209','VM_Вольтметры','EKF','vma-721-300','Вольтметр VMA-721 300B','VMA','{"размер":"72х72мм","номинал, А":"300В","подвключение":"неоср."}',1714230000,'RUB','синхронизированно с каталогом/VM_Вольтметры.xlsm','EKF',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-97b59904e24d6dfda2','VM_Вольтметры','EKF','vma-721-500','Вольтметр VMA-721 500B','VMA','{"размер":"72х72мм","номинал, А":"500В","подвключение":"неоср."}',1558390000,'RUB','синхронизированно с каталогом/VM_Вольтметры.xlsm','EKF',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c3216d8c1518a0d7f6','VM_Вольтметры','EKF','vma-961-300','Вольтметр VMA-921 300B','VMA','{"размер":"96х96мм","номинал, А":"300В","подвключение":"неоср."}',1907150000,'RUB','синхронизированно с каталогом/VM_Вольтметры.xlsm','EKF',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-afdb05ad4a3bbdbde1','VM_Вольтметры','EKF','vma-961-500','Вольтметр VMA-921 500B','VMA','{"размер":"96х96мм","номинал, А":"500В","подвключение":"неоср."}',1907150000,'RUB','синхронизированно с каталогом/VM_Вольтметры.xlsm','EKF',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-70afbcc34da9479a6f','Счетчики_эл','INCOTEX','Меркурий 230 AR-01 R','Счетчик электроэнегрии прямого включения Меркурий 230 AR-01 до 60 А','Меркурий 230 AR','{"Класс точности":"1/2","Ном. Макс. ток, А":"5(60)","интерфейс":"RS-485"}',9806540000,'RUB','Счетчики_эл.xlsm','INCOTEX',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-42f0447a13c513953f','Счетчики_эл','INCOTEX','Меркурий 230 AR-02 R','Счетчик электроэнегрии прямого включения Меркурий 230 AR-02 до 100 А','Меркурий 230 AR','{"Класс точности":"1/2","Ном. Макс. ток, А":"10(100)","интерфейс":"RS-485"}',9806540000,'RUB','Счетчики_эл.xlsm','INCOTEX',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3f011a303d9f3faa5b','Счетчики_эл','INCOTEX','Меркурий 230 AR-03 R','Счетчик электроэнегрии трансформаторного включения Меркурий 230 AR-03 (5/7,5)А','Меркурий 230 AR','{"Класс точности":"0,5S/1,0","Ном. Макс. ток, А":"5(7,5)","интерфейс":"RS-485"}',9806540000,'RUB','Счетчики_эл.xlsm','INCOTEX',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b7529a4278118e1c90','Счетчики_эл','INCOTEX','Меркурий 234 ARTMX2-01 (D)PBR.G','Счетчик электроэнегрии прямого включения Меркурий 234 ARTMX2 до 60 А','Меркурий 234 ARTM','{"Класс точности":"1/2","Ном. Макс. ток, А":"5(60)","интерфейс":"Оптопорт, RS-485, GSM/GPRS."}',28870970000,'RUB','Счетчики_эл.xlsm','INCOTEX',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-11a4ec1d56e841642f','Счетчики_эл','INCOTEX','Меркурий 234 ARTMX2-02 (D)PBR.G','Счетчик электроэнегрии прямого включения Меркурий 234 ARTMX2 до 100 А','Меркурий 234 ARTM','{"Класс точности":"1/2","Ном. Макс. ток, А":"10(100)","интерфейс":"Оптопорт, RS-485, GSM/GPRS."}',28870970000,'RUB','Счетчики_эл.xlsm','INCOTEX',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8a2860e8fd49a9a0f4','Счетчики_эл','INCOTEX','Меркурий 234 ARTMX2-03 (D)PBR.G','Счетчик электроэнегрии трансформаторного включения Меркурий 234 ARTMX2','Меркурий 234 ARTM','{"Класс точности":"0,5S/1,0","Ном. Макс. ток, А":"5(10)","интерфейс":"Оптопорт, RS-485, GSM/GPRS."}',23747540000,'RUB','Счетчики_эл.xlsm','INCOTEX',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-fb38375e0ce1e8aae1','Счетчики_эл','INCOTEX','Меркурий 236 ART-01 PQRS','Счетчик электроэнегрии прямого включения Меркурий 236 ART-01 PQRS до 60 А','Меркурий 236 ART','{"Класс точности":"1/2","Ном. Макс. ток, А":"5(60)","интерфейс":"Оптопорт, RS-485."}',10214180000,'RUB','Счетчики_эл.xlsm','INCOTEX',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d5fb6d9ad56f52d043','Счетчики_эл','INCOTEX','Меркурий 236 ART-02 PQRS','Счетчик электроэнегрии прямого включения Меркурий 236 ART-02 PQRS до 100 А','Меркурий 236 ART','{"Класс точности":"1/2","Ном. Макс. ток, А":"10(100)","интерфейс":"Оптопорт, RS-485."}',10214180000,'RUB','Счетчики_эл.xlsm','INCOTEX',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ab05142e4097b784d3','Счетчики_эл','INCOTEX','Меркурий 236 ART-03 PQRS','Счетчик электроэнегрии трансформаторного включения Меркурий 236 ART-03 PQRS','Меркурий 236 ART','{"Класс точности":"0,5S/1,0","Ном. Макс. ток, А":"5(10)","интерфейс":"Оптопорт, RS-485."}',10214180000,'RUB','Счетчики_эл.xlsm','INCOTEX',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-13a4daf7244fbb1a6b','Счетчики_эл','КЭАЗ','245520','Коробка испытательная переходная КИП-Л. ИКК','КИП-Л','{"Класс точности":"10А"}',NULL,'RUB','Счетчики_эл.xlsm','INCOTEX',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-344fefe7e2298e4753','Счетчики_эл','ЭнергоТехКомплект','УТ000003796','Коробка испытательная переходная КИП АНПК. ИКК','КИП АНПК','{"Класс точности":"10А"}',NULL,'RUB','Счетчики_эл.xlsm','INCOTEX',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-4a54623eedae998948','Счетчики_эл','Антей','АНТЕЙ-2600М','Антенна Антей 2600M WiFi/GSM/3G/4G SMA 10м на магните','Антена','{"Класс точности":"10 dB"}',NULL,'RUB','Счетчики_эл.xlsm','INCOTEX',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-976209f3dbd0506237','УПП','ESQ','08.05.000910','Устройство плавного пуска ESQ-GS7-011','ESQ-GS7','{"Мощность. кВт":11}',26242860000,'RUB','УПП.xlsm','ESQ',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-320a2a1e925409f74f','УПП','ESQ','08.05.000911','Устройство плавного пуска ESQ-GS7-015','ESQ-GS7','{"Мощность. кВт":15}',26741240000,'RUB','УПП.xlsm','ESQ',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5c30e33130ca06f17d','УПП','ESQ','08.05.000912','Устройство плавного пуска ESQ-GS7-018','ESQ-GS7','{"Мощность. кВт":18.5}',27990680000,'RUB','УПП.xlsm','ESQ',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a1997efe71d9ac528f','УПП','ESQ','08.05.000913','Устройство плавного пуска ESQ-GS7-022','ESQ-GS7','{"Мощность. кВт":22}',28491380000,'RUB','УПП.xlsm','ESQ',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9a211225144528ffe7','УПП','ESQ','08.05.000027','Устройство плавного пуска ESQ-GS7-030','ESQ-GS7','{"Мощность. кВт":30}',30989100000,'RUB','УПП.xlsm','ESQ',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5a2becb672f18a94e3','УПП','ESQ','08.05.000028','Устройство плавного пуска ESQ-GS7-037','ESQ-GS7','{"Мощность. кВт":37}',31992830000,'RUB','УПП.xlsm','ESQ',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-e82b2ba8e52b7b7b78','УПП','ESQ','08.05.000029','Устройство плавного пуска ESQ-GS7-045','ESQ-GS7','{"Мощность. кВт":45}',40241660000,'RUB','УПП.xlsm','ESQ',8);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b6c0d31f55a43972ea','УПП','ESQ','08.05.000030','Устройство плавного пуска ESQ-GS7-055','ESQ-GS7','{"Мощность. кВт":55}',46238500000,'RUB','УПП.xlsm','ESQ',9);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5f1aa4efad22335125','УПП','ESQ','08.05.000031','Устройство плавного пуска ESQ-GS7-075','ESQ-GS7','{"Мощность. кВт":75}',52234190000,'RUB','УПП.xlsm','ESQ',10);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-b83e819570e1df9eab','УПП','ESQ','08.05.000032','Устройство плавного пуска ESQ-GS7-090','ESQ-GS7','{"Мощность. кВт":90}',100492880000,'RUB','УПП.xlsm','ESQ',11);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-f8306129e64e697a4d','УПП','ESQ','08.05.000033','Устройство плавного пуска ESQ-GS7-110','ESQ-GS7','{"Мощность. кВт":110}',105057150000,'RUB','УПП.xlsm','ESQ',12);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-838f17ed30627c5224','УПП','ESQ','08.05.000034','Устройство плавного пуска ESQ-GS7-132','ESQ-GS7','{"Мощность. кВт":132}',114193820000,'RUB','УПП.xlsm','ESQ',13);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-39ed913eb8221f9426','УПП','ESQ','08.05.000035','Устройство плавного пуска ESQ-GS7-160','ESQ-GS7','{"Мощность. кВт":160}',118760410000,'RUB','УПП.xlsm','ESQ',14);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-44cb609355d404757b','УПП','ESQ','08.05.000036','Устройство плавного пуска ESQ-GS7-185','ESQ-GS7','{"Мощность. кВт":185}',121704000000,'RUB','УПП.xlsm','ESQ',15);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-9a59c4506d94a78169','УПП','ESQ','08.05.000037','Устройство плавного пуска ESQ-GS7-200','ESQ-GS7','{"Мощность. кВт":200}',141600340000,'RUB','УПП.xlsm','ESQ',16);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-ac2535481e72aed959','УПП','ESQ','08.05.000038','Устройство плавного пуска ESQ-GS7-250','ESQ-GS7','{"Мощность. кВт":250}',157708580000,'RUB','УПП.xlsm','ESQ',17);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-dfd4c1568fa66c0ba1','УПП','ONI','SFB-33-D55-A-00','Устройство плавного пуска','SFB','{"Мощность. кВт":5.5,"Ток, А":11}',16110840000,'RUB','УПП.xlsm','ONI',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-bbbb62bd7b92ef305f','УПП','ONI','SFB-33-D22-A-00','Устройство плавного пуска','SFB','{"Мощность. кВт":2.2,"Ток, А":4.5}',14360080000,'RUB','УПП.xlsm','ONI',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-0f8ff8600257851118','Шины','EKF','plc-shrb-160','Блок распределительный шинный ШРБ-160','PROxima','{"ток контактов":"160A","отверстия":"8хØ7 + 4хØ9 + 1хØ12"}',NULL,'RUB','Шины.xlsm','EKF',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-cdf33490f77a9e39ee','Шины','EKF','plc-shrb-200','Блок распределительный шинный ШРБ-200','PROxima','{"ток контактов":"200A","отверстия":"1хØ8 + 10хØ6"}',NULL,'RUB','Шины.xlsm','EKF',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-8247110fae46707d9d','Шины','EKF','plc-shrb-250','Блок распределительный шинный ШРБ-250','PROxima','{"ток контактов":"250A","отверстия":"1хØ8 + 10хØ6"}',NULL,'RUB','Шины.xlsm','EKF',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-816484f532c4c436fd','Шины','EKF','plc-shrb-400','Блок распределительный шинный ШРБ-400','PROxima','{"ток контактов":"400A","отверстия":"1хØ8 + 9хØ6"}',NULL,'RUB','Шины.xlsm','EKF',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-a0b2a834a2bdf5b569','Шины','EKF','sn0-2x7','Кросс-модуль 2x7 100А','PROxima','{"ток контактов":"100А","отверстия":"2х7"}',NULL,'RUB','Шины.xlsm','EKF',6);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-3946caa64fab796d9f','Шины','EKF','sn0-4x15','Кросс-модуль 4x15 125A','PROxima','{"ток контактов":"125A","отверстия":"4x15"}',NULL,'RUB','Шины.xlsm','EKF',7);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-5536920c4e74a89a5d','Шины','ЭРА','Б0043933','Кросс-модуль 4x7 100А','100А','{"ток контактов":"4x7"}',759760000,'RUB','Шины.xlsm','ЭРА',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d2bff0ead267956d7f','Шины','ЭРА','Б0043935','Кросс-модуль 4x15 125A','125A','{"ток контактов":"4x15"}',1233920000,'RUB','Шины.xlsm','ЭРА',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-97b4356d77406552d1','Шины','ЭРА','Б0043931','Кросс-модуль 2x7 100А','100А','{"ток контактов":"2х7"}',426860000,'RUB','Шины.xlsm','ЭРА',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-82fce8696bca252da0','Шины','ЭРА','Б0043932','Кросс-модуль 2x15 125A','125A','{"ток контактов":"2х15","отверстия":"5хØ5.3+2хØ7.5+8хØ9"}',736790000,'RUB','Шины.xlsm','ЭРА',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-d78183ef4add4edf73','Шины','IEK','YND10-4-07-100','Кросс-модуль 4x7 100А','100А','{"ток контактов":"4x7"}',1255890000,'RUB','Шины.xlsm','IEK',2);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-da5ef9abf16c034086','Шины','IEK','YND10-4-15-125','Кросс-модуль 4x15 125A','125A','{"ток контактов":"4x15"}',1997100000,'RUB','Шины.xlsm','IEK',3);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-c28cfbfbd04da842d8','Шины','IEK','YND10-2-07-100','Кросс-модуль 2x7 100А','100А','{"ток контактов":"2х7"}',687960000,'RUB','Шины.xlsm','IEK',4);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('cc-00ce7a26ed077949f2','Шины','IEK','YND10-2-15-125','Кросс-модуль 2x15 125A','125A','{"ток контактов":"2х15","отверстия":"5хØ5.3+2хØ7.5+8хØ9"}',1216000000,'RUB','Шины.xlsm','IEK',5);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('synthetic-assembly-тип-2-1','Сборочный комплект','Wenard','тип 2.1','Сборочный комплект тип 2.1','Сборочный комплект','{"Состав":"Провода, кабельный короб, наконечники, маркировка и крепёж"}',3000000000,'RUB','Расчет стоимости шкафов.xlsm','Сборочный комплект',0);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('synthetic-assembly-тип-2-2','Сборочный комплект','Wenard','тип 2.2','Сборочный комплект тип 2.2','Сборочный комплект','{"Состав":"Провода, кабельный короб, наконечники, маркировка и крепёж"}',4000000000,'RUB','Расчет стоимости шкафов.xlsm','Сборочный комплект',0);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('synthetic-assembly-тип-3-1','Сборочный комплект','Wenard','тип 3.1','Сборочный комплект тип 3.1','Сборочный комплект','{"Состав":"Провода, кабельный короб, наконечники, маркировка и крепёж"}',5000000000,'RUB','Расчет стоимости шкафов.xlsm','Сборочный комплект',0);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('synthetic-assembly-тип-3-2','Сборочный комплект','Wenard','тип 3.2','Сборочный комплект тип 3.2','Сборочный комплект','{"Состав":"Провода, кабельный короб, наконечники, маркировка и крепёж"}',6000000000,'RUB','Расчет стоимости шкафов.xlsm','Сборочный комплект',0);
--> statement-breakpoint
INSERT INTO control_components (id,category,manufacturer,article,name,component_type,attributes_json,current_price_microunits,currency,source_file,source_sheet,source_row) VALUES ('synthetic-cabinet-assembly','Работы','Wenard','LABOR-CABINET-ASSEMBLY','Сборка шкафа управления','Работа','{"Человеко-часы":10,"Стоимость часа, руб.":2000}',20000000000,'RUB','Расчет стоимости шкафов.xlsm','Smart_НС',0);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-2-0,37-0,75','smart:2:0.37-0.75','smart','Wenard PC BP-Smart-2-(0,37-0,75)',2,0.75,6.0,20.0,2,1,0.7,'400х400х200','тип 2.1',10.0,2000.0,46636790000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-b68aa1478fea400c44','incoming-switch',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-dbb4e864212026115a','motor-breaker',2,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-4e630531052184cfb2','vfd',1,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-d840fc82e60c70ccd3','contactor',2,4);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-c98572bfb013eda17e','enclosure',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','synthetic-assembly-тип-2-1','assembly-kit',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','synthetic-cabinet-assembly','labor',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-71d4821c469b6537ea','control-relay',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-3b24c4dca0364ad018','relay-socket',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-1b0881023f8c05533d','signal-lamp',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-5675d23c9701f4e624','terminal',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-14e6b96cf9fd464885','filter',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-97b4356d77406552d1','cross-module',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-0852a31b18d4b0aa7a','cable-gland',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-2-0,8-1,5','smart:2:0.8-1.5','smart','Wenard PC BP-Smart-2-(0,8-1,5)',2,1.5,6.0,20.0,2,1,1.5,'400х400х200','тип 2.1',10.0,2000.0,46921410000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-b68aa1478fea400c44','incoming-switch',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-dbb4e864212026115a','motor-breaker',2,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-fa98a402c349b5774e','vfd',1,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-d840fc82e60c70ccd3','contactor',2,4);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-c98572bfb013eda17e','enclosure',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','synthetic-assembly-тип-2-1','assembly-kit',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','synthetic-cabinet-assembly','labor',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-71d4821c469b6537ea','control-relay',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-3b24c4dca0364ad018','relay-socket',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-1b0881023f8c05533d','signal-lamp',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-5675d23c9701f4e624','terminal',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-14e6b96cf9fd464885','filter',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-97b4356d77406552d1','cross-module',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-0852a31b18d4b0aa7a','cable-gland',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-2-1,6-2,2','smart:2:1.6-2.2','smart','Wenard PC BP-Smart-2-(1,6-2,2)',2,2.2,10.0,20.0,2,1,2.2,'400х400х200','тип 2.1',10.0,2000.0,47278300000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-b68aa1478fea400c44','incoming-switch',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-75ae17184d8014d88c','motor-breaker',2,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-727e873771e3d523bd','vfd',1,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-d840fc82e60c70ccd3','contactor',2,4);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-c98572bfb013eda17e','enclosure',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','synthetic-assembly-тип-2-1','assembly-kit',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','synthetic-cabinet-assembly','labor',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-71d4821c469b6537ea','control-relay',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-3b24c4dca0364ad018','relay-socket',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-1b0881023f8c05533d','signal-lamp',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-5675d23c9701f4e624','terminal',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-14e6b96cf9fd464885','filter',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-97b4356d77406552d1','cross-module',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-0852a31b18d4b0aa7a','cable-gland',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-2-2,4-4','smart:2:2.4-4','smart','Wenard PC BP-Smart-2-(2,4-4)',2,4.0,16.0,20.0,2,1,4.0,'400х400х200','тип 2.1',10.0,2000.0,50299680000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-b68aa1478fea400c44','incoming-switch',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-0f417128222c499e95','motor-breaker',2,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-ced68215eb3af52ace','vfd',1,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-d840fc82e60c70ccd3','contactor',2,4);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-c98572bfb013eda17e','enclosure',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-2,4-4','synthetic-assembly-тип-2-1','assembly-kit',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-2,4-4','synthetic-cabinet-assembly','labor',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-71d4821c469b6537ea','control-relay',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-3b24c4dca0364ad018','relay-socket',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-1b0881023f8c05533d','signal-lamp',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-5675d23c9701f4e624','terminal',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-14e6b96cf9fd464885','filter',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-97b4356d77406552d1','cross-module',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-0852a31b18d4b0aa7a','cable-gland',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-2-4,1-5,5','smart:2:4.1-5.5','smart','Wenard PC BP-Smart-2-(4,1-5,5)',2,5.5,20.0,25.0,2,1,5.5,'400х400х200','тип 2.2',10.0,2000.0,52806540000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-93fa42fdad0b87f77d','incoming-switch',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-1da00677d3aa1cde5f','motor-breaker',2,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-bb77d5867b70ab433c','vfd',1,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-f1cb6657143c199f6c','contactor',2,4);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-c98572bfb013eda17e','enclosure',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','synthetic-assembly-тип-2-2','assembly-kit',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','synthetic-cabinet-assembly','labor',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-71d4821c469b6537ea','control-relay',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-3b24c4dca0364ad018','relay-socket',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-1b0881023f8c05533d','signal-lamp',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-5675d23c9701f4e624','terminal',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-14e6b96cf9fd464885','filter',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-97b4356d77406552d1','cross-module',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-0852a31b18d4b0aa7a','cable-gland',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-2-5,6-7,5','smart:2:5.6-7.5','smart','Wenard PC BP-Smart-2-(5,6-7,5)',2,7.5,25.0,32.0,2,1,7.5,'400х400х200','тип 2.2',10.0,2000.0,56949090000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-90c3dca48af6f38bc0','incoming-switch',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-7d6e217d91f16f7e08','motor-breaker',2,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-4063449302b11a448e','vfd',1,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-ae5dadc57f50d7e381','contactor',2,4);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-c98572bfb013eda17e','enclosure',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','synthetic-assembly-тип-2-2','assembly-kit',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','synthetic-cabinet-assembly','labor',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-71d4821c469b6537ea','control-relay',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-3b24c4dca0364ad018','relay-socket',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-1b0881023f8c05533d','signal-lamp',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-5675d23c9701f4e624','terminal',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-14e6b96cf9fd464885','filter',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-97b4356d77406552d1','cross-module',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-0852a31b18d4b0aa7a','cable-gland',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-3-0,37-0,75','smart:3:0.37-0.75','smart','Wenard PC BP-Smart-3-(0,37-0,75)',3,0.75,6.0,20.0,0,3,0.75,'500х500х200','тип 3.1',10.0,2000.0,72354820000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-b68aa1478fea400c44','incoming-switch',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-dbb4e864212026115a','motor-breaker',3,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-4e630531052184cfb2','vfd',3,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-a3d8a0fb2558118c34','enclosure',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','synthetic-assembly-тип-3-1','assembly-kit',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','synthetic-cabinet-assembly','labor',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-71d4821c469b6537ea','control-relay',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-3b24c4dca0364ad018','relay-socket',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-1b0881023f8c05533d','signal-lamp',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-5675d23c9701f4e624','terminal',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-14e6b96cf9fd464885','filter',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-97b4356d77406552d1','cross-module',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-0852a31b18d4b0aa7a','cable-gland',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-3-0,8-1,5','smart:3:0.8-1.5','smart','Wenard PC BP-Smart-3-(0,8-1,5)',3,1.5,6.0,20.0,0,3,1.5,'500х500х200','тип 3.1',10.0,2000.0,73208680000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-b68aa1478fea400c44','incoming-switch',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-dbb4e864212026115a','motor-breaker',3,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-fa98a402c349b5774e','vfd',3,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-a3d8a0fb2558118c34','enclosure',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','synthetic-assembly-тип-3-1','assembly-kit',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','synthetic-cabinet-assembly','labor',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-71d4821c469b6537ea','control-relay',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-3b24c4dca0364ad018','relay-socket',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-1b0881023f8c05533d','signal-lamp',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-5675d23c9701f4e624','terminal',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-14e6b96cf9fd464885','filter',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-97b4356d77406552d1','cross-module',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-0852a31b18d4b0aa7a','cable-gland',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-3-1,6-2,2','smart:3:1.6-2.2','smart','Wenard PC BP-Smart-3-(1,6-2,2)',3,2.2,10.0,20.0,0,3,2.2,'500х500х200','тип 3.1',10.0,2000.0,74279350000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-b68aa1478fea400c44','incoming-switch',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-75ae17184d8014d88c','motor-breaker',3,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-727e873771e3d523bd','vfd',3,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-a3d8a0fb2558118c34','enclosure',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','synthetic-assembly-тип-3-1','assembly-kit',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','synthetic-cabinet-assembly','labor',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-71d4821c469b6537ea','control-relay',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-3b24c4dca0364ad018','relay-socket',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-1b0881023f8c05533d','signal-lamp',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-5675d23c9701f4e624','terminal',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-14e6b96cf9fd464885','filter',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-97b4356d77406552d1','cross-module',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-0852a31b18d4b0aa7a','cable-gland',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-3-2,4-4','smart:3:2.4-4','smart','Wenard PC BP-Smart-3-(2,4-4)',3,4.0,16.0,20.0,0,3,4.0,'500х500х200','тип 3.1',10.0,2000.0,83343490000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-b68aa1478fea400c44','incoming-switch',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-0f417128222c499e95','motor-breaker',3,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-ced68215eb3af52ace','vfd',3,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-a3d8a0fb2558118c34','enclosure',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-2,4-4','synthetic-assembly-тип-3-1','assembly-kit',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-2,4-4','synthetic-cabinet-assembly','labor',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-71d4821c469b6537ea','control-relay',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-3b24c4dca0364ad018','relay-socket',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-1b0881023f8c05533d','signal-lamp',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-5675d23c9701f4e624','terminal',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-14e6b96cf9fd464885','filter',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-97b4356d77406552d1','cross-module',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-0852a31b18d4b0aa7a','cable-gland',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-3-4,1-5,5','smart:3:4.1-5.5','smart','Wenard PC BP-Smart-3-(4,1-5,5)',3,5.5,20.0,25.0,0,3,5.5,'500х500х200','тип 3.2',10.0,2000.0,87840110000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-93fa42fdad0b87f77d','incoming-switch',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-1da00677d3aa1cde5f','motor-breaker',3,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-bb77d5867b70ab433c','vfd',3,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-a3d8a0fb2558118c34','enclosure',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','synthetic-assembly-тип-3-2','assembly-kit',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','synthetic-cabinet-assembly','labor',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-71d4821c469b6537ea','control-relay',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-3b24c4dca0364ad018','relay-socket',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-1b0881023f8c05533d','signal-lamp',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-5675d23c9701f4e624','terminal',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-14e6b96cf9fd464885','filter',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-97b4356d77406552d1','cross-module',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-0852a31b18d4b0aa7a','cable-gland',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-3-5,6-7,5','smart:3:5.6-7.5','smart','Wenard PC BP-Smart-3-(5,6-7,5)',3,7.5,25.0,32.0,0,3,7.5,'500х500х200','тип 3.2',10.0,2000.0,98157540000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-90c3dca48af6f38bc0','incoming-switch',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-7d6e217d91f16f7e08','motor-breaker',3,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-4063449302b11a448e','vfd',3,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-a3d8a0fb2558118c34','enclosure',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','synthetic-assembly-тип-3-2','assembly-kit',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','synthetic-cabinet-assembly','labor',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-71d4821c469b6537ea','control-relay',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-3b24c4dca0364ad018','relay-socket',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-1b0881023f8c05533d','signal-lamp',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-5675d23c9701f4e624','terminal',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-14e6b96cf9fd464885','filter',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-97b4356d77406552d1','cross-module',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-0852a31b18d4b0aa7a','cable-gland',6,14);
--> statement-breakpoint
