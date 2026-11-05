select cron.schedule('kizuna-market-settlement','* * * * *',
 $$set statement_timeout='25s'; select kizuna_private.market_sweep();$$);
