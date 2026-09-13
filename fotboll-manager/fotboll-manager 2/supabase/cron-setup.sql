-- Schemalägger tick-matches så att matcher går av sig själva kl 15:00/18:00
-- GMT, oavsett om någon tittar. Kör EFTER att du har deployat funktionen
-- (`supabase functions deploy tick-matches`) — se README.
--
-- 1) Slå på tillägg (Database -> Extensions i Supabase Dashboard, eller kör
--    raderna nedan): pg_cron och pg_net.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Byt ut <PROJECT-REF> och <SERVICE-ROLE-KEY> nedan (Project Settings ->
--    API) och kör resten av filen i SQL Editor.
select cron.schedule(
  'tick-matches',
  '10 seconds', -- kör var 10:e sekund om ditt projekts pg_cron stödjer det,
                -- annars byt till en cron-sträng som '* * * * *' (var minut) —
                -- matchtempot blir ändå rätt, bara mindre smidigt live
  $$
  select net.http_post(
    url := 'https://<PROJECT-REF>.functions.supabase.co/tick-matches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE-ROLE-KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Kolla att den är schemalagd:
select * from cron.job;

-- Om du någon gång vill stänga av den:
-- select cron.unschedule('tick-matches');
