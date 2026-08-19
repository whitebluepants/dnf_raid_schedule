import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { createServerClient } from "@/lib/supabase/server";

export type RosterCharacter = {
  id: string;
  name: string;
  class_name: string;
  role: "dealer" | "buffer";
  fame: number;
  strength_tier: "high" | "medium" | "low";
  simulated_damage: number | null;
  buffer_power: number | null;
  notes: string | null;
};

export type RosterAccount = {
  id: string;
  name: string;
  characters: RosterCharacter[];
};

export async function listRoster(
  groupId: string,
  profileId: string,
  providedClient?: SupabaseClient<Database>,
): Promise<RosterAccount[]> {
  const client = providedClient ?? await createServerClient();
  const { data, error } = await client
    .from("game_accounts")
    .select("id, name, characters(id, name, class_name, role, fame, strength_tier, simulated_damage, buffer_power, notes)")
    .eq("group_id", groupId)
    .eq("profile_id", profileId)
    .eq("is_archived", false)
    .eq("characters.group_id", groupId)
    .eq("characters.profile_id", profileId)
    .eq("characters.is_archived", false)
    .order("name");

  if (error) throw new Error("无法读取角色资料");
  return (data ?? []) as unknown as RosterAccount[];
}
