# Sticky Facts: Entities Update

## Prompt 1
Запомни данные проекта: клиент - ООО "Северный Ветер", город - Екатеринбург, запуск акции 3 сентября 2026, скидка 18%, промокод WIND18. Основная аудитория - владельцы малого бизнеса.

## Expected Facts After Prompt 1
- entities.client: ООО "Северный Ветер"
- entities.city: Екатеринбург
- entities.launch_date: 3 сентября 2026
- entities.discount: 18%
- entities.promo_code: WIND18
- entities.audience: владельцы малого бизнеса

## Prompt 2
Обновление: промокод заменили на NORTH20, скидка теперь 20%. Остальное без изменений.

## Expected Facts After Prompt 2
- entities.promo_code: NORTH20
- entities.discount: 20%
