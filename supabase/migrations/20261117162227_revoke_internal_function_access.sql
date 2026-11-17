-- Applicata sul progetto dev il 2026-11-17 (versione 20261117162227).
-- Due funzioni interne risultano chiamabili da chiunque tramite l'API (/rest/v1/rpc/...), anche da utenti
-- anonimi, e non devono esserlo:
--  - public.handle_new_user(): trigger che crea il profilo al primo accesso (security definer);
--  - public.rls_auto_enable(): event trigger della piattaforma che attiva la RLS sulle tabelle nuove.
-- Un trigger non richiede il permesso di esecuzione per scattare (il permesso si controlla solo quando
-- il trigger viene creato), quindi togliere l'accesso non cambia il loro funzionamento.
-- Il controllo di esistenza permette di applicarla anche dove una delle due funzioni non c'è.

do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    revoke execute on function public.handle_new_user() from public, anon, authenticated;
  end if;
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
