import test from "node:test";
import assert from "node:assert/strict";
import { generateSalesReply, retrieveKnowledge, internals } from "../src/agent.js";

const business = {
  name: "Demo Beauty Studio",
  niche: "cosmetology",
  tone: "friendly_expert",
  address: "Москва, Цветной бульвар",
  workingHours: "10:00-20:00",
  handoffPolicy: "Передавать человеку горячие заявки и медицинские вопросы.",
  catalog: [
    {
      name: "Консультация косметолога",
      price: "1500 ₽",
      description: "30 минут, подбор процедуры."
    }
  ],
  faq: [
    {
      q: "Какая цена консультации?",
      a: "Консультация косметолога стоит 1500 ₽."
    }
  ],
  leadQuestions: ["Какая услуга интересует?", "Когда удобно?", "Как с вами связаться?"]
};

test("retrieves relevant FAQ and catalog items", () => {
  const found = retrieveKnowledge(business, "сколько стоит консультация косметолога?");
  assert.equal(found[0].type, "faq");
  assert.match(found.map((item) => item.body).join(" "), /1500/);
});

test("classifies booking intent", () => {
  assert.equal(internals.classify("Хочу записаться завтра вечером"), "booking");
});

test("extracts a hot lead from a booking message", async () => {
  const result = await generateSalesReply({
    business,
    conversation: { leadDraft: {}, messages: [] },
    text: "Хочу записаться завтра вечером на консультацию, мой телефон +7 999 111-22-33",
    user: { first_name: "Анна", username: "anna_demo" }
  });

  assert.equal(result.shouldCreateLead, true);
  assert.equal(result.shouldHandoff, true);
  assert.equal(result.leadPatch.status, "handoff");
  assert.match(result.leadPatch.fields.contact, /\+7 999/);
  assert.match(result.reply, /администратор/i);
});

test("does not invent a risky medical answer", async () => {
  const result = await generateSalesReply({
    business,
    conversation: { leadDraft: {}, messages: [] },
    text: "У меня противопоказания, какой диагноз и лечение?",
    user: {}
  });

  assert.equal(result.shouldHandoff, true);
  assert.match(result.reply, /специалист|администратор/i);
});

test("does not ask for branch again after it was selected", async () => {
  const clinic = {
    ...business,
    name: "Стоматология Ольга",
    address:
      "Филиалы: Санкт-Петербург, переулок Каховского, 12, БЦ «Пифагор», 2 этаж; Зеленогорск, ул. Привокзальная, д. 3, литер А.",
    leadQuestions: [
      "Какая услуга или проблема вас интересует?",
      "Какой филиал и время вам удобнее?",
      "Как с вами лучше связаться для записи?"
    ]
  };

  const fields = internals.extractLeadFields(
    clinic,
    "Санкт-Петербург, переулок Каховского, 12, БЦ «Пифагор», 2 этаж"
  );
  assert.match(fields.location, /Каховского/);

  const question = internals.nextQuestion(clinic, {
    interest: "Лечение кариеса Filtek",
    location: fields.location
  });
  assert.equal(question, "Какое время записи вам удобно?");

  const result = await generateSalesReply({
    business: clinic,
    conversation: {
      leadDraft: {
        interest: "Лечение кариеса Filtek",
        location: fields.location
      },
      messages: []
    },
    text: "я уже сказал какой филиал",
    user: {}
  });
  assert.doesNotMatch(result.reply, /какой филиал и время/i);
  assert.match(result.reply, /время/i);
});

test("sanitizes AI replies that repeat selected branch", () => {
  const cleaned = internals.sanitizeAiReply("Понял. Какой филиал и время вам удобнее?", {
    leadDraft: {
      location: "Санкт-Петербург, переулок Каховского, 12",
      interest: "Лечение кариеса Filtek"
    }
  });

  assert.doesNotMatch(cleaned, /какой филиал/i);
  assert.match(cleaned, /Какое время записи/i);
});

test("answers implant price concisely in local mode", async () => {
  const clinic = {
    ...business,
    name: "Стоматология Ольга",
    catalog: [
      {
        name: "Имплантация зубов под ключ",
        price: "По плану лечения",
        description: "Клиника выполняет полный цикл: от обследования до протезирования и дальнейшего сопровождения."
      }
    ],
    faq: [
      {
        q: "Какие услуги есть в клинике?",
        a: "Клиника оказывает лечение зубов, протезирование, коронки, виниры и имплантацию."
      },
      {
        q: "Есть ли имплантация?",
        a: "Да. Фиксированной общей цены на странице имплантации не указано, стоимость формируется по плану лечения."
      },
      {
        q: "Какие врачи работают в клинике?",
        a: "В клинике работают стоматологи-терапевты, ортопеды, имплантологи, ортодонты."
      }
    ],
    leadQuestions: [
      "Какая услуга или проблема вас интересует?",
      "Какой филиал и время вам удобнее?",
      "Как с вами лучше связаться для записи?"
    ]
  };

  const result = await generateSalesReply({
    business: clinic,
    conversation: { leadDraft: {}, messages: [] },
    text: "хочу поставить имплант, что по ценам?",
    user: {}
  });

  assert.match(result.reply, /точную стоимость/i);
  assert.match(result.reply, /плану лечения/i);
  assert.doesNotMatch(result.reply, /Какие услуги/i);
  assert.doesNotMatch(result.reply, /Какие врачи/i);
  assert.doesNotMatch(result.reply, /сайт|страниц/i);
  assert.equal((result.reply.match(/\n\n/g) || []).length <= 1, true);
});

test("rewrites website-language into clinic voice", () => {
  const text = internals.speakAsClinic(
    "На сайте указаны филиалы: Санкт-Петербург, адрес 1. По терапевтическому прайсу: чистка 3000 ₽."
  );

  assert.doesNotMatch(text, /сайт|страниц/i);
  assert.match(text, /У нас 2 филиала/i);
  assert.match(text, /По прайсу/i);
});

test("retrieval respects transport category for fleet rental", async () => {
  const fleetBusiness = {
    ...business,
    name: "TalkNight Drive",
    niche: "fleet_rental",
    catalog: [
      {
        name: "Аренда авто под такси",
        price: "от 1500 ₽ / день",
        description: "Автомобили для такси, без депозита, есть выкуп."
      },
      {
        name: "Аренда электробайков для доставки",
        price: "от 300 ₽ / сутки",
        description: "Электробайки для курьеров и доставки, есть варианты с выкупом."
      }
    ],
    faq: [
      {
        q: "Можно ли без депозита?",
        a: "Да, по большинству автомобилей доступны варианты без депозита."
      }
    ],
    leadQuestions: [
      "Что вам нужно: авто под такси или электробайк под доставку?",
      "Какой тариф, парк или район вам удобнее?",
      "Когда хотите начать и как с вами лучше связаться?"
    ]
  };

  const result = await generateSalesReply({
    business: fleetBusiness,
    conversation: { leadDraft: {}, messages: [] },
    text: "Нужна машина под такси без депозита, что есть по цене?",
    user: {}
  });

  assert.match(result.reply, /авто под такси|автомобили/i);
  assert.doesNotMatch(result.reply, /электробайк/i);
});
