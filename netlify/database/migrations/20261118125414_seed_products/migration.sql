INSERT INTO "products" ("slug","name","category","description","price_cents","unit","stock","min_order","featured") VALUES
('day-old-broiler-chicks','Day-old broiler chicks','chicks','Vaccinated (Marek''s + Newcastle) day-old broilers from our own hatchery. Fast-growing, ready for market in 6 weeks. Sold in boxes of 10.',1150,'box of 10',240,1,true),
('day-old-layer-chicks','Day-old layer chicks','chicks','Hardy layer chicks bred for steady egg production from week 18. Vaccinated and sexed (female).',1475,'box of 10',180,1,false),
('kienyeji-chicks-3-weeks','Improved kienyeji chicks (3 weeks)','chicks','Brooded for three weeks and past the most delicate stage. Free-range friendly and disease-resistant.',2340,'box of 10',95,1,true),
('fresh-eggs-tray','Fresh farm eggs','eggs','Collected every morning, graded and cleaned. Large brown eggs from free-range layers.',435,'tray of 30',620,1,true),
('free-range-eggs-half','Free-range eggs, half tray','eggs','Deep-yolk eggs from hens that forage outdoors all day.',265,'tray of 15',300,1,false),
('fertile-hatching-eggs','Fertile hatching eggs','eggs','Fertile eggs for incubation, collected within 3 days. Typical hatch rate around 83%.',780,'tray of 30',140,1,false),
('mature-broiler-live','Mature broiler (live)','mature','Market-weight broiler at roughly 2.3 kg live weight. Healthy and ready for the table.',685,'per bird',410,1,true),
('point-of-lay-hens','Point-of-lay hens','mature','16–18 week old layers, vaccinated and dewormed, about to start laying.',940,'per bird',130,1,false),
('dressed-broiler','Dressed whole chicken','mature','Cleaned, dressed and chilled whole broiler, about 1.6 kg.',790,'per bird',85,1,false),
('chick-starter-mash','Chick starter mash','feeds','High-protein (20%) starter feed with coccidiostat for weeks 0–4.',2860,'50 kg bag',75,1,true),
('broiler-finisher-pellets','Broiler finisher pellets','feeds','Energy-dense finisher pellets for the final growth stage, week 4 to market.',2615,'50 kg bag',90,1,false),
('layers-mash','Layers mash','feeds','Balanced calcium and protein for strong shells and consistent laying.',2490,'50 kg bag',110,1,false);

INSERT INTO "settings" ("key","value") VALUES
('store', '{"currency":"USD","deliveryFeeCents":350,"freeDeliveryOverCents":15000,"defaultCountry":"","allowedCountries":[],"momoNumber":"","momoName":"","storePhone":"","storeEmail":"","whatsapp":"","announcement":"Fresh eggs collected every morning — order online, pay on delivery or by mobile money"}');
