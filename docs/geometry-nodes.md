# Geometry Nodes в PumpStation Calculator

Администратор полной версии может изменить, какие значения получит штатный инженерный инструмент, проверить результат на копии проекта и опубликовать его. Ветка `codex/geometry-nodes` создана от `codex/3d-flange-fasteners`, коммит `8df2af7bce73e006162adae2b1d78e53ba4122d4`.

## Запуск в Windows

Команды выполняются из `E:\PumpStation_Calculator\frontend`. Требуется настроенный локальный профиль полной версии с PostgreSQL и D1. Для новой установки порядок подготовки базы и постоянных каталогов описан в [README](../README.md) и [инструкции локального хранилища](local-project-storage.md).

```powershell
npm ci
npm run build:full
```

Для существующей **тестовой** D1 со схемой по 0014 включительно примените одну новую миграцию. Укажите путь к каталогу состояния именно того профиля, который будет открывать стенд. Для пустой D1 выполните все миграции в порядке имён по инструкции README.

```powershell
$profilePath = Join-Path $env:LOCALAPPDATA 'PumpStationCalculator\full.json'
$settings = Get-Content -Raw -LiteralPath $profilePath | ConvertFrom-Json
node node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to $settings.PROJECT_STATE_DIR --file drizzle/0015_engineering_graphs.sql
```

Укажите в тестовом профиле `buildDir`, указывающий на свежий `dist` этой ветки. Запустите настроенный профиль командой `npm run start:local` или отдельный тестовый профиль командой `powershell -NoProfile -File scripts/start-local.ps1 -ConfigPath <путь-к-профилю>`. Войдите как admin, откройте главное меню → **Geometry Nodes**. Прямой адрес на том же хосте — `/?view=geometry-nodes`. Обычные роли получают опубликованные расчёты через штатные экраны. В beta сохранены ограничения на редактирование, для расчётов выдаются операции разрешённых инструментов.

## Проверка через интерфейс

1. **Каталог и два контура.** Откройте проект с выбранным насосом, затем схему «Данные патрубка насоса» и «▷ Запуск». Выберите контур и выходной патрубок, нажмите «Выполнить». У узла «Выбор источника» посмотрите входы `catalog` и `override`. В свойствах узла «DN патрубка» откройте «Связи и результат». Повторите для другой модели и другого контура. Для совпадающего ID насоса проектное переопределение имеет приоритет целиком, в том числе при неполных характеристиках.
2. **Масса.** Откройте «Песочница · масса партии». Начальный пример даёт 10 кг. В библиотеке создайте тип комплектующего с числовым выходом `mass`, смыслом `mass`, единицей `кг` и начальным значением `2.5`. Создайте тип инструмента с числовым входом `mass` с тем же смыслом и единицей, входом `count` со значением 4 и выходом `total` со смыслом `mass` и единицей `кг`. Для выхода введите `mass * count`. По ПКМ передайте массу от детали инструменту, а выход инструмента — на вход конечной ноды. Подтвердите замену связи и запустите граф. Измените количество на 5 в свойствах экземпляра и повторите запуск. Ожидаемые результаты — 10 и 12,5 кг.
3. **Скрытые поля.** Тем же выходом подключите второго получателя. На карточке источника виден один выход. Удалите линии по очереди через ПКМ по линии или «Свойства → Связи и результат». После удаления последней линии поле остаётся в «Атрибутах». При повторном подключении нажмите Esc до выбора принимающего поля и проверьте исходную схему.
4. **Публикация.** На отдельном тестовом проекте с каталожным DN 65 измените функцию узла «DN патрубка» на `get(port, "dn") + 5`. В пробном запуске появится 70. Сохраните черновик и проверьте исходный DN в уже открытом проекте. Опубликуйте и подтвердите список затронутых экземпляров. Создайте новый проект с тем же насосом либо выполните явный пересчёт состава на актуальных правилах. Сверьте DN патрубка в напорной линии и данных 3D. Через «Версии» восстановите прежнюю публикацию и повторите пересчёт. Параметры входного и выходного патрубков проверяйте раздельно.
5. **Доступ и конкуренция.** Откройте редактор двумя администраторами. Сохраните разные изменения по очереди. Второй получит сообщение о конфликте и сможет решить, когда загрузить актуальный черновик. Проверьте прямую ссылку и административный API в отдельной сессии обычного пользователя.

## Данные и воспроизведение

- Каталог формирует библиотеку по категориям оборудования. Два насоса могут иметь один тип и разные модели, значения, патрубки и связи. В свойствах экземпляра можно выбрать запись каталога. Публикация сохраняет снимок значений выбранной записи. Для замены выберите другую запись в том же экземпляре. Штатная схема патрубков получает насос и переопределения текущего проекта при каждом вызове.
- Связь хранит ID обоих экземпляров и ключи атрибутов. Имя для отображения можно менять. Совместимость определяется направлением, формой данных, инженерным смыслом и единицей. Для нового совместимого атрибута указывайте те же смысл и единицу, что у входного поля. Приведение единиц можно описать отдельным инструментом.
- Пользовательская функция вычисляет значение именованного выхода по именам входов. Поддержаны числа, строки JSON, `true`, `false`, `null`, арифметика, сравнение, `??`, `&&`, `||`, `if`, `min`, `max`, `abs`, `round`, `sqrt`, `len`, `get` и `set`. Примеры — `override ?? catalog`, `get(port, "dn")`, `set(port, "dn", dn)`. На одно выражение отводится до 50 мс и 512 шагов интерпретатора. При разборе проверяются длина, число токенов и вложенность. Циклы, произвольный JavaScript, сеть и файловые операции в языке отсутствуют.
- Черновик и история публикаций хранятся в D1. Публикация атомарно сохраняет документ, версию, программу и указатель на активную версию. Открываемый проект использует сохранённый `project.graphVersion`. Проекты прежних форматов начинают с `engineering-v1`. При воспроизведении расчёта также важны входные данные, версия сборки со встроенными функциями и использованные внешние каталоги. История графов хранит правила и значения экземпляров, отдельный архив всех внешних каталогов в неё не входит.
- Встроенные функции вызывают ту же реализацию, что и обычный экран. В свойствах можно открыть тело операции текущей сборки и его SHA-256. Для изменения добавьте собственный узел с функцией либо измените связи. В штатном расчёте исходная схема компилируется в прямой вызов проверенной функции. Изменённая схема исполняется в порядке зависимостей и получает те же входы.

## Карта покрытия

Каждая строка ниже соответствует зарегистрированному входу в штатный расчёт. Технические ключи входов и тип результата совпадают с определениями редактора. Каталожные записи поставляют значения соответствующих типов. Датчики, клапаны, запорная арматура, мембранные баки, трубы, переходы, фланцы и крепёж также используются составными операциями спецификации и 3D. Поля, единицы и ограничения доступны в свойствах.

Для всех 66 входов отдельный тест подменяет результат в опубликованной программе и вызывает реальную экспортированную функцию инструмента. В Chrome дополнительно проверяется штатное поле DN насоса из каталога до публикации, после публикации и после отката.

**«Встроенная»** означает, что экран вызывает версионированную операцию и её базовые правила проверяются указанным предметным набором. Внутренние условия доступны в исходном коде операции. **«Сквозная»** означает дополнительную проверку изменения опубликованного правила, реального потребителя и отката. **«Составная»** означает, что в исходной схеме раскрыты промежуточные операции. Для остальных строк отдельная подмена правила через каждый штатный экран вручную не проверялась.

| Инструмент и нода | Входные поля → результат | Штатный экран | Проверка в tests/ | Перенос |
|---|---|---|---|---|
| Данные патрубка насоса · [`resolvePort`](../app/pump-ports.ts) | `catalog`, `override` → `port` | Расчёт DN / обвязка / 3D | [geometry-nodes](../tests/geometry-nodes.test.mjs), [pump-nozzles](../tests/pump-nozzles.test.mjs) | Сквозная |
| Фильтр насосов · [`matchesPumpFilters`](../app/pump-filters.ts) | `row`, `filters` → `match` | Подбор насосов | [pump-filters](../tests/pump-filters.test.mjs) | Встроенная |
| Напор при заданной подаче · [`selectionHeadAtFlow`](../app/pump-catalog.ts) | `pump`, `flow` → `head` | Подбор насосов | [pump-catalog](../tests/pump-catalog.test.mjs), [curve-methods](../tests/curve-methods.test.mjs) | Встроенная |
| Рабочая точка · [`operatingPoint`](../app/pump-catalog.ts) | `pump`, `count`, `input`, `method` → `point` | Гидравлическая кривая | [pump-catalog](../tests/pump-catalog.test.mjs), [curve-methods](../tests/curve-methods.test.mjs) | Встроенная |
| Закупочная цена насоса · [`cataloguePurchasePriceRub`](../app/pump-catalog.ts) | `pump`, `settings` → `price` | Спецификация | [pump-catalog](../tests/pump-catalog.test.mjs), [curve-methods](../tests/curve-methods.test.mjs) | Встроенная |
| Оценка кандидатов · [`evaluatePumpCandidates`](../app/pump-selection.ts) | `catalogue`, `input`, `settings`, `filters` → `candidates` | Подбор насосов | [pump-selection](../tests/pump-selection.test.mjs) | Встроенная |
| Частотное регулирование · [`frequencyAdjustedPump`](../app/pump-frequency.ts) | `pump`, `frequencyHz`, `nominalHz` → `pump` | Гидравлическая кривая | [pump-frequency](../tests/pump-frequency.test.mjs) | Встроенная |
| Проверка давления на входе · [`checkInletPressure`](../app/dn-defaults.ts) | `head`, `element`, `limit`, `limitLabel` → `pressureCheck` | Расчёт DN / спецификация | [dn-connections](../tests/dn-connections.test.mjs), [suction-pressure](../tests/suction-pressure.test.mjs) | Встроенная |
| Выбор присоединения · [`resolveDnConnection`](../app/dn-defaults.ts) | `settings`, `dn`, `secondary`, `saved` → `connectionChoice` | Расчёт DN | [dn-connections](../tests/dn-connections.test.mjs), [suction-pressure](../tests/suction-pressure.test.mjs) | Встроенная |
| Всасывающая линия · [`suctionHydraulics`](../app/dn-defaults.ts) | `entity`, `input`, `settings`, `secondary`, `pump` → `lineHydraulics` | Расчёт DN | [dn-connections](../tests/dn-connections.test.mjs), [suction-pressure](../tests/suction-pressure.test.mjs) | Встроенная |
| Напорная линия · [`dischargeHydraulics`](../app/dn-defaults.ts) | `entity`, `input`, `settings`, `secondary`, `pump` → `lineHydraulics` | Расчёт DN | [dn-connections](../tests/dn-connections.test.mjs), [suction-pressure](../tests/suction-pressure.test.mjs) | Сквозная |
| Параметры коллектора · [`collectorRecommendation`](../app/collector-project.ts) | `project`, `type`, `pumps` → `collectorConfig` | Конструктор коллекторов | [collectors](../tests/collectors.test.mjs), [station-specification](../tests/station-specification.test.mjs) | Встроенная |
| Расход коллектора · [`collectorFlow`](../app/collector-calculations.ts) | `c` → `collectorFlow` | Конструктор коллекторов | [collectors](../tests/collectors.test.mjs), [collector-spacing](../tests/collector-spacing.test.mjs) | Встроенная |
| Расчёт и состав коллектора · [`calculateCollector`](../app/collector-calculations.ts) | `c`, `catalog` → `collectorCalculation` | Конструктор коллекторов | [collectors](../tests/collectors.test.mjs), [collector-spacing](../tests/collector-spacing.test.mjs) | Встроенная |
| Подбор перехода · [`selectLineReducer`](../app/line-insertion.ts) | `items`, `catalog`, `material`, `pumpDn`, `valveDn`, `pn`, `geometry` → `component` | Обвязка насосов | [line-assemblies](../tests/line-assemblies.test.mjs), [station-insertions](../tests/station-insertions.test.mjs) | Встроенная |
| Подбор вставки · [`selectLineInsertion`](../app/line-insertion.ts) | `items`, `dn`, `pn`, `material` → `insertionChoice` | Обвязка насосов | [line-assemblies](../tests/line-assemblies.test.mjs), [station-insertions](../tests/station-insertions.test.mjs) | Встроенная |
| Подбор прокладки · [`selectGasket`](../app/sealing-selection.ts) | `items`, `dn`, `pn` → `component` | Обвязка насосов | [sealing-selection](../tests/sealing-selection.test.mjs) | Встроенная |
| Длина крепежа · [`jointFastenerLength`](../app/joint-fastener-length.ts) | `grip`, `nut`, `washer`, `ends` → `length` | Подбор крепежа | [flange-fasteners](../tests/flange-fasteners.test.mjs), [collector-valve-bolts](../tests/collector-valve-bolts.test.mjs) | Формула |
| Подбор гидравлической арматуры · [`selectHydraulicProduct`](../app/hydraulic-option-selection.ts) | `items`, `need`, `selectedId` → `hydraulicSelection` | Спецификация | [hydraulic-option-selection](../tests/hydraulic-option-selection.test.mjs) | Встроенная |
| Крепление мембранного бака · [`tankMounting`](../app/tank-mounting.ts) | `items`, `volume` → `tankMounting` | Спецификация / 3D | [tank-assemblies](../tests/tank-assemblies.test.mjs) | Встроенная |
| Конструкция рамы по массе · [`frameConstructionForPumpMass`](../app/frame-selection.ts) | `massKg` → `frameConstruction` | Спецификация | [frame-selection](../tests/frame-selection.test.mjs) | Встроенная |
| Подбор рамы · [`projectFrameSelection`](../app/frame-selection.ts) | `project`, `pumps` → `frameSelection` | Спецификация | [frame-selection](../tests/frame-selection.test.mjs) | Встроенная |
| Подбор шкафа управления · [`projectControlCabinetItem`](../app/control-cabinet-selection.ts) | `controlCabinets`, `smartCabinets`, `settings`, `pump`, `totalPumpCount` → `specItem` | Конфигуратор ШУ | [station-specification](../tests/station-specification.test.mjs), [rendered-html](../tests/rendered-html.test.mjs) | Встроенная |
| Комплектация гидравлических опций · [`buildHydraulicOptions`](../app/hydraulic-option-assembly.ts) | `project`, `resources` → `specItems` | Спецификация | [hydraulic-options](../tests/hydraulic-options.test.mjs) | Встроенная |
| Спецификация всасывающей линии · [`buildSuctionSpec`](../app/suction-spec.ts) | `project`, `database`, `catalog`, `valves`, `pumps` → `specItems` | Спецификация | [suction-spec](../tests/suction-spec.test.mjs) | Встроенная |
| Спецификация напорной линии · [`buildDischargeSpec`](../app/discharge-spec.ts) | `project`, `database`, `catalog`, `valves`, `pumps` → `specItems` | Спецификация | [discharge-spec](../tests/discharge-spec.test.mjs) | Встроенная |
| Расчёт комплектующих и вставок · [`generateInsertCalculations`](../app/component-insert-calculations.ts) | `request`, `catalog` → `insertCalculations` | Расчёт комплектующих | [component-insert-calculations](../tests/component-insert-calculations.test.mjs), [insert-errors-20261031](../tests/insert-errors-20261031.test.mjs) | Встроенная |
| Компоновка насосной станции · [`buildAssembly`](../app/model-editor/model.ts) | `project`, `pumps`, `profiles`, `lines` → `assembly` | 3D-модель | [model-editor](../tests/model-editor.test.mjs), [geometry-nodes](../tests/geometry-nodes.test.mjs) | Сквозная |
| Скорость по номинальному DN · [`flowVelocity`](../app/dn-defaults.ts) | `flow`, `dn` → `velocity` | Расчёт DN | [dn-connections](../tests/dn-connections.test.mjs), [suction-pressure](../tests/suction-pressure.test.mjs) | Встроенная |
| Рекомендация диаметра · [`recommendedDn`](../app/dn-defaults.ts) | `flow`, `rules` → `dn` | Расчёт DN | [dn-connections](../tests/dn-connections.test.mjs), [suction-pressure](../tests/suction-pressure.test.mjs) | Встроенная |
| Напор в давление · [`inletPressureBar`](../app/dn-defaults.ts) | `head` → `pressure` | Проверки давления | [dn-connections](../tests/dn-connections.test.mjs), [suction-pressure](../tests/suction-pressure.test.mjs) | Встроенная |
| Интерполяция характеристики · [`interpolateCurve`](../app/pump-catalog.ts) | `points`, `flow`, `method` → `head` | Гидравлическая кривая | [pump-catalog](../tests/pump-catalog.test.mjs), [curve-methods](../tests/curve-methods.test.mjs) | Встроенная |
| Пригодность насоса к подбору · [`usablePump`](../app/pump-catalog.ts) | `pump`, `medium` → `match` | Подбор насосов | [pump-catalog](../tests/pump-catalog.test.mjs), [curve-methods](../tests/curve-methods.test.mjs) | Встроенная |
| Допуск рабочей точки · [`preferredOperatingPoint`](../app/pump-selection.ts) | `deltaQPercent`, `deltaHPercent` → `match` | Подбор насосов | [pump-selection](../tests/pump-selection.test.mjs) | Встроенная |
| Цена в рублях · [`cataloguePriceRub`](../app/pump-catalog.ts) | `pump`, `settings` → `price` | Спецификация | [pump-catalog](../tests/pump-catalog.test.mjs), [curve-methods](../tests/curve-methods.test.mjs) | Встроенная |
| Скидка производителя · [`catalogueDiscount`](../app/pump-catalog.ts) | `pump`, `settings` → `percent` | Спецификация | [pump-catalog](../tests/pump-catalog.test.mjs), [curve-methods](../tests/curve-methods.test.mjs) | Встроенная |
| Длина отвода коллектора · [`branchLength`](../app/collector-calculations.ts) | `outer`, `bolt` → `length` | Конструктор коллекторов | [collectors](../tests/collectors.test.mjs), [collector-spacing](../tests/collector-spacing.test.mjs) | Встроенная |
| Тип фланца коллектора · [`flangeKinds`](../app/collector-calculations.ts) | `material`, `dn`, `pn` → `flangeKinds` | Конструктор коллекторов | [collectors](../tests/collectors.test.mjs), [collector-spacing](../tests/collector-spacing.test.mjs) | Встроенная |
| Ограничения давления коллектора · [`collectorPressureChecks`](../app/collector-calculations.ts) | `c`, `inletHead`, `catalog`, `enabled` → `pressureChecks` | Конструктор коллекторов | [collectors](../tests/collectors.test.mjs), [collector-spacing](../tests/collector-spacing.test.mjs) | Встроенная |
| Правила бобышек · [`resolveNippleRule`](../app/collector-nipple-rules.ts) | `rules`, `context` → `nippleSelection` | Конструктор коллекторов | [collector-nipple-rules](../tests/collector-nipple-rules.test.mjs) | Встроенная |
| Применение проектных параметров коллектора · [`resolveCollector`](../app/collector-project.ts) | `recommended`, `state`, `settings` → `collectorConfig` | Конструктор коллекторов | [collectors](../tests/collectors.test.mjs), [station-specification](../tests/station-specification.test.mjs) | Встроенная |
| Допустимое давление комплектующего · [`componentPressureLimit`](../app/suction-pressure.ts) | `item` → `pressureLimit` | Проверки давления | [suction-pressure](../tests/suction-pressure.test.mjs) | Встроенная |
| Давление для КИП · [`stationInstrumentPressure`](../app/instrument-pressure.ts) | `project`, `pumps`, `circuit` → `instrumentPressure` | Спецификация | [instrument-pressure](../tests/instrument-pressure.test.mjs) | Встроенная |
| Давление КИП на напоре · [`dischargeInstrumentPressure`](../app/instrument-pressure.ts) | `project`, `pumps`, `circuit` → `instrumentPressure` | Спецификация | [instrument-pressure](../tests/instrument-pressure.test.mjs) | Встроенная |
| Варианты вставки · [`generateInsertCandidates`](../app/component-insert-calculations.ts) | `request`, `originalCatalog` → `insertCalculations` | Расчёт комплектующих | [component-insert-calculations](../tests/component-insert-calculations.test.mjs), [insert-errors-20261031](../tests/insert-errors-20261031.test.mjs) | Встроенная |
| Стоимость позиции · [`specificationLineTotal`](../app/specification-readiness.ts) | `item` → `price` | Спецификация | [specification-items](../tests/specification-items.test.mjs), [diagnostics](../tests/diagnostics.test.mjs) | Встроенная |
| Готовность спецификации · [`assessSpecification`](../app/specification-readiness.ts) | `project`, `displayedItems`, `existingIssues` → `specReadiness` | Спецификация | [specification-items](../tests/specification-items.test.mjs), [diagnostics](../tests/diagnostics.test.mjs) | Встроенная |
| Диаметры и арматура контура · [`getCircuitDnConfig`](../app/station-hydraulic-calculation.ts) | `entity`, `input`, `settings`, `secondary`, `pump` → `circuitDn` | Расчёт DN | [line-assemblies](../tests/line-assemblies.test.mjs), [discharge-spec](../tests/discharge-spec.test.mjs) | Встроенная |
| Выбор арматуры по DN и PN · [`selectValveComponent`](../app/station-hydraulic-calculation.ts) | `items`, `kind`, `dn`, `connection`, `pn`, `color`, `collectorMaterial` → `valveSelection` | Расчёт DN / спецификация | [line-assemblies](../tests/line-assemblies.test.mjs), [discharge-spec](../tests/discharge-spec.test.mjs) | Встроенная |
| Состав арматуры контуров · [`buildValveSpecItems`](../app/station-hydraulic-calculation.ts) | `database`, `entity`, `input`, `secondaryInput`, `settings`, `dischargeMaterial`, `pumps` → `specItems` | Спецификация | [line-assemblies](../tests/line-assemblies.test.mjs), [discharge-spec](../tests/discharge-spec.test.mjs) | Встроенная |
| Комплектация всаса и напора · [`refreshSuctionSpecification`](../app/station-hydraulic-calculation.ts) | `project`, `database`, `force`, `pumps` → `project` | Спецификация | [line-assemblies](../tests/line-assemblies.test.mjs), [discharge-spec](../tests/discharge-spec.test.mjs) | Встроенная |
| Состав насосной станции · [`stationComposition`](../app/station-specification.ts) | `project`, `resources` → `project` | Рабочее пространство / спецификация | [station-specification](../tests/station-specification.test.mjs) | Составная |
| Насосы, шкаф и рама · [`prepareStation`](../app/station-specification.ts) | `project`, `resources` → `stationWork` | Спецификация | [station-specification](../tests/station-specification.test.mjs) | Встроенная |
| Коллекторы станции · [`stationCollectors`](../app/station-specification.ts) | `work` → `stationWork` | Спецификация | [station-specification](../tests/station-specification.test.mjs) | Встроенная |
| Обвязка насосов · [`stationLines`](../app/station-specification.ts) | `work` → `stationWork` | Спецификация | [station-specification](../tests/station-specification.test.mjs) | Встроенная |
| Гидравлические опции станции · [`stationOptions`](../app/station-specification.ts) | `work` → `stationWork` | Спецификация | [station-specification](../tests/station-specification.test.mjs) | Встроенная |
| Проверка и итоговый состав · [`finalizeStation`](../app/station-specification.ts) | `work` → `project` | Спецификация | [station-specification](../tests/station-specification.test.mjs) | Встроенная |
| Диагностика инженерного проекта · [`collectProjectIssues`](../app/diagnostics.ts) | `project`, `catalogue`, `catalog`, `cabinets`, `assetErrors` → `issues` | Ошибки и предупреждения | [diagnostics](../tests/diagnostics.test.mjs) | Встроенная |
| Диагностика выбранного насоса · [`pumpIssues`](../app/diagnostics.ts) | `input`, `tool`, `catalogue` → `issues` | Подбор насосов | [diagnostics](../tests/diagnostics.test.mjs) | Встроенная |
| Характеристики насоса · [`pumpCardSections`](../app/pump-card-data.ts) | `pump` → `cardSections` | Карточка насоса | [pump-card](../tests/pump-card.test.mjs) | Встроенная |
| Кривые насоса · [`pumpCardCurves`](../app/pump-card-data.ts) | `pump` → `curves` | Карточка насоса | [pump-card](../tests/pump-card.test.mjs) | Встроенная |
| Автоматический подбор датчика · [`selectAutomaticTransducer`](../app/pressure-transducers.ts) | `items`, `headM` → `hydraulicSelection` | КИП / спецификация | [suction-instruments](../tests/suction-instruments.test.mjs), [instrument-pressure](../tests/instrument-pressure.test.mjs) | Встроенная |
| Исполнения вставок · [`selectInsertVariants`](../app/component-insert-variants.ts) | `rows`, `coreRows`, `catalog` → `insertCalculations` | Расчёт комплектующих | [insert-single-variants](../tests/insert-single-variants.test.mjs) | Встроенная |
| Диапазон мощности шкафа · [`smartCabinetSupportsPower`](../app/control-cabinet-selection.ts) | `cabinet`, `power` → `match` | Конфигуратор ШУ | [station-specification](../tests/station-specification.test.mjs), [rendered-html](../tests/rendered-html.test.mjs) | Встроенная |
| Шаблон коллектора для 3D · [`buildCollectorTemplate`](../app/model-editor/collector-template.ts) | `card`, `data`, `pumps`, `side`, `savedMount`, `pumpBranchOrientation` → `collectorTemplate` | 3D-модель / коллектор | [collector-3d](../tests/collector-3d.test.mjs) | Встроенная |
| Шаблон вставки для 3D · [`prepareInsertionTemplate`](../app/model-editor/insertion-template.ts) | `row`, `context`, `record`, `angle` → `insertionTemplate` | 3D-шаблон вставки | [insertion-3d](../tests/insertion-3d.test.mjs) | Встроенная |

## Границы переноса

В схеме патрубков раскрыты выбор между каталогом и проектом, извлечение DN и сборка результата. В схеме состава станции отдельно видны насосы, шкаф с рамой, коллекторы, обвязка, опции и итоговая спецификация. Для крепежа доступна редактируемая формула длины. Такие операции, как интерполяция Q–H, подбор вариантов вставки и построение 3D-шаблона коллектора, пока показывают входы и итог одного встроенного узла. Их внутренние условия и промежуточные величины можно изучать в реализации. Чтобы видеть каждое такое решение на полотне, эти операции предстоит разделить на более мелкие узлы.

Запись проекта в PostgreSQL, публикация каталога, конвертация файлов и запуск CAD-экспорта остаются обязанностью соответствующих служб. Граф рассчитывает данные для этих действий. Ручное редактирование справочника оборудования и авторизация работают в существующих разделах приложения.

## Проверки из консоли

```powershell
npm run typecheck
npm run lint
npm test
node tests/geometry-nodes-browser.mjs
npm run build:full
node tests/geometry-nodes-full.mjs
```

Порядок важен. Команда npm test сначала собирает профиль beta. Последующая сборка full готовит файлы для теста административных маршрутов и полного каталога. Браузерный тест запускает временный профиль Chrome (путь можно задать через CHROME_BIN). HTTP-проверка использует изолированную D1 и ресурсы сборки; рабочие проекты и рабочие учётные записи для неё не требуются.
