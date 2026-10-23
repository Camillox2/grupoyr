// Atomic record batch for stock + contract + invoices + outbox. No schema migration.
const key=r=>r.collection+':'+r.data.id
import { isDeepStrictEqual } from 'node:util'
const same=(a,b)=>isDeepStrictEqual(a??null,b??null)
export async function commitCommercialRecords(database,changes,{files=[]}={}){
  await database.ready
  changes=[...changes].sort((a,b)=>key(a).localeCompare(key(b)))
  if(!database.data)throw Error('Banco não suporta instalação atômica.')
  database.commercialLocks??=new Set()
  if(changes.some(r=>database.commercialLocks.has(key(r))))throw Error('Dados comerciais ocupados. Tente novamente.')
  for(const r of changes)database.commercialLocks.add(key(r))
  let client
  try{
    await database.flush?.()
    for(const r of changes)if(!same(database.find(r.collection,v=>v.id===r.data.id),r.expected))throw Error('Dados alterados. Refaça a conferência.')
    if(database.pool){
      client=await database.pool.connect()
      await client.query('BEGIN')
      await client.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='3s'")
      await client.query("SELECT pg_advisory_xact_lock(hashtext('yr-contract-automation'))")
      for(const r of changes){
        const actual=await client.query('SELECT data FROM crm_records WHERE collection=$1 AND id=$2 FOR UPDATE',[r.collection,r.data.id])
        if(!same(actual.rows[0]?.data,r.expected))throw Error('Banco atualizado por outro processo. Refaça a cotação.')
      }
      for(const file of files){
        if(!Buffer.isBuffer(file.data)||!file.data.length)throw Error('Arquivo inválido.')
        await client.query('INSERT INTO crm_binary_files(id,owner_id,kind,mime_type,file_name,file_size,data) VALUES($1,$2,$3,$4,$5,$6,$7)',[file.id,file.ownerId,file.kind,file.mimeType,file.fileName,file.data.length,file.data])
      }
      for(const r of changes)await client.query('INSERT INTO crm_records(collection,id,data,updated_at) VALUES($1,$2,$3::jsonb,now()) ON CONFLICT(collection,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()',[r.collection,r.data.id,JSON.stringify(r.data)])
      await client.query('COMMIT')
    }else if(database.data&&database.save){
      const next=structuredClone(database.data)
      for(const r of changes){next[r.collection]??=[];const i=next[r.collection].findIndex(v=>v.id===r.data.id);if(i>=0)next[r.collection][i]=r.data;else next[r.collection].unshift(r.data)}
      const old=database.data
      if(database.save(next)===false){database.data=old;throw Error('Não foi possível persistir os dados.')}
    }
    // Install only after successful durable commit, never report a failed write as success.
    if(database.data){
      for(const r of changes){database.data[r.collection]??=[];const list=database.data[r.collection],i=list.findIndex(v=>v.id===r.data.id);if(i>=0)list[i]=r.data;else list.unshift(r.data)}
    }else throw Error('Banco não suporta instalação atômica.')
    return changes.map(r=>r.data)
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client?.release();for(const r of changes)database.commercialLocks.delete(key(r))}
}
