import assert from 'node:assert/strict';
import test from 'node:test';
import {loadTs} from './load-ts.mjs';

const {createProject,parseProjectConfig}=await loadTs(new URL('../app/project-config.ts',import.meta.url));
test('opening an approved station preserves its quoted collector and library version',()=>{
  const config=createProject('Согласованный расчёт');
  const rows=config.entities['station-spec'].items;
  const collector=rows.find(row=>/collector/i.test(row.option??''));
  assert.ok(collector,'exercise a collector row that normal synchronization can reprice');
  collector.price=22345.67;
  collector.description='Принятый состав по прежней цене';
  config.project.modelLibraryVersion='a'.repeat(64);
  const wire=JSON.parse(JSON.stringify(config));
  const loaded=parseProjectConfig(wire,true);
  assert.deepEqual(loaded.entities['station-spec'].items,wire.entities['station-spec'].items);
  assert.equal(loaded.project.modelLibraryVersion,config.project.modelLibraryVersion);
  assert.equal(wire.entities['station-spec'].items.find(row=>row.option===collector.option).price,22345.67);
});
