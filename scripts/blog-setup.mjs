import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { db } from '../server/blog-db.js'
import { hashPassword } from '../server/blog-auth.js'

const sql=db()
const schema=await readFile(new URL('./blog-schema.sql',import.meta.url),'utf8')
for(const statement of schema.split(';').map(x=>x.trim()).filter(Boolean))await sql.query(statement)
console.log('Blog schema ready.')
if(process.argv.includes('--admin') || process.argv.includes('--reset-admin')) {
  const email=process.env.BLOG_ADMIN_EMAIL||'rodrigo@grupoyrhospitalar.com.br'
  const [existing]=await sql`SELECT id FROM blog_admins WHERE email=${email}`
  if(existing&&!process.argv.includes('--reset-admin'))console.log('Administrator already exists; password preserved.')
  else {
    if(!process.env.BLOG_CREDENTIAL_FILE)throw Error('Set BLOG_CREDENTIAL_FILE outside the repository.')
    const output=resolve(process.env.BLOG_CREDENTIAL_FILE)
    if(output.startsWith(resolve('.')+'\\')||output.startsWith(resolve('.')+'/'))throw Error('Credential file must be outside repository.')
    const password=randomBytes(24).toString('base64url')+'!Yr',hash=await hashPassword(password),id=existing?.id||randomUUID()
    await sql.transaction([sql`INSERT INTO blog_admins(id,email,password_hash,must_change_password) VALUES(${id},${email},${hash},TRUE) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,must_change_password=TRUE`,sql`DELETE FROM blog_sessions WHERE admin_id=${id}`])
    await mkdir(dirname(output),{recursive:true})
    await writeFile(output,`ACESSO ADMINISTRATIVO — BLOG YR\n\nPainel: https://grupoyrhospitalar.com.br/admin\nE-mail: ${email}\nSenha temporária: ${password}\n\nO primeiro acesso exige uma senha nova de pelo menos 14 caracteres.\nNão há cadastro público. Todas as sessões são encerradas ao trocar a senha.\nGuarde a nova senha no seu gerenciador de senhas.\n`,{mode:0o600})
    console.log('Temporary administrator credentials saved to the private handoff file.')
  }
}
