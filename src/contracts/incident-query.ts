import { z } from "zod";

export const incidentQuerySchema = z.object({
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RECOVERED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(256).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  q: z.string().trim().max(200).optional(),
}).refine(value => !value.from || !value.to || new Date(value.from) <= new Date(value.to), { message: "起始时间不能晚于结束时间", path: ["to"] });

export type IncidentQuery = z.infer<typeof incidentQuerySchema>;
