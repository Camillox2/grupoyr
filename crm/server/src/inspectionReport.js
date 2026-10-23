import PDFDocument from 'pdfkit'
import sharp from 'sharp'
import fs from 'node:fs'
import { readInspectionPhoto } from './inspections.js'

const date = value => value ? new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}) : 'Não registrado'
const reviewLabels = {confirmed:'Diferença visual confirmada',dismissed:'Apontamento não confirmado',inconclusive:'Avaliação presencial necessária'}
export async function inspectionReport(database,row) {
  const candidate=row.baselineId?database.find('inspections',r=>r.id===row.baselineId):null
  const baseline=candidate && candidate.leadId===row.leadId && candidate.equipmentId===row.equipmentId &&
    (candidate.contractId || '')===(row.contractId || '') ? candidate : null
  const phases=baseline?[baseline,row]:[row]
  const contract=database.find('contracts',c=>c.id===row.contractId && c.leadId===row.leadId)
  const doc=new PDFDocument({size:'A4',margin:44,bufferPages:true,info:{
    Title:'Relatório de vistoria - Grupo YR Hospitalar',Author:'Grupo YR Hospitalar',
  }})
  const chunks=[],result=new Promise((resolve,reject)=>{
    doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)
  })
  const logo=new URL('../../client/public/yr-hospitalar-logo.jpg',import.meta.url)
  const header=()=>{
    doc.save().rect(0,0,doc.page.width,82).fill('#102a4c').restore()
    if(fs.existsSync(logo))doc.image(fs.readFileSync(logo),44,18,{fit:[44,44]})
    doc.font('Times-Roman').fontSize(21).fillColor('#fffdf9').text('Grupo YR Hospitalar',100,23)
    doc.font('Helvetica').fontSize(9).text('VISTORIA DIGITAL DO EQUIPAMENTO',100,51)
    doc.fillColor('#102a4c');doc.x=44;doc.y=105
  }
  doc.on('pageAdded',header);header()
  const paragraph=(label,value)=>{
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#102a4c').text(label)
    doc.font('Helvetica').fontSize(10).fillColor('#56667c').text(String(value || 'Não informado'),{lineGap:3})
    doc.moveDown(.75)
  }
  doc.font('Times-Roman').fontSize(25).text(baseline?'Entrega e retirada':'Relatório da vistoria')
  doc.font('Helvetica').fontSize(10).fillColor('#1d5fae').text(row.status==='completed'?'Registro concluído':'Registro preliminar - vistoria em andamento')
  doc.moveDown(1.3)
  paragraph('Cliente',row.clientName)
  paragraph('Equipamento e patrimônio',row.equipmentName+' - '+row.serialNumber)
  paragraph('Contrato',contract?.number || 'Vistoria sem contrato vinculado')
  for(const phase of phases) {
    paragraph(phase.phase==='delivery'?'Entrega':'Retirada',
      'Criada em '+date(phase.createdAt)+' | Concluída em '+date(phase.completedAt))
    paragraph('Conferência',phase.completion?.accepted?
      'Conferida por '+phase.completion.name+' em '+date(phase.completedAt):
      'A conferência ainda não foi concluída.')
    if(phase.notes)paragraph('Observações sobre o equipamento',phase.notes)
  }
  if(row.analysis?.status==='completed') {
    paragraph('Comparação visual por IA',row.analysis.summary)
    if(row.analysis.limitations)paragraph('Limitações da comparação',row.analysis.limitations)
    paragraph('Revisão humana',row.analysis.humanReview?
      (reviewLabels[row.analysis.humanReview.decision] || 'Revisão registrada')+'. '+row.analysis.humanReview.notes:
      'Ainda não revisada pela equipe.')
  }
  paragraph('Importante','Este relatório reúne fotos e conferência do equipamento. Não é laudo técnico, assinatura do contrato, prova automática de culpa ou autorização de cobrança. Uma comparação visual não comprova funcionamento ou ausência de danos.')
  for(const phase of phases) {
    const title=phase.phase==='delivery'?'Entrega - antes':'Retirada - depois'
    for(let start=0;start<phase.photos.length;start+=4) {
      doc.addPage();doc.font('Times-Roman').fontSize(22).fillColor('#102a4c').text(title)
      doc.font('Helvetica').fontSize(9).fillColor('#56667c').text('Patrimônio '+phase.serialNumber+' | Fotos registradas em '+date(phase.createdAt))
      const photos=phase.photos.slice(start,start+4)
      for(let i=0;i<photos.length;i++) {
        const p=photos[i],x=44+(i%2)*261,y=155+Math.floor(i/2)*280
        const jpeg=await sharp(await readInspectionPhoto(database,phase,p.id)).flatten({background:'#fffdf9'}).jpeg({quality:88}).toBuffer()
        doc.save().roundedRect(x,y,245,190,12).fillAndStroke('#f6f1e8','#e2d6c2').restore()
        doc.image(jpeg,x+8,y+8,{fit:[229,174],align:'center',valign:'center'})
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#102a4c').text((start+i+1)+'. '+(p.caption || 'Equipamento'),x,y+201,{width:245,height:38})
        doc.font('Helvetica').fontSize(8).fillColor('#56667c').text(date(p.createdAt),x,y+242,{width:245})
      }
    }
  }
  const range=doc.bufferedPageRange()
  for(let i=range.start;i<range.start+range.count;i++) {
    doc.switchToPage(i);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0
    doc.font('Helvetica').fontSize(8).fillColor('#56667c').text(
      'Grupo YR Hospitalar | Ambiente privado | Página '+(i+1)+' de '+range.count,
      44,doc.page.height-30,{width:doc.page.width-88,align:'center',lineBreak:false})
    doc.page.margins.bottom=bottom
  }
  doc.end();return result
}

