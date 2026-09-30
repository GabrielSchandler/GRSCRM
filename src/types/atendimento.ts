export type Channel = {
  id: string;
  company_id: string;
  name: string;
  business_area: "commercial" | "legal";
  provider: string;
  provider_channel_external_id: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  company_id: string;
  client_id: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationStatus = "ia" | "aguardando_humano" | "humano" | "aguardando_cliente" | "encerrada";

/** Rótulo de exibição do status — usado pelo badge da conversa. */
export type ConversaEstado = "IA" | "AGUARDANDO_HUMANO" | "HUMANO" | "AGUARDANDO_CLIENTE" | "ENCERRADA";

export type Conversation = {
  id: string;
  company_id: string;
  channel_id: string;
  contact_id: string;
  client_id: string | null;
  team_id: string | null;
  assigned_user_profile_id: string | null;
  status: ConversationStatus;
  last_activity_at: string;
  last_message_preview: string | null;
  unread_count: number;
  first_response_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageDirection = "entrada" | "saida";
export type MessageAuthorType = "cliente" | "humano" | "ia" | "sistema";
export type MessageType = "texto" | "documento" | "audio" | "imagem" | "video" | "nota";
export type MessageStatus = "recebida" | "criada" | "pendente" | "enviada" | "entregue" | "lida" | "falha";

export type Message = {
  id: string;
  company_id: string;
  conversation_id: string;
  direction: MessageDirection;
  author_type: MessageAuthorType;
  author_user_profile_id: string | null;
  is_internal_note: boolean;
  message_type: MessageType;
  body: string | null;
  status: MessageStatus;
  external_id: string | null;
  idempotency_key: string | null;
  failed_reason: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  // 0009 — opcionais: antes da migração ser aplicada o banco não devolve estes campos.
  edited_at?: string | null;
  deleted_at?: string | null;
  deleted_by_user_profile_id?: string | null;
};

/** Edição/exclusão de mensagem e a confirmação do WhatsApp (tabela message_revisions, 0009). */
export type MessageRevision = {
  id: string;
  message_id: string;
  kind: "edicao" | "exclusao";
  origin: "equipe" | "cliente";
  body_before: string | null;
  body_after: string | null;
  whatsapp_status: "nao_se_aplica" | "aguardando" | "confirmado" | "recusado";
  whatsapp_error: string | null;
  created_at: string;
  confirmed_at: string | null;
  requested_by: { full_name: string | null } | null;
};

export type ConversationTransfer = {
  id: string;
  conversation_id: string;
  company_id: string;
  from_user_profile_id: string | null;
  to_user_profile_id: string | null;
  transferred_by: string;
  note: string | null;
  created_at: string;
};

/** Conversa com dados relacionados já resolvidos, pra exibir na lista/tela sem N+1. */
export type ConversationComRelacionados = Conversation & {
  contact: Pick<Contact, "id" | "display_name"> | null;
  channel: Pick<Channel, "id" | "name" | "provider"> | null;
  assigned_user_profile: { id: string; full_name: string | null } | null;
};
