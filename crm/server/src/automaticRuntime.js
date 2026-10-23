import fs from 'node:fs'
import {db} from './db.js'
import {createAutomaticContractService} from './automaticContracts.js'
let notify=()=>{}
export const automaticContracts=createAutomaticContractService({
 database:db,getPublicUrl:()=>{try{return String(process.env.PUBLIC_CRM_URL||fs.readFileSync(new URL('../../.runtime/public_url.txt',import.meta.url),'utf8')).trim()}catch{return ''}},
 emit:(...args)=>notify(...args)
})
export const configureAutomaticContracts=emit=>{notify=emit}

