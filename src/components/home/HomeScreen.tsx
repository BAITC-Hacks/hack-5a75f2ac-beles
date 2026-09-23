import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { MatchResponse } from "../../types";
import catalog from "../../data/catalog-options.json";
import contractors from "../../../data/contractors.json";
import KazakhstanMap from "../common/KazakhstanMap";
import ContractorDetails from "../common/ContractorDetails";
import type { ContractorSelection } from "../common/ContractorDetails";
import "./HomeScreen.css";

const priceFormatter = new Intl.NumberFormat("ru-KZ");
const EMPTY_FORM = {
  city: "",
  date: "",
  category: "",
  format: "",
  budget: "",
  duration_hours: "",
  language: "",
};
const EXAMPLES = [
  {
    label: "Много вариантов",
    detail: "Ведущий · Алматы",
    values: { city: "Алматы", date: "2026-10-06", category: "Ведущий", format: "корпоратив", budget: "1000000", language: "русский" },
  },
  {
    label: "Редкая категория",
    detail: "Флорист · 23 сентября",
    values: { city: "Алматы", date: "2026-09-23", category: "Флорист", format: "свадьба", budget: "300000", language: "русский" },
  },
  {
    label: "Все заняты",
    detail: "Флорист · 25 сентября",
    values: { city: "Алматы", date: "2026-09-25", category: "Флорист", format: "свадьба", budget: "300000", language: "русский" },
  },
  {
    label: "Нет категории",
    detail: "Ведущий · Зарубежье",
    values: { city: "Зарубежье", date: "2026-10-06", category: "Ведущий", format: "корпоратив", budget: "3000000", language: "русский" },
  },
];
const RESULT_TITLES: Record<MatchResponse["status"], string> = {
  matched: "Подходящие подрядчики",
  no_category: "В этом городе нет подрядчиков выбранной категории",
  no_match: "Никто не подходит под все условия",
  error: "Не удалось выполнить подбор",
};
const EXCLUSION_LABELS = {
  busy: "заняты в выбранную дату",
  budget: "дороже бюджета с допуском 10%",
  format: "не работают с этим форматом",
  language: "не указан выбранный язык",
  duration: "не подходят по длительности",
};

function MessageIcon({ warning }: { warning: boolean }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      {warning ? <>
        <path d="M12 3 2 21h20L12 3Z" strokeLinejoin="round" />
        <path d="M12 9v5" strokeLinecap="round" />
        <circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none" />
      </> : <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6" strokeLinecap="round" />
        <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
      </>}
    </svg>
  );
}

export function HomeScreen() {
  const componentId = useId();
  const [form, setForm] = useState(EMPTY_FORM);
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchBudget, setSearchBudget] = useState(0);
  const [searchDate, setSearchDate] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<ContractorSelection | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const cityRef = useRef<HTMLSelectElement>(null);
  const detailsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const profileId = `${componentId}-contractor-profile`;

  useEffect(() => {
    if (!result || isSearching || detailsTriggerRef.current) return;
    resultsRef.current?.focus({ preventScroll: true });
    resultsRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [result, isSearching]);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyExample(values: typeof EXAMPLES[number]["values"]) {
    setForm({ ...EMPTY_FORM, ...values });
    setResult(null);
    setSelectedProfile(null);
    detailsTriggerRef.current = null;
    cityRef.current?.focus();
  }

  function openProfile(selection: ContractorSelection, trigger: HTMLButtonElement) {
    detailsTriggerRef.current = trigger;
    setSelectedProfile(selection);
  }

  function backToCard() {
    const target = detailsTriggerRef.current?.isConnected ? detailsTriggerRef.current : resultsRef.current;
    setSelectedProfile(null);
    detailsTriggerRef.current = null;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSearching) return;
    setIsSearching(true);
    setResult(null);
    setSearchBudget(Number(form.budget));
    setSearchDate(form.date);
    setSelectedProfile(null);
    detailsTriggerRef.current = null;

    try {
      const response = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: form.city,
          date: form.date,
          category: form.category,
          format: form.format,
          budget: Number(form.budget),
          ...(form.duration_hours ? { duration_hours: Number(form.duration_hours) } : {}),
          ...(form.language ? { language: form.language } : {}),
        }),
      });
      const data = (await response.json()) as Partial<MatchResponse> | null;
      const message = typeof data?.message === "string" ? data.message.trim() : "";
      if (!response.ok) {
        setResult({ status: "error", matches: [], message: message || "Сервис временно недоступен. Попробуйте ещё раз." });
        return;
      }
      if (!data || !Array.isArray(data.matches) || !data.status || !Object.hasOwn(RESULT_TITLES, data.status)) {
        throw new Error("Invalid match response");
      }
      setResult({
        status: data.status,
        matches: data.matches,
        message,
        explanation_source: data.explanation_source,
        summary: data.summary,
      });
    } catch {
      setResult({ status: "error", matches: [], message: "Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз." });
    } finally {
      setIsSearching(false);
    }
  }

  const isWarning = result?.status !== "matched";
  const excluded = result?.summary?.excluded;

  return (
    <main className="home-screen">
      <header className="home-header">
        <p className="home-eyebrow">HACKALEM AI</p>
        <h1>Найдите подрядчика для события</h1>
        <p>Укажите детали — подберём до трёх вариантов и объясним, почему они вам подходят.</p>
        <p className="home-catalog-note">
          {catalog.total} подрядчиков · {catalog.categories.length} категорий · Анонимизированный каталог хакатона
        </p>
      </header>

      <form className="home-search" onSubmit={handleSearch} aria-label="Поиск подрядчиков" aria-busy={isSearching}>
        <fieldset disabled={isSearching}>
          <div className="home-fields">
            <label>
              Город
              <select ref={cityRef} required name="city" value={form.city} onChange={(event) => updateField("city", event.target.value)}>
                <option value="" disabled>Выберите город</option>
                {catalog.cities.map((city) => <option key={city} value={city}>{city}</option>)}
              </select>
            </label>

            <label>
              Дата
              <input required type="date" name="date" min={catalog.minDate} max={catalog.maxDate} value={form.date} onChange={(event) => updateField("date", event.target.value)} aria-describedby={`${componentId}-date-hint`} />
            </label>

            <label>
              Категория
              <select required name="category" value={form.category} onChange={(event) => updateField("category", event.target.value)}>
                <option value="" disabled>Выберите категорию</option>
                {catalog.categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>

            <label>
              Формат
              <select required name="format" value={form.format} onChange={(event) => updateField("format", event.target.value)}>
                <option value="" disabled>Выберите формат</option>
                {catalog.formats.map((format) => <option key={format} value={format}>{format}</option>)}
              </select>
            </label>

            <label>
              Бюджет, ₸
              <input required type="number" name="budget" min="0" step="1" inputMode="numeric" placeholder="Например, 250000" value={form.budget} onChange={(event) => updateField("budget", event.target.value)} aria-describedby={`${componentId}-budget-hint`} />
            </label>
          </div>
          <div className="home-form-hints">
            <span id={`${componentId}-date-hint`}>Период: 23 сентября — 31 декабря 2026.</span>
            <span id={`${componentId}-budget-hint`}>Допуск к бюджету — до 10%; превышение укажем в карточке.</span>
          </div>

          <details className="home-extra-filters">
            <summary>Дополнительные условия</summary>
            <div className="home-fields home-fields-optional">
              <label>
                Длительность, часов
                <input type="number" name="duration_hours" min="0.5" step="0.5" inputMode="decimal" placeholder="Не важно" value={form.duration_hours} onChange={(event) => updateField("duration_hours", event.target.value)} />
              </label>
              <label>
                Язык
                <select name="language" value={form.language} onChange={(event) => updateField("language", event.target.value)}>
                  <option value="">Любой</option>
                  {catalog.languages.map((language) => <option key={language} value={language}>{language}</option>)}
                </select>
              </label>
            </div>
          </details>

          <button className="home-search-button" type="submit" disabled={isSearching}>
            {isSearching ? "Подбираем…" : "Найти подрядчиков"}
            <span aria-hidden="true">{isSearching ? "…" : "→"}</span>
          </button>

          <div className="home-examples" aria-label="Примеры поиска">
            <p>Попробуйте пример</p>
            <div className="home-example-buttons">
              {EXAMPLES.map((example) => (
                <button key={example.label} type="button" onClick={() => applyExample(example.values)}>
                  <strong>{example.label}</strong>
                  <span>{example.detail}</span>
                </button>
              ))}
            </div>
          </div>
        </fieldset>
      </form>

      <KazakhstanMap onOpenDetails={(preview, trigger) => {
        const contractor = contractors.find((profile) => profile.anon_name === preview.anon_name && profile.city === preview.city);
        openProfile({
          contractor: contractor ?? { ...preview, id: `demo-${preview.city}-${preview.anon_name}` },
          source: contractor ? "catalog" : "demo",
          date: form.date || undefined,
        }, trigger);
      }} />

      <section ref={resultsRef} tabIndex={-1} className="home-results" aria-labelledby={`${componentId}-results`} aria-busy={isSearching}>
        <div role="status" aria-live="polite" aria-atomic="true">
          <h2 id={`${componentId}-results`}>{result ? RESULT_TITLES[result.status] : "Результаты подбора"}</h2>
          {isSearching && <p className="home-muted">Проверяем условия и подбираем подрядчиков…</p>}
          {!isSearching && !result && <p className="home-muted">Заполните форму или выберите пример и нажмите «Найти подрядчиков».</p>}
          {result?.status === "matched" && (
            <p className="home-muted">
              Показываем {result.matches.length} из {result.summary?.eligible ?? result.matches.length} подходящих вариантов.
            </p>
          )}
        </div>

        {result?.message && (
          <div className={`home-message ${isWarning ? "home-message-warning" : "home-message-info"}`} role={result.status === "error" ? "alert" : undefined}>
            <MessageIcon warning={isWarning} />
            <p>{result.message}</p>
          </div>
        )}

        {result?.summary && result.status !== "no_category" && result.summary.total_in_category > 0 && (
          <details className="home-filter-summary">
            <summary>Как прошла проверка условий</summary>
            <p>В выбранных городе и категории: {result.summary.total_in_category}. Подходят по всем условиям: {result.summary.eligible}.</p>
            {excluded && Object.values(excluded).some((count) => count > 0) && (
              <ul>
                {(Object.keys(EXCLUSION_LABELS) as Array<keyof typeof EXCLUSION_LABELS>).filter((key) => excluded[key] > 0).map((key) => (
                  <li key={key}>{excluded[key]} — {EXCLUSION_LABELS[key]}.</li>
                ))}
              </ul>
            )}
            {excluded && Object.values(excluded).some((count) => count > 0) && <p>У одного подрядчика может быть несколько причин исключения.</p>}
          </details>
        )}

        {result && result.matches.length > 0 && (
          <div className="home-result-grid">
            {result.matches.map(({ contractor, explanation }) => (
              <article key={contractor.id} className={`home-result-card${selectedProfile?.contractor.id === contractor.id ? " home-result-card--selected" : ""}`}>
                <div className="home-contractor-badges">
                  {contractor.synthetic && <span className="home-synthetic-badge">Синтетическая запись</span>}
                  <span className="home-city-badge">{contractor.city}</span>
                </div>
                <h3>{contractor.anon_name}</h3>
                <p className="home-contractor-category">{contractor.categories.join(" · ")}</p>
                <p className="home-contractor-price">от {priceFormatter.format(contractor.price_from_kzt)} ₸</p>
                {contractor.price_from_kzt > searchBudget && (
                  <p className="home-budget-note">Выше бюджета на {priceFormatter.format(contractor.price_from_kzt - searchBudget)} ₸, в пределах допуска 10%.</p>
                )}
                {(contractor.price_imputed || contractor.city_imputed) && (
                  <p className="home-imputed-note">
                    {contractor.price_imputed && contractor.city_imputed ? "Цена и город заполнены при подготовке датасета." : contractor.price_imputed ? "Цена заполнена при подготовке датасета." : "Город заполнен при подготовке датасета."}
                  </p>
                )}
                <div className="home-explanation">
                  <p className="home-explanation-label">{result.explanation_source === "openai" ? "Объяснение ИИ" : "По данным каталога"}</p>
                  <p>{explanation}</p>
                </div>
                <button
                  className="home-card-details-button"
                  type="button"
                  aria-label={`Подробнее о подрядчике ${contractor.anon_name}`}
                  aria-expanded={selectedProfile?.contractor.id === contractor.id}
                  aria-controls={selectedProfile?.contractor.id === contractor.id ? profileId : undefined}
                  onClick={(event) => openProfile({
                    contractor,
                    source: "catalog",
                    date: searchDate,
                    explanation,
                    explanationSource: result.explanation_source,
                  }, event.currentTarget)}
                >
                  Подробнее о подрядчике <span aria-hidden="true">↓</span>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedProfile && <ContractorDetails selection={selectedProfile} onBack={backToCard} targetId={profileId} />}
    </main>
  );
}

export default HomeScreen;
