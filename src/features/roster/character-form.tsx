"use client";

import { type MouseEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { RosterAccount, RosterCharacter } from "./repository";
import { createGameAccount, saveCharacter } from "./actions";

type EditableCharacter = RosterCharacter & { accountId: string };

type CharacterFormProps = {
  accounts: RosterAccount[];
  triggerLabel: string;
  character?: EditableCharacter;
  onSaved?: () => void;
};

export function CharacterForm({ accounts, triggerLabel, character, onSaved }: CharacterFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [accountPending, startAccountTransition] = useTransition();
  const [selectedAccountId, setSelectedAccountId] = useState(character?.accountId ?? accounts[0]?.id ?? "");
  const [role, setRole] = useState<"dealer" | "buffer">(character?.role ?? "dealer");
  const [extraAccounts, setExtraAccounts] = useState<RosterAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("");
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const accountIds = new Set(accounts.map((account) => account.id));
  const allAccounts = [
    ...accounts,
    ...extraAccounts.filter((account, index, current) => !accountIds.has(account.id) && current.findIndex((item) => item.id === account.id) === index),
  ];
  const title = character ? "编辑角色" : "新增角色";

  function openDialog(event: MouseEvent<HTMLButtonElement>) {
    openerRef.current = event.currentTarget;
    setError(null);
    setOpen(true);
  }

  function closeDialog() {
    openerRef.current?.focus();
    setOpen(false);
  }

  function createAccount() {
    const name = accountName.trim();
    if (!name) {
      setError("请输入账号名后再添加");
      return;
    }
    const formData = new FormData();
    formData.set("name", name);
    setError(null);
    startAccountTransition(async () => {
      const result = await createGameAccount(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setExtraAccounts((current) => [...current, { id: result.value, name, characters: [] }]);
      setSelectedAccountId(result.value);
      setAccountName("");
      setNotice("账号已添加，可以继续填写角色资料。");
      router.refresh();
    });
  }

  return (
    <div className="inline-block">
      <Button type="button" className="bg-cyan-600 text-white" onClick={openDialog}>{triggerLabel}</Button>
      {notice ? <p role="status" className="mt-2 text-sm text-emerald-700">{notice}</p> : null}
      <Dialog open={open} title={title} onClose={closeDialog}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">角色资料仅归属当前空间，并用于活动报名和初排。</p>
          </div>
          <Button type="button" aria-label="关闭" onClick={closeDialog}>关闭</Button>
        </div>
        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            setError(null);
            startTransition(async () => {
              const result = await saveCharacter({
                characterId: character?.id,
                accountId: selectedAccountId,
                name: String(formData.get("name") ?? ""),
                className: String(formData.get("className") ?? ""),
                role,
                fame: String(formData.get("fame") ?? ""),
                strengthTier: String(formData.get("strengthTier") ?? "") as "high" | "medium" | "low",
                damageScore: role === "dealer" ? String(formData.get("damageScore") ?? "") : null,
                buffScore: role === "buffer" ? String(formData.get("buffScore") ?? "") : null,
                notes: String(formData.get("notes") ?? ""),
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setNotice(character ? "角色资料已更新。" : "角色已添加。 ");
              setOpen(false);
              onSaved?.();
              router.refresh();
            });
          }}
        >
          <label className="block text-sm font-medium" htmlFor="character-account">
            账号
            <Select id="character-account" name="accountId" className="mt-1" value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)} required>
              <option value="" disabled>请选择账号</option>
              {allAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </Select>
          </label>
          <div className="rounded-xl bg-slate-50 p-3">
            <label className="block text-sm font-medium" htmlFor="new-game-account">新账号名</label>
            <div className="mt-1 flex gap-2">
              <Input id="new-game-account" maxLength={80} placeholder="例如：主账号" value={accountName} onChange={(event) => setAccountName(event.target.value)} />
              <Button type="button" onClick={createAccount} disabled={accountPending} className="border border-slate-300 bg-white text-slate-800">{accountPending ? "添加中…" : "添加账号"}</Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium" htmlFor="character-name">角色名<Input id="character-name" name="name" className="mt-1" defaultValue={character?.name} maxLength={80} required /></label>
            <label className="block text-sm font-medium" htmlFor="character-class">职业<Input id="character-class" name="className" className="mt-1" defaultValue={character?.class_name} maxLength={80} required /></label>
            <label className="block text-sm font-medium" htmlFor="character-role">定位<Select id="character-role" name="role" className="mt-1" value={role} onChange={(event) => setRole(event.target.value as "dealer" | "buffer")} required><option value="dealer">C</option><option value="buffer">奶</option></Select></label>
            <label className="block text-sm font-medium" htmlFor="character-fame">名望<Input id="character-fame" name="fame" type="number" min="1" className="mt-1" defaultValue={character?.fame} required /></label>
            <label className="block text-sm font-medium" htmlFor="character-tier">强度档位<Select id="character-tier" name="strengthTier" className="mt-1" defaultValue={character?.strength_tier ?? "medium"} required><option value="high">高档</option><option value="medium">中档</option><option value="low">低档</option></Select></label>
            {role === "dealer" ? <label key="dealer-metric" className="block text-sm font-medium" htmlFor="character-damage">模拟伤害<Input id="character-damage" name="damageScore" type="number" min="0.01" step="any" className="mt-1" defaultValue={character?.simulated_damage ?? ""} required /></label> : <label key="buffer-metric" className="block text-sm font-medium" htmlFor="character-buff">奶量<Input id="character-buff" name="buffScore" type="number" min="0.01" step="any" className="mt-1" defaultValue={character?.buffer_power ?? ""} required /></label>}
          </div>
          <label className="block text-sm font-medium" htmlFor="character-notes">备注<textarea id="character-notes" name="notes" className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 p-3 text-sm" defaultValue={character?.notes ?? ""} maxLength={500} /></label>
          {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
          <div className="flex justify-end gap-3"><Button type="button" onClick={closeDialog} className="border border-slate-300 bg-white text-slate-800">取消</Button><Button type="submit" disabled={pending} className="bg-cyan-600 text-white">{pending ? "保存中…" : "保存角色"}</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
