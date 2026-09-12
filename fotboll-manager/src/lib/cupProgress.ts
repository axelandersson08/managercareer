import { supabase } from './supabaseClient'

/**
 * Kollar om en cupomgång är helt färdigspelad och, om så, lottar och skapar
 * nästa omgång automatiskt. Anropas av klienten som just avslutade en
 * cupmatch (se LiveMatch.tsx). Hela logiken körs i databasen
 * (advance_cup_round, se supabase/schema.sql) eftersom det annars inte skulle
 * gå att skapa nästa omgångs matcher — den som råkar avsluta sista matchen i
 * en omgång är sällan admin.
 *
 * MVP-begränsning: det här triggas av en klient, inte av en server-cron. Om
 * ingen tittar på den sista matchen i en omgång kan nästa omgång dröja tills
 * någon öppnar sidan igen — se AdminPage → "Kontrollera cupomgångar" som
 * manuell reserv.
 */
export async function checkAndAdvanceCupRound(seasonId: string, round: number) {
  await supabase.rpc('advance_cup_round', { p_season_id: seasonId, p_round: round })
}
