"use client";
import { useState, type KeyboardEvent } from "react";
import { CloseIcon } from "./icons";
import { inputClass } from "./StaffShell";

export function splitMenu(text: string): string[] {
  return text.split(",").map(item => item.trim()).filter(Boolean);
}

function addUnique(tags: string[], items: string[]): string[] {
  const next = [...tags];
  for (const item of items) {
    const name = item.slice(0, 100);
    if (!next.some(tag => tag.toLowerCase() === name.toLowerCase())) next.push(name);
  }
  return next;
}

export default function MenuTags({ initial }: { initial: string[] }) {
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState("");
  const serialized = addUnique(tags, splitMenu(draft)).join(", ");

  function commitDraft(text: string) {
    setTags(current => addUnique(current, splitMenu(text)));
    setDraft("");
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft(draft);
    } else if (event.key === "Backspace" && !draft && tags.length) {
      setTags(current => current.slice(0, -1));
    }
  }
  function onChange(value: string) {
    if (value.includes(",")) commitDraft(value);
    else setDraft(value);
  }

  return <div className="flex flex-col gap-1.5">
    <label htmlFor="menu-tag-input" className="text-sm font-medium">Komponen menu yang seharusnya ada</label>
    {tags.length > 0 && <ul aria-label="Komponen menu" className="flex flex-wrap gap-2">
      {tags.map(tag => <li key={tag} className="flex min-h-9 items-center gap-1 rounded-full bg-mint pr-1 pl-3 text-sm font-bold text-brand-dark">
        {tag}
        <button type="button" onClick={() => setTags(current => current.filter(item => item !== tag))} aria-label={`Hapus ${tag}`} className="grid size-7 place-items-center rounded-full hover:bg-brand hover:text-white">
          <CloseIcon />
        </button>
      </li>)}
    </ul>}
    <input id="menu-tag-input" value={draft} onChange={event => onChange(event.target.value)} onKeyDown={onKeyDown} onBlur={() => commitDraft(draft)} maxLength={100} enterKeyHint="done" placeholder={tags.length ? "Tambah komponen lain" : "Contoh: Nasi putih"} className={inputClass} />
    <p className="text-xs text-ink2">Tekan Enter atau koma untuk menambah. Agen memakai daftar ini untuk memeriksa komponen yang hilang.</p>
    <input type="hidden" name="menu_items" value={serialized} />
  </div>;
}
