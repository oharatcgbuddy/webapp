-- Oltre al dado: se nel round si è giocato per primi o per secondi (null = non indicato, BYE o round vecchi).
alter table onepiece.matches add column went_first boolean;
