# Відновлення scoped free lookup Facebook / Telegram — 2026-10-10

Під час перевірки втрати HTTPS-відповіді KRC знайшов розбіжність ключів: native lookup не знаходив уже створені free Facebook/Telegram jobs.

## Зміна
Додано lookupFreeRoute для scoped R3E3/R3E4 HTTP lookup. Він використовує ті самі normalized URL, language hint та owner digest, що й відповідний free start. Старий native lookup збережено.
Читання проходить лише наявний ланцюг free retry до 16 записів. Воно не резервує завдання, не змінює orphan PROCESSING, не викликає retrieval/STT і зупиняється на paid/charge-uncertain записі.
Перевірки платформи та власника залишилися в HTTP/service шарах. Нові credentials чи tool mappings не потрібні.

## Перевірки та розгортання
- npm run check: 276/276 PASS, build PASS, 86.968 секунди.
- KRC cross-repository suite: 496/496 PASS.
- Ізольовані справжні HTTPS-сценарії на всіх чотирьох маршрутах: створити один job, втратити відповідь, відновити COMPLETED через lookup, не викликати провайдера вдруге.
- Unit tests: правильна free identity, розділення owner/language, читання FAILED без повтору, знаходження вже створеної наступної спроби.
- Source commit: 072658ff512802262cef00ff424b87eedde1f934.
- Deploy dep-db4vlu0473hc739b20sg: live 2026-10-10T08:45:08.683295Z; health HTTP 200.
- Після перезапуску збережено FAILED job KRCM_e71f7ede-6598-4718-b5fb-a26b6dcdf6df та provider HTTP 503.

## Межі
Перша жива обробка NASA завершилася Gemini service_unavailable/503 без транскрипції. Після окремої явної згоди власника виконано один новий запуск — COMPLETED; холодний 429 через Render → Render і причина попереднього provider 503 не вважаються усуненими. FREE_ONLY та наявна архітектура збережені.

Повний протокол: https://github.com/kolemasakar/K_Research_Critic/blob/agent/krc-public-media-r3-integration/docs/media/KRC_COLD_START_AND_LONG_MEDIA_CHECK_2026-10-10.md

## Живе підтвердження відновлення YouTube start
- Власник підтвердив нову обробку 2026-10-10T10:18:09Z після повідомлення Gemini Free.
- Job KRCM_a95042aa-7952-40f2-ba5c-30801d2702b7: створено 10:20:48.516Z, COMPLETED 10:21:17.968Z.
- Start request_id=80d9ddfc-c8e8-41b9-aa5b-3e451685490e: start_response_recovered=true, reused=true, PROCESSING. Повторного start POST не виконано.
- Отримано 4 сегменти, індекси 0–3, next_cursor=null, точна сума UTF-16 text=5186. Таймкоди/confidence та media_duration_seconds=null. Повноту payload перевірено; аудіоточність не перевірена.
- credits_charged=0, stt_seconds_charged=0, credit_charge_uncertain=false. Gemini token usage не виміряний.
- Повну транскрипцію не архівовано в репозиторій. Core pilot завершено з обмеженнями.
- Успіх цього YouTube запуску не є новою живою перевіркою free lookup Facebook/Telegram; для них зберігаються попередні live результати й ізольовані HTTPS tests.
- VoiceBridge app log: service_started=2026-10-10T10:18:30.270266163Z після зовнішнього health GET; 429 request-log query за 10:10–10:25 UTC порожній і не визначає причину помилки.
