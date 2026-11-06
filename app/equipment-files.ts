import { CAD_EXTENSIONS } from "./equipment-admin";
import { checkPumpFile, checkedPumpFileStream, PumpFileError, type PumpFileKind } from "./pump-files";

export function checkEquipmentFile(kind: PumpFileKind, name: string, size: number) {
  if (kind === "image") throw new PumpFileError("Выберите чертёж или CAD-модель.");
  const extension=name.split(".").at(-1)?.toLowerCase() ?? "";
  if (kind === "model" && !CAD_EXTENSIONS.includes(extension)) throw new PumpFileError("Нужна исходная CAD-модель: SLDPRT, SLDASM, STEP, IGES, Parasolid или ZIP сборки с деталями.");
  if (extension === "zip") {
    checkPumpFile("model",name.replace(/\.zip$/i,".sldasm"),size);
    return {extension,contentType:"application/zip"};
  }
  return checkPumpFile(kind,name,size);
}

/** Keep only the ZIP central directory tail; packages are downloaded intact, never extracted. */
export function checkedEquipmentStream(body: ReadableStream<Uint8Array>, size: number, extension: string) {
  const stream=checkedPumpFileStream(body,size,extension);
  if (extension !== "zip") return stream;
  let tail=new Uint8Array(0),prefix=new Uint8Array(0);
  return stream.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
    transform(chunk,controller) {
      if(prefix.length<4){const nextPrefix=new Uint8Array(Math.min(4,prefix.length+chunk.length));nextPrefix.set(prefix);nextPrefix.set(chunk.subarray(0,nextPrefix.length-prefix.length),prefix.length);prefix=nextPrefix;}
      const limit=4*1024*1024, next=new Uint8Array(Math.min(limit,tail.length+chunk.length));
      const previous=Math.max(0,next.length-chunk.length);
      next.set(tail.subarray(tail.length-previous)); next.set(chunk.subarray(Math.max(0,chunk.length-next.length)),previous); tail=next;
      controller.enqueue(chunk);
    },
    flush() {
      if(prefix.length!==4 || new DataView(prefix.buffer).getUint32(0,true)!==0x04034b50)throw new PumpFileError("Файл не содержит ZIP-пакет сборки.");
      const view=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);
      let end=-1;
      for(let i=tail.length-22;i>=Math.max(0,tail.length-65557);i--) if(view.getUint32(i,true)===0x06054b50 && i+22+view.getUint16(i+20,true)===tail.length){end=i;break;}
      if(end<0 || view.getUint16(end+4,true)!==0 || view.getUint16(end+6,true)!==0) throw new PumpFileError("Нужен обычный ZIP-пакет сборки (без ZIP64 и разделения на тома).");
      const count=view.getUint16(end+10,true),length=view.getUint32(end+12,true),offset=view.getUint32(end+16,true),start=offset-(size-tail.length);
      if(count===65535 || count!==view.getUint16(end+8,true) || start<0 || start+length!==end)throw new PumpFileError("Слишком большой или повреждённый каталог ZIP.");
      let position=start,assembly=false,part=false;
      for(let i=0;i<count;i++){
        if(position+46>end || view.getUint32(position,true)!==0x02014b50)throw new PumpFileError("Повреждённый ZIP-пакет.");
        const nameLength=view.getUint16(position+28,true),extra=view.getUint16(position+30,true),comment=view.getUint16(position+32,true);
        if(view.getUint32(position+42,true)>=offset)throw new PumpFileError("Недопустимая ссылка на данные ZIP.");
        if(position+46+nameLength+extra+comment>end || (view.getUint16(position+8,true)&1))throw new PumpFileError("Повреждённый или зашифрованный ZIP-пакет.");
        const name=new TextDecoder().decode(tail.subarray(position+46,position+46+nameLength)).replaceAll("\\","/");
        if(name.startsWith("/") || name.includes(":") || name.split("/").includes(".."))throw new PumpFileError("Пакет содержит недопустимый путь.");
        assembly ||= /\.sldasm$/i.test(name); part ||= /\.(sldprt|step|stp|igs|iges|x_t|x_b)$/i.test(name);
        position+=46+nameLength+extra+comment;
      }
      if(position!==end || !assembly || !part) throw new PumpFileError("В ZIP должны быть сборка SLDASM и её детали. Сохраните пакет через Pack and Go.");
    },
  }));
}
