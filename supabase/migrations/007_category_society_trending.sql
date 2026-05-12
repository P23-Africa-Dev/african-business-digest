-- Broader digest categories for trending_broad clusters (elections, society, viral topics)

alter type category_enum add value if not exists 'society';
alter type category_enum add value if not exists 'trending';
