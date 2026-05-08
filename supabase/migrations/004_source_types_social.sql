do $$ begin
  alter type source_type_enum add value 'twitter';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type source_type_enum add value 'youtube';
exception when duplicate_object then null;
end $$;
