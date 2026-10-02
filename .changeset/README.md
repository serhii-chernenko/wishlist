# Changeset Rules

Use Ukrainian tagged bullets in every changeset body, and put one nested line for every translation under each bullet:

- `[added]` for new user-facing features
- `[updated]` for behavior changes or copy updates
- `[fixed]` for bug fixes
- `[removed]` for removals
- `[notes]` for announcements or extra context

Every bullet needs an English (`en`) and a Polish (`pl`) nested line. Each locale appears at most once per bullet.

Example:

```md
---
'wishlist': patch
---

- [fixed] Виправлено пошук за юзернеймом.
    - en: Fixed the search by username.
    - pl: Naprawiono wyszukiwanie po nazwie użytkownika.
- [updated] Оновлено тексти довідки.
    - en: The help texts were updated.
    - pl: Zaktualizowano teksty pomocy.
```

`pnpm run changeset:validate` enforces this format.
