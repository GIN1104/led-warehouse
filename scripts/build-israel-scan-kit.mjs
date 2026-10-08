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
wb.title = "Рамка, бирки и сканер для склада в Израиле";

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
    oddFooter: "LED Warehouse · склад в Израиле · цены AliExpress на 8 октября 2026 · не является юридическим или таможенным заключением",
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
start.columns = [{ width: 28 }, { width: 88 }];
sectionTitle(start, 1, "Что покупать для склада LED в Израиле", 2);
note(
  start,
  2,
  "Короткий вывод на 8 октября 2026. Рамку UHF с AliExpress включать в дверях склада сейчас нельзя: в Израиле пассивный UHF RFID разрешён в узкой полосе 915–917 МГц при мощности до 2 Вт EIRP. Большинство дешёвых рамок прыгают по европейской 865–868 МГц или по американской 902–928 МГц. Обе эти настройки для Израиля не подходят. Склад уже принимает скан по API, поэтому первый комплект — штрихкод, а радиорамка только вторым шагом после фиксации частоты и вопроса в משרד התקשורת.",
  2,
);
start.getRow(2).height = 62;

const startRows = [
  ["Сейчас", "Два беспроводных 2D-сканера Bluetooth, принтер термотрансферных этикеток и флажки на кабели. Это закрывает приход, расход и заказ из mapper. Полоса 2400–2483,5 МГц до 100 мВт по ETSI EN 300 328 есть в списке изъятий Министерства связи. UHF-передатчика в комплекте нет."],
  ["Проба металла", "20 антиметаллических UHF-бирок ABS на реальные алюминиевые кабинеты. Покупать тысячу бирок и рамку до этой пробы не нужно: обычная наклейка на металле молчит."],
  ["Рамка", "Фиксированный считыватель Impinj E710 или R2000 с SDK, в котором таблица частот ставится только на 915–917 МГц, плюс две антенны у двери. Мощность с учётом усиления антенны не выше 2 Вт EIRP. Включать после ответа Министерства связи."],
  ["Не брать", "Считыватели с надписью только 865–868 МГц, полный американский хоп 902–928 МГц, китайский 920–925 МГц, антенны 433 МГц, клонеры ключей 125 кГц и бумажные UHF-инлеи на алюминий."],
];
start.getRow(4).values = ["Шаг", "Решение"];
styleHeader(start.getRow(4));
startRows.forEach((values, index) => {
  const row = start.getRow(5 + index);
  row.values = values;
  row.height = 48;
  const tone = index === 3 ? "F8E4E4" : index === 0 ? "E5F2EA" : "FFF6E4";
  values.forEach((_, column) => fillWrap(row.getCell(column + 1), tone));
});
note(
  start,
  10,
  "Цены ниже сняты с витрины AliExpress 8 октября 2026 в долларах США, без доставки и без израильских налогов. Карточка может смениться. Перед оплатой напишите продавцу: «Lock transmit frequency to 915–917 MHz only, max 2 W EIRP. Do not ship EU 865–868 or full FCC 902–928 hopping.» Если продавец отвечает только «global 860–960», это не настройка под Израиль.",
  2,
);
start.getRow(10).height = 48;

const law = wb.addWorksheet("Частоты Израиля", { properties: { tabColor: { argb: "FF2457A6" } } });
base(law);
law.columns = [{ width: 34 }, { width: 28 }, { width: 62 }];
sectionTitle(law, 1, "Какие частоты можно, а какие для этого склада закрыты", 3);
note(
  law,
  2,
  "Основание по UHF RFID: обзор GS1 «UHF allocations for RFID». Для Израиля там указано 915–917 МГц, 2 Вт EIRP, регламент от 27.08.2012, отдельные пределы побочного излучения. Более ранний отчёт ITU-R SM.2255 пишет ещё уже: 915–916,8 МГц и те же пределы вне полосы. Это отраслевые сводки, не текст приказа. Перед включением передатчика нужен ответ משרד התקשורת (requests@moc.gov.il, 03-5198282).",
  3,
);
law.getRow(2).height = 58;
law.getRow(4).values = ["Диапазон", "Для склада в Израиле", "Почему"];
styleHeader(law.getRow(4));
const bands = [
  ["915–917 МГц, до 2 Вт EIRP", "Единственная полоса UHF RFID", "Пассивные бирки EPC Gen2 / ISO 18000-6C. Мощность считается вместе с антенной: 30 дБм с антенны плюс 8 дБи антенны уже около 6 Вт и выходят за 2 Вт."],
  ["Ниже 915 и выше 917 МГц", "Передача запрещена пределами OoB", "GS1: вне полосы излучение ограничено. Американский хоп 902–928 МГц задевает обе запретные зоны."],
  ["865–868 МГц, европейские 2 Вт ERP", "Не полоса Израиля", "Европейская рамка с AliExpress здесь не «просто тише». Она передаёт в другой полосе."],
  ["920–925 МГц, Китай", "Не полоса Израиля", "Частая заводская настройка модулей R2000. Её нужно сменить до первого включения, если SDK это позволяет."],
  ["2,400–2,483,5 ГГц, Bluetooth и Wi-Fi", "Подходит для сканера и планшета", "В תקנות הטלגרף האלחוטי (אישורי התאמה), תשפ\"א-2021, строка 49: эта полоса до 100 мВт по ETSI EN 300 328. Это путь без UHF-передатчика."],
  ["13,56 МГц, NFC и HF", "Только касание, не рамка двери", "Дальность сантиметры. Для ворот склада не берём."],
  ["433,92 МГц", "Не RFID склада", "Это пульты ворот и брелоки. Карточки «антенна для рамки» на этой частоте к биркам кабинетов не относятся."],
  ["125 кГц", "Не брать", "Клонеры домофонных ключей. К учёту кабинетов отношения не имеют."],
];
bands.forEach((values, index) => {
  const row = law.getRow(5 + index);
  row.values = values;
  row.height = 42;
  const tone = index === 0 || index === 4 ? "E5F2EA" : index === 5 ? "FFF6E4" : "F8E4E4";
  values.forEach((_, column) => fillWrap(row.getCell(column + 1), tone));
});
note(
  law,
  14,
  "Типовое одобрение радио выдаёт Министерство связи израильскому импортёру. Отчёты ETSI или FCC помогают, но сами по себе не разрешают передачу. Наклейка CE или FCC на коробке с AliExpress не заменяет это одобрение. Личный ввоз до 5 штук иногда описывают как упрощённый, но складской комплект для услуг проката — коммерческий ввоз, не личная посылка.",
  3,
);
law.getRow(14).height = 48;

const customs = wb.addWorksheet("Растаможка", { properties: { tabColor: { argb: "FF8A5A00" } } });
base(customs);
customs.columns = [{ width: 42 }, { width: 78 }];
sectionTitle(customs, 1, "Ввоз в Израиль: что закладывать в цену", 2);
note(
  customs,
  2,
  "НДС в 2026 году — 18%. С 2 июня 2026 порог личного ввоза снова 75 долларов США по стоимости товара, без доставки: до 75 USD нет НДС и пошлины; от 75 до 500 USD пошлины нет, НДС 18% на товар и доставку; выше 500 USD добавляется пошлина по коду товара. Источник порога: ICL Global, 02.06.2026. Калькуляторы часто подставляют 12% пошлины как пример. Фактическую ставку называет таможня по ТН ВЭД.",
  2,
);
customs.getRow(2).height = 58;
const customsRows = [
  ["Личный порог 75 USD", "Он для личной или семейной посылки, не для снабжения и не для оказания услуг. Оборудование склада проката под него не подгоняем и посылки ради порога не дробим."],
  ["Коммерческий ввоз", "Декларация, код товара, НДС 18%. У עוסק מורשה НДС с импорта обычно идёт к зачёту. Пошлина зависит от кода: сканер данных и радиопередатчик могут попасть в разные группы."],
  ["Радио", "UHF-считыватель — передатчик. Посылку могут удержать до проверки Министерства связи, даже если сумма маленькая. Bluetooth-сканер без UHF проходит проще."],
  ["Вилка и сеть", "В Израиле 230 В, 50 Гц, вилка типа H (SI 32). Блок считывателя чаще с европейской или американской вилкой. Нужен переходник или местный блок 100–240 В."],
  ["Срок", "AliExpress пишет «бесплатная доставка», таможня и связь добавляют дни. Рамку не ставить в график выезда, пока посылка не выпущена и частота не проверена."],
];
customs.getRow(4).values = ["Тема", "Как считать"];
styleHeader(customs.getRow(4));
customsRows.forEach((values, index) => {
  const row = customs.getRow(5 + index);
  row.values = values;
  row.height = 40;
  values.forEach((_, column) => fillWrap(row.getCell(column + 1), index % 2 ? paper : sand));
});
note(
  customs,
  11,
  "Оценка «как личная посылка» ниже только для понимания шкалы. Для склада её не применяем. Подставьте цену товара и доставку. Если товар дороже 500 USD, в ячейку пошлины поставьте ставку из таможенного тарифа, не оставляйте примерные 12%.",
  2,
);
customs.getRow(11).height = 36;
customs.getCell("A13").value = "Цена товара, USD";
customs.getCell("B13").value = 352;
customs.getCell("A14").value = "Доставка, USD";
customs.getCell("B14").value = 40;
customs.getCell("A15").value = "Ставка пошлины, если товар > 500 USD";
customs.getCell("B15").value = 0.12;
customs.getCell("B15").numFmt = "0%";
customs.getCell("A16").value = "Пошлина, USD";
customs.getCell("B16").value = { formula: 'IF(B13>500,B13*B15,0)' };
customs.getCell("B16").numFmt = '#,##0.00';
customs.getCell("A17").value = "НДС 18%, если товар > 75 USD";
customs.getCell("B17").value = { formula: 'IF(B13>75,(B13+B14+B16)*0.18,0)' };
customs.getCell("B17").numFmt = '#,##0.00';
customs.getCell("A18").value = "Итого с налогом личной шкалы, USD";
customs.getCell("B18").value = { formula: "B13+B14+B16+B17" };
customs.getCell("B18").numFmt = '#,##0.00';
["A13", "A14", "A15", "A16", "A17", "A18"].forEach((addr) => {
  customs.getCell(addr).font = { name: "Calibri", bold: true, size: 11 };
});
customs.getCell("A18").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF6E4" } };
customs.getCell("B18").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF6E4" } };

const compare = wb.addWorksheet("Сравнение", { properties: { tabColor: { argb: `FF${copper}` } } });
base(compare);
compare.columns = [{ width: 28 }, { width: 38 }, { width: 40 }, { width: 40 }, { width: 34 }];
sectionTitle(compare, 1, "Четыре способа читать груз. Для этого склада оставляем два.", 5);
note(
  compare,
  2,
  "Кабинеты алюминиевые, кабели лежат бухтами, в дверном проёме рядом металл кейса и кузов машины. Рамка без дисциплины читает соседний стеллаж. Поэтому сравнение не по дальности из карточки, а по тому, доживёт ли учёт до API склада.",
  5,
);
compare.getRow(2).height = 36;
compare.getRow(4).values = ["", "Штрихкод и QR", "UHF, ручной, 915–917", "UHF-рамка на двери", "HF 13,56 МГц"];
styleHeader(compare.getRow(4));
const cmp = [
  ["Закон в Израиле", "Bluetooth 2,4 ГГц, без UHF", "Полоса есть, мощность и одобрение передатчика отдельно", "То же радио плюс риск превысить 2 Вт антенной", "Не рамка"],
  ["Алюминиевый кабинет", "Полиэстеровая этикетка клеится на торец", "Только on-metal бирка с зазором", "Та же бирка, чтение пачкой", "На металле молчит"],
  ["Кабель powerCON и EtherCON", "Флажок вокруг кабеля", "Бирка на бухте путает количество", "Рамка не отличает кабель в тележке от кабеля на стеллаже", "Не подходит"],
  ["Скорость выхода", "По штуке, человек на двери", "Пачка в руке, 1–3 м", "Тележка целиком, если бирки живые", "Касание каждой бирки"],
  ["Ошибки", "Пропуск, если не поднесли", "Чужой кабинет в луче", "Двойной проход, отражение, нет направления без двух антенн", "Мало"],
  ["Связь со складом", "Сканер печатает код в поле или Android шлёт POST", "Программа на Android пишет EPC и шлёт POST", "Сервис у ридера переводит EPC в код номенклатуры", "Не закладываем"],
  ["Деньги на старт", "около 150–300 USD", "около 300–900 USD плюс бирки", "около 400–800 USD плюс антенны и монтаж", "Не покупаем"],
  ["Когда", "Первый комплект", "После 20 бирок на своих кабинетах", "После стабильного ручного чтения и ответа Министерства связи", "Нет"],
];
cmp.forEach((values, index) => {
  const row = compare.getRow(5 + index);
  row.values = values;
  row.height = 36;
  fillWrap(row.getCell(1), sand);
  fillWrap(row.getCell(2), "E5F2EA");
  fillWrap(row.getCell(3), "FFF6E4");
  fillWrap(row.getCell(4), "FFF6E4");
  fillWrap(row.getCell(5), "F8E4E4");
  row.getCell(1).font = { name: "Calibri", bold: true, size: 11 };
});

const catalog = wb.addWorksheet("Каталог AliExpress", { properties: { tabColor: { argb: `FF${green}` } } });
base(catalog);
catalog.views = [{ state: "frozen", ySplit: 4, rightToLeft: false }];
catalog.columns = [
  { width: 18 },
  { width: 16 },
  { width: 28 },
  { width: 42 },
  { width: 14 },
  { width: 22 },
  { width: 36 },
  { width: 46 },
  { width: 18 },
];
sectionTitle(catalog, 1, "Карточки с AliExpress на 8 октября 2026", 9);
note(
  catalog,
  2,
  "Фото с витрины продавца. Цена — нижняя цена поиска в тот день, без доставки. Ссылка ведёт на карточку. Зелёная строка — можно заказывать как первый комплект. Жёлтая — только после письма продавцу про 915–917 МГц и пробы на металле. В колонке «шт» — стартовый склад на один выездной парк, не на всю страну.",
  9,
);
catalog.getRow(2).height = 36;
catalog.getRow(4).values = ["Фото", "Этап", "Зачем", "Карточка", "USD", "Частота", "Вердикт для Израиля", "Как использовать", "Шт"];
styleHeader(catalog.getRow(4));

const items = [
  ["netum.jpg", "Сейчас", "Сканер на двери и в зоне приёмки", "NETUM L8BLPro, Bluetooth, 2D, QR, PDF417", 26.39, "Bluetooth 2,4 ГГц", "Берём", "Режим клавиатуры: в поле скана склада печатает код CAB-P39 и Enter. Второй такой же держать запасным.", "https://www.aliexpress.com/item/3256807158575890.html", 2, "E5F2EA"],
  ["niimbot.jpg", "Сейчас", "Этикетки, которые не выгорают в кузове", "Niimbot M2, термотрансфер, 300 dpi, ширина 20–50 мм", 108.18, "Нет радио", "Берём", "Печатает код номенклатуры и QR. Термотрансфер с лентой держится лучше прямой термопечати. Сразу заказать ленту и полиэстеровые ролики.", "https://www.aliexpress.com/item/3256807174481455.html", 1, "E5F2EA"],
  ["cable.jpg", "Сейчас", "Бирка на кабель, а не на металл кабинета", "Флажки P-type, самоламинирующиеся, под печать", 4.64, "Нет радио", "Берём", "Один флажок на бухту или на отрезок, который уходит отдельной строкой заказа. Текст: код склада и длина.", "https://www.aliexpress.com/item/3256812153312228.html", 3, "E5F2EA"],
  ["pda.jpg", "Сейчас", "Телефон склада, если своего аппарата жалко", "Android-терминал, Honeywell 2D, 4G, Wi-Fi, IP65", 169, "Wi-Fi и LTE  — проверить диапазоны у продавца", "Берём, если телефон не тянет", "Стоит у двери, шлёт POST на сервер склада. Перед заказом спросить, держит ли LTE полосы Израиля. Иначе хватит сканера и обычного телефона в той же сети.", "https://www.aliexpress.com/item/3256812541944074.html", 1, "E5F2EA"],
  ["printer4x6.jpg", "Запасной принтер", "Широкая этикетка на кейс", "Термопринтер 4×6, 203 dpi, USB или Bluetooth", 66.07, "Нет радио", "Только как дешёвая замена", "Прямая термопечать на солнце и в кузове сереет. На кабинеты лучше M2 с лентой. Этот принтер годится для внутренних бумажных ярлыков.", "https://www.aliexpress.com/item/3256812542748102.html", 0, "FFF6E4"],
  ["abs-tag.jpg", "Проба", "Бирка на алюминиевый кабинет", "ABS anti-metal, ISO 18000-6C, 860–960 МГц, чип U8/U9/H3, 20 шт", 16.81, "Бирка широкополосная, читается и на 915–917", "Сначала 20 штук, не ящик", "Клеить на ровный торец кабинета, не на ребро и не на пучок кабелей. В EPC записать код склада. Бумажный инлей рядом не клеить.", "https://www.aliexpress.com/item/3256809928444565.html", 1, "FFF6E4"],
  ["pcb-tag.jpg", "Проба", "Бирка туда, где жарко или моют", "PCB anti-metal, температура и химия, 20 шт", 20.58, "860–960 МГц, чип под 915 МГц подходит", "Вместе с ABS-пробой", "Сравнить на одном и том же кабинете P3.9: какая читается ручным считывателем с 1 м. Победившую и заказывать пачкой.", "https://www.aliexpress.com/item/3256806013345138.html", 1, "FFF6E4"],
  ["handheld299.jpg", "После пробы", "Ручной UHF плюс штрихкод", "Android 15 PDA, 6 дюймов, UHF и 1D/2D, 4+64 ГБ", 299, "Должен запираться на 915–917 МГц", "Письмо продавцу до оплаты", "Просить скрин настройки региона. Если в списке только EU, FCC и China, не брать. Мощность снизить так, чтобы с антенной вышло не больше 2 Вт EIRP.", "https://www.aliexpress.com/item/3256812403093676.html", 1, "FFF6E4"],
  ["gun.jpg", "После пробы", "Пистолет, если PDA неудобна у кейса", "Android 11, UHF gun, есть 2D-сканер", 669.36, "Та же проверка 915–917", "Дороже, брать одну, не обе", "Имеет смысл, если рукой надо читать стеллаж с расстояния. Для старта избыточна: сначала PDA за 299 USD.", "https://www.aliexpress.com/item/3256812528914328.html", 0, "FFF6E4"],
  ["c72.jpg", "После пробы", "Именной промышленный терминал", "Chainway C72, Android 13, UHF, Zebra 1D/2D, NFC", 818.34, "У Chainway регион прошивки выбирается", "Если продавец подтвердит Израиль", "Дороже безымянных PDA, зато известный SDK. Всё равно не включать, пока частота не зафиксирована.", "https://www.aliexpress.com/item/3256811537361703.html", 0, "FFF6E4"],
  ["cf815.jpg", "Рамка, мозг", "Фиксированный ридер у двери", "CHAFON CF815, Impinj E710, заявлено 15 м, бесплатный SDK", 351.78, "E710 умеет таблицу частот, заводская может быть чужой", "Только с фиксацией 915–917 и двумя антеннами", "Один ридер не знает, груз выходит или заходит. Нужны две антенны: первая увидела со склада — выход. Сервис рядом переводит EPC в код номенклатуры и шлёт API.", "https://www.aliexpress.com/item/2255800904982823.html", 0, "FFF6E4"],
  ["e710.jpg", "Рамка, мозг", "Модуль на 4 антенны", "E710, 4/8/16 портов, RS232 и TCP/IP, в карточке до 20 м", 290.89, "860–960 в модуле, рабочая полоса задаётся командой", "Альтернатива CF815", "Дешевле именем, больше возни с питанием и корпусом. Антенны в эту цену обычно не входят. Усиление антенны закладывать в расчёт 2 Вт.", "https://www.aliexpress.com/item/3256812395316151.html", 0, "FFF6E4"],
];

items.forEach((item, index) => {
  const [file, stage, why, title, price, freq, verdict, how, url, qty, tone] = item;
  const rowNumber = 5 + index;
  const row = catalog.getRow(rowNumber);
  row.height = 78;
  row.getCell(2).value = stage;
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
catalog.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + items.length, column: 9 } };

const reject = wb.addWorksheet("Не покупать", { properties: { tabColor: { argb: `FF${red}` } } });
base(reject);
reject.columns = [{ width: 46 }, { width: 18 }, { width: 62 }, { width: 55 }];
sectionTitle(reject, 1, "Похожие карточки, которые для Израиля не берём", 4);
note(reject, 2, "Они лежат в той же выдаче AliExpress и выглядят дешевле. Частота или назначение другие.", 4);
reject.getRow(4).values = ["Карточка", "USD", "Почему мимо", "Ссылка"];
styleHeader(reject.getRow(4));
const bad = [
  ["Support Android APP UHF writer KL9005HID, в заголовке 865–868 МГц", 49, "Европейская полоса прямо в названии. В Израиле это не рабочая настройка UHF RFID.", "https://www.aliexpress.com/item/3256808492231150.html"],
  ["Антенна 433,92 МГц «для ворот и гаража»", 6.33, "Пульт ворот, не бирка кабинета.", "https://www.aliexpress.com/item/3256806984597837.html"],
  ["Клонер 125 кГц и карты T5577", 8.56, "Домофонные ключи. К учёту парка не относится.", "https://www.aliexpress.com/item/3256811990656145.html"],
  ["Мокрый инлей 9662 Higgs3, 100 шт", 15.5, "На картоне живёт, на алюминиевом кабинете антенна садится и не читается.", "https://www.aliexpress.com/item/2251832632624782.html"],
];
bad.forEach((values, index) => {
  const row = reject.getRow(5 + index);
  row.values = [values[0], values[1], values[2], { text: "Открыть", hyperlink: values[3] }];
  row.height = 36;
  row.getCell(2).numFmt = '"$"#,##0.00';
  row.getCell(4).font = { name: "Calibri", size: 11, color: { argb: "FF1D4E89" }, underline: true };
  values.forEach((_, column) => {
    if (column < 3) fillWrap(row.getCell(column + 1), "F8E4E4");
  });
  fillWrap(row.getCell(4), "F8E4E4");
});
note(
  reject,
  10,
  "Отдельно: любой считыватель с гордой строкой «FCC 902–928, 4 Вт» или «EU 865–868» без пункта «custom frequency 915–917, 2 W EIRP» в эту таблицу не добавлялся как покупка. Полный американский хоп задевает частоты ниже 915 и выше 917 МГц.",
  4,
);
reject.getRow(10).height = 36;

const api = wb.addWorksheet("Интеграция API", { properties: { tabColor: { argb: "FF2457A6" } } });
base(api);
api.columns = [{ width: 32 }, { width: 90 }];
sectionTitle(api, 1, "Как железо попадает в учёт, который уже написан", 2);
note(
  api,
  2,
  "Сайт GitHub Pages скан рамки не запишет: там нет сервера. Пишет компьютер склада: docker compose up или npm run dev, файл data/warehouse.sqlite. Адрес со слэшем в конце, потому что так собран сервер.",
  2,
);
api.getRow(2).height = 36;
const apiRows = [
  ["Куда слать", "POST http://<сервер-склада>:3000/api/v1/integrations/scan/events/"],
  ["Заголовок", "Если задан SCAN_WEBHOOK_SECRET, нужен X-Signature: sha256=<hmac тела запроса>. Без секрета сервер принимает запрос как есть, так что секрет включаем до того, как рамка смотрит в сеть."],
  ["Одно событие", '{ "eventId": "gate-кабинет-время", "source": "gate", "code": "CAB-P39", "direction": "out", "qty": 1, "deviceId": "door-1", "meta": { "externalId": "mapper-42", "epc": "EPC бирки" } }'],
  ["Пачка", "Тело { \"events\": [ ... ] }. Сервер проводит события по очереди."],
  ["Повтор", "Тот же eventId второй раз остаток не удваивает. Для рамки eventId делать из EPC, направления и минуты, иначе одна тележка у двери превратится в десять расходов."],
  ["Код", "Поле code — это код номенклатуры склада, CAB-P39, CBL-SIG, CTL-NOVA. В бирку можно записать тот же текст. Если в бирке только заводской EPC, у двери нужна таблица EPC → код. Неизвестный код сервер отклоняет."],
  ["Выход заказа", "direction out уменьшает остаток. Если в meta есть externalId заказа mapper, строка этого заказа отмечается как вышедшая со склада."],
  ["Направление", "in — приход, out — расход, move — перенос, для него нужны locationId и fromLocationId."],
  ["Кто шлёт", "Bluetooth-сканер сам HTTP не умеет: он печатает код в открытое поле. Рамка и UHF-пистолет шлют через маленькую программу на компьютере у двери или через Android-приложение терминала."],
  ["Заказ из mapper", "Это другой адрес: POST /api/v1/integrations/mapper/orders/ с externalId и строками code+qty. Рамка этот заказ не создаёт, она только списывает уже забронированное."],
];
api.getRow(4).values = ["Место", "Как устроено"];
styleHeader(api.getRow(4));
apiRows.forEach((values, index) => {
  const row = api.getRow(5 + index);
  row.values = values;
  row.height = index === 2 ? 48 : 36;
  values.forEach((_, column) => fillWrap(row.getCell(column + 1), index % 2 ? paper : sand));
  row.getCell(1).font = { name: "Calibri", bold: true, size: 11 };
});

const missed = wb.addWorksheet("Что ещё учесть", { properties: { tabColor: { argb: `FF${amber}` } } });
base(missed);
missed.columns = [{ width: 32 }, { width: 90 }];
sectionTitle(missed, 1, "То, чего в запросе «рамка, бирка, сканер» ещё нет", 2);
const missedRows = [
  ["Кейс и кабинет", "Кейс на 8 кабинетов и сам кабинет — разные бирки. Иначе рамка спишет кейс и ещё раз восьми штук, или спишет кейс вместо кабинетов. В номенклатуре это CASE-FC и CAB-P39."],
  ["Длина кабеля", "Магистраль 50 м и перемычка 0,5 м сейчас могут попасть в один код. Для честного расхода нужны разные коды, иначе заказ из mapper сольёт их в одну кучу."],
  ["Две антенны", "Одна антенна не отличает вход от выхода. Ставим две по ходу движения и режем чтение стеллажа экраном или снижением мощности."],
  ["Люди в проёме", "Бирка в кармане и бирка на тележке за дверью тоже читаются. Программа выпускает только то, что есть в открытом заказе, и не чаще одного раза на EPC за проход."],
  ["Кодировка бирок", "Нужен один вечер у стола: принтер печатает этикетку, считыватель пишет в EPC тот же код. Без этого рамка видит номер чипа, а склад ждёт CAB-P39."],
  ["Солнце и мойка", "Прямая термобумага в кузове за лето умирает. На кабинеты — полиэстер и лента. На улицу — ABS или PCB, не бумага."],
  ["Запас", "Второй сканер, запас ленты, 10% бирок сверх парка. Одна сломанная голова сканера в день выезда останавливает отгрузку."],
  ["Сеть у двери", "Ридер по Ethernet в ту же сеть, что сервер склада. Wi-Fi на металлическом складе у ворот часто пропадает. Секрет подписи не класть в сайт GitHub Pages."],
  ["Офлайн", "Если сервер на минуту недоступен, программа у двери копит события и досылает с теми же eventId. Иначе тележка уедет, а остаток останется."],
  ["Питание рамки", "Блок 12 В, бесперебойник хотя бы на ридер, чтобы отключение света не выглядело как «ничего не вышло»."],
  ["Проба до ящика", "20 бирок, 5 кабинетов, 5 кабелей, один кейс, чтение у реальной двери с машиной. Дальность с картинки AliExpress к этому складу отношения не имеет."],
  ["Кто отвечает за частоту", "Пароль от настройки ридера не у всех. Случайное возвращение на американский хоп снова включает запрещённые частоты."],
  ["Язык на бирке", "На наклейке код латиницей крупно, рядом коротко русское или ивритское имя. Сканер читает код, человек читает имя."],
  ["Возврат", "Отдельное направление in на ту же бирку. Иначе возврат с площадки придётся вбивать руками и остаток разъедется."],
];
missed.getRow(3).values = ["Тема", "Что сделать"];
styleHeader(missed.getRow(3));
missedRows.forEach((values, index) => {
  const row = missed.getRow(4 + index);
  row.values = values;
  row.height = 36;
  values.forEach((_, column) => fillWrap(row.getCell(column + 1), index % 2 ? paper : sand));
  row.getCell(1).font = { name: "Calibri", bold: true, size: 11 };
});

const money = wb.addWorksheet("Смета", { properties: { tabColor: { argb: `FF${green}` } } });
base(money);
money.columns = [{ width: 55 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 55 }];
sectionTitle(money, 1, "Две сметы. Вторая не заказывается, пока не пройдена первая.", 5);
money.getRow(3).values = ["Позиция", "Цена USD", "Штук", "Сумма USD", "Комментарий"];
styleHeader(money.getRow(3));
const buyNow = [
  ["NETUM L8BLPro", 26.39, 2, "Дверь и запас"],
  ["Niimbot M2", 108.18, 1, "Лента и ролики в карточке отдельно, заложите ещё около 30 USD"],
  ["Флажки на кабель", 4.64, 3, "Тикшорет и питание"],
  ["Переходник вилки на тип H", 8, 2, "Местный магазин, не AliExpress. Оценка."],
];
buyNow.forEach((values, index) => {
  const row = money.getRow(4 + index);
  row.values = [values[0], values[1], values[2], { formula: `B${4 + index}*C${4 + index}` }, values[3]];
  row.getCell(2).numFmt = '"$"#,##0.00';
  row.getCell(4).numFmt = '"$"#,##0.00';
  row.height = 22;
});
const firstTotal = 4 + buyNow.length;
money.getCell(`A${firstTotal}`).value = "Первый комплект";
money.getCell(`D${firstTotal}`).value = { formula: `SUM(D4:D${firstTotal - 1})` };
money.getCell(`D${firstTotal}`).numFmt = '"$"#,##0.00';
money.getCell(`A${firstTotal}`).font = { name: "Calibri", bold: true };
money.getRow(firstTotal).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5F2EA" } };

const secondStart = firstTotal + 2;
money.getCell(`A${secondStart}`).value = "Вторая очередь, после пробы и ответа по частоте";
money.mergeCells(secondStart, 1, secondStart, 5);
money.getCell(`A${secondStart}`).font = { name: "Calibri", bold: true, size: 13 };
const second = [
  ["Проба ABS anti-metal, 20 шт", 16.81, 1],
  ["Проба PCB anti-metal, 20 шт", 20.58, 1],
  ["Android UHF PDA, если продавец зафиксирует 915–917", 299, 1],
  ["CHAFON CF815 либо модуль E710, один из двух", 351.78, 1],
  ["Две антенны и кабели, оценка, в цену ридера обычно не входят", 120, 1],
];
second.forEach((values, index) => {
  const rowNumber = secondStart + 1 + index;
  const row = money.getRow(rowNumber);
  row.values = [values[0], values[1], values[2], { formula: `B${rowNumber}*C${rowNumber}` }, ""];
  row.getCell(2).numFmt = '"$"#,##0.00';
  row.getCell(4).numFmt = '"$"#,##0.00';
});
const secondTotal = secondStart + 1 + second.length;
money.getCell(`A${secondTotal}`).value = "Вторая очередь, если брать и PDA, и ридер";
money.getCell(`D${secondTotal}`).value = { formula: `SUM(D${secondStart + 1}:D${secondTotal - 1})` };
money.getCell(`D${secondTotal}`).numFmt = '"$"#,##0.00';
money.getCell(`A${secondTotal}`).font = { name: "Calibri", bold: true };
money.getRow(secondTotal).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF6E4" } };
note(
  money,
  secondTotal + 2,
  "НДС, пошлина и доставка сверху. Коммерческий ввоз считается отдельно от личного порога 75 USD. Chainway C72 за 818 USD и пистолет за 669 USD в смету не ставил: это замена PDA, а не добавка к ней.",
  5,
);

const sources = wb.addWorksheet("Источники", { properties: { tabColor: { argb: "FF666666" } } });
base(sources);
sources.columns = [{ width: 42 }, { width: 88 }];
sectionTitle(sources, 1, "Откуда взяты правила и цены", 2);
sources.getRow(3).values = ["Источник", "Зачем он в этом файле"];
styleHeader(sources.getRow(3));
const sourceRows = [
  ["GS1, UHF allocations for RFID", "https://www.gs1.org/docs/epc/uhf_regulations.pdf — Израиль: 915–917 МГц, 2 Вт EIRP, регламент 27.08.2012, пределы вне полосы."],
  ["ITU-R SM.2255 (2012)", "https://www.itu.int/dms_pub/itu-r/opb/rep/r-rep-sm.2255-2012-pdf-e.pdf — более узкая запись 915–916,8 МГц. Поэтому перед закупкой нужен актуальный ответ министерства, а не только сводка."],
  ["ICL Global, 02.06.2026", "https://www.iclglobal.com/news_update/vat-exemption-threshold-for-personal-imports-to-israel-updated/ — личный порог снова 75 USD, НДС на посылки между 75 и 130 USD."],
  ["משרד הכלכלה, יבוא מכשיר קשר", "https://apps.economy.gov.il/Apps/PersonalImport/Product/Index/221 — личный ввоз радио, до 5 штук, условия «не для оказания услуг»."],
  ["משרד התקשורת", "requests@moc.gov.il, 03-5198282. Типовое одобрение и вопрос, можно ли включить конкретную модель на 915–917 МГц."],
  ["AliExpress, выдача 8 октября 2026", "Цены и фото карточек из поиска в этот день. Карточка, остаток и доставка меняются."],
  ["Код склада", "POST /api/v1/integrations/scan/events/ и POST /api/v1/integrations/mapper/orders/ уже есть в этом репозитории."],
];
sourceRows.forEach((values, index) => {
  const row = sources.getRow(4 + index);
  row.values = values;
  row.height = 36;
  values.forEach((_, column) => fillWrap(row.getCell(column + 1)));
});
note(
  sources,
  12,
  "Файл помогает выбрать комплект и не включить чужую частоту. Он не заменяет таможенного брокера и не является разрешением Министерства связи на передачу.",
  2,
);
sources.getRow(12).height = 32;

for (const ws of wb.worksheets) {
  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (!cell.font?.name) cell.font = { ...(cell.font ?? {}), name: "Calibri", size: cell.font?.size ?? 11 };
    });
  });
}

await mkdir("docs/procurement", { recursive: true });
await wb.xlsx.writeFile(outPath);
console.log(outPath);
