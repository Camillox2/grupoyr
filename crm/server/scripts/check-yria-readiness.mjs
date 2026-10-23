import 'dotenv/config'
import {Pool} from 'pg'
import {automationReadiness} from '../src/automaticContracts.js'
import {getYriaConfiguration} from '../src/yriaCore.js'
const pool=new Pool({connectionString:process.env.DATABASE_URL})
const client=await pool.connect()
try{
 await client.query('BEGIN READ ONLY')
 const settings=(await client.query('SELECT data FROM crm_settings WHERE id=1')).rows[0]?.data||{}
 const config=getYriaConfiguration(settings).published.config
 console.log(JSON.stringify({database:'neon',readiness:automationReadiness(settings),assistedSales:config.assistedSalesEnabled===true,automaticContracts:config.automaticContractsEnabled===true,freightRows:(settings.freightRates||[]).length,freightApiConfigured:Boolean(settings.freightProvider?.token||process.env.MELHOR_ENVIO_TOKEN),promptCharacters:config.customPrompt.length}))
 await client.query('ROLLBACK')
}finally{client.release();await pool.end()}
