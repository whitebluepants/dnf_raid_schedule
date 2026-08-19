import { Card } from "@/components/ui/card";
import { RegistrationForm } from "@/features/activities/registration-form";
import { getActivity, getSignup, listSignupCharacters } from "@/features/activities/repository";
import { CurrentSpaceError, requireCurrentSpace } from "@/lib/current-space";
import { createServerClient } from "@/lib/supabase/server";

export default async function SignupPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const client = await createServerClient();
  try {
    const space = await requireCurrentSpace(client);
    const eventResult = await getActivity(client, eventId, space.groupId);
    if (!eventResult.ok) return <div className="mx-auto max-w-3xl rounded-2xl bg-rose-50 p-6 text-rose-900"><h1 className="text-xl font-bold">无法读取活动</h1><p className="mt-2 text-sm">{eventResult.error}</p><a className="mt-4 inline-block font-semibold text-cyan-800 underline" href="/activities">返回活动列表</a></div>;
    if (!eventResult.value) return <div className="mx-auto max-w-3xl rounded-2xl bg-amber-50 p-6 text-amber-900"><h1 className="text-xl font-bold">找不到这个活动</h1><p className="mt-2 text-sm">活动可能已归档，或不属于当前空间。</p><a className="mt-4 inline-block font-semibold text-cyan-800 underline" href="/activities">返回活动列表</a></div>;
    const event = eventResult.value;
    const [charactersResult, signupResult] = await Promise.all([listSignupCharacters(client, space), getSignup(client, eventId, space.profileId)]);
    if (!charactersResult.ok) return <div className="mx-auto max-w-3xl rounded-2xl bg-rose-50 p-6 text-rose-900"><h1 className="text-xl font-bold">无法读取报名信息</h1><p className="mt-2 text-sm">{charactersResult.error}</p><a className="mt-4 inline-block font-semibold text-cyan-800 underline" href={`/activities/${eventId}/signup`}>重新加载</a></div>;
    if (!signupResult.ok) return <div className="mx-auto max-w-3xl rounded-2xl bg-rose-50 p-6 text-rose-900"><h1 className="text-xl font-bold">无法读取报名信息</h1><p className="mt-2 text-sm">{signupResult.error}</p><a className="mt-4 inline-block font-semibold text-cyan-800 underline" href={`/activities/${eventId}/signup`}>重新加载</a></div>;
    const characters = charactersResult.value;
    const signup = signupResult.value;
    return <div className="mx-auto max-w-3xl space-y-6"><section><p className="text-sm font-semibold text-cyan-700">活动报名</p><h1 className="mt-1 text-3xl font-bold">{event.title}</h1><p className="mt-2 text-sm text-slate-600">只可报名当前空间内属于你的未归档角色。保存后团长才能将其纳入排表。</p></section><Card className="p-5"><RegistrationForm eventId={eventId} characters={characters} initialState={signup?.state ?? "participating"} initialCharacterIds={signup?.characterIds ?? []} /></Card></div>;
  } catch (error) {
    return <div className="mx-auto max-w-3xl rounded-2xl bg-amber-50 p-6 text-amber-900"><h1 className="text-xl font-bold">无法打开报名</h1><p className="mt-2 text-sm">{error instanceof CurrentSpaceError ? "请先在空间页选择可访问的空间。" : "请稍后刷新后重试。"}</p><a className="mt-4 inline-block font-semibold text-cyan-800 underline" href="/spaces">前往空间页</a></div>;
  }
}
