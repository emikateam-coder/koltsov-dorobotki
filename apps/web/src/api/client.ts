import {
  EventListResponseSchema,
  EventSchema,
  MeResponseSchema,
  RegistrationListResponseSchema,
  type Event,
  type EventInput,
  type EventListResponse,
  type MeResponse,
  type RegistrationListResponse,
} from '@app/shared';
import { z } from 'zod';
import { getInitData } from '../lib/telegram';

const RAW_API_URL = import.meta.env.VITE_API_URL ?? '';
const API_URL = RAW_API_URL.replace(/\/$/, '');

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body !== undefined && init.body !== null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const initData = getInitData();
  if (initData) {
    headers.set('X-Telegram-Init-Data', initData);
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const data: unknown = text.length > 0 ? JSON.parse(text) : null;

  if (!res.ok) {
    let message = `Request failed with ${res.status}`;
    let code: string | undefined;
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (typeof obj.message === 'string' && obj.message.length > 0) {
        message = obj.message;
      }
      if (typeof obj.error === 'string') {
        code = obj.error;
      }
    }
    throw new ApiError(res.status, message, code);
  }

  return data as T;
}

export async function getMe(): Promise<MeResponse> {
  const data = await request<unknown>('/me');
  return MeResponseSchema.parse(data);
}

export async function getHealth(): Promise<{ status: string }> {
  return request<{ status: string }>('/health');
}

const EventEnvelopeSchema = z.object({ event: EventSchema });

export async function listEvents(includePast = false): Promise<EventListResponse> {
  const path = includePast ? '/events?all=1' : '/events';
  const data = await request<unknown>(path);
  return EventListResponseSchema.parse(data);
}

export async function getEventById(id: number): Promise<Event> {
  const data = await request<unknown>(`/events/${id}`);
  return EventEnvelopeSchema.parse(data).event;
}

export async function createEvent(input: EventInput): Promise<Event> {
  const data = await request<unknown>('/events', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return EventEnvelopeSchema.parse(data).event;
}

export async function updateEvent(id: number, input: EventInput): Promise<Event> {
  const data = await request<unknown>(`/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return EventEnvelopeSchema.parse(data).event;
}

export async function deleteEvent(id: number): Promise<void> {
  await request<unknown>(`/events/${id}`, { method: 'DELETE' });
}

export async function registerForEvent(id: number, seats: number): Promise<Event> {
  const data = await request<unknown>(`/events/${id}/register`, {
    method: 'POST',
    body: JSON.stringify({ seats }),
  });
  return EventEnvelopeSchema.parse(data).event;
}

export async function unregisterFromEvent(id: number): Promise<Event> {
  const data = await request<unknown>(`/events/${id}/register`, { method: 'DELETE' });
  return EventEnvelopeSchema.parse(data).event;
}

export async function listRegistrations(eventId: number): Promise<RegistrationListResponse> {
  const data = await request<unknown>(`/events/${eventId}/registrations`);
  return RegistrationListResponseSchema.parse(data);
}
