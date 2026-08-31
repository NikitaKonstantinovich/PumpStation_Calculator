DELETE FROM control_cabinet_items WHERE cabinet_id IN (SELECT id FROM control_cabinets WHERE station_type='smart');
--> statement-breakpoint
DELETE FROM control_cabinets WHERE station_type='smart';
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-2-0,37-0,75','smart:2:0.37-0.75','smart','Wenard PC BP-Smart-2-(0,37-0,75)',2,0.75,6,20,2,1,0.7,'400х400х200','тип 2.1',10,2000,46636790000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-b68aa1478fea400c44','incoming-switch','dynamic',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-dbb4e864212026115a','motor-breaker','dynamic',2,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-4e630531052184cfb2','vfd','dynamic',1,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-d840fc82e60c70ccd3','contactor','dynamic',2,4);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-c98572bfb013eda17e','enclosure','dynamic',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','synthetic-assembly-тип-2-1','assembly-kit','dynamic',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','synthetic-cabinet-assembly','labor','dynamic',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-71d4821c469b6537ea','control-relay','static',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-3b24c4dca0364ad018','relay-socket','static',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-1b0881023f8c05533d','signal-lamp','static',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-5675d23c9701f4e624','terminal','static',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-14e6b96cf9fd464885','filter','static',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-97b4356d77406552d1','cross-module','static',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,37-0,75','cc-0852a31b18d4b0aa7a','cable-gland','static',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-2-0,8-1,5','smart:2:0.8-1.5','smart','Wenard PC BP-Smart-2-(0,8-1,5)',2,1.5,6,20,2,1,1.5,'400х400х200','тип 2.1',10,2000,46921410000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-b68aa1478fea400c44','incoming-switch','dynamic',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-dbb4e864212026115a','motor-breaker','dynamic',2,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-fa98a402c349b5774e','vfd','dynamic',1,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-d840fc82e60c70ccd3','contactor','dynamic',2,4);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-c98572bfb013eda17e','enclosure','dynamic',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','synthetic-assembly-тип-2-1','assembly-kit','dynamic',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','synthetic-cabinet-assembly','labor','dynamic',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-71d4821c469b6537ea','control-relay','static',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-3b24c4dca0364ad018','relay-socket','static',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-1b0881023f8c05533d','signal-lamp','static',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-5675d23c9701f4e624','terminal','static',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-14e6b96cf9fd464885','filter','static',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-97b4356d77406552d1','cross-module','static',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-0,8-1,5','cc-0852a31b18d4b0aa7a','cable-gland','static',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-2-1,6-2,2','smart:2:1.6-2.2','smart','Wenard PC BP-Smart-2-(1,6-2,2)',2,2.2,10,20,2,1,2.2,'400х400х200','тип 2.1',10,2000,47278300000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-b68aa1478fea400c44','incoming-switch','dynamic',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-75ae17184d8014d88c','motor-breaker','dynamic',2,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-727e873771e3d523bd','vfd','dynamic',1,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-d840fc82e60c70ccd3','contactor','dynamic',2,4);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-c98572bfb013eda17e','enclosure','dynamic',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','synthetic-assembly-тип-2-1','assembly-kit','dynamic',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','synthetic-cabinet-assembly','labor','dynamic',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-71d4821c469b6537ea','control-relay','static',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-3b24c4dca0364ad018','relay-socket','static',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-1b0881023f8c05533d','signal-lamp','static',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-5675d23c9701f4e624','terminal','static',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-14e6b96cf9fd464885','filter','static',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-97b4356d77406552d1','cross-module','static',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-1,6-2,2','cc-0852a31b18d4b0aa7a','cable-gland','static',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-2-2,4-4','smart:2:2.4-4','smart','Wenard PC BP-Smart-2-(2,4-4)',2,4,16,20,2,1,4,'400х400х200','тип 2.1',10,2000,50299680000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-b68aa1478fea400c44','incoming-switch','dynamic',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-0f417128222c499e95','motor-breaker','dynamic',2,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-ced68215eb3af52ace','vfd','dynamic',1,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-d840fc82e60c70ccd3','contactor','dynamic',2,4);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-c98572bfb013eda17e','enclosure','dynamic',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-2,4-4','synthetic-assembly-тип-2-1','assembly-kit','dynamic',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-2,4-4','synthetic-cabinet-assembly','labor','dynamic',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-71d4821c469b6537ea','control-relay','static',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-3b24c4dca0364ad018','relay-socket','static',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-1b0881023f8c05533d','signal-lamp','static',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-5675d23c9701f4e624','terminal','static',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-14e6b96cf9fd464885','filter','static',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-97b4356d77406552d1','cross-module','static',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-2,4-4','cc-0852a31b18d4b0aa7a','cable-gland','static',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-2-4,1-5,5','smart:2:4.1-5.5','smart','Wenard PC BP-Smart-2-(4,1-5,5)',2,5.5,20,25,2,1,5.5,'400х400х200','тип 2.2',10,2000,52806540000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-93fa42fdad0b87f77d','incoming-switch','dynamic',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-1da00677d3aa1cde5f','motor-breaker','dynamic',2,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-bb77d5867b70ab433c','vfd','dynamic',1,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-f1cb6657143c199f6c','contactor','dynamic',2,4);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-c98572bfb013eda17e','enclosure','dynamic',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','synthetic-assembly-тип-2-2','assembly-kit','dynamic',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','synthetic-cabinet-assembly','labor','dynamic',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-71d4821c469b6537ea','control-relay','static',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-3b24c4dca0364ad018','relay-socket','static',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-1b0881023f8c05533d','signal-lamp','static',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-5675d23c9701f4e624','terminal','static',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-14e6b96cf9fd464885','filter','static',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-97b4356d77406552d1','cross-module','static',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-4,1-5,5','cc-0852a31b18d4b0aa7a','cable-gland','static',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-2-5,6-7,5','smart:2:5.6-7.5','smart','Wenard PC BP-Smart-2-(5,6-7,5)',2,7.5,25,32,2,1,7.5,'400х400х200','тип 2.2',10,2000,56949090000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-90c3dca48af6f38bc0','incoming-switch','dynamic',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-7d6e217d91f16f7e08','motor-breaker','dynamic',2,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-4063449302b11a448e','vfd','dynamic',1,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-ae5dadc57f50d7e381','contactor','dynamic',2,4);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-c98572bfb013eda17e','enclosure','dynamic',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','synthetic-assembly-тип-2-2','assembly-kit','dynamic',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','synthetic-cabinet-assembly','labor','dynamic',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-71d4821c469b6537ea','control-relay','static',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-3b24c4dca0364ad018','relay-socket','static',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-1b0881023f8c05533d','signal-lamp','static',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-5675d23c9701f4e624','terminal','static',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-14e6b96cf9fd464885','filter','static',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-97b4356d77406552d1','cross-module','static',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-2-5,6-7,5','cc-0852a31b18d4b0aa7a','cable-gland','static',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-3-0,37-0,75','smart:3:0.37-0.75','smart','Wenard PC BP-Smart-3-(0,37-0,75)',3,0.75,6,20,0,3,0.75,'500х500х200','тип 3.1',10,2000,72354820000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-b68aa1478fea400c44','incoming-switch','dynamic',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-dbb4e864212026115a','motor-breaker','dynamic',3,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-4e630531052184cfb2','vfd','dynamic',3,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-a3d8a0fb2558118c34','enclosure','dynamic',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','synthetic-assembly-тип-3-1','assembly-kit','dynamic',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','synthetic-cabinet-assembly','labor','dynamic',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-71d4821c469b6537ea','control-relay','static',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-3b24c4dca0364ad018','relay-socket','static',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-1b0881023f8c05533d','signal-lamp','static',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-5675d23c9701f4e624','terminal','static',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-14e6b96cf9fd464885','filter','static',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-97b4356d77406552d1','cross-module','static',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,37-0,75','cc-0852a31b18d4b0aa7a','cable-gland','static',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-3-0,8-1,5','smart:3:0.8-1.5','smart','Wenard PC BP-Smart-3-(0,8-1,5)',3,1.5,6,20,0,3,1.5,'500х500х200','тип 3.1',10,2000,73208680000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-b68aa1478fea400c44','incoming-switch','dynamic',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-dbb4e864212026115a','motor-breaker','dynamic',3,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-fa98a402c349b5774e','vfd','dynamic',3,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-a3d8a0fb2558118c34','enclosure','dynamic',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','synthetic-assembly-тип-3-1','assembly-kit','dynamic',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','synthetic-cabinet-assembly','labor','dynamic',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-71d4821c469b6537ea','control-relay','static',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-3b24c4dca0364ad018','relay-socket','static',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-1b0881023f8c05533d','signal-lamp','static',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-5675d23c9701f4e624','terminal','static',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-14e6b96cf9fd464885','filter','static',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-97b4356d77406552d1','cross-module','static',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-0,8-1,5','cc-0852a31b18d4b0aa7a','cable-gland','static',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-3-1,6-2,2','smart:3:1.6-2.2','smart','Wenard PC BP-Smart-3-(1,6-2,2)',3,2.2,10,20,0,3,2.2,'500х500х200','тип 3.1',10,2000,74279350000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-b68aa1478fea400c44','incoming-switch','dynamic',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-75ae17184d8014d88c','motor-breaker','dynamic',3,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-727e873771e3d523bd','vfd','dynamic',3,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-a3d8a0fb2558118c34','enclosure','dynamic',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','synthetic-assembly-тип-3-1','assembly-kit','dynamic',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','synthetic-cabinet-assembly','labor','dynamic',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-71d4821c469b6537ea','control-relay','static',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-3b24c4dca0364ad018','relay-socket','static',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-1b0881023f8c05533d','signal-lamp','static',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-5675d23c9701f4e624','terminal','static',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-14e6b96cf9fd464885','filter','static',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-97b4356d77406552d1','cross-module','static',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-1,6-2,2','cc-0852a31b18d4b0aa7a','cable-gland','static',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-3-2,4-4','smart:3:2.4-4','smart','Wenard PC BP-Smart-3-(2,4-4)',3,4,16,20,0,3,4,'500х500х200','тип 3.1',10,2000,83343490000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-b68aa1478fea400c44','incoming-switch','dynamic',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-0f417128222c499e95','motor-breaker','dynamic',3,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-ced68215eb3af52ace','vfd','dynamic',3,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-a3d8a0fb2558118c34','enclosure','dynamic',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-2,4-4','synthetic-assembly-тип-3-1','assembly-kit','dynamic',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-2,4-4','synthetic-cabinet-assembly','labor','dynamic',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-71d4821c469b6537ea','control-relay','static',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-3b24c4dca0364ad018','relay-socket','static',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-1b0881023f8c05533d','signal-lamp','static',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-5675d23c9701f4e624','terminal','static',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-14e6b96cf9fd464885','filter','static',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-97b4356d77406552d1','cross-module','static',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-2,4-4','cc-0852a31b18d4b0aa7a','cable-gland','static',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-3-4,1-5,5','smart:3:4.1-5.5','smart','Wenard PC BP-Smart-3-(4,1-5,5)',3,5.5,20,25,0,3,5.5,'500х500х200','тип 3.2',10,2000,87840110000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-93fa42fdad0b87f77d','incoming-switch','dynamic',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-1da00677d3aa1cde5f','motor-breaker','dynamic',3,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-bb77d5867b70ab433c','vfd','dynamic',3,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-a3d8a0fb2558118c34','enclosure','dynamic',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','synthetic-assembly-тип-3-2','assembly-kit','dynamic',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','synthetic-cabinet-assembly','labor','dynamic',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-71d4821c469b6537ea','control-relay','static',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-3b24c4dca0364ad018','relay-socket','static',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-1b0881023f8c05533d','signal-lamp','static',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-5675d23c9701f4e624','terminal','static',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-14e6b96cf9fd464885','filter','static',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-97b4356d77406552d1','cross-module','static',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-4,1-5,5','cc-0852a31b18d4b0aa7a','cable-gland','static',6,14);
--> statement-breakpoint
INSERT INTO control_cabinets (id,configuration_key,station_type,name,pump_count,pump_power_kw,breaker_current_a,incoming_switch_current_a,contactor_count,vfd_count,vfd_power_kw,enclosure_dimensions,assembly_kit_type,labor_hours,labor_rate,cached_total_microunits,source) VALUES ('SMART-3-5,6-7,5','smart:3:5.6-7.5','smart','Wenard PC BP-Smart-3-(5,6-7,5)',3,7.5,25,32,0,3,7.5,'500х500х200','тип 3.2',10,2000,98157540000,'Расчет стоимости шкафов.xlsm · Smart_НС · Таблица градации.xlsx');
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-90c3dca48af6f38bc0','incoming-switch','dynamic',1,1);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-7d6e217d91f16f7e08','motor-breaker','dynamic',3,2);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-4063449302b11a448e','vfd','dynamic',3,3);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-a3d8a0fb2558118c34','enclosure','dynamic',1,5);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','synthetic-assembly-тип-3-2','assembly-kit','dynamic',1,6);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','synthetic-cabinet-assembly','labor','dynamic',1,7);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-71d4821c469b6537ea','control-relay','static',1,8);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-3b24c4dca0364ad018','relay-socket','static',1,9);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-1b0881023f8c05533d','signal-lamp','static',1,10);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-5675d23c9701f4e624','terminal','static',6,11);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-14e6b96cf9fd464885','filter','static',2,12);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-97b4356d77406552d1','cross-module','static',1,13);
--> statement-breakpoint
INSERT INTO control_cabinet_items (cabinet_id,component_id,role,component_group,quantity,sort_order) VALUES ('SMART-3-5,6-7,5','cc-0852a31b18d4b0aa7a','cable-gland','static',6,14);
--> statement-breakpoint
