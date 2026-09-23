"use client";

import { useId, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import type { MatchResponse } from "../../types";
import KazakhstanMap from "../common/KazakhstanMap";

const CITIES = ["Алматы", "Астана", "Шымкент", "Караганда", "Актобе", "Атырау"];
const CATEGORIES = [
  { value: "venue", label: "Площадки" },
  { value: "talent", label: "Артисты и ведущие" },
  { value: "service", label: "Услуги" },
];
const EVENT_FORMATS = [
  { value: "wedding", label: "Свадьба" },
  { value: "corporate", label: "Корпоратив" },
  { value: "birthday", label: "День рождения" },
  { value: "concert", label: "Концерт" },
];

const controlStyle: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
  minHeight: 44,
  padding: "10px 12px",
  border: "1px solid #cbdcd4",
  borderRadius: 10,
  background: "#fff",
  color: "#16382e",
  font: "inherit",
};
const labelStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  minWidth: 0,
  fontSize: 14,
};
const priceFormatter = new Intl.NumberFormat("ru-KZ");

export function HomeScreen() {
  const componentId = useId();
  const [form, setForm] = useState({
    city: "",
    date: "",
    category: "",
    format: "",
    budget: "",
  });
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSearching) return;

    setIsSearching(true);
    setResult(null);
    setError("");

    try {
      const response = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, budget: Number(form.budget) }),
      });
      const data = (await response.json()) as Partial<MatchResponse> | null;
      const matches = data?.matches;
      const message = typeof data?.message === "string" ? data.message.trim() : "";

      // Refusals can arrive with either a successful or an error HTTP status.
      if (!response.ok) {
        if (message) {
          setResult({ matches: [], message });
          return;
        }
        throw new Error("Match request failed");
      }

      if (!Array.isArray(matches) && !message) {
        throw new Error("Invalid match response");
      }

      setResult({
        matches: Array.isArray(matches) ? matches : [],
        message,
      });
    } catch {
      setError("Не удалось выполнить поиск. Попробуйте ещё раз.");
    } finally {
      setIsSearching(false);
    }
  }

  const warning = result?.message || error;

  return (
    <main
      style={{
        boxSizing: "border-box",
        width: "100%",
        maxWidth: 1120,
        margin: "0 auto",
        padding: "32px 16px",
        display: "grid",
        gap: 28,
        color: "#16382e",
        fontFamily: "inherit",
      }}
    >
      <header>
        <h1 style={{ margin: "0 0 8px", fontSize: 30 }}>Найдите подрядчика для события</h1>
        <p style={{ margin: 0, color: "#526c63" }}>
          Укажите детали — подберём варианты и объясним, почему они вам подходят.
        </p>
      </header>

      <form onSubmit={handleSearch} aria-label="Поиск подрядчиков" aria-busy={isSearching}>
        <fieldset
          disabled={isSearching}
          style={{ minWidth: 0, margin: 0, padding: 0, border: 0 }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))", gap: 16 }}>
            <label style={labelStyle}>
              Город
              <select required name="city" value={form.city} onChange={(event) => updateField("city", event.target.value)} style={controlStyle}>
                <option value="" disabled>Выберите город</option>
                {CITIES.map((city) => <option key={city} value={city}>{city}</option>)}
              </select>
            </label>

            <label style={labelStyle}>
              Дата
              <input required type="date" name="date" min="2026-09-23" value={form.date} onChange={(event) => updateField("date", event.target.value)} style={controlStyle} />
            </label>

            <label style={labelStyle}>
              Категория
              <select required name="category" value={form.category} onChange={(event) => updateField("category", event.target.value)} style={controlStyle}>
                <option value="" disabled>Выберите категорию</option>
                {CATEGORIES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            <label style={labelStyle}>
              Формат
              <select required name="format" value={form.format} onChange={(event) => updateField("format", event.target.value)} style={controlStyle}>
                <option value="" disabled>Выберите формат</option>
                {EVENT_FORMATS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            <label style={labelStyle}>
              Бюджет, ₸
              <input required type="number" name="budget" min="0" step="1" inputMode="numeric" placeholder="Например, 250000" value={form.budget} onChange={(event) => updateField("budget", event.target.value)} style={controlStyle} />
            </label>
          </div>

          <button
            type="submit"
            disabled={isSearching}
            style={{ marginTop: 20, minHeight: 44, padding: "12px 24px", border: 0, borderRadius: 10, background: "#047857", color: "#fff", font: "inherit", fontWeight: 600, cursor: isSearching ? "wait" : "pointer", opacity: isSearching ? 0.7 : 1 }}
          >
            {isSearching ? "Подбираем…" : "Найти подрядчиков"}
          </button>
        </fieldset>
      </form>

      <KazakhstanMap />

      <section aria-labelledby={`${componentId}-results`} aria-busy={isSearching}>
        <h2 id={`${componentId}-results`} style={{ margin: "0 0 16px", fontSize: 22 }}>
          Результаты подбора
        </h2>

        <div role="status" aria-live="polite" aria-atomic="true">
          {isSearching && <p style={{ color: "#526c63" }}>Ищем подходящих подрядчиков…</p>}
          {!isSearching && !result && !error && (
            <p style={{ color: "#526c63" }}>Заполните форму и нажмите «Найти подрядчиков».</p>
          )}
          {!isSearching && result && result.matches.length > 0 && (
            <p style={{ color: "#526c63" }}>Найдено вариантов: {result.matches.length}</p>
          )}
          {!isSearching && result && result.matches.length === 0 && !warning && (
            <p style={{ color: "#526c63" }}>Подрядчики не найдены. Попробуйте изменить условия поиска.</p>
          )}
        </div>

        {warning && (
          <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16, padding: 16, border: "1px solid #f5d36a", borderRadius: 12, background: "#fffbeb", color: "#854d0e" }}>
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
              <path d="M12 3 2 21h20L12 3Z" strokeLinejoin="round" />
              <path d="M12 9v5" strokeLinecap="round" />
              <circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none" />
            </svg>
            <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{warning}</p>
          </div>
        )}

        {result && result.matches.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 16 }}>
            {result.matches.map(({ contractor, explanation }) => (
              <article key={contractor.id} style={{ minWidth: 0, padding: 20, border: "1px solid #dbe7e3", borderRadius: 16, background: "#fff" }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 19, overflowWrap: "anywhere" }}>{contractor.anon_name}</h3>
                <p style={{ margin: "0 0 16px", color: "#047857", fontWeight: 700 }}>
                  от {priceFormatter.format(contractor.price_from_kzt)} ₸
                </p>
                <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Почему подходит — объяснение ИИ</p>
                <p style={{ margin: 0, color: "#526c63", lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{explanation}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default HomeScreen;
