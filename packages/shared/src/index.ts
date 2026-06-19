import { z } from 'zod';

export const TelegramUserSchema = z.object({
  id: z.number().int(),
  is_bot: z.boolean().optional(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  is_premium: z.boolean().optional(),
  added_to_attachment_menu: z.boolean().optional(),
  allows_write_to_pm: z.boolean().optional(),
  photo_url: z.string().url().optional(),
});

export type TelegramUser = z.infer<typeof TelegramUserSchema>;

export const MeResponseSchema = z.object({
  user: TelegramUserSchema,
  authDate: z.number().int(),
  isOrganizer: z.boolean(),
});

export type MeResponse = z.infer<typeof MeResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const EventSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  location: z.string().max(200),
  startsAt: z.number().int(),
  capacity: z.number().int().min(0),
  organizerId: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  registeredCount: z.number().int().min(0),
  bookedSeats: z.number().int().min(0),
  isRegistered: z.boolean(),
  myBookingNumber: z.number().int().positive().nullable(),
  mySeats: z.number().int().min(0),
});

export type Event = z.infer<typeof EventSchema>;

export const EventListResponseSchema = z.object({
  events: z.array(EventSchema),
});

export type EventListResponse = z.infer<typeof EventListResponseSchema>;

export const EventResponseSchema = z.object({
  event: EventSchema,
});

export type EventResponse = z.infer<typeof EventResponseSchema>;

export const EventInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  location: z.string().trim().max(200).default(''),
  startsAt: z.number().int(),
  capacity: z.number().int().min(0).max(100000),
});

export type EventInput = z.infer<typeof EventInputSchema>;

export const RegistrationSchema = z.object({
  id: z.number().int().positive(),
  eventId: z.number().int().positive(),
  bookingNumber: z.number().int().positive(),
  seats: z.number().int().min(1),
  user: TelegramUserSchema,
  createdAt: z.number().int(),
});

export type Registration = z.infer<typeof RegistrationSchema>;

export const RegistrationListResponseSchema = z.object({
  registrations: z.array(RegistrationSchema),
});

export type RegistrationListResponse = z.infer<typeof RegistrationListResponseSchema>;

export const RegisterRequestSchema = z.object({
  seats: z.number().int().min(1).max(50).default(1),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
