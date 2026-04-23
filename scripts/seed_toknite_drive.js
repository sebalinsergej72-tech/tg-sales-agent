import fs from "node:fs";
import path from "node:path";

const DEFAULT_SOURCE = "/Users/nikolay/Documents/toknite/src/App.tsx";
const DEFAULT_METADATA = "/Users/nikolay/Documents/toknite/metadata.json";
const DEFAULT_API_BASE = "https://tg-sales-agent-production.up.railway.app";
const DEFAULT_BUSINESS_NAME = "TalkNight Drive";

function extractArray(source, name) {
  const match = source.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`));
  if (!match) {
    throw new Error(`Could not extract ${name} from source`);
  }
  return Function(`"use strict"; return (${match[1]});`)();
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function minPrice(items) {
  return Math.min(
    ...items.map((item) => Number.parseInt(String(item.priceDay).replace(/\s/g, ""), 10)).filter(Number.isFinite)
  );
}

function extractTelegramUrl(source) {
  const match = source.match(/const TELEGRAM_URL = "([^"]+)"/);
  return match?.[1] || "";
}

function buildCatalog(cars, bikes) {
  const carMin = minPrice(cars);
  const bikeMin = minPrice(bikes);

  const primary = [
    {
      name: "Аренда авто под такси",
      price: `от ${carMin} ₽ / день`,
      description:
        "Автомобили для тарифов Эконом, Комфорт и Комфорт+. Есть варианты с выкупом, без депозита и с оформлением 24/7."
    },
    {
      name: "Аренда электробайков для доставки",
      price: `от ${bikeMin} ₽ / сутки`,
      description:
        "Электробайки для курьеров и доставки. Есть модели с выкупом, без депозита, с ТО и разными условиями по аккумуляторам и страховке."
    }
  ];

  const carEntries = cars.map((car) => ({
    name: `${car.name} (${car.class})`,
    price: `${car.priceDay} ₽ / день`,
    description: `${car.specs}. ${car.park}, ${car.location}. ${car.conditions}. График аренды: ${car.schedule}.${car.buyout ? " Есть выкуп." : ""}`
  }));

  const bikeEntries = bikes.map((bike) => ({
    name: `${bike.name} (${bike.class})`,
    price: `${bike.priceDay} ₽ / сутки`,
    description: `${bike.specs}. ${bike.park}, ${bike.location}. ${bike.conditions}. Режим: ${bike.schedule}.${bike.buyout ? " Есть выкуп." : ""}`
  }));

  return [...primary, ...carEntries, ...bikeEntries];
}

function buildFaq(cars, bikes, metadata, telegramUrl) {
  const parks = unique([...cars, ...bikes].map((item) => `${item.park}: ${item.location}`));
  const buyoutCars = cars.filter((item) => item.buyout).map((item) => item.name);
  const buyoutBikes = bikes.filter((item) => item.buyout).map((item) => item.name);
  const carMin = minPrice(cars);
  const carMax = Math.max(...cars.map((item) => Number.parseInt(String(item.priceDay).replace(/\s/g, ""), 10)));
  const bikeMin = minPrice(bikes);
  const bikeMax = Math.max(...bikes.map((item) => Number.parseInt(String(item.priceDay).replace(/\s/g, ""), 10)));

  return [
    {
      q: "Чем занимается TalkNight Drive?",
      a: `${metadata.name} — сервис аренды автомобилей и электровелосипедов для таксистов и курьеров. Можно подобрать транспорт под такси или доставку и оставить заявку в Telegram.`
    },
    {
      q: "Какие машины есть под такси?",
      a: `В автопарке есть Эконом, Комфорт и Комфорт+: например Lada Granta, Kia Rio, Hyundai Solaris, VW Polo, Changan Alsvin, Haval Jolion, Omoda S5, Chery Tiggo 4 Pro, Belgee X70, Geely Atlas Pro, Kia K5 и Hyundai Sonata.`
    },
    {
      q: "Какие цены на аренду авто?",
      a: `По текущему проекту цены на авто начинаются от ${carMin} ₽ в день и доходят до ${carMax} ₽ в день. Для большинства машин есть промо-цены на первую неделю.`
    },
    {
      q: "Есть ли электробайки для доставки?",
      a: `Да, есть электробайки под доставку: E-Bike Pro X, City Rider 2024, Courier Max и Eco Commuter. Диапазон цены сейчас от ${bikeMin} ₽ до ${bikeMax} ₽ в сутки.`
    },
    {
      q: "Можно ли взять транспорт без депозита?",
      a: `Да, по большинству предложений для авто и части электробайков есть варианты без депозита. Точные условия зависят от конкретной модели и парка.`
    },
    {
      q: "Есть ли машины или байки с выкупом?",
      a: `Да. Среди автомобилей с выкупом сейчас указаны: ${buyoutCars.join(", ")}. Среди электробайков с выкупом: ${buyoutBikes.join(", ")}.`
    },
    {
      q: "Какая комиссия и условия по паркам?",
      a: `По авто встречаются комиссии 2%-3% с заказа, есть варианты без скрытых платежей, с моментальным выводом и без депозита. По электробайкам условия зависят от модели: бесплатное ТО, запасной аккумулятор, страховка или выкуп через полгода.`
    },
    {
      q: "Где находятся парки и точки выдачи?",
      a: `Сейчас в проекте указаны такие точки в Санкт-Петербурге: ${parks.join("; ")}.`
    },
    {
      q: "Что нужно для аренды автомобиля?",
      a: `Для получения автомобиля обязательное требование — наличие водительского удостоверения. В проекте указано, что проверка занимает не больше 15 минут.`
    },
    {
      q: "Как быстро можно оформить аренду?",
      a: `Оформление заявлено 24/7, а менеджер отвечает в Telegram в течение пары минут.`
    },
    {
      q: "Какие способы оплаты есть?",
      a: `Для предложений в проекте указаны такие способы оплаты: списание с баланса, оплата картой и СБП.`
    },
    {
      q: "Как оставить заявку?",
      a: telegramUrl
        ? `Оставить заявку можно через Telegram: ${telegramUrl}. Также я могу сразу помочь подобрать тип транспорта, парк и удобное время старта.`
        : "Я могу сразу помочь подобрать тип транспорта, парк и удобное время старта, а затем передать заявку менеджеру."
    }
  ];
}

async function loadSource() {
  const sourcePath = process.argv[2] || process.env.TOKNITE_SOURCE || DEFAULT_SOURCE;
  const metadataPath = process.env.TOKNITE_METADATA || DEFAULT_METADATA;
  const source = fs.readFileSync(sourcePath, "utf8");
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const cars = extractArray(source, "CARS");
  const bikes = extractArray(source, "BIKES");
  const telegramUrl = extractTelegramUrl(source);
  return { sourcePath, metadata, cars, bikes, telegramUrl };
}

async function findBusiness(apiBase, targetIdOrName) {
  if (targetIdOrName?.startsWith("biz_")) return { id: targetIdOrName };
  const res = await fetch(`${apiBase}/api/businesses`);
  if (!res.ok) throw new Error(`Failed to fetch businesses: ${res.status}`);
  const data = await res.json();
  const business = (data.businesses || []).find((item) => item.name === targetIdOrName);
  if (!business) throw new Error(`Business not found: ${targetIdOrName}`);
  return business;
}

async function updateBusiness(apiBase, businessId, patch) {
  const res = await fetch(`${apiBase}/api/businesses/${businessId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
  if (!res.ok) {
    throw new Error(`Failed to update business: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

const { metadata, cars, bikes, telegramUrl, sourcePath } = await loadSource();
const apiBase = process.env.TG_SALES_AGENT_API_BASE || DEFAULT_API_BASE;
const target = process.env.BUSINESS_ID || process.env.BUSINESS_NAME || DEFAULT_BUSINESS_NAME;
const business = await findBusiness(apiBase, target);

const patch = {
  name: "TalkNight Drive",
  niche: "fleet_rental",
  tone: "friendly_expert",
  address:
    "Санкт-Петербург. Точки выдачи в парках Прайд, Вектор, Авангард, Сириус и Электро. Подбор конкретной точки зависит от выбранного транспорта.",
  workingHours: "Оформление 24/7. Менеджер отвечает в Telegram в течение пары минут.",
  handoffPolicy:
    "Передавать человеку точные вопросы по наличию конкретной машины или байка, бронированию на дату, оплате, выкупу, жалобам, партнерствам и любым нестандартным условиям.",
  catalog: buildCatalog(cars, bikes),
  faq: buildFaq(cars, bikes, metadata, telegramUrl),
  leadQuestions: [
    "Что вам нужно: авто под такси или электробайк под доставку?",
    "Какой тариф, парк или район вам удобнее?",
    "Когда хотите начать и как с вами лучше связаться?"
  ],
  followUp: { enabled: true, delayMinutes: 60, maxMessages: 1 }
};

const result = await updateBusiness(apiBase, business.id, patch);

console.log(
  JSON.stringify(
    {
      ok: true,
      sourcePath: path.resolve(sourcePath),
      businessId: business.id,
      businessName: result.business.name,
      catalog: result.business.catalog.length,
      faq: result.business.faq.length
    },
    null,
    2
  )
);
