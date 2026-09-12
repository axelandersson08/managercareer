# ⚽ Fotbollsmanager Online

Ett online football manager-spel: alla loggar in med tränarnamn och
klubbnamn, hamnar i ett divisionssystem, spelar en dubbelmötesserie
hemma/borta plus en cup med rakt slutspel, och sköter ekonomi och
transfermarknad mellan matcherna. Matcherna simuleras **på servern**, på
schema — de går av kl 15:00/18:00 GMT oavsett om någon tittar, och du kan gå
in och se var matchen ligger när du vill.

**OBS: databasschemat är omskrivet sedan förra leveransen igen** (bland
annat: matcherna flyttades från klienten till en riktig serverfunktion, och
fria agenter prissätts dynamiskt). Kör mot ett nytt/tomt Supabase-projekt,
eller töm det gamla, innan du kör det nya schemat.

## Kom igång

### 1. Grundinstallationen (samma som innan)

1. **Supabase-projekt**: [supabase.com](https://supabase.com) → New project → region Frankfurt.
2. **Databas**: SQL Editor → klistra in hela `supabase/schema.sql` → Run.
3. **Realtime**: Database → Replication → slå på för `fixtures`, `match_events`,
   `match_actions`, `transfer_listings`, `transfer_bids`.
4. **Inloggning**: Authentication → Providers → Email är på som standard.
   Authentication → URL Configuration → Site URL = `http://localhost:5173`
   (byt till din riktiga domän efter deploy).
5. **`.env`**: kopiera `.env.example` → `.env`, fyll i Project URL + anon key
   från Project Settings → API.
6. **Kör lokalt**: `npm install && npm run dev`.
7. **Bli admin**: logga in i appen en gång så din profil skapas, gå sen till
   Supabase → Table Editor → `profiles` → sätt `is_admin` till `true` på din
   rad. Admin-länken dyker upp i menyn efter omladdning.
8. **Deploy**: Vercel (gratis) → koppla GitHub-repo → lägg in samma env-vars
   → Deploy. Uppdatera sen Site URL i Supabase till din `.vercel.app`-adress.

### 2. Matchmotorn på servern (nytt — krävs för att matcher ska gå av sig själva)

Det här är det enda steget som kräver Supabase CLI, eftersom Edge Functions
inte går att klistra in i SQL Editor.

1. Installera CLI:t om du inte har det: `npm install -g supabase`.
2. Logga in och koppla projektet: `supabase login` och sen
   `supabase link --project-ref <ditt-project-ref>` (finns i Project Settings
   → General) kört i projektmappen.
3. Deploya funktionen: `supabase functions deploy tick-matches`.
   `SUPABASE_URL` och `SUPABASE_SERVICE_ROLE_KEY` finns redan tillgängliga i
   Edge Function-miljön automatiskt — inget extra att sätta.
4. Slå på schemaläggning: öppna `supabase/cron-setup.sql`, byt ut
   `<PROJECT-REF>` och `<SERVICE-ROLE-KEY>` (Project Settings → API → service
   role-nyckeln, hemlig, dela den aldrig) mot dina riktiga värden, kör filen
   i SQL Editor. Den slår på `pg_cron` + `pg_net` och schemalägger ett anrop
   till funktionen var 10:e sekund (eller varje minut om ditt projekts
   pg_cron-version inte stödjer sekundgranularitet — matchtempot blir ändå
   rätt, bara mindre smidigt att titta på live).
5. Klart — nu går matcher av kl 15:00/18:00 GMT automatiskt, och alla kan
   gå in och se hur långt matchen kommit när de vill.

## Så här spelas en säsong

1. Alla loggar in, väljer tränarnamn (vid första inloggning) och skapar sin
   klubb. Du får en trupp på 18 spelare direkt.
2. Admin går till **Admin**-sidan, skapar en ny säsong (default 20 lag per
   division) — anmälan är nu öppen.
3. När tillräckligt många anmält sig: admin sätter ett startdatum och klickar
   **Starta säsongen**. Det här händer automatiskt:
   - **Säsong 1**: lagen delas in i divisioner i anmälningsordning — de
     första fyller högsta divisionen, sen näst högsta, och så vidare.
   - **Säsong 2 och framåt**: de tre sämsta i varje division flyttas ner, de
     tre bästa i divisionen under flyttas upp — baserat på föregående
     säsongs tabeller. Nya lag som anmäler sig läggs längst ner i pyramiden
     (en ny bottendivision skapas om den nuvarande blir full).
   - Ett dubbelmötesschema (alla möter alla hemma och borta) lottas fram per
     division, en omgång per dag kl **15:00 GMT**.
   - En cup med alla lag blandade lottas fram, rakt slutspel, kl **18:00
     GMT** — med frilotter för de lag som blir över om antalet inte är en
     jämn tvåpotens.
   - Marknaden fylls med 24 fria agenter (bara första gången).
4. Cupen går vidare en omgång i taget automatiskt när alla matcher i
   omgången är spelade.
5. När säsongen är slutspelad: admin klickar **Avsluta säsongen** på
   Admin-sidan, och kan sedan skapa nästa säsong.

## Matcher

En match tar **5 minuter realtid** för alla 90 simulerade minuter. Den körs
av `supabase/functions/tick-matches` enligt schemat ovan — helt oberoende av
om någon har sidan öppen. Alla kan titta på alla matcher hur mycket de vill,
men bara på sitt eget lag kan man styra: du kan skicka in byten medan
matchen pågår (från matchsidan, om du äger ett av de två lagen), och
serverfunktionen applicerar dem på nästa tick (inom några sekunder).

## Ekonomi och marknad

- **Direktköp** av fria agenter till dagens pris, eller **buda** ett eget
  belopp — men aldrig hur lågt som helst. Priserna (både direktköp och
  lägsta bud) skalar med hur mycket pengar som finns i spelet totalt (snittkassan
  jämfört med startkassan), så marknaden blir dyrare i takt med att
  klubbarna tjänar mer på matchdagar. Ett bud som når lägstanivån går igenom
  direkt om ingen redan hunnit före — fria agenter har ingen motpart att
  förhandla med.
- **Lag-till-lag-transfers**: lista en spelare till ett självvalt utrop,
  andra lag lägger bud, du väljer själv vilket (om något) du accepterar.
- **Arena**: högre nivå ger mer i matchdagsintäkter efter varje ligamatch
  (hemmalaget får mest, bortalaget en mindre andel).
- **Akademi**: varje uppgradering kostar pengar men ger direkt en ny ung
  spelare till truppen.
- Släpp en spelare från din trupp så blir hen fri agent igen, till marknadens
  gällande pris.

## Sidorna

- **Start** — nästa match, tabellplacering, uttagen elva, ekonomiöversikt i
  ett svep.
- **Mitt lag** — trupp, startelva/formation (bara du ser din egen
  uppställning), släpp spelare till marknaden. Andra tränares lagsidor visar
  bara truppen och statistiken, inte deras uttagna elva.
- **Tabell & cup** — alla divisioners tabeller och cupträdet, med länkar in
  till matcher.
- **Match** — live matchhändelser (uppdateras i realtid för alla tittare),
  och byteskontroller om du äger ett av lagen.
- **Ekonomi** — kassa, pengaflöde, uppgradera arena eller akademi.
- **Marknad** — scouta och filtrera fria agenter, köp eller buda, lista dina
  egna spelare, hantera inkomna bud.
- **Admin** — skapa/starta/avsluta säsonger, manuell cupomgångskontroll.

## Medvetna förenklingar i den här versionen

- **`tick-matches` har ingen distribuerad låsning** mellan körningar — om
  cronjobbet skulle skjuta igång en ny körning innan den förra hunnit klart
  (t.ex. om schemat är satt snålare än funktionens svarstid) kan en match i
  teorin bearbetas dubbelt. Osannolikt i den här skalan, men värt att känna
  till. En riktig lösning vore `select ... for update skip locked` per match.
- **Cupmatcher som slutar lika avgörs slumpmässigt** ("på straffar") istället
  för en simulerad straffläggning.
- Akademins effekt är en direkt ny spelare per uppgradering, inte en
  pågående ungdomsverksamhet över tid.
- Upp-/nedflyttning sker bara i gränsen mellan varje division och den under
  — ingen särskild "playoff"-omgång för sista platsen, bara raka tre upp/tre
  ner.

## Säkerhet kring ekonomin

Budget, division, spelarrating och liknande går inte att förfalska genom att
skriva direkt till databasen förbi appen — de ändras bara via de
databasfunktioner (`credit_team`, `upgrade_arena`, `accept_transfer_bid`,
`buy_free_agent_now`, `bid_on_free_agent` osv.) som finns i
`supabase/schema.sql`. Matcher skrivs numera bara av `tick-matches`
(service role) eller admin — vanliga spelares webbläsare har ingen
skrivbehörighet till matcher eller matchhändelser längre.

## Projektstruktur

```
src/
  engine/matchEngine.ts        Referensimplementation av matchsimuleringen (klientsida, oanvänd i drift)
  lib/seasonEngine.ts          Divisionsindelning (inkl. upp-/nedflyttning), ligaschema, cuplottning
  lib/cupProgress.ts           Triggar nästa cupomgång via databasfunktionen (admin-reserv)
  lib/standings.ts             Tabellberäkning
  lib/generateSquad.ts         Slumpar truppar och fria agenter
  context/AuthContext.tsx      Inloggning
  hooks/useMyTeam.ts           Hämtar den inloggades eget lag
  pages/
    RegisterTeam.tsx           Skapa klubb (visas innan du har ett lag)
    HomePage.tsx                Startsidans sammanfattning
    TeamManager.tsx             Trupp/laguppställning (egen + andras, olika vy)
    LeagueView.tsx               Tabeller + cupträd
    LiveMatch.tsx                Live matchvy + byteskontroller
    EconomyPage.tsx              Ekonomi
    MarketPage.tsx               Transfermarknad
    AdminPage.tsx                Säsongsadministration
supabase/
  schema.sql                    Hela databasschemat, behörighetsregler och spelfunktioner
  functions/tick-matches/       Serverfunktionen som faktiskt kör matcherna
  cron-setup.sql                Schemalägger tick-matches (mall, fyll i dina egna värden)
```

**OBS om `matchEngine.ts`**: den simuleringslogik som faktiskt körs i drift
ligger duplicerad inuti `tick-matches/index.ts` (Edge Functions paketeras
isolerat, så den kan inte enkelt importera från `src/`). `src/engine/matchEngine.ts`
är samma logik i klientvänlig form och används inte längre i produktion —
om du ändrar matchreglerna, gör det på båda ställena.
