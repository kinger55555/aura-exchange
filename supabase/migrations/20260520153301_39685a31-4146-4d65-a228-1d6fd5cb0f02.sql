
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_nickname(text) from public, anon;
revoke all on function public.send_aura(text, numeric, text) from public, anon;
grant execute on function public.set_nickname(text) to authenticated;
grant execute on function public.send_aura(text, numeric, text) to authenticated;
