export interface ServiceRequest {
  id: string; type: string; message: string; status: string; createdAt: string; revision: number;
  clientName?: string; leadId?: string; assignedTo?: string; assignedName?: string; response?: string;
  contractId?: string; contractNumber?: string; requestedDate?: string; requestedMonths?: number;
  scheduledDate?: string; decision?: string; receiptId?: string; invoiceId?: string;
  history: { at: string; status: string; response?: string; assignedName?: string; scheduledDate?: string; decision?: string }[];
}
export interface PaymentReceipt { id: string; invoiceId: string; fileName: string; size: number; reviewStatus: string; createdAt: string }
export const requestTypes: Record<string,string> = {question:'Atendimento',maintenance:'Manutenção',payment:'Pagamento / comprovante',renewal:'Renovação da locação',withdrawal:'Retirada do equipamento'};
export const requestStatuses: Record<string,string> = {open:'Recebida',in_progress:'Em atendimento',scheduled:'Agendada',resolved:'Concluída'};
export const receiptStatuses: Record<string,string> = {pending:'Aguardando conferência',accepted:'Documento conferido',rejected:'Documento não aceito'};
export const dateLabel = (value?: string) => {
  if (!value) return 'Não informado';
  const date = new Date(value.length === 10 ? value + 'T12:00:00' : value);
  return Number.isNaN(date.getTime()) ? 'Não informado' : date.toLocaleDateString('pt-BR');
};
export const today = () => new Date().toLocaleDateString('en-CA');

