import hostOne from "../assets/contractors/host-01.png";
import hostTwo from "../assets/contractors/host-02.png";
import hostThree from "../assets/contractors/host-03.png";
import florist from "../assets/contractors/florist.png";
import photographer from "../assets/contractors/photographer.png";
import musician from "../assets/contractors/musician.png";
import venue from "../assets/event-atmosphere.png";

const hosts = [hostOne, hostTwo, hostThree];
const featuredHosts: Record<string, number> = {
  "HK-44733": 0,
  "HK-88430": 2,
  "HK-44923": 1,
};
const venues = new Set(["Банкетный зал", "Загородная площадка", "Ресторан", "Отель"]);
const performers = new Set(["Инструменталист", "Лайв-бэнд", "Национальный ансамбль", "Танцевальный коллектив", "Шоу-программа"]);
const visualServices = new Set(["Фотограф", "Видеограф", "Фото и видеобудки"]);

// These reusable fictional illustrations depict a profession, not the contractor's identity.
export function getContractorImage(contractor: { id: string; categories: string[] }) {
  if (contractor.categories.some((category) => venues.has(category))) {
    return { src: venue, alt: "ИИ-иллюстрация: светлая площадка для события", position: "center 55%" };
  }
  if (contractor.categories.some((category) => category === "Ведущий" || category === "Ведущий церемонии")) {
    const stableIndex = Array.from(contractor.id).reduce((sum, character) => sum + character.charCodeAt(0), 0) % hosts.length;
    return { src: hosts[featuredHosts[contractor.id] ?? stableIndex], alt: "ИИ-иллюстрация: образ ведущего мероприятий", position: "center 35%" };
  }
  if (contractor.categories.some((category) => visualServices.has(category))) {
    return { src: photographer, alt: "ИИ-иллюстрация: специалист по съёмке мероприятий", position: "center 35%" };
  }
  if (contractor.categories.some((category) => performers.has(category))) {
    return { src: musician, alt: "ИИ-иллюстрация: образ артиста", position: "center 35%" };
  }
  return { src: florist, alt: "ИИ-иллюстрация: специалист по оформлению событий", position: "center 35%" };
}
