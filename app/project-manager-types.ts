import type {ProjectCard, ProjectFile} from "./project-types";
export type ProjectOwner = {id:string;name:string;email:string};
export type ProjectAlgorithm = {id:string;name:string;connected:boolean};
export type ManagedProject = ProjectCard & {ownerId:string;algorithmId:string;owner:ProjectOwner;algorithm:ProjectAlgorithm};
export type ManagedProjectPage = {projects:ManagedProject[];users:ProjectOwner[];algorithms:ProjectAlgorithm[];total:number;next:number|null};
export type ProjectCopyRequest = {id:string;revision:number;operation:string};
export async function copyProjectRequest(body:ProjectCopyRequest):Promise<ProjectFile> {
  const response=await fetch("/api/admin/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await response.json() as ProjectFile & {error?:string};
  if(!response.ok)throw Error(data.error??"Не удалось создать копию проекта.");
  return data;
}
