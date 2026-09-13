-- Abonelik anahtarları yalnız kimliği doğrulayan Edge Function üzerinden değiştirilsin.
-- RLS savunmada kalır; doğrudan istemci yazma ayrıcalığı verilmez.
revoke all on table public.push_subscriptions from anon, authenticated;
