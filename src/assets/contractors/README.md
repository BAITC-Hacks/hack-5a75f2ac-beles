# Contractor illustrations

Six fictional editorial portraits generated with the built-in `image_gen` tool.
They illustrate professions; they do not represent the real people behind the anonymized records.
Images are reused by category. Hosts use a stable ID mapping, including distinct images for the
three profiles returned by the main search example. No catalog facts or contractor identities
are inferred from the pictures. The UI labels every image “ИИ-иллюстрация”.

| File | Illustration | Final prompt |
| --- | --- | --- |
| `host-01.png` | Event host, navy suit | [Hosts](./prompts-hosts.md) |
| `host-02.png` | Event host, navy blazer | [Hosts](./prompts-hosts.md) |
| `host-03.png` | Event host, charcoal suit | [Performers](./prompts-performers.md) |
| `florist.png` | Event florist / creative services | [Specialists](./prompts-specialists.md) |
| `photographer.png` | Photographer / visual services | [Specialists](./prompts-specialists.md) |
| `musician.png` | Musician / performance services | [Performers](./prompts-performers.md) |

All files are generated as separate images, saved in this directory, and bundled locally.
Cards load images lazily. Full profiles use the same category/ID mapping as result cards.
Venue cards use the previously generated [`event-atmosphere.png`](../event-atmosphere.png);
its prompt is recorded in the [parent README](../README.md).
