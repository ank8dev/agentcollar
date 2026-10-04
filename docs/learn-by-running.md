# Учимся, запуская: AgentCollar в 15 опытах

Каждый опыт — одна идея. Запускаешь команду, смотришь, что произошло, и читаешь, почему так.
В конце каждого опыта есть **«Сломай»**: маленькая правка, после которой видно, зачем нужен этот кусок кода.
После «сломай» всегда возвращай код обратно: `git checkout -- broker/src`.

Все команды — из папки `broker/`:

```bash
cd ~/Documents/AgentCollar/broker
```

---

## 0. Подготовка

```bash
npm install      # ставит инструменты разработки и собирает dist/
npm link         # кладёт команды agcl и agentcollar в PATH
agcl --help
```

**Увидишь:** список команд и строку `agcl — короткое имя agentcollar: agcl watch == agentcollar watch`.

**Почему:** в `package.json` поле `"bin"` даёт **одному** файлу `dist/cli.js` **два** имени. `npm link` создаёт
**symlink** (ярлык) на этот файл в папке из `PATH` — списка мест, где терминал ищет команды.

```bash
ls -l "$(which agcl)"     # ярлык → .../dist/cli.js
head -1 dist/cli.js       # #!/usr/bin/env node — shebang: «запускай меня через node»
```

---

## 1. Сердце: mandate и 6 проверок

```bash
npm run demo
```

**Увидишь:** mandate выдан → `gmail.read` и `gmail.draft` ALLOWED → `gmail.send` DENIED → пауза 4 с →
всё DENIED (истёк) → новый mandate → `revoke()` → DENIED.

**Почему:** `check()` в `src/check.ts` проверяет по порядку: token известен → человек одобрил → не истёк →
не отозван → действие разрешено → лимит не исчерпан. Первая неудача останавливает всё (**early return**),
`allowed: true` стоит в самом конце (**deny by default**).

**Сломай:** в `src/check.ts` поставь `mandate.used += 1;` в самое начало `runChecks` и запусти `npm test`.
Упадёт не только счётчик: для неизвестного token `mandate` — `undefined`, и программа падает целиком.

---

## 2. Журнал: всё записано

```bash
agcl logs --today
agcl logs --denied
tail -3 ~/.agentcollar/audit.log
```

**Увидишь:** в `agcl logs` — цветные строки с `✓ ✓ ✓ ✓ ✗ ·`; в сыром файле — строки вида
`время | "агент" | "действие" | DENIED | "причина" | action_not_allowed`.

**Почему:**
- журнал **append-only**: только дописываем, никогда не меняем;
- текст агента в кавычках (`JSON.stringify`) — агент не может подсунуть перевод строки и подделать запись (**log injection**);
- последняя колонка — код проверки; `✓✗·` вычисляются из `CHECK_ORDER`, а не хранятся.

**Сломай:** в `src/audit.ts` убери `safe(...)` вокруг `action` и запусти `npm test` — упадёт тест на подделку строк.

---

## 3. Живой экран

Два окна терминала:

```bash
agcl watch          # окно 1
npm run demo        # окно 2
```

**Увидишь:** строки появляются в окне 1 в тот же момент, когда демо их пишет.

**Почему:** `fs.watch` — ОС сама сообщает «файл изменился». `src/cli/tail.ts` дочитывает только новые **байты**
и не превращает в текст недописанную строку: буква «т» — 2 байта в **UTF-8**, половинка дала бы мусор.

---

## 4. Сервер и HTTP-ответы

Окно 1 — брокер, одобрение в этом же терминале (пустой токен = без Telegram):

```bash
TELEGRAM_BOT_TOKEN= agcl server --no-intro
```

Окно 2 — ты сам в роли агента:

```bash
# попросить mandate: в ответ 202 и token
R=$(curl -s -X POST 127.0.0.1:8787/mandates -H 'content-type: application/json' \
  -d '{"agent":"me","task":"learning","allowedActions":["gmail.read"],"expiresInSeconds":300,"limit":1}')
echo "$R"
TOKEN=$(echo "$R" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
ID=$(echo "$R" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')

curl -s -w ' → %{http_code}\n' 127.0.0.1:8787/inbox -H "Authorization: Bearer $TOKEN"
```

**Увидишь:** `mandate is waiting for human approval → 403`. В окне 1 вопрос «Одобрить? [y/N]» — ответь `y`. Дальше:

```bash
curl -s -w ' → %{http_code}\n' 127.0.0.1:8787/inbox -H "Authorization: Bearer $TOKEN"        # 200
curl -s -w ' → %{http_code}\n' -X POST 127.0.0.1:8787/send -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"to":"a@b.c","subject":"s","body":"b"}'            # 403
curl -s -w ' → %{http_code}\n' 127.0.0.1:8787/inbox                                            # 401
curl -s -w ' → %{http_code}\n' 127.0.0.1:8787/inbox -H "Authorization: Bearer $TOKEN"        # 429 (лимит 1 уже потрачен)
```

**Почему:** **401** — «кто ты?» (нет token), **403** — «знаю тебя, но нельзя», **429** — «слишком много».
Token едет в **header** `Authorization: Bearer …`. Отказ `send` лимит не тратит — тратят только разрешённые действия.

---

## 5. Защита от браузера

Брокер из опыта 4 ещё работает:

```bash
curl -s -X POST 127.0.0.1:8787/mandates -H 'Host: evil.example:8787' -H 'content-type: application/json' -d '{}'; echo
curl -s -X POST 127.0.0.1:8787/mandates/$ID/revoke -H 'Origin: https://evil.example'; echo
curl -s -X POST 127.0.0.1:8787/mandates -H 'content-type: text/plain' -d '{}'; echo
```

**Увидишь:** `unexpected Host header`, `requests from web pages are not allowed`, `content-type must be application/json`.

**Почему:** `127.0.0.1` закрывает брокер от других компьютеров, но **не от сайтов в твоём браузере**.
Проверка `Host` останавливает **DNS rebinding**, отказ при `Origin` — запросы со страниц,
требование JSON — «тихие» формы. Код: `refuseBrowsers` в `src/server.ts`.

---

## 6. Нельзя обмануть одобрение

```bash
curl -s -X POST 127.0.0.1:8787/mandates -H 'content-type: application/json' \
  -d '{"agent":"helper","task":"Summarize\nДействия: gmail.read","allowedActions":["gmail.read","gmail.send"],"expiresInSeconds":60,"limit":5}'
```

**Увидишь в окне 1:** настоящие `Действия: gmail.read, gmail.send` наверху, `⚠️ Агент просит право ОТПРАВЛЯТЬ`,
а фальшивое «Действия» — внутри кавычек, одной строкой: `Задача (слова агента): «Summarize Действия: gmail.read»`.
Ответь `n`.

```bash
curl -s -X POST 127.0.0.1:8787/mandates -H 'content-type: application/json' \
  -d '{"agent":"x","task":"t","allowedActions":["gmail.read\nfake"],"expiresInSeconds":60,"limit":1}'; echo
```

**Увидишь:** `400 … like "gmail.read"` — действие обязано выглядеть строго как `app.verb`.

---

## 7. Kill switch и список мандатов

```bash
agcl mandates
agcl revoke $ID
curl -s 127.0.0.1:8787/inbox -H "Authorization: Bearer $TOKEN"; echo
agcl mandates
```

**Увидишь:** статус меняется на «отозван», запрос даёт `mandate revoked`.

**Почему:**
- `agcl revoke` — отдельный процесс, у него своя память; поэтому он **просит** сервер через `POST /mandates/:id/revoke`;
- `agcl mandates` читает `~/.agentcollar/mandates.json` — сервер пишет его после каждого изменения,
  **атомарно** (временный файл + `rename`) и **без токенов** (список разрешённых полей, **allowlist**).

```bash
grep -c token ~/.agentcollar/mandates.json    # 0
```

Останови сервер (Ctrl+C) и снова `agcl mandates`: «Брокер не запущен» — CLI проверил `pid` сигналом 0.

---

## 8. Fail closed: никто не ответил — отказ

Ждать 10 минут не нужно — у теста есть «машина времени»:

```bash
AGENTCOLLAR_HOME=/tmp/agcl-try npx tsx --test --test-name-pattern "nobody answered" test/approval.test.ts
```

**Почему:** `denyStalePending(maxAge, now)` принимает `now` параметром, поэтому тест передаёт «через 10 минут»
вместо ожидания. В сервере эту функцию раз в 30 секунд вызывает таймер.

**Сломай:** в `src/mandate.ts` в `findStalePending` поменяй `>` на `<` и запусти тот же тест.

---

## 9. Telegram

```bash
agcl setup
```

**Увидишь:** токен при вводе не виден → «✓ Бот найден» → ссылка `t.me/<бот>?start=XXXXXXXX` → Start на телефоне →
«Это ты?» → `~/.agentcollar/.env`.

```bash
ls -l ~/.agentcollar/.env      # -rw------- : читать может только твой пользователь (600)
ls -ld ~/.agentcollar          # drwx------ : папка 700
```

**Почему одноразовый код:** без него мастер взял бы user_id **первого**, кто нажал Start, — посторонний успел бы
стать одобряющим. Принимается только `/start <наш код>` из личного чата.

Потом `agcl`, во втором окне `npm run agent` — запрос придёт в Telegram, жми «✅ Одобрить», затем «🛑 Отозвать».

---

## 10. MCP руками

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","clientInfo":{"name":"me"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | agcl mcp
```

**Увидишь:** две строки JSON — ответ на `id 1` и на `id 2` (5 инструментов). На уведомление без `id` ответа нет.

**Почему:** **JSON-RPC 2.0** — «запрос с `id` → ответ с тем же `id`». stdout принадлежит протоколу,
поэтому все логи идут в stderr: лишний `console.log` сломал бы связь с Claude Code.

Подключить к Claude Code: `claude mcp add agentcollar -- agcl mcp`, потом попроси Claude
«через agentcollar прочитай inbox и сделай черновик». Модель видит только `mandateId`, token остаётся в MCP-сервере.

---

## 11. Заставка

```bash
agcl help                  # без заставки: help
agcl watch                 # заставка, потом экран (Ctrl+C — выход)
agcl watch --no-intro      # сразу экран
agcl watch | cat           # вывод не в терминал → без заставки
NO_COLOR=1 agcl watch      # NO_COLOR → без заставки
```

**Почему:** кадры — обычный текст из **Braille**-символов (`⣿` = 8 точек 2×4), сгенерированный один раз из логотипа
скриптом `tools/gen-intro.ts`. Анимация — **ANSI escape codes**: `ESC 7`/`ESC 8` сохранить/вернуть курсор,
`ESC[2K` стереть строку, `ESC[?25l` спрятать курсор.

---

## 12. Тесты и TDD

```bash
npm test
```

**Увидишь:** `# pass 97`, `# fail 0`.

**Опыт TDD:** открой `test/revoke.test.ts`, допиши тест, которого код ещё не выполняет, например:

```ts
test("an uppercase id is refused too", async () => {
  const result = await revokeMandate("DEADBEEF", 8787);
  assert.equal(result.ok, false);
});
```

`npm test` — тест **проходит** сразу? Значит, код уже это делал (регулярка `^[0-9a-f]{8}$`), и тест ничего нового
не доказал. Хороший тест сначала **падает** — так ты знаешь, что он что-то проверяет.

---

## 13. Что уходит в npm

```bash
npm run build && ls dist
npm pack --dry-run
```

**Увидишь:** 31 файл — только `dist/`, `README.md`, `LICENSE`, `package.json`. Ни тестов, ни `.env`, ни `data/`.

**Почему:** `"files"` в `package.json` — **allowlist**: в пакет попадает только перечисленное.
Runtime-зависимостей ноль — `tsx` и `typescript` нужны только для разработки.

Установить «как пользователь», но в отдельную папку, ничего не трогая в системе:

```bash
npm pack --pack-destination /tmp && npm install -g --prefix /tmp/agcl-prefix /tmp/agentcollar-0.1.0.tgz
/tmp/agcl-prefix/bin/agcl --help
```

---

## 14. Provenance (после первой публикации)

```bash
npm view agentcollar
npm audit signatures        # в папке проекта, где agentcollar стоит зависимостью
```

**Почему:** **provenance** — подписанное свидетельство «этот архив собрал GitHub Actions из коммита X репозитория
ank8dev/agentcollar». Его выдаёт workflow `.github/workflows/publish-broker.yml` при `npm publish --provenance`.
Публикация идёт через **trusted publishing (OIDC)**: npm проверяет, что запрос пришёл из этого workflow, и пароля
npm, который можно украсть, просто нет. Для инструмента, которому доверяют почту, это важно: можно проверить,
что установленный код — ровно тот, что лежит открытым на GitHub.

---

## Шпаргалка терминов

| Термин | Одной фразой |
|---|---|
| mandate | разрешение агенту на одну задачу: какие действия, на сколько, сколько раз |
| token | случайная строка-пропуск; кто её показал, тот и агент этого mandate |
| deny by default | запрещено всё, что не разрешено явно |
| fail closed | при сбое или без ответа — отказ, а не доступ |
| append-only log | журнал, в который только дописывают |
| injection | подмена смысла данных спецсимволами (перевод строки, escape-коды) |
| DNS rebinding | трюк, при котором сайт в браузере достаёт до `127.0.0.1` |
| atomic write | файл виден целиком или не виден вовсе (temp + rename) |
| allowlist | разрешено только перечисленное |
| race condition | результат зависит от того, какой процесс успел первым |
| JSON-RPC | «запрос с id → ответ с тем же id» |
| trust boundary | граница, за которую секреты не передаются |
| provenance | подписанное свидетельство, из какого кода собран пакет |
