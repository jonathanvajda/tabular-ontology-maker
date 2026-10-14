# Vendored Browser Libraries

Same-origin copies of browser runtime dependencies used by the static apps.

| File | Version | Source |
| --- | --- | --- |
| `jsonld.min.js` | Existing vendored copy | Existing shared vendor migration |
| `mermaid.min.js` | Existing vendored copy | Existing shared vendor migration |
| `n3.min.js` | Existing vendored copy | Existing shared vendor migration |
| `rdflib.min.js` | Existing vendored copy | Existing shared vendor migration |
| `tabulator.min.js` | Existing vendored copy | Existing shared vendor migration |
| `jszip.min.js` | 3.10.1 | Copied from `D:\GitHub\mermaid\vendor\jszip.min.js`; upstream source documented there as `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js` |

Vendoring keeps browser pages on same-origin script loading and avoids CDN runtime dependencies.
