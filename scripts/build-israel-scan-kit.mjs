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

const wb = new ExcelJS.Workbook();
wb.creator = "LED Warehouse";
wb.created = new Date("2026-10-08T16:30:00Z");
wb.title = "Рамка для прохода пачки груза, Израиль";

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
    oddFooter: "LED Warehouse · проход пачки через рамку · Израиль 915–917 МГц · 8 октября 2026 · не юридическое заключение",
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
  cell.alignment = { vertical: "middle" };
  ws.getRow(row).height = 26;
}

function note(ws, row, text, cols) {
  ws.mergeCells(row, 1, row, cols);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { name: "Calibri", size: 11, color: { argb: "FF3F3A34" } };
  cell.alignment = { wrapText: true, vertical: "top" };
}

function paintBody(ws, fromRow) {
  for (let r = fromRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = { ...(cell.font ?? {}), name: "Calibri", size: 11 };
      cell.alignment = { ...(cell.alignment ?? {}), wrapText: true, vertical: "top" };
      cell.border = {
        bottom: { style: "thin", color: { argb: `FF${line}` } },
      };
    });
  }
}

const start = wb.addWorksheet("С чего начать", { properties: { tabColor: { argb: `FF${green}` } } });
base(start);
start.columns = [{ width: 28 }, { width: 92 }];
sectionTitle(start, 1, "Рамка, которая читает пачку на проходе туда и обратно", 2);
note(
  start,
  2,
  "Задача склада: беспроводное чтение сразу многих позиций, когда тележка проходит через дверной проём, и отдельное чтение, когда она возвращается. Штрихкод этого не делает: его подносят к каждой вещи. Для пачки алюминиевых кабинетов нужна UHF-рамка на чипе Impinj E710, четыре антенны и два инфракрасных луча. Работать она может только в полосе Израиля 915–917 МГц и не выше 2 Вт EIRP. Надпись на коробке «0–25 м» и «33 дБм» — это чужая мощность, её в Израиле не включают.",
  2,
);
start.getRow(2).height = 72;
start.getRow(4).values = ["Что покупать", "Зачем это в проходе"];
styleHeader(start.getRow(4));
const startRows = [
  ["Мозг рамки", "CHAFON CF815, 4 антенных порта, Impinj E710, Ethernet. Один ридер на одну дверь. Модуль E710 без корпуса — запасной вариант, не вторая покупка."],
  ["Четыре антенны", "Круговая поляризация, 9 дБи, 860–960 МГц. По две на каждой стойке, на разной высоте. Луч смотрит в проём, не вдоль стеллажа."],
  ["Два луча", "Две пары фотодатчиков по ходу движения. Сначала луч у склада, потом луч у двора — это выход. Обратный порядок — возврат. Одна антенна направление не знает."],
  ["Бирки на металл", "Сначала 20 штук ABS на свои кабинеты P3.9. Если с 1 м читаются при законной мощности, тот же тип клеится на весь парк: кабинет, кейс и бухта кабеля — отдельные бирки."],
  ["Ручной UHF", "Не вместо рамки. Им записывают код в бирку и добивают то, что рамка не увидела, пока машина ещё у двери."],
  ["Штрихкод", "Только для вещи без живой бирки. Пачку через проём он не читает, поэтому в основной комплект не входит."],
];
startRows.forEach((values, index) => {
  const row = start.getRow(5 + index);
  row.values = values;
  row.height = 48;
  const tone = index === 5 ? "F8E4E4" : index < 4 ? "E5F2EA" : "FFF6E4";
  values.forEach((_, column) => fillWrap(row.getCell(column + 1), tone));
});
note(
  start,
  12,
  "Перед оплатой ридера продавцу пишут: «Set the hop table to 915.25, 915.75, 916.25 and 916.75 MHz only. Max 2 W EIRP including the 9 dBi antennas. Send a screenshot. Do not ship a fixed EU 865–868 MHz or a full FCC 902–928 MHz hop.» Ответ «global 860–960» без списка частот — это не настройка под Израиль.",
  2,
);
start.getRow(12).height = 56;

const pass = wb.addWorksheet("Проход тележки", { properties: { tabColor: { argb: `FF${copper}` } } });
base(pass);
pass.columns = [{ width: 28 }, { width: 92 }];
sectionTitle(pass, 1, "Как пачка читается на выходе и на возврате", 2);
note(
  pass,
  2,
  "Беспроводная здесь связь бирки с антенной. Сам ридер стоит на Ethernet в сеть сервера склада. Wi-Fi у металлических ворот пропадает, и пачка уедет без записи.",
  2,
);
pass.getRow(2).height = 36;
pass.getRow(4).values = ["Шаг", "Что происходит"];
styleHeader(pass.getRow(4));
const passRows = [
  ["Проём", "Ширина под тележку около 2 м. Антенны на левой и правой стойке, нижняя примерно на 0,7 м, верхняя на 1,6 м. Так закрывается и один кабинет, и стопка."],
  ["Мощность", "С антенной 9 дБи и кабелем около 2 дБ потерь с ридера можно отдать примерно 26 дБм. Вместе это около 2 Вт EIRP. Полные 33 дБм с той же антенной — уже около 10 Вт, это мимо правила."],
  ["Дальность", "Цель — проём 2 м, не двор. На алюминии при законной мощности бирка на торце читается с 1–3 м, если её плоскость смотрит в проём. Цифра 15–25 м с витрины относится к бумажной бирке и полной американской мощности."],
  ["Направление", "Луч A стоит ближе к складу, луч B ближе к двору. A, потом B — direction out. B, потом A — direction in. Чтение идёт, пока любой луч перекрыт, и ещё 300 мс после."],
  ["Пачка", "Чип умеет сотни бирок в секунду на стенде. Стопка кабинетов металл к металлу так не читается: бирка между двумя алюминиевыми стенками молчит. Бирка клеится на внешний торец, одним и тем же боком в проём."],
  ["Кейс и кабель", "Кейс на 8 кабинетов — своя бирка. Бухта кабеля, которая уходит одной строкой заказа, — одна бирка на бухту. Пятьдесят коротких перемычек внутри мешка рамка поштучно не разберёт."],
  ["Пропуск", "После прохода экран показывает, сколько бирок заказа прочитано. Непрочитанные добивает ручной UHF, пока тележка у двери. Иначе «большое количество» тихо потеряет несколько кабинетов."],
  ["Повтор", "Один проход — один номер сессии. Повтор той же бирки в ту же секунду остаток не удваивает. Возврат через час — новая сессия и direction in."],
];
passRows.forEach((values, index) => {
  const row = pass.getRow(5 + index);
  row.values = values;
  row.height = 48;
  values.forEach((_, column) => fillWrap(row.getCell(column + 1), index % 2 ? paper : sand));
});

const law = wb.addWorksheet("Частоты и мощность", { properties: { tabColor: { argb: "FF2457A6" } } });
base(law);
law.columns = [{ width: 36 }, { width: 28 }, { width: 62 }];
sectionTitle(law, 1, "Полоса Израиля и потолок 2 Вт вместе с антенной", 3);
note(
  law,
  2,
  "GS1 «UHF allocations for RFID»: Израиль 915–917 МГц, 2 Вт EIRP, регламент 27.08.2012, отдельные пределы вне полосы. ITU-R SM.2255 пишет уже: 915–916,8 МГц. Чип E710 физически умеет 860–930 МГц, но заводская прошивка часто прыгает по всей Европе или всей Америке. Перед включением — ответ משרד התקשורת, requests@moc.gov.il, 03-5198282.",
  3,
);
law.getRow(2).height = 56;
law.getRow(4).values = ["Диапазон", "Для этой рамки", "Почему"];
styleHeader(law.getRow(4));
const bands = [
  ["915,25 / 915,75 / 916,25 / 916,75 МГц", "Единственный рабочий набор", "Четыре канала сетки 500 кГц внутри 915–917 МГц. Именно этот список просим зафиксировать в ридере."],
  ["Ниже 915 и выше 917 МГц", "Не включать", "Полный хоп 902–928 МГц задевает обе стороны запрета. Китайский 920–925 тоже выше 917."],
  ["865–868 МГц", "Не полоса Израиля", "Европейская рамка передаёт в другом месте, даже если она «тише»."],
  ["2 Вт EIRP", "Потолок с учётом антенны", "2 Вт — это 33 дБм на выходе антенны, не 33 дБм на разъёме ридера. 9 дБи сверху уже многократно превышают потолок, если ридер крутить на максимум."],
  ["2400–2483,5 МГц, до 100 мВт", "Не рамка для пачки", "Строка 49 правил одобрения 2021 года, ETSI EN 300 328. Это Bluetooth сканера. Пачку в проёме он не читает."],
  ["433,92 МГц и 125 кГц", "Не бирки кабинетов", "Пульты ворот и домофонные ключи. К учёту парка не относятся."],
];
bands.forEach((values, index) => {
  const row = law.getRow(5 + index);
  row.values = values;
  row.height = 44;
  const tone = index === 0 || index === 3 ? "E5F2EA" : index === 4 ? "FFF6E4" : "F8E4E4";
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
customs.columns = [{ width: 42 }, { width: 80 }];
sectionTitle(customs, 1, "Ввоз передатчика рамки в Израиль", 2);
note(
  customs,
  2,
  "НДС в 2026 году — 18%. С 2 июня 2026 личный порог снова 75 USD по цене товара, без доставки (ICL Global). Рамка для услуг проката — коммерческий ввоз, порог к ней не применяем и посылки ради порога не дробим. Выше 500 USD у личной посылки обычно появляется пошлина; ставку по коду товара называет таможня, 12% в калькуляторе — только пример.",
  2,
);
customs.getRow(2).height = 56;
customs.getRow(4).values = ["Тема", "Как считать"];
styleHeader(customs.getRow(4));
const customsRows = [
  ["Радио", "UHF-ридер — передатчик. Посылку могут удержать до проверки Министерства связи. CE и FCC на коробке одобрение не заменяют. Типовое одобрение выдаётся израильскому импортёру."],
  ["Коммерческий ввоз", "Декларация, код товара, НДС 18%. У עוסק מורשה НДС с импорта обычно идёт к зачёту. Ридер и антенна могут попасть в разные коды."],
  ["Вилка", "230 В, 50 Гц, вилка типа H. Блок с AliExpress часто американский или европейский. Нужен переходник или местный блок 100–240 В."],
  ["Срок", "Рамку не ставить в график выезда, пока посылка выпущена, частоты проверены скрином и проход испытан на своих кабинетах."],
];
customsRows.forEach((values, index) => {
  const row = customs.getRow(5 + index);
  row.values = values;
  row.height = 40;
  values.forEach((_, column) => fillWrap(row.getCell(column + 1), index % 2 ? paper : sand));
});
customs.getCell("A11").value = "Цена товара, USD";
customs.getCell("B11").value = 352;
customs.getCell("A12").value = "Доставка, USD";
customs.getCell("B12").value = 40;
customs.getCell("A13").value = "Ставка пошлины, если товар > 500 USD";
customs.getCell("B13").value = 0.12;
customs.getCell("B13").numFmt = "0%";
customs.getCell("A14").value = "Пошлина, USD";
customs.getCell("B14").value = { formula: "IF(B11>500,B11*B13,0)" };
customs.getCell("B14").numFmt = "#,##0.00";
customs.getCell("A15").value = "НДС 18%, если товар > 75 USD";
customs.getCell("B15").value = { formula: "IF(B11>75,(B11+B12+B14)*0.18,0)" };
customs.getCell("B15").numFmt = "#,##0.00";
customs.getCell("A16").value = "Итого по личной шкале, USD";
customs.getCell("B16").value = { formula: "B11+B12+B14+B15" };
customs.getCell("B16").numFmt = "#,##0.00";
["A11", "A12", "A13", "A14", "A15", "A16"].forEach((addr) => {
  customs.getCell(addr).font = { name: "Calibri", bold: true, size: 11 };
});

const compare = wb.addWorksheet("Сравнение", { properties: { tabColor: { argb: `FF${copper}` } } });
base(compare);
compare.columns = [{ width: 28 }, { width: 36 }, { width: 40 }, { width: 42 }, { width: 34 }];
sectionTitle(compare, 1, "Что реально читает пачку в проёме", 5);
note(
  compare,
  2,
  "Сравнение под задачу «много позиций, на расстоянии, туда и обратно». Штрихкод и HF 13,56 МГц эту задачу не закрывают. Ручной UHF читает пачку в руке, но человек всё равно обходит тележку.",
  5,
);
compare.getRow(2).height = 36;
compare.getRow(4).values = ["", "UHF-рамка, 4 антенны и 2 луча", "Ручной UHF 915–917", "Штрихкод Bluetooth", "HF 13,56 МГц"];
styleHeader(compare.getRow(4));
const cmp = [
  ["Пачка на проходе", "Да, если бирки смотрят в проём", "Пачка в луче пистолета, человек ведёт луч", "По одной вещи у сканера", "Касание каждой бирки"],
  ["Обратный проход", "Второй луч меняет направление на in", "Человек выбирает «возврат» в программе", "Тоже руками", "Руками"],
  ["Алюминиевый кабинет", "On-metal бирка на внешнем торце", "Та же бирка, с 1–3 м", "Этикетка на торец, в упор", "На металле молчит"],
  ["Кабель в мешке", "Одна бирка на бухту, не на каждую перемычку", "То же", "Флажок, если бирки нет", "Не подходит"],
  ["Закон Израиля", "Только 915–917 и не выше 2 Вт EIRP", "Та же полоса, антенна пистолета тоже в расчёте", "Bluetooth до 100 мВт, не UHF", "Не рамка"],
  ["Связь со складом", "Программа у двери шлёт пачку событий", "Приложение терминала шлёт пачку", "Код печатается в поле по одному", "Не закладываем"],
  ["Деньги на дверь", "Ридер, 4 антенны, лучи, бирки пробы", "Один терминал не заменяет рамку", "Дёшево и мимо задачи", "Не покупаем"],
];
cmp.forEach((values, index) => {
  const row = compare.getRow(5 + index);
  row.values = values;
  row.height = 40;
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
  { width: 18 },
  { width: 28 },
  { width: 44 },
  { width: 14 },
  { width: 28 },
  { width: 36 },
  { width: 48 },
  { width: 12 },
];
sectionTitle(catalog, 1, "Карточки под рамку, 8 октября 2026", 9);
note(
  catalog,
  2,
  "Зелёное — ставим на дверь. Жёлтое — проба или добивка пропусков. Серое в колонке «шт» ноль — не докупать, это замена, а не добавка. Цена антенны на витрине плавает: в смете она оценка, на карточке проверьте число сами. Остальные цены сняты с витрины в тот день, без доставки и налогов.",
  9,
);
catalog.getRow(2).height = 40;
catalog.getRow(4).values = ["Фото", "Роль в проходе", "Зачем", "Карточка", "USD", "Частота", "Вердикт", "Как ставить", "Шт"];
styleHeader(catalog.getRow(4));

const items = [
  ["cf815.jpg", "Мозг рамки", "4 порта, пачка, Ethernet", "CHAFON CF815, Impinj E710, в карточке USB/RS232/TCP и SDK", 351.78, "Чип 860–930, хоп надо сузить до 915–917", "Берём один", "Порты 1–2 на стойку склада, 3–4 на стойку двора. Мощность около 26 дБм, не 33. Вилка блока может быть не типа H.", "https://www.aliexpress.com/item/2255800904982823.html", 1, "E5F2EA"],
  ["ant9.jpg", "Поле рамки", "Круговая антенна в проём", "9 дБи, 860–960 МГц, круговая поляризация, уличная", 35, "Антенна широкополосная, частоту задаёт ридер", "4 штуки, цену сверить", "Оценка 35 USD за штуку, на карточке цифра другая — берите карточку. Кабель короткий и с потерями, которые вычли в калькуляторе. Луч в проём, не в стеллаж.", "https://www.aliexpress.com/item/4000110617928.html", 4, "E5F2EA"],
  ["abs-tag.jpg", "Бирка кабинета", "Читается на алюминии", "ABS anti-metal, ISO 18000-6C, 860–960, чип U8/U9/H3, лот 20 шт", 16.81, "Бирка широкополосная, на 915 МГц живая", "Сначала один лот", "20 штук на реальные кабинеты при 26 дБм. Если читаются с 1 м торцом в антенну, тот же лот заказывают на парк. Бумажный инлей рядом не клеить.", "https://www.aliexpress.com/item/3256809928444565.html", 1, "FFF6E4"],
  ["handheld299.jpg", "Запись и пропуски", "Добить то, что рамка не увидела", "Android PDA, UHF и штрихкод, 6 дюймов", 299, "Должен запираться на те же 4 канала", "Один, после скрина частот", "Им пишут в EPC код CAB-P39. На двери он список непрочитанных, не основной проход. Если в регионах только EU, FCC и China, не брать.", "https://www.aliexpress.com/item/3256812403093676.html", 1, "FFF6E4"],
  ["niimbot.jpg", "Надпись для человека", "Рядом с биркой читаемый код", "Niimbot M2, термотрансфер, 20–50 мм", 108.18, "Радио нет", "Берём", "На наклейке крупно CAB-P39. Лента и полиэстер, не голая термобумага: в кузове она сереет.", "https://www.aliexpress.com/item/3256807174481455.html", 1, "E5F2EA"],
  ["pcb-tag.jpg", "Вторая проба", "Если ABS отвалится от жары", "PCB anti-metal, 20 шт", 20.58, "860–960 МГц", "Рядом с ABS, не вместо парка", "Один и тот же кабинет, две бирки, законная мощность. Какая стабильнее с 1 м, ту и размножать.", "https://www.aliexpress.com/item/3256806013345138.html", 1, "FFF6E4"],
  ["e710.jpg", "Замена мозга", "Тот же чип без имени CHAFON", "Модуль E710, 4 порта, RS232 и TCP/IP", 290.89, "860–960, полосу задаёт команда", "Не вместе с CF815", "Дешевле и больше возни с корпусом и питанием. Антенн в цену нет. Брать, только если CF815 не подтвердит 4 канала.", "https://www.aliexpress.com/item/3256812395316151.html", 0, "FFF6E4"],
  ["gun.jpg", "Замена ручного", "Пистолет, если PDA мала", "Android UHF gun и 2D", 669.36, "Та же проверка 915–917", "Не вместе с PDA", "Для стеллажа с расстояния. Рамку не заменяет.", "https://www.aliexpress.com/item/3256812528914328.html", 0, "FFF6E4"],
  ["c72.jpg", "Замена ручного", "Именной терминал", "Chainway C72, UHF, Zebra 2D", 818.34, "Регион прошивки выбирается", "Не вместе с PDA", "SDK известнее безымянной PDA. Частоту всё равно фиксировать.", "https://www.aliexpress.com/item/3256811537361703.html", 0, "FFF6E4"],
  ["netum.jpg", "Дыра без бирки", "Одна вещь, если бирка умерла", "NETUM L8BL Pro, Bluetooth 2D", 26.39, "2,4 ГГц, не UHF", "Один запасной", "Пачку в проёме не читает. Нужен, когда бирку сорвали, а груз уже в тележке.", "https://www.aliexpress.com/item/3256807158575890.html", 1, "FFF6E4"],
];

items.forEach((item, index) => {
  const [file, role, why, title, price, freq, verdict, how, url, qty, tone] = item;
  const rowNumber = 5 + index;
  const row = catalog.getRow(rowNumber);
  row.height = 78;
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
    tl: { col: 0.15, row: rowNumber - 1 + 0.12 },
    ext: { width: 96, height: 96 },
    editAs: "oneCell",
  });
});
note(
  catalog,
  16,
  "Две пары фотодатчиков E3F (луч на просвет, NPN, 10–30 В) на AliExpress ищутся по строке «E3F-10DN1 E3F-10L». Отдельной проверенной карточки в этот файл не кладу, чтобы не приписать чужую цену. На дверь нужны две пары: луч у склада и луч у двора. Это не RFID и не отдельное разрешение на 915 МГц.",
  9,
);
catalog.getRow(16).height = 40;

const reject = wb.addWorksheet("Не покупать", { properties: { tabColor: { argb: `FF${red}` } } });
base(reject);
reject.columns = [{ width: 52 }, { width: 16 }, { width: 62 }, { width: 42 }];
sectionTitle(reject, 1, "Что выглядит как рамка и для этой задачи не годится", 4);
reject.getRow(3).values = ["Карточка", "USD", "Почему мимо", "Ссылка"];
styleHeader(reject.getRow(3));
const bad = [
  ["UHF writer, в заголовке 865–868 МГц", 49, "Европейская полоса. Пачку в израильском проёме она не имеет права читать.", "https://www.aliexpress.com/item/3256808492231150.html"],
  ["Антенна 433,92 МГц", 6.33, "Пульт ворот. Бирки кабинетов на этой частоте нет.", "https://www.aliexpress.com/item/3256806984597837.html"],
  ["Клонер 125 кГц", 8.56, "Домофон. К проходу тележки не относится.", "https://www.aliexpress.com/item/3256811990656145.html"],
  ["Мокрый инлей 9662, 100 шт", 15.5, "На картоне живёт, между алюминиевыми кабинетами молчит. Пачка как раз из алюминия.", "https://www.aliexpress.com/item/2251832632624782.html"],
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
  "Туда же любой комплект с одной антенной и обещанием «направление само». Для тележки направление дают два луча. Туда же ридер, который умеет только EU и полный FCC и не принимает список из четырёх каналов. Обещание 950 бирок в секунду и 25 м — стенд, не стопка кабинетов при 2 Вт EIRP.",
  4,
);
reject.getRow(9).height = 48;

const api = wb.addWorksheet("Интеграция API", { properties: { tabColor: { argb: "FF2457A6" } } });
base(api);
api.columns = [{ width: 32 }, { width: 92 }];
sectionTitle(api, 1, "Как проход тележки становится записями склада", 2);
note(
  api,
  2,
  "Сайт GitHub Pages пачку не запишет. Пишет сервер склада: docker compose up или npm run dev, файл data/warehouse.sqlite. Адрес со слэшем на конце.",
  2,
);
api.getRow(2).height = 32;
const apiRows = [
  ["Куда", "POST http://<сервер-склада>:3000/api/v1/integrations/scan/events/"],
  ["Секрет", "Если задан SCAN_WEBHOOK_SECRET, заголовок X-Signature: sha256=<hmac тела>. Секрет включаем до того, как рамка смотрит в сеть."],
  ["Один проход", "Программа у двери собирает уникальные EPC, пока лучи перекрыты, и шлёт одно тело { \"events\": [ ... ] }."],
  ["Событие выхода", '{ "eventId": "pass-20261008T1640-EPC", "source": "gate", "code": "CAB-P39", "direction": "out", "qty": 1, "deviceId": "door-1", "meta": { "externalId": "номер-заказа", "epc": "EPC" } }'],
  ["Возврат", "Тот же набор, direction in, новый eventId с другой минутой прохода. Иначе возврат не вернёт остаток."],
  ["Код", "code — это CAB-P39, не заводской номер чипа. В EPC при записи кладут тот же код. Нет таблицы EPC → код, и сервер отклонит неизвестный code."],
  ["Повтор в проёме", "Один eventId на бирку и на проход. Тележка, которая стоит в луче десять секунд, не списывает кабинет десять раз."],
  ["Заказ mapper", "Рамка заказ не создаёт. Заказ уже лежит после POST /api/v1/integrations/mapper/orders/. Проход только списывает строки с тем же externalId."],
  ["Кто шлёт", "CF815 по TCP отдаёт EPC и номер порта маленькой программе на компьютере у двери. Программа добавляет направление лучей и делает POST. В сам ридер этот API не вшит."],
];
api.getRow(4).values = ["Место", "Как устроено"];
styleHeader(api.getRow(4));
apiRows.forEach((values, index) => {
  const row = api.getRow(5 + index);
  row.values = values;
  row.height = index === 3 ? 52 : 36;
  values.forEach((_, column) => fillWrap(row.getCell(column + 1), index % 2 ? paper : sand));
  row.getCell(1).font = { name: "Calibri", bold: true, size: 11 };
});

const missed = wb.addWorksheet("Что ещё учесть", { properties: { tabColor: { argb: `FF${amber}` } } });
base(missed);
missed.columns = [{ width: 32 }, { width: 92 }];
sectionTitle(missed, 1, "Без этого пачка в проёме читается враньём", 2);
missed.getRow(3).values = ["Тема", "Что сделать"];
styleHeader(missed.getRow(3));
const missedRows = [
  ["Куда клеить", "Внешний торец кабинета, один бок у всего парка. Между двумя кабинетами в стопке бирка мертва. Кейс и кабинет — разные бирки, иначе восемь штук спишутся дважды."],
  ["Бухта", "Одна бирка на бухту, которая является строкой заказа. Короткие перемычки внутри бухты рамка не пересчитает."],
  ["Чужой стеллаж", "Антенны смотрят в проём. Мощность не поднимают «чтобы добивало до машины во дворе»: тогда спишется стеллаж у двери."],
  ["Люди", "Бирка в кармане тоже читается. В расход попадает только EPC, который есть в открытом заказе этого выхода."],
  ["Список пропусков", "После лучей на экране «прочитано 54 из 60». Шесть добивает ручной UHF до отъезда. Без этого большого количества на бумаге не будет."],
  ["Офлайн", "Если сервер моргнул, программа копит события и досылает с теми же eventId."],
  ["Питание", "12 В на ридер и лучи, маленький бесперебойник. Иначе отключение света выглядит как «ничего не вышло»."],
  ["Проба", "20 бирок, 8 кабинетов стопкой, один кейс, одна бухта, проход туда и обратно при 26 дБм. Дальность с картинки к этому тесту отношения не имеет."],
  ["Пароль ридера", "Кто угодно не возвращает американский хоп. Иначе рамка снова передаёт ниже 915 и выше 917 МГц."],
];
missedRows.forEach((values, index) => {
  const row = missed.getRow(4 + index);
  row.values = values;
  row.height = 40;
  values.forEach((_, column) => fillWrap(row.getCell(column + 1), index % 2 ? paper : sand));
  row.getCell(1).font = { name: "Calibri", bold: true, size: 11 };
});

const money = wb.addWorksheet("Смета", { properties: { tabColor: { argb: `FF${green}` } } });
base(money);
money.columns = [{ width: 62 }, { width: 14 }, { width: 12 }, { width: 16 }, { width: 52 }];
sectionTitle(money, 1, "Одна дверь. Вторая дверь — ещё один такой комплект.", 5);
money.getRow(3).values = ["Позиция", "Цена USD", "Штук", "Сумма USD", "Комментарий"];
styleHeader(money.getRow(3));
const buy = [
  ["CHAFON CF815", 351.78, 1, "Модуль E710 за 290.89 вместо него, не вместе"],
  ["Антенна 9 дБи, оценка", 35, 4, "Цену сверить на карточке 4000110617928"],
  ["Две пары лучей E3F, оценка", 20, 2, "Поиск E3F-10DN1 и E3F-10L, карточки в файле нет"],
  ["Проба ABS, лот 20 шт", 16.81, 1, "Парк докупается тем же лотом после прохода"],
  ["Проба PCB, лот 20 шт", 20.58, 1, "Сравнение на одном кабинете"],
  ["Ручной UHF PDA", 299, 1, "Только если продавец зафиксирует 4 канала"],
  ["Niimbot M2", 108.18, 1, "Лента и полиэстер ещё около 30 USD"],
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
const totalRow = 4 + buy.length;
money.getCell(`A${totalRow}`).value = "Дверь, если PDA подтвердят";
money.getCell(`D${totalRow}`).value = { formula: `SUM(D4:D${totalRow - 1})` };
money.getCell(`D${totalRow}`).numFmt = '"$"#,##0.00';
money.getCell(`A${totalRow}`).font = { name: "Calibri", bold: true };
money.getRow(totalRow).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5F2EA" } };
note(
  money,
  totalRow + 2,
  "НДС 18%, пошлина и доставка сверху. Пистолет за 669 USD и Chainway за 818 USD в сумму не входят: это замена PDA. Бирки на весь парк сюда не входят: их число равно числу кабинетов, кейсов и бухт после удачной пробы лота в 20 штук.",
  5,
);

const sources = wb.addWorksheet("Источники", { properties: { tabColor: { argb: "FF666666" } } });
base(sources);
sources.columns = [{ width: 42 }, { width: 90 }];
sectionTitle(sources, 1, "Откуда правила. Цены витрины меняются.", 2);
sources.getRow(3).values = ["Источник", "Зачем он здесь"];
styleHeader(sources.getRow(3));
const sourceRows = [
  ["GS1, UHF allocations for RFID", "https://www.gs1.org/docs/epc/uhf_regulations.pdf — Израиль: 915–917 МГц, 2 Вт EIRP, 27.08.2012."],
  ["ITU-R SM.2255 (2012)", "https://www.itu.int/dms_pub/itu-r/opb/rep/r-rep-sm.2255-2012-pdf-e.pdf — запись уже, 915–916,8 МГц. Поэтому нужен ответ министерства."],
  ["Impinj E710, даташит", "Чип принимает 860–930 МГц. Это не разрешение включить весь диапазон в Израиле."],
  ["תקנות הטלגרף האלחוטי, תשפ\"א-2021, строка 49", "2400–2483,5 МГц, до 100 мВт, ETSI EN 300 328. Это Bluetooth, не рамка."],
  ["ICL Global, 02.06.2026", "https://www.iclglobal.com/news_update/vat-exemption-threshold-for-personal-imports-to-israel-updated/ — личный порог снова 75 USD, НДС 18%."],
  ["משרד התקשורת", "requests@moc.gov.il, 03-5198282. Можно ли включить конкретную модель на четырёх каналах 915–917 МГц при 2 Вт EIRP."],
  ["Карточки AliExpress", "CF815 2255800904982823, антенна 4000110617928, бирки и терминалы — ссылки на листе каталога. Антенна и лучи в смете частично оценка."],
  ["Код склада", "POST /api/v1/integrations/scan/events/ уже принимает пачку events и direction in или out."],
];
sourceRows.forEach((values, index) => {
  const row = sources.getRow(4 + index);
  row.values = values;
  row.height = 36;
  values.forEach((_, column) => fillWrap(row.getCell(column + 1)));
});
note(
  sources,
  13,
  "Файл подбирает рамку под проход пачки. Он не является разрешением Министерства связи на передачу и не заменяет таможенного брокера.",
  2,
);
sources.getRow(13).height = 32;

await mkdir("docs/procurement", { recursive: true });
await wb.xlsx.writeFile(outPath);
console.log(outPath);
