BusVisa v0.3.2 — Netlify deployment bundle

Official site: https://busvisa.netlify.app/

Release highlights
- Map and Visa are the only bottom tabs.
- About BusVisa is at the bottom of Visa.
- Four interface languages: 简体中文, 繁體中文（香港）, 繁體中文（台灣）, English.
- Language choices are kept on this device.
- Multilingual passport/visa issuing country search in simplified/traditional Chinese and English.
- More detailed visa-type lists across issuers; Schengen A/C/D appears under all Schengen issuing states.
- Current app icon included as PWA icon, iPhone touch icon and favicon.
- Visa validity dates are not collected. Third-country visa privileges are advisory/conditional.
- Reference visa-on-arrival fees and CNY FX display, with source dates when available.

Upload instructions (update the EXISTING website, not a new Netlify site)
1. Log in to app.netlify.com and select the visaatlas site.
2. Open Deploys and use the manual production deploy area.
3. Upload the folder containing index.html and its files in the folder ROOT.
   Do NOT upload a parent folder in which index.html is nested.
4. Wait until Published, then open https://busvisa.netlify.app/.
5. On iPhone close and reopen the home-screen web app. If old assets persist, try Safari reload twice, without clearing site data.

Do not delete Safari website data; it may hold stored visa information.

Technical
- Web/PWA static site with same-origin Netlify proxy rules (_redirects).
- Entry policy sync depends on the external open dataset, and may lag official changes.
- Fee and FX references are not official guarantees of price or admission.
- Data citation: TravelRequirements.info — Entry Requirements Dataset, AXG Sp. z o.o. (CC BY 4.0).
- FX reference: Frankfurter (daily indicative, not transaction live rates).
- Schengen visa A is airport transit and does not grant entry to Schengen territory.
- Visa types can differ by nationality, purpose and issuing authority. For incomplete catalogs, manually enter the visa label.

Version 0.3.2: Theme Settings (follow system/light/dark), About inside Settings, full 4-language disclaimers including minors/guardians. Internal policy API diagnostic link removed.
