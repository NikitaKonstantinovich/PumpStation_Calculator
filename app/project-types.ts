import type {ProjectConfig} from "./project-config";
export type ProjectCard = {id:string;name:string;revision:number;createdAt:string;updatedAt:string};
export type ProjectFile = ProjectCard & {config:ProjectConfig};
