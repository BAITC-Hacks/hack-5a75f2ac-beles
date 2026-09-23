import type { Contractor, MatchResponse } from "../types";

export type MatchRequest = {
  city: string;
  date: string;
  category: string;
  format: string;
  budget: number;
  duration_hours?: number;
  language?: string;
};

const FORMAT_TERMS: Record<string, string[]> = {
  "свадьба": ["свадьб", "свадеб", "церемон", "молодож"],
  "той": ["той", "казах", "националь"],
  "корпоратив": ["корпоратив", "команд", "бизнес", "делов"],
  "конференция": ["конференц", "форум", "делов", "бизнес"],
  "юбилей": ["юбиле", "семейн", "праздн"],
  "день рождения": ["день рождения", "именин", "праздн"],
};

const money = new Intl.NumberFormat("ru-KZ");
const normalize = (value: string) => value.trim().toLocaleLowerCase("ru-KZ");
const includes = (values: string[], value: string) => values.some((item) => normalize(item) === normalize(value));

function relevance(contractor: Contractor, input: MatchRequest): number {
  const text = normalize(contractor.description);
  const terms = FORMAT_TERMS[normalize(input.format)] ?? [normalize(input.format)];
  // Staying within the requested budget outranks the optional 10% tolerance.
  return (contractor.price_from_kzt <= input.budget ? 100 : 0)
    + terms.filter((term) => text.includes(term)).length * 10
    + (input.language && text.includes(normalize(input.language)) ? 5 : 0);
}

export function evaluateCatalog(allContractors: Contractor[], input: MatchRequest) {
  const catalog = allContractors.filter((contractor) =>
    normalize(contractor.city) === normalize(input.city) && includes(contractor.categories, input.category));
  const excluded = { busy: 0, budget: 0, format: 0, language: 0, duration: 0 };
  const eligible = catalog.filter((contractor) => {
    const reasons = {
      busy: contractor.busy_dates.includes(input.date),
      budget: contractor.price_from_kzt > input.budget * 1.1,
      format: !includes(contractor.event_formats, input.format),
      language: Boolean(input.language && !includes(contractor.languages, input.language)),
      duration: input.duration_hours !== undefined && contractor.max_hours !== null && input.duration_hours > contractor.max_hours,
    };
    for (const reason of Object.keys(reasons) as (keyof typeof reasons)[]) {
      if (reasons[reason]) excluded[reason]++;
    }
    return !Object.values(reasons).some(Boolean);
  });

  eligible.sort((left, right) => relevance(right, input) - relevance(left, input)
    || left.price_from_kzt - right.price_from_kzt
    || left.id.localeCompare(right.id, "en"));

  const summary = { total_in_category: catalog.length, eligible: eligible.length, excluded };
  const candidates = eligible.slice(0, 5);
  const selected = candidates.slice(0, 3);
  const reasons = [
    excluded.busy ? `заняты на дату — ${excluded.busy}` : "",
    excluded.budget ? `дороже бюджета с допуском 10% — ${excluded.budget}` : "",
    excluded.format ? `не работают с этим форматом — ${excluded.format}` : "",
    excluded.language ? `не указан нужный язык — ${excluded.language}` : "",
    excluded.duration ? `недостаточная длительность — ${excluded.duration}` : "",
  ].filter(Boolean).join("; ");

  const status: MatchResponse["status"] = !catalog.length ? "no_category" : !eligible.length ? "no_match" : "matched";
  let message = "";
  if (status === "no_category") {
    message = `В локации «${input.city}» нет подрядчиков категории «${input.category}». Выберите другой город или категорию.`;
  } else if (status === "no_match") {
    message = `В этой категории найдено профилей: ${catalog.length}, но ни один не проходит условия. Причины: ${reasons}. Попробуйте другую дату или измените условия поиска.`;
  } else if (eligible.length < 3) {
    message = `Подходящих профилей только ${eligible.length} из ${catalog.length} — показываем все. `
      + (reasons ? `Причины исключения остальных: ${reasons}.` : "В этом городе в выбранной категории больше профилей нет.");
  }
  return { status, message, summary, candidates, selected };
}

function descriptionEvidence(contractor: Contractor, input: MatchRequest): string {
  const text = contractor.description.replace(/\s+/gu, " ").trim();
  const sentences = text.split(/(?<=[.!?])\s+/u).filter((sentence) => sentence.length >= 30);
  const terms = FORMAT_TERMS[normalize(input.format)] ?? [normalize(input.format)];
  const best = sentences.map((sentence, index) => ({
    sentence, index,
    score: terms.filter((term) => normalize(sentence).includes(term)).length * 10 + Math.min(sentence.length, 200) / 200,
  })).sort((a, b) => b.score - a.score || a.index - b.index)[0]?.sentence ?? text;
  if (best.length <= 240) return best.replace(/[.!?]+$/u, "");
  const prefix = best.slice(0, 237);
  return `${prefix.slice(0, prefix.lastIndexOf(" "))}…`;
}

export function localExplanation(contractor: Contractor, input: MatchRequest): string {
  const date = input.date.split("-").reverse().join(".");
  const budget = contractor.price_from_kzt <= input.budget
    ? "в пределах бюджета"
    : `выше бюджета на ${money.format(contractor.price_from_kzt - input.budget)} ₸, в пределах допуска 10%`;
  const language = input.language ? `, язык — ${input.language}` : "";
  const duration = input.duration_hours === undefined ? "" : contractor.max_hours === null
    ? ", работа не привязана к присутствию на площадке"
    : `, длительность ${input.duration_hours} ч при максимуме ${contractor.max_hours} ч`;
  return `На ${date} свободен, берёт формат «${input.format}»; цена от ${money.format(contractor.price_from_kzt)} ₸ — ${budget}${language}${duration}. `
    + `Из описания: «${descriptionEvidence(contractor, input)}».`;
}
