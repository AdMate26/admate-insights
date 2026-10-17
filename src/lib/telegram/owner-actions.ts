/**
 * Owner-only Telegram actions behind the interactive server functions
 * (Preview, Send Now, and reading / saving / enabling schedules).
 *
 * Every action first proves, on the server, that the request comes from the
 * verified AdMate owner (Supabase-validated access token whose user id equals
 * META_OWNER_USER_ID — see auth/viewer.server). Only then does it build a
 * briefing, call Telegram, or touch `telegram_schedules`. Anyone else gets one
 * fixed, generic error; nothing protected is read or written first.
 *
 * The scheduled cron runner does NOT come through here: it calls
 * runDueSchedules() directly and is authorised by CRON_SECRET, with no user
 * session involved.
 *
 * Dependencies are injected so the gate can be tested without Supabase,
 * Telegram or a request context. admate.functions wires in the real ones,
 * unchanged.
 */

import type { OwnerAccess } from "../auth/viewer.server"; // type-only
import type { Brand } from "../brands";
import { validateSchedule, type DeliveryType, type Schedule } from "./schedule-model";
import type { StoredSchedule } from "./schedules.server"; // type-only

/** The only message an unauthorised caller ever sees. */
export const TELEGRAM_ACCESS_DENIED = "Telegram briefings aren't available for this account.";

export class TelegramAccessError extends Error {
  constructor() {
    super(TELEGRAM_ACCESS_DENIED);
    this.name = "TelegramAccessError";
  }
}

export type TelegramActionDeps = {
  /** Resolves to proof of owner access, or null for anyone else. */
  verifyOwner: () => Promise<OwnerAccess | null>;
  renderBriefingText: (brand: Brand) => Promise<string>;
  sendBrandBriefing: (
    brand: Brand,
    chatId?: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  getScheduleForBrand: (brand: Brand) => Promise<StoredSchedule | null>;
  upsertSchedule: (brand: Brand, input: Schedule) => Promise<StoredSchedule>;
  setScheduleEnabled: (brand: Brand, enabled: boolean) => Promise<StoredSchedule | null>;
};

export type ScheduleInput = {
  brand: Brand;
  deliveryType: DeliveryType;
  time: string;
  timezone: string;
  weekday: number | null;
  dayOfMonth: number | null;
};

export function createTelegramActions(deps: TelegramActionDeps) {
  async function requireOwner(): Promise<OwnerAccess> {
    let access: OwnerAccess | null = null;
    try {
      access = await deps.verifyOwner();
    } catch {
      access = null;
    }
    if (!access) throw new TelegramAccessError();
    return access;
  }

  return {
    /** Preview the EXACT briefing that would be sent. */
    async preview(data: { brand: Brand }): Promise<{ text: string }> {
      await requireOwner();
      return { text: await deps.renderBriefingText(data.brand) };
    },

    /** Send Now through the shared sender. */
    async send(data: {
      brand: Brand;
      chatId?: string | undefined;
    }): Promise<{ ok: true } | { ok: false; error: string }> {
      await requireOwner();
      const result = await deps.sendBrandBriefing(data.brand, data.chatId);
      return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
    },

    /** Current saved schedule. `configured:false` when storage is unavailable. */
    async getSchedule(data: {
      brand: Brand;
    }): Promise<{ configured: boolean; schedule: StoredSchedule | null }> {
      await requireOwner();
      try {
        const schedule = await deps.getScheduleForBrand(data.brand);
        return { configured: true, schedule };
      } catch (error) {
        console.error("getTelegramSchedule failed", error);
        return { configured: false, schedule: null };
      }
    },

    /** Create/replace a brand's schedule. Persisted; the cron runner executes it. */
    async saveSchedule(
      data: ScheduleInput,
    ): Promise<{ ok: true; schedule: StoredSchedule } | { ok: false; error: string }> {
      await requireOwner();
      const invalid = validateSchedule(data);
      if (invalid) return { ok: false, error: invalid };
      try {
        const schedule = await deps.upsertSchedule(data.brand, {
          deliveryType: data.deliveryType,
          time: data.time,
          timezone: data.timezone,
          weekday: data.weekday,
          dayOfMonth: data.dayOfMonth,
        });
        return { ok: true, schedule };
      } catch (error) {
        console.error("saveTelegramSchedule failed", error);
        return { ok: false, error: "Unable to save schedule." };
      }
    },

    /** Enable or disable an existing schedule without deleting it. */
    async setScheduleEnabled(data: {
      brand: Brand;
      enabled: boolean;
    }): Promise<{ ok: true; schedule: StoredSchedule | null } | { ok: false; error: string }> {
      await requireOwner();
      try {
        const schedule = await deps.setScheduleEnabled(data.brand, data.enabled);
        return { ok: true, schedule };
      } catch (error) {
        console.error("setTelegramScheduleEnabled failed", error);
        return { ok: false, error: "Unable to update schedule." };
      }
    },
  };
}
