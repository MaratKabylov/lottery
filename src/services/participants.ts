import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Participant, RegistrationResult } from "../types/database";

export async function listParticipants(eventId: string) {
  // Page through the API limit so large events are not silently truncated.
  const result: Participant[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("participants")
      .select("*")
      .eq("event_id", eventId)
      .order("ticket_number")
      .range(offset, offset + 999);
    if (error) throw error;
    result.push(...data);
    if (data.length < 1000) break;
  }
  return result;
}
export async function registerParticipant(input: {
  event_slug: string;
  name: string;
  phone: string;
  email: string;
}) {
  const { data, error } = await supabase.functions.invoke<RegistrationResult>(
    "register-participant",
    { body: input },
  );
  if (error instanceof FunctionsHttpError) {
    const body: unknown = await error.context.json();
    throw new Error(
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : "Ошибка регистрации",
    );
  }
  if (error) throw error;
  if (!data) throw new Error("Нет ответа от сервера");
  return data;
}
export async function setParticipantActive(id: string, is_active: boolean) {
  const { error } = await supabase
    .from("participants")
    .update({ is_active })
    .eq("id", id);
  if (error) throw error;
}
export async function checkIn(
  eventId: string,
  ticket: number,
  checkedIn = true,
) {
  const { data, error } = await supabase.rpc("staff_check_in", {
    p_event_id: eventId,
    p_ticket_number: ticket,
    p_checked_in: checkedIn,
  });
  if (error) throw error;
  return data;
}
export async function checkInByPhone(
  eventId: string,
  phone: string,
  checkedIn = true,
) {
  const { data, error } = await supabase.rpc("staff_check_in_by_phone", {
    p_event_id: eventId,
    p_phone: phone,
    p_checked_in: checkedIn,
  });
  if (error) throw error;
  return data;
}
export async function manageTestParticipants(
  eventId: string,
  count: number,
  remove = false,
) {
  const { data, error } = await supabase.rpc("manage_test_participants", {
    p_event_id: eventId,
    p_count: count,
    p_remove: remove,
  });
  if (error) throw error;
  return data;
}
