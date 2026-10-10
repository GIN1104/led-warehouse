import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";

const imagesDir = process.argv[2] ?? "/tmp/scan-jpg";
const outPath = process.argv[3] ?? "docs/procurement/israel-scan-kit.xlsx";

const ink = "1C1915";
const sand = "F6F1E8";
const paper = "FFFCF7";
const copper = "C4622D";
const green = "1F7A4D";
const amber = "8A5A00";
const red = "9B2C2C";
const line = "E4D9C8";
const later = "E7EEF8";

const wb = new ExcelJS.Workbook();
wb.creator = "LED Warehouse";
wb.created = new Date("2026-10-08T17:30:00Z");
wb.title = "Рамка на проём 2 м, бирка на каждый кубик, Израиль";

function styleHeader(row) {
  row.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${ink}` } };
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 28;
}

function base(ws) {
  ws.views = [{ state: "frozen", ySplit: 1, rightToLeft: false }];
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  ws.pageSetup.horizontalCentered = true;
  ws.headerFooter = {
    oddFooter: "LED Warehouse · проём 2 м · бирка на кубик · 500–1000 кейсов · Израиль 915–917 МГц · сверка с GitHub 10 октября 2026 · не юридическое заключение",
  };
  ws.properties.defaultRowHeight = 18;
}

function fillWrap(cell, argb) {
  cell.alignment = { vertical: "top", wrapText: true };
  if (argb) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${argb}` } };
}

function sectionTitle(ws, row, text, cols) {
  ws.mergeCells(row, 1, row, cols);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { name: "Calibri", bold: true, size: 16, color: { argb: `FF${ink}` } };
  cell.alignment = { vertical: "middle", wrapText: true };
  ws.getRow(row).height = 28;
}

function note(ws, row, text, cols) {
  ws.mergeCells(row, 1, row, cols);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { name: "Calibri", size: 11, color: { argb: "FF3F3A34" } };
  cell.alignment = { wrapText: true, vertical: "top" };
}

function writePairs(ws, startRow, pairs, toneFor) {
  pairs.forEach((values, index) => {
    const row = ws.getRow(startRow + index);
    row.values = values;
    row.height = 48;
    const tone = toneFor(index);
    values.forEach((_, column) => fillWrap(row.getCell(column + 1), tone));
    row.getCell(1).font = { name: "Calibri", bold: true, size: 11 };
  });
}

const start = wb.addWorksheet("С чего начать", { properties: { tabColor: { argb: `FF${green}` } } });
base(start);
start.columns = [{ width: 28 }, { width: 100 }];
sectionTitle(start, 1, "Одна дверь 2 м сейчас. Бирка на каждом кубике. Кабели и двери 2–3 позже", 2);
note(
  start,
  2,
  "Кейс на 6–8 алюминиевых кубиков проходит через проём около 2 м и должен вернуться обратно. Считать кубики штрихкодом на ходу нельзя. Рамка: ридер Impinj E710 на четыре антенны, два инфракрасных луча, полоса Израиля 915–917 МГц, потолок 2 Вт EIRP. Ридер стоит рядом с компьютером склада. На этом же компьютере уже крутится учёт, и здесь же живёт короткая программа-мост.",
  2,
);
start.getRow(2).height = 62;
start.getRow(4).values = ["Что зафиксировали", "Как из этого собран комплект"];
styleHeader(start.getRow(4));
writePairs(
  start,
  5,
  [
    ["Проём и двери", "Ширина около 2 м. Сейчас одна дверь. Двери 2 и 3 потом копируют ридер, четыре антенны и два луча. Компьютер и адрес склада остаются те же, у каждой двери свой deviceId."],
    ["Каждый кубик", "Бирка клеится на внешний торец каждого кабинета, одним и тем же боком в проём. Кейс человек подписывает маркером. Радиобирку на кейс клеим только если закрытый алюминий глушит кубики, и код у неё CASE-FC, не код кубика."],
    ["500–1000 кейсов", "6–8 кубиков в кейсе и запас 10% дают 3 300–8 800 бирок. Сначала лот 20 штук и проба. Парк заказываем тем типом, который прошёл пробу. Мелкие кабели в первой волне без бирок: ссылки и цены уже лежат в каталоге, количество ноль."],
    ["Рядом с компьютером", "Первая дверь — короткий Ethernet или USB в этот компьютер. Так программа одна и та же, когда появятся двери 2 и 3 по Ethernet. Wi-Fi у металлических створок не используем."],
    ["Ввозим сами", "Оплата ридера после двух вещей от продавца: скрин четырёх частот 915,25 / 915,75 / 916,25 / 916,75 МГц и архив SDK с примером чтения. Включаем передатчик после письма в Министерство связи. Пассивные бирки и антенны передатчиками не являются."],
  ],
  () => sand,
);
note(
  start,
  11,
  "Главная проба, до заказа тысяч бирок. Восемь бирок на внешние торцы, открытый кейс через проём при 26 дБм: цель 8 из 8. Затем тот же кейс закрыть и пронести ещё раз. Если закрытый алюминий ответил меньше чем восемью, кубики читаем на столе, пока кейс открыт, а дверь только подтверждает, что кейс выехал. Обещать чтение кубиков внутри закрытого кейса нельзя: алюминий для UHF как клетка.",
  2,
);
start.getRow(11).height = 68;
start.getRow(13).values = ["Что покупать сейчас", "Зачем"];
styleHeader(start.getRow(13));
writePairs(
  start,
  14,
  [
    ["Мозг рамки", "CHAFON CF815, 4 порта, Impinj E710, USB, RS232, TCP и GPIO. Один на первую дверь. Официальный лист частот у этой модели — США 902–928 или Европа 865–868, поэтому без скрина четырёх израильских каналов не оплачиваем."],
    ["Четыре антенны", "Круговая поляризация, 9 дБи, 860–960 МГц. По две на каждой стойке проёма 2 м, примерно 0,7 м и 1,6 м. Луч смотрит в проём."],
    ["Два луча", "Две пары фотодатчиков по ходу. Сначала луч у склада, потом луч у двора — выход. Обратный порядок — возврат. На странице CF815 есть GPIO, распиновку берём из инструкции SDK."],
    ["Проба бирок", "Один лот ABS на металл, 20 штук, и рядом лот PCB, 20 штук. Победитель пробы на открытом и закрытом кейсе идёт на парк 3 300–8 800 штук."],
    ["Запись бирок", "Тот же CF815 на столе у компьютера пишет код в бирку, пока она ещё не наклеена. Ручной UHF нужен у двери, чтобы добить пропуск, и только если продавец запер те же четыре канала."],
    ["Кабели позже", "Три карточки хомутов UHF уже с ценой и ссылкой. В корзину первой волны их не кладём."],
  ],
  (index) => (index === 5 ? later : "E5F2EA"),
);
note(
  start,
  21,
  "Текст продавцу до оплаты: «Set the hop table to 915.25, 915.75, 916.25 and 916.75 MHz only. Max conducted power 26 dBm with 9 dBi antennas, so EIRP stays at 2 W. Send a screenshot of that screen and the SDK archive with a read example (C# or Java). Do not ship a fixed EU 865–868 MHz unit or a full FCC 902–928 MHz hop.» Ответ «global 860–960» без скрина — это не настройка.",
  2,
);
start.getRow(21).height = 64;

const live = wb.addWorksheet("Что на GitHub", { properties: { tabColor: { argb: "FF2457A6" } } });
base(live);
live.columns = [{ width: 32 }, { width: 100 }];
sectionTitle(live, 1, "Что уже залито на GitHub, сверка 10 октября 2026", 2);
note(
  live,
  2,
  "Сайт публикуется только из ветки main. Этот файл сметы в main не влит: он лежит в черновике запроса №3, ветка cursor/israel-scan-kit-cc23. Календарь Google на сайте есть с 9 октября 2026. Приём прохода рамки на сайте нет: для него нужен компьютер склада с сервером.",
  2,
);
live.getRow(2).height = 52;
live.getRow(4).values = ["Куда залито", "Что там сейчас"];
styleHeader(live.getRow(4));
writePairs(
  live,
  5,
  [
    ["Сайт склада", "https://gin1104.github.io/led-warehouse/ — номенклатура, остатки, заказы, меню, русский, английский и иврит. У каждого браузера своя копия в IndexedDB. Общий файл склада этот адрес не хранит."],
    ["Календарь", "https://gin1104.github.io/led-warehouse/calendar/ — месяц, заказы склада и кнопка «Подключить Google». Аккаунт проекта ledvision2026.il@gmail.com. Это занятость экранов, не чтение бирок в проёме."],
    ["Публикация", "Последняя успешная выкладка Pages — 9 октября 2026, после вливания календаря в main. Ветка сметы на Pages не публикуется."],
    ["Сервер склада", "Код приёма рамки уже в main: POST /api/v1/integrations/scan/events/ и POST /api/v1/integrations/mapper/orders/. Он оживает на компьютере у двери: npm run dev или docker compose, файл data/warehouse.sqlite."],
    ["Этот Excel", "Скачивание: https://github.com/GIN1104/led-warehouse/raw/cursor/israel-scan-kit-cc23/docs/procurement/israel-scan-kit.xlsx. Запрос: https://github.com/GIN1104/led-warehouse/pull/3. На сайт склада файл не выложен."],
  ],
  (index) => (index === 4 ? "FFF6E4" : index % 2 ? paper : sand),
);

const pass = wb.addWorksheet("Проход кейса", { properties: { tabColor: { argb: `FF${copper}` } } });
base(pass);
pass.columns = [{ width: 28 }, { width: 100 }];
sectionTitle(pass, 1, "Как 6–8 кубиков проходят проём 2 м и возвращаются", 2);
note(
  pass,
  2,
  "Беспроводная здесь связь бирки с антенной. Ридер стоит в метре от компьютера склада и связан с ним коротким Ethernet или USB. Учёт на этом компьютере принимает пачку событий.",
  2,
);
pass.getRow(2).height = 36;
pass.getRow(4).values = ["Шаг", "Что происходит"];
styleHeader(pass.getRow(4));
writePairs(
  pass,
  5,
  [
    ["Проём 2 м", "Левая и правая стойка, нижняя антенна около 0,7 м, верхняя около 1,6 м. Так луч видит и один кубик, и стопку высотой с кейс. Вдоль стеллажа антенны не смотрят."],
    ["Мощность", "Антенна 9 дБи и кабель около 2 дБ потерь: с разъёма ридера около 26 дБм. Вместе это около 2 Вт EIRP. Полные 33 дБм с той же антенной — около 10 Вт, мимо правила Израиля."],
    ["Открытый кейс", "Бирка на внешнем торце кубика, плоскостью в проём, читается с 1–3 м при законной мощности, если торец не спрятан между двумя алюминиевыми стенками. Цель пробы: 8 из 8."],
    ["Закрытый кейс", "Шесть–восемь кубиков внутри закрытого алюминиевого кейса рамка может не увидеть вообще. Это не поломка ридера. Проба одна: закрыть кейс и пронести. Число ответивших бирок записываем. Если меньше восьми, дверь кубики внутри кейса не обещает."],
    ["Если кейс глушит", "Кубики читаем на столе упаковки, пока крышка открыта: каждое событие — артикул кубика и qty 1. Дверь потом шлёт одну бирку кейса с кодом CASE-FC, если кейс есть отдельной строкой заказа. Те же кубики дверь второй раз не шлёт."],
    ["Направление", "Луч A ближе к складу, луч B ближе к двору. A, потом B — direction out. B, потом A — direction in. Чтение идёт, пока любой луч перекрыт, и ещё 300 мс после."],
    ["Кабели", "Мелкие кабели в первой волне идут без бирок, по накладной. Когда дойдём до хомутов, одна бирка на кабель, который является строкой склада, не на каждый короткий хвост в мешке. Клубок из десятков хвостов дверь поштучно не разберёт."],
    ["Пропуск и возврат", "Экран у двери: сколько бирок этого выхода прочитано. Непрочитанные добивает ручной UHF, пока кейс ещё у двери. Один проход — одна сессия. Возврат через час — новая сессия и direction in."],
  ],
  (index) => (index === 3 || index === 4 ? "FFF6E4" : index % 2 ? paper : sand),
);

const law = wb.addWorksheet("Частоты и мощность", { properties: { tabColor: { argb: "FF2457A6" } } });
base(law);
law.columns = [{ width: 40 }, { width: 30 }, { width: 64 }];
sectionTitle(law, 1, "Полоса Израиля и потолок 2 Вт вместе с антенной", 3);
note(
  law,
  2,
  "GS1 «UHF allocations for RFID»: Израиль 915–917 МГц, 2 Вт EIRP, регламент 27.08.2012. ITU-R SM.2255 пишет уже: 915–916,8 МГц. Чип E710 физически умеет 860–930 МГц. Лист CF815 при этом называет две заводские полосы: США 902–928 МГц и Европа 865–868 МГц. Перед включением — ответ משרד התקשורת, requests@moc.gov.il, 03-5198282.",
  3,
);
law.getRow(2).height = 56;
law.getRow(4).values = ["Диапазон", "Для этой рамки", "Почему"];
styleHeader(law.getRow(4));
const bands = [
  ["915,25 / 915,75 / 916,25 / 916,75 МГц", "Единственный рабочий набор", "Четыре канала сетки 500 кГц внутри 915–917 МГц. Этот список просим зафиксировать и прислать скрином до оплаты."],
  ["902–928 МГц, строка USA в листе CF815", "Так с завода часто и едет", "Полный американский хоп задевает частоты ниже 915 и выше 917. Наклейка FCC разрешение Израиля не заменяет."],
  ["865–868 МГц, строка EU в листе CF815", "Не полоса Израиля", "Европейский экземпляр передаёт в другом месте, даже если он тише."],
  ["920–925 МГц", "Не включать", "Китайская полоса выше 917 МГц."],
  ["2 Вт EIRP", "Потолок с учётом антенны", "2 Вт — это 33 дБм на выходе антенны, не 33 дБм на разъёме. С антенной 9 дБи на разъёме оставляем около 26 дБм."],
  ["2400–2483,5 МГц, до 100 мВт", "Только запасной штрихкод", "Строка 49 правил одобрения 2021 года, ETSI EN 300 328. Пачку в проёме это не читает."],
];
bands.forEach((values, index) => {
  const row = law.getRow(5 + index);
  row.values = values;
  row.height = 44;
  const tone = index === 0 || index === 4 ? "E5F2EA" : "F8E4E4";
  values.forEach((_, column) => fillWrap(row.getCell(column + 1), tone));
});
note(
  law,
  12,
  "Калькулятор ниже. Меняйте три жёлтые клетки. Зелёная сумма не должна быть выше 33 дБм. Это оценка для разговора с продавцом, не измерение лаборатории.",
  3,
);
law.getRow(12).height = 32;
law.getCell("A14").value = "Мощность с разъёма ридера, дБм";
law.getCell("B14").value = 26;
law.getCell("A15").value = "Усиление антенны, дБи";
law.getCell("B15").value = 9;
law.getCell("A16").value = "Потери кабеля, дБ";
law.getCell("B16").value = 2;
law.getCell("A17").value = "EIRP, дБм";
law.getCell("B17").value = { formula: "B14+B15-B16" };
law.getCell("A18").value = "Это выше 2 Вт?";
law.getCell("B18").value = { formula: 'IF(B17>33,"Да, убавить мощность ридера","Нет, в потолке 33 дБм")' };
["A14", "A15", "A16", "A17", "A18"].forEach((addr) => {
  law.getCell(addr).font = { name: "Calibri", bold: true, size: 11 };
});
["B14", "B15", "B16"].forEach((addr) => {
  law.getCell(addr).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF6E4" } };
});
law.getCell("B17").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5F2EA" } };
law.getCell("B18").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5F2EA" } };

const customs = wb.addWorksheet("Растаможка", { properties: { tabColor: { argb: "FF8A5A00" } } });
base(customs);
customs.columns = [{ width: 42 }, { width: 88 }];
sectionTitle(customs, 1, "Ввозим сами. Реалистичный порядок, без обещания, что передатчик выпустят сразу", 2);
note(
  customs,
  2,
  "НДС в 2026 году — 18%. С 2 июня 2026 личный порог снова 75 USD по цене товара, без доставки (ICL Global). Рамка для проката — коммерческий ввоз: порог к ней не применяем и посылки ради порога не дробим. Выше 500 USD у личной посылки обычно появляется пошлина. Ставку по коду товара называет таможня, 12% в калькуляторе — только пример. Типовое одобрение радио выдаётся израильскому импортёру: при самостоятельном завозе этим импортёром становитесь вы.",
  2,
);
customs.getRow(2).height = 68;
customs.getRow(4).values = ["Шаг", "Что делаем сами"];
styleHeader(customs.getRow(4));
writePairs(
  customs,
  5,
  [
    ["1. Скрин до оплаты", "Продавец показывает экран, где хоп стоит только на четырёх каналах 915,25–916,75 МГц, и отдаёт SDK. Экземпляр с заводской полосой USA или EU в корзину не кладём."],
    ["2. Письмо в министерство", "До первого включения: requests@moc.gov.il, 03-5198282. В письме модель, четыре частоты, 2 Вт EIRP с антенной 9 дБи, склад в Израиле. CE и FCC на коробке это письмо не заменяют."],
    ["3. Декларация", "Коммерческий ввоз, код товара, НДС 18%. У עוסק מורשה НДС с импорта обычно идёт к зачёту. Ридер, антенна и бирки могут попасть в разные коды. Брокер называет ставку, калькулятор ниже её не знает."],
    ["4. Что могут задержать", "Задерживают передатчик, то есть ридер и ручной UHF. Пассивные бирки и антенны передатчиками не являются, их обычно выпускают проще. Это наблюдение с рынка, не гарантия таможни."],
    ["5. Розетка", "230 В, 50 Гц, вилка типа H. Блок с AliExpress часто американский или европейский. Нужен переходник или местный блок 100–240 В."],
    ["6. Когда ставить в график", "После выпуска посылки, скрина частот на уже полученном приборе и пробы восьми кубиков в открытом и закрытом кейсе. До этого выезд на рамку не опирается."],
  ],
  (index) => (index % 2 ? paper : sand),
);
customs.getCell("A12").value = "Цена товара одной двери, USD";
customs.getCell("B12").value = { formula: "'Смета'!D13" };
customs.getCell("A13").value = "Доставка, USD, оценка";
customs.getCell("B13").value = 80;
customs.getCell("A14").value = "Ставка пошлины в примере, если товар > 500 USD";
customs.getCell("B14").value = 0.12;
customs.getCell("B14").numFmt = "0%";
customs.getCell("A15").value = "Пошлина по личной шкале, USD";
customs.getCell("B15").value = { formula: "IF(B12>500,B12*B14,0)" };
customs.getCell("B15").numFmt = "#,##0.00";
customs.getCell("A16").value = "НДС 18%, если товар > 75 USD";
customs.getCell("B16").value = { formula: "IF(B12>75,(B12+B13+B15)*0.18,0)" };
customs.getCell("B16").numFmt = "#,##0.00";
customs.getCell("A17").value = "Иллюстрация личной шкалы, USD";
customs.getCell("B17").value = { formula: "B12+B13+B15+B16" };
customs.getCell("B17").numFmt = '"$"#,##0.00';
customs.getCell("B12").numFmt = '"$"#,##0.00';
customs.getCell("B13").numFmt = '"$"#,##0.00';
["A12", "A13", "A14", "A15", "A16", "A17"].forEach((addr) => {
  customs.getCell(addr).font = { name: "Calibri", bold: true, size: 11 };
});
customs.getCell("B13").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF6E4" } };
customs.getCell("B14").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF6E4" } };
note(
  customs,
  19,
  "Жёлтые клетки — доставка и пример ставки. Цена товара подтягивается из сметы одной двери. Комплект двери выше 500 USD, поэтому пример 12% в иллюстрации включается. К коммерческому ввозу эта личная шкала не применяется: её здесь видно, чтобы не спутать с порогом 75 USD.",
  2,
);
customs.getRow(19).height = 48;

const compare = wb.addWorksheet("Сравнение", { properties: { tabColor: { argb: `FF${copper}` } } });
base(compare);
compare.columns = [{ width: 28 }, { width: 38 }, { width: 38 }, { width: 36 }, { width: 32 }];
sectionTitle(compare, 1, "Что читает кубики в проёме 2 м", 5);
note(
  compare,
  2,
  "Сравнение под задачу «каждый кубик, на расстоянии, туда и обратно, кейсы по 6–8 штук». Штрихкод и HF 13,56 МГц эту задачу не закрывают.",
  5,
);
compare.getRow(2).height = 32;
compare.getRow(4).values = ["", "UHF-рамка, 4 антенны и 2 луча", "Ручной UHF 915–917", "Штрихкод Bluetooth", "HF 13,56 МГц"];
styleHeader(compare.getRow(4));
const cmp = [
  ["Кубики на проходе", "Да, если торцы смотрят в проём и кейс открыт. Закрытый кейс — только после пробы", "Человек ведёт луч по торцам", "По одной вещи у сканера", "Касание каждой бирки"],
  ["Обратный проход", "Второй луч ставит direction in", "Человек выбирает «возврат»", "Тоже руками", "Руками"],
  ["Алюминиевый кубик", "On-metal бирка на внешнем торце", "Та же бирка, с 1–3 м", "Этикетка на торец, в упор", "На металле молчит"],
  ["Закрытый кейс", "Может заглушить все 6–8 бирок. Тогда читаем на столе", "Крышку всё равно открывают", "Крышку открывают", "Не читает металл"],
  ["Мелкий кабель", "В первой волне без бирки. Потом хомут на строку склада", "Тот же хомут, когда дойдём", "Флажок, если бирки нет", "Не подходит"],
  ["Закон Израиля", "Только 915–917 и не выше 2 Вт EIRP", "Та же полоса", "Bluetooth до 100 мВт", "Не рамка"],
  ["Связь со складом", "SDK ридера на этом компьютере шлёт пачку JSON", "Приложение терминала шлёт пачку", "По одному коду", "Не закладываем"],
  ["Деньги", "Одна дверь сейчас. Двери 2–3 копируют ридер и антенны", "Один терминал рамку не заменяет", "Дёшево и мимо задачи", "Не покупаем"],
];
cmp.forEach((values, index) => {
  const row = compare.getRow(5 + index);
  row.values = values;
  row.height = 42;
  fillWrap(row.getCell(1), sand);
  fillWrap(row.getCell(2), "E5F2EA");
  fillWrap(row.getCell(3), "FFF6E4");
  fillWrap(row.getCell(4), "F8E4E4");
  fillWrap(row.getCell(5), "F8E4E4");
  row.getCell(1).font = { name: "Calibri", bold: true, size: 11 };
});

const catalog = wb.addWorksheet("Каталог AliExpress", { properties: { tabColor: { argb: `FF${green}` } } });
base(catalog);
catalog.views = [{ state: "frozen", ySplit: 4, rightToLeft: false }];
catalog.columns = [
  { width: 18 },
  { width: 20 },
  { width: 28 },
  { width: 46 },
  { width: 14 },
  { width: 30 },
  { width: 28 },
  { width: 52 },
  { width: 12 },
];
sectionTitle(catalog, 1, "Карточки, 8 октября 2026. Хомуты на кабель — с ценой, количество ноль", 9);
note(
  catalog,
  2,
  "Зелёное ставим на первую дверь. Жёлтое — проба или добивка пропусков. Голубое — кабели позже, в корзину сейчас не кладём. Серое по смыслу «шт = 0» — замена, а не добавка. Цены хомутов сняты с витрины поиска AliExpress в этот день (поле sale). На карточке цифра другая, если купон кончился: рядом указана цена без скидки. Антенна в смете — оценка.",
  9,
);
catalog.getRow(2).height = 48;
catalog.getRow(4).values = ["Фото", "Роль", "Зачем", "Карточка", "USD", "Частота", "Вердикт", "Как ставить", "Шт"];
styleHeader(catalog.getRow(4));

const items = [
  ["cf815.jpg", "Мозг рамки", "4 порта, рядом с компьютером", "CHAFON CF815, Impinj E710, USB/RS232/TCP, GPIO, SDK", 351.78, "Заводской лист: USA 902–928 или EU 865–868. Хоп сужаем", "Берём один после скрина", "Порты на две стойки проёма 2 м. Мощность около 26 дБм. Короткий Ethernet или USB в компьютер склада. Вилка блока может быть не типа H.", "https://www.aliexpress.com/item/2255800904982823.html", 1, "E5F2EA"],
  ["ant9.jpg", "Поле рамки", "Круговая антенна в проём", "9 дБи, 860–960 МГц, круговая поляризация", 35, "Частоту задаёт ридер", "4 штуки, цену сверить", "Оценка 35 USD за штуку. Кабель короткий, потери около 2 дБ уже сидят в калькуляторе. Луч в проём.", "https://www.aliexpress.com/item/4000110617928.html", 4, "E5F2EA"],
  ["abs-tag.jpg", "Проба кубика", "Читается на алюминии", "ABS anti-metal, ISO 18000-6C, 860–960, U8/U9/H3, лот 20 шт", 16.81, "На 915 МГц живая", "Один лот на пробу", "20 штук на реальные кубики. Победителя этой пробы и пробы закрытого кейса заказываем на 3 300–8 800 штук. Бумажный инлей на торец не клеить.", "https://www.aliexpress.com/item/3256809928444565.html", 1, "FFF6E4"],
  ["pcb-tag.jpg", "Вторая проба", "Если ABS отвалится от жары", "PCB anti-metal, 20 шт", 20.58, "860–960 МГц", "Рядом с ABS", "Один кубик, две бирки, законная мощность. Какая стабильнее в открытом и закрытом кейсе, ту и размножать.", "https://www.aliexpress.com/item/3256806013345138.html", 1, "FFF6E4"],
  ["handheld299.jpg", "Пропуски у двери", "Добить то, что рамка не увидела", "Android PDA, UHF и штрихкод", 299, "Те же 4 канала, иначе не брать", "Один, после скрина", "Запись тысяч бирок делаем настольным CF815, не этим терминалом: 3 300–8 800 записей с рук займут много дней. Терминал — список непрочитанных у двери.", "https://www.aliexpress.com/item/3256812403093676.html", 1, "FFF6E4"],
  ["niimbot.jpg", "Надпись для человека", "Рядом с биркой читаемый код", "Niimbot M2, термотрансфер, 20–50 мм", 108.18, "Радио нет", "Берём", "На наклейке крупно артикул, например CAB-P39. Лента и полиэстер, не голая термобумага.", "https://www.aliexpress.com/item/3256807174481455.html", 1, "E5F2EA"],
  ["netum.jpg", "Дыра без бирки", "Одна вещь, если бирку сорвали", "NETUM L8BL Pro, Bluetooth 2D", 26.39, "2,4 ГГц, не UHF", "Один запасной", "Кейс из 6–8 кубиков через проём он не читает.", "https://www.aliexpress.com/item/3256807158575890.html", 1, "FFF6E4"],
  ["cable-nxp.jpg", "Кабель позже", "Хомут с названным чипом", "Хомут UHF, 50 шт, ISO 18000-6C, чип NXP U8/U9/H3/H9/MR6P", 23.66, "860–960 МГц", "Сейчас 0 штук", "Самая низкая цена витрины из трёх: $23.66 за 50, это $0.47 за штуку. Без скидки на той же карточке $45.50. Продаж на витрине 20. Мелкие кабели пока без бирок.", "https://www.aliexpress.com/item/3256810079211017.html", 0, later],
  ["cable-abs.jpg", "Кабель позже", "Многоразовый хомут на металл", "ABS cable tie, anti-metal, 50 шт, UHF", 30.94, "860–960 МГц", "Сейчас 0 штук", "$30.94 за 50, это $0.62 за штуку. Без скидки $34.38. Продаж 109, это самая живая карточка из трёх. Имеет смысл, если разъём кабеля сидит на металле.", "https://www.aliexpress.com/item/3256808948767414.html", 0, later],
  ["cable-disp.jpg", "Кабель позже", "Хомут на жгут кабеля", "Одноразовый хомут 860–960, ISO 18000-6C, 50 шт", 36.8, "860–960 МГц, протокол в заголовке", "Сейчас 0 штук", "$36.80 за 50, это $0.74 за штуку. Без скидки $66.91. Продаж 10. Форма ближе к жгуту, чем к бирке на торец кубика.", "https://www.aliexpress.com/item/3256808098729184.html", 0, later],
  ["e710.jpg", "Замена мозга", "Тот же чип без имени CHAFON", "Модуль E710, 4 порта, RS232 и TCP/IP", 290.89, "860–960, полосу задаёт команда", "Не вместе с CF815", "Дешевле и больше возни с корпусом. SDK у CF815 известнее. Брать, только если CF815 не подтвердит 4 канала.", "https://www.aliexpress.com/item/3256812395316151.html", 0, "FFF6E4"],
  ["gun.jpg", "Замена ручного", "Пистолет, если PDA мала", "Android UHF gun и 2D", 669.36, "Та же проверка 915–917", "Не вместе с PDA", "Рамку не заменяет.", "https://www.aliexpress.com/item/3256812528914328.html", 0, "FFF6E4"],
  ["c72.jpg", "Замена ручного", "Именной терминал", "Chainway C72, UHF, Zebra 2D", 818.34, "Регион прошивки выбирается", "Не вместе с PDA", "SDK известнее безымянной PDA. Частоту всё равно фиксировать.", "https://www.aliexpress.com/item/3256811537361703.html", 0, "FFF6E4"],
];

items.forEach((item, index) => {
  const [file, role, why, title, price, freq, verdict, how, url, qty, tone] = item;
  const rowNumber = 5 + index;
  const row = catalog.getRow(rowNumber);
  row.height = 84;
  row.getCell(2).value = role;
  row.getCell(3).value = why;
  row.getCell(4).value = { text: title, hyperlink: url };
  row.getCell(4).font = { name: "Calibri", size: 11, color: { argb: "FF1D4E89" }, underline: true };
  row.getCell(5).value = price;
  row.getCell(5).numFmt = '"$"#,##0.00';
  row.getCell(6).value = freq;
  row.getCell(7).value = verdict;
  row.getCell(8).value = how;
  row.getCell(9).value = qty;
  for (let column = 2; column <= 9; column++) fillWrap(row.getCell(column), tone);
  const imageId = wb.addImage({ filename: `${imagesDir}/${file}`, extension: "jpeg" });
  catalog.addImage(imageId, {
    tl: { col: 0.15, row: rowNumber - 1 + 0.15 },
    ext: { width: 92, height: 92 },
    editAs: "oneCell",
  });
});
note(
  catalog,
  19,
  "Две пары фотодатчиков E3F (луч на просвет, NPN, 10–30 В) ищутся по строке «E3F-10DN1 E3F-10L». Отдельной проверенной карточки в файл не кладу. На одну дверь — две пары. Опт хомутов вне AliExpress, в корзину не входит: rfidnfccard.com около $0.17 при заказе от 1000, twsetech.com $0.40–0.50 от 500, GoldSupplier $0.19–0.30 от 500. Это чужие витрины, не цена AliExpress.",
  9,
);
catalog.getRow(19).height = 48;

const reject = wb.addWorksheet("Не покупать", { properties: { tabColor: { argb: `FF${red}` } } });
base(reject);
reject.columns = [{ width: 52 }, { width: 16 }, { width: 62 }, { width: 42 }];
sectionTitle(reject, 1, "Что выглядит как рамка и для кубиков в проёме не годится", 4);
reject.getRow(3).values = ["Карточка", "USD", "Почему мимо", "Ссылка"];
styleHeader(reject.getRow(3));
const bad = [
  ["UHF writer, в заголовке 865–868 МГц", 49, "Европейская полоса. В израильском проёме её не включаем.", "https://www.aliexpress.com/item/3256808492231150.html"],
  ["Антенна 433,92 МГц", 6.33, "Пульт ворот. Бирки кубиков на этой частоте нет.", "https://www.aliexpress.com/item/3256806984597837.html"],
  ["Клонер 125 кГц", 8.56, "Домофон. К проходу кейса не относится.", "https://www.aliexpress.com/item/3256811990656145.html"],
  ["Мокрый инлей 9662, 100 шт", 15.5, "На картоне живёт, на алюминиевом торце кубика молчит.", "https://www.aliexpress.com/item/2251832632624782.html"],
];
bad.forEach((values, index) => {
  const row = reject.getRow(4 + index);
  row.values = [values[0], values[1], values[2], { text: "Открыть", hyperlink: values[3] }];
  row.height = 36;
  row.getCell(2).numFmt = '"$"#,##0.00';
  row.getCell(4).font = { name: "Calibri", size: 11, color: { argb: "FF1D4E89" }, underline: true };
  for (let column = 1; column <= 4; column++) fillWrap(row.getCell(column), "F8E4E4");
});
note(
  reject,
  9,
  "Туда же комплект с одной антенной и обещанием, что направление известно само. Направление дают два луча. Туда же ридер, который умеет только EU и полный FCC и не принимает список из четырёх каналов. Обещание 800–1100 бирок в секунду и 0–25 м — стенд даташита CF815, не закрытый кейс при 2 Вт EIRP. Туда же обещание прочитать каждый кубик внутри закрытого алюминиевого кейса без пробы.",
  4,
);
reject.getRow(9).height = 56;

const api = wb.addWorksheet("Интеграция API", { properties: { tabColor: { argb: "FF2457A6" } } });
base(api);
api.columns = [{ width: 34 }, { width: 96 }];
sectionTitle(api, 1, "Удобный API: SDK ридера на этом компьютере и JSON склада", 2);
note(
  api,
  2,
  "Два разных языка, и это нормально. Ридер говорит протоколом CHAFON. Склад говорит JSON. Между ними одна программа на компьютере, который уже стоит рядом с дверью и уже держит базу. В прошивку ридера адрес склада не вшивается. На 10 октября 2026 сайт https://gin1104.github.io/led-warehouse/ показывает учёт в браузере и календарь Google. Пачку прохода туда отправить нельзя: её принимает сервер на этом компьютере, docker compose up или npm run dev, файл data/warehouse.sqlite.",
  2,
);
api.getRow(2).height = 48;
api.getRow(4).values = ["Место", "Как устроено"];
styleHeader(api.getRow(4));
const apiRows = [
  ["SDK, который уже есть", "Страница CF815 пишет: demo, API, sample, инструкция, языки C#, Java (jni и linux), VC, Android. На chafon.com/download лежит архив CF-E710.714.718.71F SDK от 19.09.2025. Просим продавца прислать тот же архив до оплаты. Пример в архиве — это и есть удобный API ридера. Кадр протокола в этот файл не переписываю."],
  ["Почему не Node внутри ридера", "Учёт склада на Node. SDK ридера — на C# и Java. Мост — маленькая программа на C# или Java из примера SDK: она читает EPC и GPIO и делает HTTP POST на http://127.0.0.1:3000. Разбирать двоичный кадр самим нужно только если продавец SDK не отдал."],
  ["Куда шлёт мост", "POST http://127.0.0.1:3000/api/v1/integrations/scan/events/   слэш на конце нужен."],
  ["Секрет", "Если задан SCAN_WEBHOOK_SECRET, заголовок X-Signature: sha256=<hmac тела>. Секрет включаем до того, как к компьютеру есть сеть не только у двери."],
  ["Один проход", "Пока лучи перекрыты, мост собирает уникальные EPC и шлёт одно тело { \"events\": [ ... ] }. Повтор той же бирки в ту же секунду в пачку не дублируется."],
  ["Событие кубика", '{ "eventId": "door-1-20261008T1640-<epc>", "source": "gate", "code": "CAB-P39", "direction": "out", "qty": 1, "deviceId": "door-1", "meta": { "externalId": "номер-заказа", "epc": "<epc>" } }'],
  ["Что значит code", "code — артикул склада, один на все кубики этого типа. Уникальный номер бирки едет в meta.epc. Остаток CAB-P39 уменьшается на 1 за каждый кубик. Отдельной карточки «кубик №441» в базе сейчас нет, и для подсчёта в проёме она не нужна."],
  ["Кейс", "Радиобирка кейса, если она понадобится после пробы закрытого кейса, шлёт code CASE-FC и qty 1. Это другой артикул, не восемь кубиков. Кубики, уже отправленные со стола упаковки, дверь повторно не шлёт."],
  ["Возврат", "Тот же набор, direction in, новый eventId с другой минутой прохода."],
  ["Двери 2 и 3", "Те же поля. deviceId: door-2 и door-3. У каждого ридера свой адрес в Ethernet. Мост один, склад один."],
  ["Заказ mapper", "Рамка заказ не создаёт. Заказ уже лежит после POST /api/v1/integrations/mapper/orders/. Проход списывает строки."],
  ["Запись парка", "Код в бирку пишет настольный CF815 из того же SDK, пачками, пока бирка на столе. 3 300–8 800 записей — это дни работы, их делают по мере сборки кейсов, не в ночь перед первым выездом."],
];
apiRows.forEach((values, index) => {
  const row = api.getRow(5 + index);
  row.values = values;
  row.height = index === 0 || index === 5 ? 64 : 44;
  values.forEach((_, column) => fillWrap(row.getCell(column + 1), index % 2 ? paper : sand));
  row.getCell(1).font = { name: "Calibri", bold: true, size: 11 };
});

const missed = wb.addWorksheet("Что ещё учесть", { properties: { tabColor: { argb: `FF${amber}` } } });
base(missed);
missed.columns = [{ width: 32 }, { width: 98 }];
sectionTitle(missed, 1, "Без этой пробы тысячи бирок сядут мимо задачи", 2);
missed.getRow(3).values = ["Тема", "Что сделать"];
styleHeader(missed.getRow(3));
const missedRows = [
  ["Проба до парка", "8 бирок, открытый кейс, проём 2 м, 26 дБм, проход туда и обратно: цель 8 из 8 и верный in/out. Затем закрыть крышку и повторить. Число, которое ответило из закрытого кейса, решает, читает дверь кубики или их читает стол."],
  ["Куда клеить", "Внешний торец, один бок у всего парка. Между двумя кубиками в стопке бирка мертва. Кейс маркером подписывает человек. Радиобирка кейса с кодом кубика спишет лишний кабинет."],
  ["Сколько бирок", "Жёлтые клетки на листе сметы: кейсы 500–1000, кубики 6–8, запас 10%. Сейчас это 3 300–8 800. Лот 20 штук на AliExpress даёт $0.84 за бирку. Оптовую цену на тысячи штук эта выборка AliExpress не подтвердила, поэтому парк в смете посчитан лотами по 20."],
  ["Дни на запись", "Один терминал в руке на 8 800 бирок — это недели. Пишет настольный ридер у компьютера, пачками. Ручной остаётся на пропуски у двери."],
  ["Кабели", "Первая волна без бирок. Три ссылки и цены лежат в каталоге. Хомут потом вешаем на кабель-строку склада. Мешок коротких хвостов дверь поштучно не обещает и позже."],
  ["Чужой стеллаж", "Антенны смотрят в проём. Мощность не поднимают, чтобы добивало до машины во дворе: тогда спишется стеллаж у двери."],
  ["Люди", "Бирка в кармане тоже читается. В расход попадает EPC, который мост сопоставил с открытым выходом, а не каждая бирка в радиусе."],
  ["Список пропусков", "После лучей на экране «прочитано 6 из 8». Два добивает ручной UHF до отъезда."],
  ["Офлайн", "Если сервер моргнул, мост копит события и досылает с теми же eventId. Повтор eventId остаток не двигает второй раз."],
  ["Питание", "12 В на ридер и лучи, маленький бесперебойник на компьютере и на ридере. Иначе отключение света выглядит как «ничего не вышло»."],
  ["Пароль ридера", "После настройки четырёх каналов пароль меняем. Иначе кто угодно возвращает американский хоп, и рамка снова передаёт ниже 915 и выше 917 МГц."],
  ["Три двери", "Вторая и третья — копия железа, не копия базы. Один компьютер, один POST, три deviceId."],
];
missedRows.forEach((values, index) => {
  const row = missed.getRow(4 + index);
  row.values = values;
  row.height = 44;
  const tone = index === 0 ? "FFF6E4" : index % 2 ? paper : sand;
  values.forEach((_, column) => fillWrap(row.getCell(column + 1), tone));
  row.getCell(1).font = { name: "Calibri", bold: true, size: 11 };
});

const money = wb.addWorksheet("Смета", { properties: { tabColor: { argb: `FF${green}` } } });
base(money);
money.columns = [{ width: 62 }, { width: 16 }, { width: 12 }, { width: 18 }, { width: 62 }];
sectionTitle(money, 1, "Сейчас одна дверь. Парк кубиков, кабели и двери 2–3 посчитаны отдельно", 5);
note(
  money,
  2,
  "Зелёная сумма — то, что покупаем на первую дверь, включая пробу из 20+20 бирок. Янтарные суммы — весь парк кубиков лотами по 20, если проба прошла. Голубое — кабели, количество ноль. Двери 2 и 3 — ещё по одному ридеру и комплекту антенн, когда до них дойдём.",
  5,
);
money.getRow(2).height = 40;
money.getRow(3).values = ["Позиция", "Цена USD", "Штук", "Сумма USD", "Комментарий"];
styleHeader(money.getRow(3));
const buy = [
  ["CHAFON CF815", 351.78, 1, "После скрина частот и архива SDK. Модуль E710 за 290.89 вместо него, не вместе"],
  ["Антенна 9 дБи, оценка", 35, 4, "Цену сверить на карточке 4000110617928"],
  ["Две пары лучей E3F, оценка", 20, 2, "Поиск E3F-10DN1 и E3F-10L, карточки в файле нет"],
  ["Проба ABS, лот 20 шт", 16.81, 1, "Парк докупается этим типом только после пробы закрытого кейса"],
  ["Проба PCB, лот 20 шт", 20.58, 1, "Сравнение на одном кубике"],
  ["Ручной UHF PDA", 299, 1, "Добивка у двери. Запись парка делает настольный CF815"],
  ["Niimbot M2", 108.18, 1, "Лента и полиэстер ещё около 30 USD, в сумму не входят"],
  ["NETUM, запас на сорванную бирку", 26.39, 1, "Не основной проход"],
  ["Переходник на вилку H", 8, 2, "Местный магазин, оценка"],
];
buy.forEach((values, index) => {
  const rowNumber = 4 + index;
  const row = money.getRow(rowNumber);
  row.values = [values[0], values[1], values[2], { formula: `B${rowNumber}*C${rowNumber}` }, values[3]];
  row.getCell(2).numFmt = '"$"#,##0.00';
  row.getCell(4).numFmt = '"$"#,##0.00';
  row.height = 22;
});
money.getCell("A13").value = "Сейчас, одна дверь и проба";
money.getCell("D13").value = { formula: "SUM(D4:D12)" };
money.getCell("D13").numFmt = '"$"#,##0.00';
money.getCell("A13").font = { name: "Calibri", bold: true, size: 12 };
money.getRow(13).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5F2EA" } };

note(money, 15, "Бирки на все кубики. Жёлтые клетки можно менять. В зелёную сумму двери эти деньги не входят.", 5);
money.getRow(15).height = 22;
const inputs = [
  [16, "Кейсов, минимум", 500, "0"],
  [17, "Кейсов, максимум", 1000, "0"],
  [18, "Кубиков в кейсе, минимум", 6, "0"],
  [19, "Кубиков в кейсе, максимум", 8, "0"],
  [20, "Запас на брак и срыв", 0.1, "0%"],
];
inputs.forEach(([rowNumber, label, value, fmt]) => {
  money.getCell(`A${rowNumber}`).value = label;
  money.getCell(`B${rowNumber}`).value = value;
  money.getCell(`B${rowNumber}`).numFmt = fmt;
  money.getCell(`A${rowNumber}`).font = { name: "Calibri", bold: true, size: 11 };
  money.getCell(`B${rowNumber}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF6E4" } };
});
money.getCell("A21").value = "Бирок на кубики, минимум";
money.getCell("B21").value = { formula: "ROUND(B16*B18*(1+B20),0)" };
money.getCell("A22").value = "Бирок на кубики, максимум";
money.getCell("B22").value = { formula: "ROUND(B17*B19*(1+B20),0)" };
money.getCell("A23").value = "Цена одной ABS, если брать лотами по 20";
money.getCell("B23").value = { formula: "16.81/20" };
money.getCell("B23").numFmt = '"$"#,##0.000';
money.getCell("A24").value = "Парк лотами по 20, минимум";
money.getCell("D24").value = { formula: "B21*B23" };
money.getCell("A25").value = "Парк лотами по 20, максимум";
money.getCell("D25").value = { formula: "B22*B23" };
["A21", "A22", "A23", "A24", "A25"].forEach((addr) => {
  money.getCell(addr).font = { name: "Calibri", bold: true, size: 11 };
});
["B21", "B22"].forEach((addr) => {
  money.getCell(addr).numFmt = "#,##0";
  money.getCell(addr).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF6E4" } };
});
["D24", "D25"].forEach((addr) => {
  money.getCell(addr).numFmt = '"$"#,##0.00';
});
money.getRow(24).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF6E4" } };
money.getRow(25).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF6E4" } };
note(
  money,
  27,
  "Оптовая цена на 3 300–8 800 on-metal бирок на AliExpress этой выборкой не подтверждена. Считать парк по $0.08–0.60 с фабрик в файл не стал: такой цены на карточке нет. Пока проба лота 20 не пройдена, тысячи штук не заказываем.",
  5,
);
money.getRow(27).height = 40;

note(money, 29, "Кабельные хомуты. Количество ноль, в сумму двери не входят. Цена — sale со страницы поиска AliExpress 8 октября 2026.", 5);
money.getRow(29).height = 22;
const cables = [
  ["Хомут NXP U8/U9/H3, 50 шт", 23.66, "За штуку около $0.47. Без скидки $45.50. Продаж 20. Карточка 3256810079211017"],
  ["Хомут ABS anti-metal, 50 шт", 30.94, "За штуку около $0.62. Без скидки $34.38. Продаж 109. Карточка 3256808948767414"],
  ["Хомут на жгут, 50 шт, ISO 18000-6C", 36.8, "За штуку около $0.74. Без скидки $66.91. Продаж 10. Карточка 3256808098729184"],
];
cables.forEach((values, index) => {
  const rowNumber = 30 + index;
  const row = money.getRow(rowNumber);
  row.values = [values[0], values[1], 0, { formula: `B${rowNumber}*C${rowNumber}` }, values[2]];
  row.getCell(2).numFmt = '"$"#,##0.00';
  row.getCell(4).numFmt = '"$"#,##0.00';
  row.height = 32;
  for (let column = 1; column <= 5; column++) fillWrap(row.getCell(column), later);
});
money.getCell("A33").value = "Кабели в этой волне";
money.getCell("D33").value = { formula: "SUM(D30:D32)" };
money.getCell("D33").numFmt = '"$"#,##0.00';
money.getCell("A33").font = { name: "Calibri", bold: true, size: 11 };

note(money, 35, "Двери 2 и 3, когда дойдём. Компьютер, ручной считыватель и принтер вторым комплектом не покупаем.", 5);
money.getRow(35).height = 22;
money.getCell("A36").value = "Ещё одна дверь: ридер, 4 антенны, 2 пары лучей";
money.getCell("B36").value = { formula: "B4+B5*4+B6*2" };
money.getCell("C36").value = 2;
money.getCell("D36").value = { formula: "B36*C36" };
money.getCell("E36").value = "Две будущие двери. Антенна и лучи в цене — оценки. Тот же компьютер и тот же POST, deviceId door-2 и door-3.";
money.getCell("B36").numFmt = '"$"#,##0.00';
money.getCell("D36").numFmt = '"$"#,##0.00';
money.getRow(36).height = 36;
for (let column = 1; column <= 5; column++) fillWrap(money.getCell(36, column), sand);
money.getCell("A36").font = { name: "Calibri", bold: true, size: 11 };

note(
  money,
  38,
  "НДС 18%, пошлина и доставка сверху. Это коммерческий ввоз. Калькулятор на листе растаможки берёт зелёную сумму одной двери и показывает личную шкалу только как иллюстрацию. Пистолет за 669 USD и Chainway за 818 USD в суммы не входят.",
  5,
);
money.getRow(38).height = 40;

const sources = wb.addWorksheet("Источники", { properties: { tabColor: { argb: "FF666666" } } });
base(sources);
sources.columns = [{ width: 46 }, { width: 96 }];
sectionTitle(sources, 1, "Откуда правила и цены. Витрина меняется.", 2);
sources.getRow(3).values = ["Источник", "Зачем он здесь"];
styleHeader(sources.getRow(3));
const sourceRows = [
  ["GS1, UHF allocations for RFID", "https://www.gs1.org/docs/epc/uhf_regulations.pdf — Израиль: 915–917 МГц, 2 Вт EIRP, 27.08.2012."],
  ["ITU-R SM.2255 (2012)", "https://www.itu.int/dms_pub/itu-r/opb/rep/r-rep-sm.2255-2012-pdf-e.pdf — запись уже, 915–916,8 МГц. Поэтому нужен ответ министерства."],
  ["CHAFON, страница CF815", "https://www.chafon.com/productinfo/1069648.html — E710, USB, RS232, TCP/IP, GPIO, demo и API на C#, Java, VC, Android."],
  ["CHAFON, загрузка SDK", "https://www.chafon.com/download — архив CF-E710.714.718.71F SDK.rar от 19.09.2025. Его и просим у продавца до оплаты."],
  ["Лист частот CF815", "https://www.henutsen.com/CF815-EN.pdf — в листе полосы USA 902–928 и EU 865–868, мощность 0–33 дБм, дальность 0–25 м. Это не настройка Израиля и не дальность закрытого кейса."],
  ["תקנות הטלגרף האלחוטי, תשפ\"א-2021, строка 49", "2400–2483,5 МГц, до 100 мВт, ETSI EN 300 328. Это Bluetooth запасного сканера."],
  ["ICL Global, 02.06.2026", "https://www.iclglobal.com/news_update/vat-exemption-threshold-for-personal-imports-to-israel-updated/ — личный порог снова 75 USD, НДС 18%."],
  ["משרד התקשורת", "requests@moc.gov.il, 03-5198282. Письмо до включения: модель, четыре канала, 2 Вт EIRP."],
  ["Хомуты, витрина поиска 8 октября 2026", "3256810079211017 sale $23.66 (без скидки $45.50, 20 продаж). 3256808948767414 sale $30.94 (без скидки $34.38, 109 продаж). 3256808098729184 sale $36.80 (без скидки $66.91, 10 продаж)."],
  ["Опт хомутов, не AliExpress", "https://rfidnfccard.com/products/disposable-cable-ties-uhf-rfid-labels-with-alien-h3-chip — $0.17, MOQ 1000. https://www.twsetech.com/products/rfid-card/rfid-tag/uhf-tag/logistic-management-and-inventory-tracking-uhf-seal-passive-zip-tie-rfid-tag-1047.html — $0.40–0.50 от 500. GoldSupplier $0.19–0.30 от 500."],
  ["Код склада на main", "POST /api/v1/integrations/scan/events/ уже в ветке main: пачка events, direction in или out, повтор eventId остаток не двигает. На GitHub Pages этот адрес не отвечает."],
  ["Сайт 10 октября 2026", "https://gin1104.github.io/led-warehouse/ и календарь /calendar/. Выкладка Pages от 9 октября 2026. Файл сметы в main не влит, он в запросе №3."],
];
sourceRows.forEach((values, index) => {
  const row = sources.getRow(4 + index);
  row.values = values;
  row.height = 40;
  values.forEach((_, column) => fillWrap(row.getCell(column + 1)));
});
note(
  sources,
  16,
  "Файл собирает комплект под проём 2 м, бирку на каждый кубик и самостоятельный ввоз. Он не является разрешением Министерства связи на передачу и не заменяет таможенного брокера. Сводка GS1 и ITU не является ответом министерства на вашу модель.",
  2,
);
sources.getRow(16).height = 36;

await mkdir("docs/procurement", { recursive: true });
await wb.xlsx.writeFile(outPath);
console.log(outPath);
