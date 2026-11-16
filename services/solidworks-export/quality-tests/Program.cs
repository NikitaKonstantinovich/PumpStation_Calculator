int checks=0;
void Check(bool ok){if(!ok)throw new Exception("Import quality assertion failed");checks++;}
void Reject(string? origin,int? result,int faults,int solids,int surfaces){
    try{ImportQuality.Warning(origin,result,faults,solids,surfaces);throw new Exception("Invalid geometry was accepted");}
    catch(InvalidDataException){checks++;}
}
Check(ImportQuality.Warning("library",0,0,1,0)==null);
Check(ImportQuality.Warning("generated",0,0,1,0)==null);
Check(ImportQuality.Warning("library",0,1,1,1)?.Contains("поверхностных тел 1")==true);
Check(ImportQuality.Warning("library",0,6,1,0)?.Contains("замечаний геометрии 6")==true);
Reject("generated",0,1,1,0);
Reject("generated",0,0,1,1);
Reject("library",0,0,0,1);
Reject("library",-1,0,1,0);
Reject(null,0,1,1,0);
Console.WriteLine($"PASS {checks} import quality checks");
