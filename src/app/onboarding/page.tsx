import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthCard } from "@/components/auth-card";

export default function OnboardingPage() {
  return <AuthCard title="加入你的团体"><form className="space-y-4"><label className="block text-sm font-medium" htmlFor="nickname">游戏昵称<Input id="nickname" name="nickname" className="mt-1" required /></label><label className="block text-sm font-medium" htmlFor="inviteCode">团体邀请码<Input id="inviteCode" name="inviteCode" className="mt-1" minLength={6} maxLength={64} required /></label><Button type="submit" className="w-full bg-cyan-600 text-white">加入团体</Button></form></AuthCard>;
}
