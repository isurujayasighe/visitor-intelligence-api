import { Type, Static } from '@sinclair/typebox';

export const IngestVisitorEventBodySchema = Type.Object({
  ip_address: Type.Optional(Type.String()),
  event_name: Type.String({ minLength: 1, maxLength: 100 }),
  client_id: Type.Optional(Type.String({ maxLength: 150 })),
  session_id: Type.Optional(Type.String({ maxLength: 200 })),
  event_timestamp: Type.Optional(Type.String({ maxLength: 100 })),

  page_url: Type.Optional(Type.String({ maxLength: 2000 })),
  page_hostname: Type.Optional(Type.String({ maxLength: 255 })),
  page_path: Type.Optional(Type.String({ maxLength: 1000 })),
  page_title: Type.Optional(Type.String({ maxLength: 500 })),

  user_agent: Type.Optional(Type.String({ maxLength: 1000 })),
  referrer: Type.Optional(Type.String({ maxLength: 2000 })),

  utm_source: Type.Optional(Type.String({ maxLength: 150 })),
  utm_medium: Type.Optional(Type.String({ maxLength: 150 })),
  utm_campaign: Type.Optional(Type.String({ maxLength: 200 })),
}, { additionalProperties: true });

export type IngestVisitorEventBody = Static<typeof IngestVisitorEventBodySchema>;
