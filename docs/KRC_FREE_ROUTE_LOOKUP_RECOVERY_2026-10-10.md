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
Довший живий YouTube тест NASA завершився Gemini service_unavailable/503; транскрипції немає. Холодний 429 через Render → Render також не вважається усуненим.
Нова обробка FAILED job не запускалася. FREE_ONLY та наявна архітектура збережені.

Повний протокол: https://github.com/kolemasakar/K_Research_Critic/blob/agent/krc-public-media-r3-integration/docs/media/KRC_COLD_START_AND_LONG_MEDIA_CHECK_2026-10-10.md
