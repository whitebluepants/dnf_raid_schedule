import { Badge } from "./ui/badge";

export function RealtimeStatus({ state }: { state: "connected" | "connecting" | "offline" }) {
  const labels = { connected: "实时已连接", connecting: "正在连接", offline: "离线" };
  return <Badge className={state === "offline" ? "bg-rose-50 text-rose-700" : state === "connecting" ? "bg-amber-50 text-amber-700" : ""}>{labels[state]}</Badge>;
}
