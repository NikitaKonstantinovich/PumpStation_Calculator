import "../../app/engineering/native-server.ts";
import {withEvaluationProgram} from "../../app/engineering/runtime.ts";
import {connectStore} from './store.mjs';
import {generateInsertCalculations} from '../../app/component-insert-calculations.ts';
import {setTimeout as delay} from 'node:timers/promises';
const pool=await connectStore();
const lock=await pool.connect();
let running=true;
process.on('SIGINT',()=>{running=false;});
process.on('SIGTERM',()=>{running=false;});
process.on('disconnect',()=>{running=false;});
try {
  if(!(await lock.query('SELECT pg_try_advisory_lock(70124320) AS acquired')).rows[0].acquired)throw new Error('Обработчик уже запущен');
  await lock.query("UPDATE calculation_jobs SET state=CASE WHEN attempts>=3 THEN 'error' ELSE 'queued' END,error='Выполнение было прервано' WHERE state='running'");
  while(running){
    const {rows:[job]}=await lock.query("UPDATE calculation_jobs SET state='running',attempts=attempts+1 WHERE id=(SELECT id FROM calculation_jobs WHERE state='queued' ORDER BY created_at LIMIT 1) RETURNING id,payload");
    if(!job){await delay(500);continue;}
    // The STEP service and batch calculations share one CPU-intensive slot.
    await lock.query('SELECT pg_advisory_lock(70124321)');
    try{
      const {input,catalog,engineering}=job.payload;
      const dns=catalog.nominalDns.filter(n=>n>=input.dnFrom && n<=input.dnTo).sort((a,b)=>a-b);
      const rows=[];
      for (const [i,dn] of dns.entries()) {
        const calculate=()=>generateInsertCalculations({...input,dnFrom:dn,dnTo:dn},catalog);
        rows.push(...(engineering?withEvaluationProgram(engineering,calculate):calculate()));
        await lock.query('UPDATE calculation_jobs SET progress=$2 WHERE id=$1',[job.id,Math.floor((i+1)*100/dns.length)]);
      }
      await lock.query("UPDATE calculation_jobs SET state='done',result=$2,payload=NULL,error=NULL,progress=100 WHERE id=$1",[job.id,JSON.stringify(rows)]);
    }catch(error){
      await lock.query("UPDATE calculation_jobs SET state='error',error=$2 WHERE id=$1",[job.id,String(error.message).slice(0,2000)]);
    } finally {await lock.query('SELECT pg_advisory_unlock(70124321)');}
  }
}finally{lock.release(true);await pool.end();}
