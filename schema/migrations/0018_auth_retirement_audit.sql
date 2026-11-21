-- Run before the replacement application is deployed. Never delete or re-key
-- identities. A failed build leaves the previous deployment/access in service.
-- A social-only identity must first authenticate and add a working credential
-- through verified recovery; another unverified/disabled provider is not enough.
do $$
declare
  provider_accounts integer;
  dependent_accounts integer;
begin
  select count(*)::integer into provider_accounts
  from account where provider_id = 'wechat';

  select count(distinct legacy.user_id)::integer into dependent_accounts
  from account legacy
  where legacy.provider_id = 'wechat'
    and not exists (
      select 1 from account alternative
      where alternative.user_id = legacy.user_id
        and alternative.provider_id = 'credential'
        and nullif(alternative.password, '') is not null
    );

  if dependent_accounts > 0 then
    raise exception 'WeChat retirement blocked: % account(s) still require verified credential enrollment on the SAME account before deployment. Keep the previous deployment active.', dependent_accounts;
  end if;
  raise notice 'WeChat retirement audit: % provider account(s), 0 dependent account(s). Account IDs and data unchanged.', provider_accounts;
end $$;
