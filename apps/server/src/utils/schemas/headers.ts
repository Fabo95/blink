import { z } from 'zod';

export const zAuthHeaders = z.object({
  authorization: z.string().min(1),
});
