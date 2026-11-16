import type {CollectorCatalog} from "./collector-calculations";
export type ComponentField={column:string;headerPath:string[];value:unknown};
export type ComponentPrice={label:string;amount:number;currency:string};
export type ComponentItem={id:string;catalogId:string;family:string;fields:ComponentField[];prices:ComponentPrice[]};
export type ComponentGroupId="hydraulic"|"control"|"metal"|"services";
export type ComponentCatalog={id:string;name:string;groupId:ComponentGroupId};
export type ComponentsDatabase={catalogs:ComponentCatalog[];items:ComponentItem[];collectorCatalog:CollectorCatalog;statistics:{componentRows:number;pricedComponentRows:number}};

export const componentFieldLabel=(field:ComponentField)=>field.headerPath.filter(Boolean).at(-1)?.trim()??"";
